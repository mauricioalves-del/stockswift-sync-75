import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Play, CheckCircle2, XCircle, Rocket, Layers, AlertTriangle } from "lucide-react";
import { carregarBomCompleta, explodirBOM, gerarNumeroOP } from "@/lib/pcp-bom";

export const Route = createFileRoute("/_authenticated/producao/pcp/$id")({
  component: DetalheOP,
  head: () => ({ meta: [{ title: "Ordem de Produção — PCP" }] }),
});

type OP = {
  id: string; numero_op: string; produto: string; desc_produto: string | null;
  quantidade_planejada: number; quantidade_produzida_real: number | null;
  data_planejada: string | null; data_inicio_real: string | null; data_conclusao_real: string | null;
  almoxarifado_producao: string | null; status: string; origem_demanda: string;
  op_pai_id: string | null;
};

type Nec = {
  id: string; id_item: string; item: string | null; um: string | null;
  qtd_necessaria: number; eh_semiacabado: boolean; op_filha_id: string | null;
  saldo_disponivel_no_calculo: number | null; status_disponibilidade: string | null;
  qtd_consumo_real: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  PLANEJADA: "Planejada", LIBERADA: "Liberada", EM_PRODUCAO: "Em Produção",
  CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};
const STATUS_COR: Record<string, string> = {
  PLANEJADA: "bg-muted text-foreground border-border",
  LIBERADA: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  EM_PRODUCAO: "bg-warning/15 text-warning border-warning/30",
  CONCLUIDA: "bg-success/15 text-success border-success/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
};

