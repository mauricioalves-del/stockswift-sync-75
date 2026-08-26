import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { notificarTarefaAtribuida } from "@/lib/tarefa-email.functions";
import { fetchAll } from "@/lib/fetch-all";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  percentualDispersao, classificar, custoDesvio, badgeCor, labelClass, fmtBRL,
  CAUSAS, FAIXAS_DEFAULT, type Faixas,
} from "@/lib/dispersao";
import { ArrowLeft, ClipboardList, Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/producao/material/$material")({
  validateSearch: (s: Record<string, unknown>): { pc?: string } =>
    s['pc'] ? { pc: String(s['pc']) } : {},
  component: MaterialDrilldown,
  head: ({ params }) => ({ meta: [{ title: `Material ${params.material} — Dispersão` }] }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>,
  notFoundComponent: () => <div className="p-6">Material não encontrado.</div>,
});

function MaterialDrilldown() {
  const { material } = Route.useParams();
  const { pc } = Route.useSearch();
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();
  const canClassificar = isAdmin || role === "COORDENADOR_CONTROLE" || role === "GERENTE";

  const faixasQ = useQuery({
    queryKey: ["dispersao", "faixas"],
    queryFn: async (): Promise<Faixas> => {
      const { data } = await (supabase as any).from("parametros_dispersao").select("*").maybeSingle();
      return data ? { atencao: Number(data.limite_atencao_pct), critico: Number(data.limite_critico_pct) } : FAIXAS_DEFAULT;
    },
  });
  const faixas = faixasQ.data ?? FAIXAS_DEFAULT;

  const dataQ = useQuery({
    queryKey: ["dispersao", "material", material],
    queryFn: async () => {
      const [pc, bom, causas, acoes] = await Promise.all([
        (supabase as any).from("producao_consumo").select("*").eq("material", material),
        (supabase as any).from("ficha_tecnica_bom").select("id_item, item, custo, linha_origem").eq("id_item", material).limit(1),
        (supabase as any).from("dispersao_causa_raiz").select("*"),
        (supabase as any).from("dispersao_acoes_corretivas").select("*").eq("material", material),
      ]);
      if (pc.error) throw pc.error;
      const custo = Number(bom.data?.[0]?.custo ?? 0);
      const bomItem = bom.data?.[0] ?? null;
      const causasMap = new Map<string, any>();
      for (const c of (causas.data ?? [])) causasMap.set(c.producao_consumo_id, c);

      // Descrição do produto produzido: usa desc_produto quando existir,
      // senão resolve na ficha técnica em cascata:
      // 1) id_produto/produto  2) id_subconjunto/subconjunto  3) id_item/item
      const codigos = [...new Set((pc.data ?? []).map((r: any) => r.produto).filter(Boolean))] as string[];
      const descMap = new Map<string, string>();
      const setIfEmpty = (k: unknown, v: unknown) => {
        const key = k == null ? "" : String(k).trim();
        const val = v == null ? "" : String(v).trim();
        if (key && val && !descMap.has(key)) descMap.set(key, val);
      };
      if (codigos.length) {
        // Cada código pode aparecer em milhares de linhas da BOM. Paginar é
        // indispensável para não perder descrições após o limite de 1.000 registros.
        const [porProduto, porSubconjunto, porItem] = await Promise.all([
          fetchAll<any>((from, to) => (supabase as any)
            .from("ficha_tecnica_bom")
            .select("id_produto,produto")
            .in("id_produto", codigos)
            .range(from, to)),
          fetchAll<any>((from, to) => (supabase as any)
            .from("ficha_tecnica_bom")
            .select("id_subconjunto,subconjunto")
            .in("id_subconjunto", codigos)
            .range(from, to)),
          fetchAll<any>((from, to) => (supabase as any)
            .from("ficha_tecnica_bom")
            .select("id_item,item")
            .in("id_item", codigos)
            .range(from, to)),
        ]);
        // A ordem é intencional: Produto → Subconjunto → Item.
        for (const p of porProduto) setIfEmpty(p.id_produto, p.produto);
        for (const p of porSubconjunto) setIfEmpty(p.id_subconjunto, p.subconjunto);
        for (const p of porItem) setIfEmpty(p.id_item, p.item);
      }


      return {
        rows: (pc.data ?? []).map((r: any) => {
          const pct = percentualDispersao(r.qtd_dif, r.qtd_previsto, r.qtd_consumo);
          const cls = classificar(pct, faixas);
          const cd = custoDesvio(r.qtd_dif, custo);
          return {
            ...r,
            desc_resolvida: r.desc_produto || descMap.get(String(r.produto ?? "").trim()) || null,
            pct, cls, custoLiq: cd.perda - cd.sobra, causa: causasMap.get(r.id),
          };
        }),
        custo, bomItem, acoes: acoes.data ?? [],
      };

    },
  });

  const rows = useMemo(() => {
    const arr = [...(dataQ.data?.rows ?? [])];
    arr.sort((a, b) => {
      const av = a.pct === "NAO_PREVISTO" ? Infinity : Math.abs(a.pct);
      const bv = b.pct === "NAO_PREVISTO" ? Infinity : Math.abs(b.pct);
      return bv - av;
    });
    return arr;
  }, [dataQ.data]);

  const [causaDlg, setCausaDlg] = useState<any | null>(null);
  const [acaoDlg, setAcaoDlg] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/producao/dispersao"><ArrowLeft className="size-4" /></Link></Button>
        <div>
          <h1 className="text-xl font-semibold">{material} {dataQ.data?.bomItem?.item ? `— ${dataQ.data.bomItem.item}` : ""}</h1>
          <p className="text-xs text-muted-foreground">
            {dataQ.data?.bomItem?.linha_origem ? `Linha: ${dataQ.data.bomItem.linha_origem} · ` : ""}
            Custo unitário: {fmtBRL(dataQ.data?.custo ?? 0)}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>OP</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Descrição do produto</TableHead>
                <TableHead className="text-right">Consumo</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Dif</TableHead>
                <TableHead className="text-right">% Disp.</TableHead>
                <TableHead className="text-right">Custo Desvio</TableHead>
                <TableHead>Classif.</TableHead>
                <TableHead>Causa</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={pc === String(r.id) ? "bg-primary/10 ring-1 ring-primary/40" : ""}>
                  <TableCell>{r.ano_mes}</TableCell>
                  <TableCell>{r.id_op}</TableCell>
                  <TableCell>{r.produto || "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.desc_resolvida ?? ""}>{r.desc_resolvida || "—"}</TableCell>
                  <TableCell className="text-right">{Number(r.qtd_consumo).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{Number(r.qtd_previsto).toFixed(2)}</TableCell>
                  <TableCell className={"text-right " + (Number(r.qtd_dif) > 0 ? "text-destructive" : Number(r.qtd_dif) < 0 ? "text-success" : "")}>{Number(r.qtd_dif).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.pct === "NAO_PREVISTO" ? "—" : `${(r.pct as number).toFixed(1)}%`}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.custoLiq)}</TableCell>
                  <TableCell><Badge variant="outline" className={badgeCor(r.cls)}>{labelClass(r.cls)}</Badge></TableCell>
                  <TableCell className="text-xs">{r.causa ? (CAUSAS.find((c) => c.v === r.causa.causa)?.l ?? r.causa.causa) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canClassificar && (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setCausaDlg(r)}><Tag className="size-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setAcaoDlg(r)}><ClipboardList className="size-3.5" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-sm text-muted-foreground">Nenhum consumo registrado para este material.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CausaDialog row={causaDlg} onClose={() => setCausaDlg(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["dispersao"] }); setCausaDlg(null); }} />
      <AcaoDialog row={acaoDlg} material={material} onClose={() => setAcaoDlg(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["dispersao"] }); setAcaoDlg(null); }} />
    </div>
  );
}

