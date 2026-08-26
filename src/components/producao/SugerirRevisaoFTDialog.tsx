// Parte C — Sugestão de revisão de Ficha Técnica (grava com status "Sugerida").
// Também oferece o registro de ocorrência de apontamento (Ação Corretiva), que
// nunca toca na ficha técnica.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { calcularSugestaoFT, type ImpactoLinha } from "@/lib/ft-arvore";
import { fmtBRL } from "@/lib/dispersao";

export type AlvoRevisao = {
  produtoRaiz: string;
  produtoDesc?: string | null;
  materialId: string;
  materialDesc?: string | null;
  gera_oc: boolean;
  qtdAtual: number;
  impactoLinhas: ImpactoLinha[];
  impactoRs?: number;
};

export function SugerirRevisaoFTDialog({
  alvo, open, onOpenChange,
}: { alvo: AlvoRevisao | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [qtdSugerida, setQtdSugerida] = useState("");
  const [metodo, setMetodo] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open || !alvo) return;
    let vivo = true;
    setCarregando(true);
    setQtdSugerida(""); setMetodo(""); setJustificativa("");
    calcularSugestaoFT({
      produtoRaiz: alvo.produtoRaiz,
      materialId: alvo.materialId,
      gera_oc: alvo.gera_oc,
      qtdAtual: alvo.qtdAtual,
      impactoLinhas: alvo.impactoLinhas,
    })
      .then((s) => {
        if (!vivo) return;
        if (!s) {
          setMetodo("Sem OPs com quantidade produzida registrada — informe a nova quantidade manualmente.");
          setJustificativa("");
          return;
        }
        setQtdSugerida(String(s.qtd_sugerida));
        setMetodo(s.metodo_calculo);
        setJustificativa(s.justificativa);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [open, alvo]);

  async function salvar() {
    if (!alvo) return;
    const nova = Number(String(qtdSugerida).replace(",", "."));
    if (!Number.isFinite(nova) || nova <= 0) { toast.error("Informe uma quantidade sugerida válida."); return; }
    if (!user?.id) { toast.error("Sessão expirada."); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from("ficha_tecnica_revisoes").insert({
      produto_id: alvo.produtoRaiz,
      material_id: alvo.materialId,
      produto_desc: alvo.produtoDesc ?? null,
      material_desc: alvo.materialDesc ?? null,
      qtd_atual: alvo.qtdAtual,
      qtd_sugerida: nova,
      metodo_calculo: metodo,
      justificativa,
      status: "Sugerida",
      criado_por: user.id,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sugestão registrada em Revisões de Ficha Técnica.");
    qc.invalidateQueries({ queryKey: ["ft-revisoes"] });
    onOpenChange(false);
  }

  const nova = Number(String(qtdSugerida).replace(",", "."));
  const simulavel = Number.isFinite(nova) && nova > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sugerir novo valor de Ficha Técnica</DialogTitle>
        </DialogHeader>
        {alvo && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div><span className="text-muted-foreground">Produto: </span>{alvo.produtoRaiz} {alvo.produtoDesc ? `— ${alvo.produtoDesc}` : ""}</div>
              <div><span className="text-muted-foreground">Item: </span>{alvo.materialId} {alvo.materialDesc ? `— ${alvo.materialDesc}` : ""}</div>
              <div><span className="text-muted-foreground">Quantidade atual na FT: </span>{alvo.qtdAtual}</div>
              {typeof alvo.impactoRs === "number" && (
                <div><span className="text-muted-foreground">Impacto no período: </span>{fmtBRL(alvo.impactoRs)}</div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantidade sugerida</label>
              <Input value={qtdSugerida} onChange={(e) => setQtdSugerida(e.target.value)} placeholder={carregando ? "Calculando..." : "0,000000"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Método de cálculo</label>
              <Textarea value={metodo} onChange={(e) => setMetodo(e.target.value)} rows={2} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Justificativa</label>
              <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} />
            </div>
            {simulavel && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                Simulação: para uma produção hipotética de 100 unidades, a próxima Solicitação de Materiais
                passaria a requisitar <strong>{(nova * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</strong>{" "}
                ao invés de <strong>{(alvo.qtdAtual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</strong>.
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>Registrar sugestão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cria uma Ação Corretiva do tipo "Revisão de processo de apontamento" (não altera a FT). */
export async function registrarApontamento(params: {
  material: string; anoMes?: string | null; userId?: string | null; descricao?: string;
}) {
  const { error } = await (supabase as any).from("dispersao_acoes_corretivas").insert({
    material: params.material,
    ano_mes: params.anoMes ?? null,
    descricao_acao: params.descricao ?? `Revisão de processo de apontamento — material ${params.material}.`,
    status: "IDENTIFICADA",
    aberto_por: params.userId ?? null,
  });
  if (error) throw error;
}
