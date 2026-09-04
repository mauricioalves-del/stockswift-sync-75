// Detalhe de uma ação corretiva de dispersão: contexto do desvio, histórico de
// acompanhamento e mudança de status.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBRL, STATUS_ACAO } from "@/lib/dispersao";
import { descricaoDeCodigo } from "@/lib/ft-arvore";
import { ExternalLink } from "lucide-react";

export type AcaoCorretiva = {
  id: string;
  material: string | null;
  ano_mes: string | null;
  descricao_acao: string;
  responsavel: string | null;
  status: string;
  data_abertura: string;
  data_conclusao: string | null;
  aberto_por: string | null;
  fechado_por: string | null;
  producao_consumo_id: string | null;
};

const labelStatus = (s: string) => STATUS_ACAO.find((x) => x.v === s)?.l ?? s;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

export function DetalheAcaoCorretivaDialog({
  acao,
  open,
  onOpenChange,
  onAlterarStatus,
  podeAlterarStatus,
  podeConcluir,
}: {
  acao: AcaoCorretiva | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAlterarStatus: (id: string, novo: string) => void;
  podeAlterarStatus: boolean;
  podeConcluir: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role } = useRole();
  const [novoTexto, setNovoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const material = acao?.material ?? "";

  const descQ = useQuery({
    queryKey: ["acao-corretiva", "desc", material],
    enabled: !!material && open,
    staleTime: 300_000,
    queryFn: () => descricaoDeCodigo(material),
  });

  const linhasQ = useQuery({
    queryKey: ["acao-corretiva", "linhas", material, acao?.ano_mes],
    enabled: !!material && open,
    queryFn: async () => {
      let q = (supabase as any)
        .from("v_impacto_consumo")
        .select("id,numero_op,dt_producao,sku_produto_final,desc_prod,um,qtd_previsto,qtd_consumo,qtd_dif,impacto_rs")
        .eq("material", material)
        .limit(500);
      if (acao?.ano_mes) q = q.eq("ano_mes", acao.ano_mes);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).sort(
        (a, b) => Math.abs(Number(b.impacto_rs ?? 0)) - Math.abs(Number(a.impacto_rs ?? 0)),
      );
    },
  });

  const comentariosQ = useQuery({
    queryKey: ["acao-corretiva", "comentarios", acao?.id],
    enabled: !!acao?.id && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dispersao_acao_comentarios")
        .select("*")
        .eq("acao_id", acao!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function adicionarComentario() {
    if (!acao || !novoTexto.trim()) return;
    if (!user?.id) { toast.error("Sessão expirada. Entre novamente."); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from("dispersao_acao_comentarios").insert({
      acao_id: acao.id,
      texto: novoTexto.trim(),
      autor_id: user.id,
      autor_nome: (user.user_metadata as any)?.nome || user.email || null,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    setNovoTexto("");
    toast.success("Anotação registrada");
    qc.invalidateQueries({ queryKey: ["acao-corretiva", "comentarios", acao.id] });
  }

  const linhas = linhasQ.data ?? [];
  const totalImpacto = linhas.reduce((s: number, r: any) => s + Number(r.impacto_rs ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {material || "Ação corretiva"}
            {descQ.data ? <span className="text-muted-foreground font-normal"> — {descQ.data}</span> : null}
          </DialogTitle>
        </DialogHeader>

        {acao && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Campo rotulo="Período" valor={acao.ano_mes || "—"} />
              <Campo rotulo="Abertura" valor={dt(acao.data_abertura)} />
              <Campo rotulo="Responsável" valor={acao.responsavel || "—"} />
              <Campo rotulo="Status" valor={<Badge variant="outline">{labelStatus(acao.status)}</Badge>} />
              <Campo rotulo="Conclusão" valor={dt(acao.data_conclusao)} />
              <Campo rotulo="Impacto no período" valor={fmtBRL(totalImpacto)} />
              <Campo rotulo="Lançamentos" valor={String(linhas.length)} />
              <Campo rotulo="Seu perfil" valor={role ?? "—"} />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Descrição da ação</p>
              <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{acao.descricao_acao}</p>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {podeAlterarStatus && (
                <Select value={acao.status} onValueChange={(v) => onAlterarStatus(acao.id, v)}>
                  <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_ACAO.map((s) => (
                      <SelectItem key={s.v} value={s.v} disabled={s.v === "CONCLUIDA" && !podeConcluir}>{s.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {material && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link to="/producao/material/$material" params={{ material }}>
                    <ExternalLink className="size-3.5 mr-1" /> Abrir material
                  </Link>
                </Button>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Contexto do desvio</p>
              <div className="border rounded-md overflow-auto max-h-[320px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OP</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Previsto</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead className="text-right">Dif</TableHead>
                      <TableHead className="text-right">Impacto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasQ.isLoading && (
                      <TableRow><TableCell colSpan={7} className="text-xs text-muted-foreground py-6 text-center">Carregando...</TableCell></TableRow>
                    )}
                    {!linhasQ.isLoading && linhas.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-xs text-muted-foreground py-6 text-center">Sem lançamentos para este material no período.</TableCell></TableRow>
                    )}
                    {linhas.map((r: any) => (
                      <TableRow key={r.id} className={r.id === acao.producao_consumo_id ? "bg-primary/10" : ""}>
                        <TableCell className="text-xs font-mono">{r.numero_op}</TableCell>
                        <TableCell className="text-xs">{r.dt_producao ? new Date(r.dt_producao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate" title={`${r.sku_produto_final ?? ""} ${r.desc_prod ?? ""}`}>
                          {r.sku_produto_final}{r.desc_prod ? ` — ${r.desc_prod}` : ""}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{Number(r.qtd_previsto ?? 0).toFixed(2)} {r.um ?? ""}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{Number(r.qtd_consumo ?? 0).toFixed(2)}</TableCell>
                        <TableCell className={"text-right text-xs tabular-nums " + (Number(r.qtd_dif) > 0 ? "text-destructive" : Number(r.qtd_dif) < 0 ? "text-success" : "")}>
                          {Number(r.qtd_dif ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className={"text-right text-xs tabular-nums " + (Number(r.impacto_rs) > 0 ? "text-destructive" : "")}>
                          {fmtBRL(Number(r.impacto_rs ?? 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Acompanhamento</p>
              <div className="space-y-2 mb-3">
                {(comentariosQ.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Nenhuma anotação registrada ainda.</p>
                )}
                {(comentariosQ.data ?? []).map((c: any) => (
                  <div key={c.id} className="rounded-md border p-2">
                    <p className="text-[11px] text-muted-foreground">
                      {c.autor_nome || "Usuário"} · {dt(c.created_at)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
                  </div>
                ))}
              </div>
              <Textarea
                rows={3}
                placeholder="Registrar andamento da ação..."
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={adicionarComentario} disabled={!novoTexto.trim() || salvando}>
                  {salvando ? "Salvando..." : "Adicionar anotação"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="text-sm">{valor}</div>
    </div>
  );
}
