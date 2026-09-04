// Detalhe completo de uma ação de lote (campanha de shelf life): dados do lote,
// resumo financeiro, acompanhamento e mudança de status.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_CAMPANHA, statusCampanhaLabel } from "@/lib/shelf-life";
import { valorRecuperadoFinal, savingRecuperadoFinal } from "@/lib/shelf-life-financeiro";
import { descricaoDeCodigo } from "@/lib/ft-arvore";
import { ExternalLink } from "lucide-react";

export type AcaoLote = {
  id: string;
  sku: string;
  descricao?: string | null;
  lote: string;
  almoxarifado?: string | null;
  data_validade?: string | null;
  tipo_acao_id?: string | null;
  quantidade_enderecada?: number | null;
  quantidade_recuperada?: number | null;
  custo_unitario?: number | null;
  custo_acao?: number | null;
  valor_estimado_recuperado?: number | null;
  valor_recuperado?: number | null;
  valor_estimado_saving?: number | null;
  saving_recuperado?: number | null;
  responsavel?: string | null;
  data_acao?: string | null;
  status: string;
  observacao?: string | null;
  categoria_financeira?: string | null;
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const d = (v?: string | null) =>
  v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export function DetalheAcaoLoteDialog({
  acao,
  open,
  onOpenChange,
  onStatusChange,
}: {
  acao: AcaoLote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStatusChange?: (id: string, novo: string) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role, isAdmin } = useRole();
  const [novoTexto, setNovoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const podeAlterar = isAdmin || role === "COORDENADOR_CONTROLE" || role === "GERENTE";
  const sku = acao?.sku ?? "";

  const descQ = useQuery({
    queryKey: ["acao-lote", "desc", sku],
    enabled: !!sku && open && !acao?.descricao,
    staleTime: 300_000,
    queryFn: () => descricaoDeCodigo(sku),
  });

  const tipoQ = useQuery({
    queryKey: ["acao-lote", "tipo", acao?.tipo_acao_id],
    enabled: !!acao?.tipo_acao_id && open,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tipos_acao_shelf_life")
        .select("nome")
        .eq("id", acao!.tipo_acao_id)
        .maybeSingle();
      return (data?.nome as string | null) ?? null;
    },
  });

  const comentariosQ = useQuery({
    queryKey: ["acao-lote", "comentarios", acao?.id],
    enabled: !!acao?.id && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campanha_lote_comentarios")
        .select("*")
        .eq("campanha_id", acao!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function adicionarComentario() {
    if (!acao || !novoTexto.trim()) return;
    if (!user?.id) { toast.error("Sessão expirada. Entre novamente."); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from("campanha_lote_comentarios").insert({
      campanha_id: acao.id,
      texto: novoTexto.trim(),
      autor_id: user.id,
      autor_nome: (user.user_metadata as any)?.nome || user.email || null,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    setNovoTexto("");
    toast.success("Anotação registrada");
    qc.invalidateQueries({ queryKey: ["acao-lote", "comentarios", acao.id] });
  }

  const descricao = acao?.descricao || descQ.data || null;
  const valorRec = acao ? valorRecuperadoFinal(acao as any) : 0;
  const saving = acao ? savingRecuperadoFinal(acao as any) : 0;
  const qtd = Number(acao?.quantidade_recuperada ?? acao?.quantidade_enderecada ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {sku || "Ação de lote"}
            {descricao ? <span className="text-muted-foreground font-normal"> — {descricao}</span> : null}
          </DialogTitle>
        </DialogHeader>

        {acao && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Campo rotulo="Lote" valor={acao.lote || "—"} />
              <Campo rotulo="Tipo de ação" valor={tipoQ.data ?? "—"} />
              <Campo rotulo="Data da ação" valor={d(acao.data_acao)} />
              <Campo rotulo="Status" valor={<Badge variant="outline">{statusCampanhaLabel(acao.status)}</Badge>} />
              <Campo rotulo="Responsável" valor={acao.responsavel || "—"} />
              <Campo rotulo="Almoxarifado" valor={acao.almoxarifado || "—"} />
              <Campo rotulo="Validade" valor={d(acao.data_validade)} />
              <Campo rotulo="Quantidade" valor={qtd ? qtd.toLocaleString("pt-BR") : "—"} />
              <Campo rotulo="Custo unitário" valor={fmtBRL(Number(acao.custo_unitario ?? 0))} />
              <Campo rotulo="Custo da ação" valor={fmtBRL(Number(acao.custo_acao ?? 0))} />
              <Campo rotulo="Valor recuperado" valor={fmtBRL(valorRec)} />
              <Campo rotulo="Saving" valor={fmtBRL(saving)} />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Descrição / observação</p>
              <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
                {acao.observacao?.trim() || "Sem observação registrada."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {podeAlterar && onStatusChange && (
                <Select value={acao.status} onValueChange={(v) => onStatusChange(acao.id, v)}>
                  <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_CAMPANHA.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link to="/shelf-life/acoes" search={{ acao: acao.id }}>
                  <ExternalLink className="size-3.5 mr-1" /> Abrir na tela de Ações de Lote
                </Link>
              </Button>
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