function CausaDialog({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const [causa, setCausa] = useState<string>("FALHA_PROCESSO");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  if (!row) return null;

  async function salvar() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("dispersao_causa_raiz").insert({
        producao_consumo_id: row.id, causa, observacao: obs || null, classificado_por: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Causa registrada"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Classificar causa raiz</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">OP {row.id_op} · {row.ano_mes}</div>
          <div>
            <label className="text-xs">Causa</label>
            <Select value={causa} onValueChange={setCausa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CAUSAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Observação</label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcaoDialog({ row, material, onClose, onSaved }: { row: any | null; material: string; onClose: () => void; onSaved: () => void }) {
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [busy, setBusy] = useState(false);
  const usuarios = useUsuariosSistema();
  const notificar = useServerFn(notificarTarefaAtribuida);
  if (!row) return null;

  async function salvar() {
    if (!descricao.trim()) { toast.error("Descreva a ação"); return; }
    if (!responsavelId) { toast.error("Selecione o responsável"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const resp = (usuarios.data ?? []).find((x) => x.id === responsavelId);
      const { data: acao, error } = await (supabase as any).from("dispersao_acoes_corretivas").insert({
        producao_consumo_id: row.id, material, ano_mes: row.ano_mes,
        descricao_acao: descricao, responsavel: resp?.nome ?? null,
        status: "IDENTIFICADA", aberto_por: u.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      const link = `/producao/material/${encodeURIComponent(material)}?pc=${row.id}`;
      const { data: tarefa, error: errT } = await (supabase as any).from("tarefas_operacionais").insert({
        titulo: `Ação corretiva — Material ${material} · OP ${row.id_op}`,
        descricao: `${descricao}\n\nPeríodo ${row.ano_mes} · Consumo ${Number(row.qtd_consumo).toFixed(2)} vs Previsto ${Number(row.qtd_previsto).toFixed(2)}`,
        prioridade: "Alta",
        data_prevista: new Date().toISOString().slice(0, 10),
        recorrencia: "Unica",
        responsavel_tipo: "Pessoa",
        responsavel_id: responsavelId,
        responsavel_label: resp?.nome ?? null,
        sku_ou_local: material,
        link_rota: link,
        status: "Pendente",
        criado_por: u.user?.id ?? null,
        observacao: `Ação corretiva #${(acao as any)?.id ?? ""}`,
      }).select("id").single();
      if (errT) throw errT;

      try { await notificar({ data: { tarefaId: (tarefa as any).id } }); }
      catch { toast.warning("Tarefa criada, mas o e-mail não pôde ser enviado."); }

      toast.success("Ação corretiva aberta e tarefa atribuída"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir ação corretiva</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">OP {row.id_op} · {row.ano_mes} · Material {material}</div>
          <div>
            <label className="text-xs">Descrição da ação</label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} placeholder="Ex.: Recalibrar balança da linha X..." />
          </div>
          <div>
            <label className="text-xs">Responsável</label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
              <SelectContent>
                {(usuarios.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uma tarefa será criada para o responsável, com link direto para esta linha, e um e-mail será enviado.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>Abrir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