function DetalheOP() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { canWrite, isAdmin } = useRole();

  const opQ = useQuery({
    queryKey: ["pcp", "op", id],
    queryFn: async (): Promise<OP | null> => {
      const { data, error } = await (supabase as any).from("ordens_producao").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as OP | null;
    },
  });

  const necQ = useQuery({
    queryKey: ["pcp", "nec", id],
    queryFn: async (): Promise<Nec[]> => {
      const { data, error } = await (supabase as any).from("necessidade_materiais_op").select("*").eq("op_id", id).order("id_item");
      if (error) throw error;
      return (data as Nec[]) ?? [];
    },
  });

  // Saldo em estoque para os itens dessa OP no almoxarifado
  const saldoQ = useQuery({
    queryKey: ["pcp", "saldo", id, opQ.data?.almoxarifado_producao],
    enabled: !!necQ.data && necQ.data.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const ids = (necQ.data ?? []).map((n) => n.id_item);
      let q = (supabase as any).from("estoque_sistemico").select("id_produto,quantidade,id_local").in("id_produto", ids);
      if (opQ.data?.almoxarifado_producao) q = q.eq("id_local", opQ.data.almoxarifado_producao);
      const { data } = await q;
      const acc: Record<string, number> = {};
      for (const r of (data ?? []) as { id_produto: string; quantidade: number }[]) {
        acc[r.id_produto] = (acc[r.id_produto] ?? 0) + Number(r.quantidade || 0);
      }
      return acc;
    },
  });

  async function mudarStatus(novo: string, extra: Partial<OP> = {}) {
    const { error } = await (supabase as any).from("ordens_producao").update({ status: novo, ...extra }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → ${STATUS_LABEL[novo]}`);
    qc.invalidateQueries({ queryKey: ["pcp"] });
  }

  async function gerarOPFilha(nec: Nec) {
    if (!confirm(`Gerar OP filha para ${nec.id_item} (${nec.qtd_necessaria})?`)) return;
    try {
      const bom = await carregarBomCompleta();
      const necFilha = explodirBOM(nec.id_item, nec.qtd_necessaria, bom);
      const { data: user } = await supabase.auth.getUser();
      const { data: opFilha, error } = await (supabase as any).from("ordens_producao").insert({
        numero_op: gerarNumeroOP(),
        produto: nec.id_item, desc_produto: nec.item,
        quantidade_planejada: nec.qtd_necessaria,
        almoxarifado_producao: opQ.data?.almoxarifado_producao ?? null,
        origem_demanda: "MANUAL", op_pai_id: id,
        criado_por: user.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      if (necFilha.length) {
        const rows = necFilha.map((n) => ({
          op_id: opFilha.id, id_item: n.id_item, item: n.item, um: n.um,
          qtd_necessaria: n.qtd_necessaria, eh_semiacabado: n.eh_semiacabado,
        }));
        await (supabase as any).from("necessidade_materiais_op").insert(rows);
      }
      await (supabase as any).from("necessidade_materiais_op").update({ op_filha_id: opFilha.id }).eq("id", nec.id);
      toast.success("OP filha criada");
      qc.invalidateQueries({ queryKey: ["pcp"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar OP filha");
    }
  }

  async function gerarDemanda(nec: Nec, deficit: number) {
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("demanda_extra").insert({
        origem: opQ.data?.almoxarifado_producao ?? null,
        sku: nec.id_item, produto: nec.item,
        quantidade_extra: deficit,
        motivo: `PCP — OP ${opQ.data?.numero_op ?? ""}`,
        data_inicio: new Date().toISOString().slice(0, 10),
        data_fim: new Date().toISOString().slice(0, 10),
        responsavel: user.user?.id ?? null,
        status: "PENDENTE",
      });
      if (error) throw error;
      toast.success("Demanda extra criada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar demanda");
    }
  }

  const [concluirOpen, setConcluirOpen] = useState(false);

  const necComSaldo = useMemo(() => {
    return (necQ.data ?? []).map((n) => {
      const saldo = saldoQ.data?.[n.id_item] ?? 0;
      const suficiente = saldo >= n.qtd_necessaria;
      return { ...n, saldo, suficiente, deficit: Math.max(0, n.qtd_necessaria - saldo) };
    });
  }, [necQ.data, saldoQ.data]);

  const temInsuficiente = necComSaldo.some((n) => !n.suficiente && !n.eh_semiacabado);

  const op = opQ.data;
  if (opQ.isLoading || !op) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/producao/pcp" })}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {op.numero_op}
                <Badge variant="outline" className={STATUS_COR[op.status]}>{STATUS_LABEL[op.status]}</Badge>
                {op.op_pai_id && <Badge variant="outline">OP filha</Badge>}
              </CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {op.produto} — {op.desc_produto}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Planejado: {Number(op.quantidade_planejada).toLocaleString("pt-BR")} · Almox: {op.almoxarifado_producao ?? "—"} · Data: {op.data_planejada ?? "—"}
                {op.quantidade_produzida_real != null && ` · Produzido: ${Number(op.quantidade_produzida_real).toLocaleString("pt-BR")}`}
              </div>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {op.status === "PLANEJADA" && (
                  <Button size="sm" onClick={() => {
                    if (temInsuficiente && !confirm("Há materiais insuficientes. Liberar mesmo assim?")) return;
                    mudarStatus("LIBERADA");
                  }}><Rocket className="h-4 w-4 mr-1" /> Liberar</Button>
                )}
                {op.status === "LIBERADA" && (
                  <Button size="sm" onClick={() => mudarStatus("EM_PRODUCAO", { data_inicio_real: new Date().toISOString() })}><Play className="h-4 w-4 mr-1" /> Iniciar</Button>
                )}
                {op.status === "EM_PRODUCAO" && (
                  <Button size="sm" onClick={() => setConcluirOpen(true)}><CheckCircle2 className="h-4 w-4 mr-1" /> Concluir</Button>
                )}
                {isAdmin && op.status !== "CONCLUIDA" && op.status !== "CANCELADA" && (
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm("Cancelar OP?")) mudarStatus("CANCELADA"); }}>
                    <XCircle className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Necessidade de Materiais (BOM explodida)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>UM</TableHead>
                <TableHead className="text-right">Necessário</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Disponibilidade</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {necComSaldo.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {n.id_item}
                      {n.eh_semiacabado && <Badge variant="outline" className="ml-2 text-[10px]"><Layers className="h-3 w-3 mr-1 inline" />Semiacabado</Badge>}
                      {n.op_filha_id && (
                        <Link to="/producao/pcp/$id" params={{ id: n.op_filha_id }} className="ml-2 text-xs text-primary hover:underline">→ OP filha</Link>
                      )}
                    </div>
                    {n.item && <div className="text-xs text-muted-foreground">{n.item}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{n.um ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.qtd_necessaria.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    {n.eh_semiacabado
                      ? <Badge variant="outline">semiacabado</Badge>
                      : n.suficiente
                        ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Suficiente</Badge>
                        : <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30"><AlertTriangle className="h-3 w-3 mr-1 inline" />Falta {n.deficit.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {n.eh_semiacabado && !n.op_filha_id && canWrite && op.status !== "CONCLUIDA" && op.status !== "CANCELADA" && (
                        <Button size="sm" variant="outline" onClick={() => gerarOPFilha(n)}>Gerar OP</Button>
                      )}
                      {!n.eh_semiacabado && !n.suficiente && canWrite && (
                        <Button size="sm" variant="outline" onClick={() => gerarDemanda(n, n.deficit)}>Demanda Extra</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!necComSaldo.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">Sem necessidade calculada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {concluirOpen && <ConcluirDialog op={op} nec={necComSaldo} onClose={() => setConcluirOpen(false)} />}
    </div>
  );
}

function ConcluirDialog({ op, nec, onClose }: { op: OP; nec: (Nec & { saldo: number })[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [qtdReal, setQtdReal] = useState(String(op.quantidade_planejada));
  const [consumos, setConsumos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const n of nec) init[n.id] = String(n.qtd_necessaria);
    setConsumos(init);
  }, [nec]);

  async function salvar() {
    setSaving(true);
    try {
      const agora = new Date();
      const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
      // Atualiza consumo por linha
      for (const n of nec) {
        const real = Number(consumos[n.id] ?? n.qtd_necessaria);
        await (supabase as any).from("necessidade_materiais_op").update({ qtd_consumo_real: real }).eq("id", n.id);
      }
      // Grava OP
      const { error } = await (supabase as any).from("ordens_producao").update({
        status: "CONCLUIDA",
        quantidade_produzida_real: Number(qtdReal),
        data_conclusao_real: agora.toISOString(),
      }).eq("id", op.id);
      if (error) throw error;
      // Alimenta producao_consumo (uma linha por material — pula semiacabados intermediários)
      const rows = nec.filter((n) => !n.eh_semiacabado).map((n) => ({
        ano_mes: anoMes, id_op: op.numero_op,
        produto: op.produto, desc_produto: op.desc_produto,
        material: n.id_item, desc_material: n.item, um: n.um,
        qtd_consumo: Number(consumos[n.id] ?? n.qtd_necessaria),
        qtd_previsto: n.qtd_necessaria,
        qtd_produzida: Number(qtdReal),
      }));
      if (rows.length) await (supabase as any).from("producao_consumo").insert(rows);
      toast.success("OP concluída e Dispersão atualizada");
      qc.invalidateQueries({ queryKey: ["pcp"] });
      qc.invalidateQueries({ queryKey: ["dispersao"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Concluir OP {op.numero_op}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Quantidade produzida real</Label>
            <Input type="number" value={qtdReal} onChange={(e) => setQtdReal(e.target.value)} />
          </div>
          <div className="max-h-[400px] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Previsto</TableHead><TableHead className="text-right">Consumo Real</TableHead></TableRow></TableHeader>
              <TableBody>
                {nec.filter((n) => !n.eh_semiacabado).map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="text-sm">{n.id_item} <span className="text-xs text-muted-foreground">{n.item}</span></TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{n.qtd_necessaria.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.0001" className="h-8 w-32 ml-auto text-right"
                        value={consumos[n.id] ?? ""} onChange={(e) => setConsumos((c) => ({ ...c, [n.id]: e.target.value }))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Concluir OP"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
