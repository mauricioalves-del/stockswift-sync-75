// Parte C — Fila de Revisões de Ficha Técnica com aprovação dupla
// (Produção + Suprimentos) e aplicação controlada na ficha_tecnica_bom.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

type Revisao = {
  id: string; produto_id: string; material_id: string;
  produto_desc: string | null; material_desc: string | null;
  qtd_atual: number; qtd_sugerida: number;
  metodo_calculo: string | null; justificativa: string | null;
  status: string;
  aprovador_producao_id: string | null; aprovador_producao_em: string | null;
  aprovador_suprimentos_id: string | null; aprovador_suprimentos_em: string | null;
  motivo_rejeicao: string | null; criado_por: string | null; criado_em: string;
  aplicada_em: string | null;
};

const CORES: Record<string, string> = {
  Sugerida: "bg-muted text-muted-foreground",
  "Em Aprovação": "bg-warning/15 text-warning border-warning/30",
  Aprovada: "bg-success/15 text-success border-success/30",
  Rejeitada: "bg-destructive/15 text-destructive border-destructive/30",
  Aplicada: "bg-primary/15 text-primary border-primary/30",
};

export function RevisoesFichaTecnica() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role, isAdmin } = useRole();
  const usuariosQ = useUsuariosSistema();
  const [filtro, setFiltro] = useState("abertas");
  const [rejeitando, setRejeitando] = useState<Revisao | null>(null);
  const [aplicando, setAplicando] = useState<Revisao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  // Aprovação de Produção: Administrador, Gerente ou Coordenador de Controle.
  const podeProducao = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  // Aprovação de Suprimentos: Administrador ou Gerente.
  const podeSuprimentos = isAdmin || role === "GERENTE";

  const revQ = useQuery({
    queryKey: ["ft-revisoes"],
    queryFn: async (): Promise<Revisao[]> => {
      const { data, error } = await (supabase as any)
        .from("ficha_tecnica_revisoes").select("*").order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Revisao[];
    },
  });

  const nome = (id: string | null) =>
    id ? (usuariosQ.data ?? []).find((u) => u.id === id)?.nome ?? id.slice(0, 8) : "—";

  const lista = (revQ.data ?? []).filter((r) => {
    if (filtro === "abertas") return !["Aplicada", "Rejeitada"].includes(r.status);
    if (filtro === "todas") return true;
    return r.status === filtro;
  });

  async function patch(id: string, valores: Record<string, unknown>) {
    const { error } = await (supabase as any).from("ficha_tecnica_revisoes").update(valores).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["ft-revisoes"] });
  }

  async function aprovar(r: Revisao, area: "producao" | "suprimentos") {
    if (!user?.id) return;
    const outro = area === "producao" ? r.aprovador_suprimentos_id : r.aprovador_producao_id;
    if (outro && outro === user.id) {
      toast.error("A aprovação dupla exige dois usuários diferentes.");
      return;
    }
    setBusy(true);
    try {
      const campos: Record<string, unknown> = area === "producao"
        ? { aprovador_producao_id: user.id, aprovador_producao_em: new Date().toISOString() }
        : { aprovador_suprimentos_id: user.id, aprovador_suprimentos_em: new Date().toISOString() };
      const temAmbas = area === "producao" ? !!r.aprovador_suprimentos_id : !!r.aprovador_producao_id;
      campos.status = temAmbas ? "Aprovada" : "Em Aprovação";
      await patch(r.id, campos);
      toast.success(temAmbas ? "Revisão aprovada pelas duas áreas." : "Aprovação registrada. Falta a outra área.");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function rejeitar() {
    if (!rejeitando) return;
    if (!motivo.trim()) { toast.error("Informe o motivo da rejeição."); return; }
    setBusy(true);
    try {
      await patch(rejeitando.id, { status: "Rejeitada", motivo_rejeicao: motivo.trim() });
      toast.success("Revisão rejeitada.");
      setRejeitando(null); setMotivo("");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function aplicar(r: Revisao) {
    if (r.status !== "Aprovada") { toast.error("Aprovação dupla obrigatória antes de aplicar."); return; }
    if (!user?.id) return;
    setBusy(true);
    try {
      const { data: antes, error: errSel } = await (supabase as any)
        .from("ficha_tecnica_bom").select("*")
        .eq("id_produto", r.produto_id).eq("id_item", r.material_id);
      if (errSel) throw errSel;
      const { error: errUp } = await (supabase as any)
        .from("ficha_tecnica_bom").update({ qtd: r.qtd_sugerida })
        .eq("id_produto", r.produto_id).eq("id_item", r.material_id);
      if (errUp) throw errUp;
      await patch(r.id, {
        status: "Aplicada",
        aplicada_em: new Date().toISOString(),
        aplicada_por: user.id,
        ficha_tecnica_bom_versao_anterior: antes ?? [],
      });
      qc.invalidateQueries({ queryKey: ["ft-arvore"] });
      setAplicando(null);
      toast.success(`Ficha Técnica atualizada (${(antes ?? []).length} linha(s)).`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em andamento</SelectItem>
            <SelectItem value="Sugerida">Sugeridas</SelectItem>
            <SelectItem value="Em Aprovação">Em Aprovação</SelectItem>
            <SelectItem value="Aprovada">Aprovadas</SelectItem>
            <SelectItem value="Aplicada">Aplicadas</SelectItem>
            <SelectItem value="Rejeitada">Rejeitadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          A ficha técnica só muda após aprovação de Produção <strong>e</strong> Suprimentos.
        </span>
      </div>

      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">FT atual</TableHead>
              <TableHead className="text-right">Sugerida</TableHead>
              <TableHead>Justificativa</TableHead>
              <TableHead>Aprov. Produção</TableHead>
              <TableHead>Aprov. Suprimentos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs max-w-[200px] truncate" title={r.produto_desc ?? ""}>
                  {r.produto_id}{r.produto_desc ? ` — ${r.produto_desc}` : ""}
                </TableCell>
                <TableCell className="text-xs max-w-[200px] truncate" title={r.material_desc ?? ""}>
                  {r.material_id}{r.material_desc ? ` — ${r.material_desc}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">{Number(r.qtd_atual).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</TableCell>
                <TableCell className="text-right tabular-nums text-xs font-medium">{Number(r.qtd_sugerida).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</TableCell>
                <TableCell className="text-xs max-w-[280px]">
                  <div className="line-clamp-2" title={`${r.metodo_calculo ?? ""}\n${r.justificativa ?? ""}`}>{r.justificativa ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs">{r.aprovador_producao_id ? nome(r.aprovador_producao_id) : "—"}</TableCell>
                <TableCell className="text-xs">{r.aprovador_suprimentos_id ? nome(r.aprovador_suprimentos_id) : "—"}</TableCell>
                <TableCell><Badge variant="outline" className={CORES[r.status] ?? ""}>{r.status}</Badge></TableCell>
                <TableCell className="text-right whitespace-nowrap space-x-1">
                  {!["Aplicada", "Rejeitada"].includes(r.status) && (
                    <>
                      {podeProducao && !r.aprovador_producao_id && (
                        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => aprovar(r, "producao")}>
                          <ShieldCheck className="size-3.5 mr-1" /> Produção
                        </Button>
                      )}
                      {podeSuprimentos && !r.aprovador_suprimentos_id && (
                        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => aprovar(r, "suprimentos")}>
                          <ShieldCheck className="size-3.5 mr-1" /> Suprimentos
                        </Button>
                      )}
                      {r.status === "Aprovada" && isAdmin && (
                        <Button size="sm" className="h-7" disabled={busy} onClick={() => setAplicando(r)}>
                          <CheckCircle2 className="size-3.5 mr-1" /> Aplicar à FT
                        </Button>
                      )}
                      {(podeProducao || podeSuprimentos) && (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive" disabled={busy} onClick={() => { setRejeitando(r); setMotivo(""); }}>
                          <XCircle className="size-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {lista.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                {revQ.isLoading ? "Carregando..." : "Nenhuma revisão nesse filtro."}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!aplicando} onOpenChange={(v) => !v && setAplicando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aplicar revisão à Ficha Técnica</DialogTitle></DialogHeader>
          {aplicando && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{aplicando.produto_id}</strong>{aplicando.produto_desc ? ` — ${aplicando.produto_desc}` : ""}
                <br />Item <strong>{aplicando.material_id}</strong>{aplicando.material_desc ? ` — ${aplicando.material_desc}` : ""}
              </p>
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                Simulação: se esta Ficha Técnica for atualizada, a próxima Solicitação de Materiais para este produto
                passará a requisitar{" "}
                <strong>{(Number(aplicando.qtd_sugerida) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</strong>{" "}
                ao invés de{" "}
                <strong>{(Number(aplicando.qtd_atual) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</strong>{" "}
                (produção hipotética de 100 unidades).
              </div>
              <p className="text-xs text-muted-foreground">
                O valor atual da ficha é guardado como versão anterior, permitindo reversão.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAplicando(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => aplicando && aplicar(aplicando)}>Confirmar e aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejeitando} onOpenChange={(v) => !v && setRejeitando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar sugestão de Ficha Técnica</DialogTitle></DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} placeholder="Motivo da rejeição" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejeitando(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitar} disabled={busy}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
