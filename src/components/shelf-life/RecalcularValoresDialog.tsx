import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchAll } from "@/lib/fetch-all";
import { chaveSku } from "@/lib/precos-venda";
import { calculateActionFinancials } from "@/lib/shelf-life-recalculo";
import type { CampanhaRow } from "@/hooks/useShelfLife";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campanhas: CampanhaRow[];
};

type Erro = { id: string; sku: string; lote: string; mensagem: string };

const LOTE_UPDATE = 25;

export function RecalcularValoresDialog({ open, onOpenChange, campanhas }: Props) {
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<
    { processadas: number; atualizadas: number; erros: Erro[] } | null
  >(null);

  const executar = async () => {
    setRodando(true);
    setResultado(null);
    const inicio = Date.now();
    const erros: Erro[] = [];
    let atualizadas = 0;

    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;

      // Contexto: quantidades das baixas vinculadas, preços de venda e % padrão.
      const baixaIds = Array.from(
        new Set(campanhas.map((c) => c.baixa_operacional_id).filter(Boolean) as string[]),
      );
      const baixasQtd = new Map<string, number>();
      for (let i = 0; i < baixaIds.length; i += 200) {
        const { data } = await (supabase as any)
          .from("baixa_operacional")
          .select("id, quantidade")
          .in("id", baixaIds.slice(i, i + 200));
        for (const b of data ?? []) baixasQtd.set(b.id, Number(b.quantidade) || 0);
      }

      const precos = await fetchAll<any>((from, to) =>
        (supabase as any).from("precos_venda").select("sku, pr_venda").range(from, to),
      );
      const precoPorSku = new Map<string, number>(
        precos.map((p) => [chaveSku(p.sku), Number(p.pr_venda) || 0]),
      );

      const { data: paramDesc } = await (supabase as any)
        .from("parametros_desconto_colaborador")
        .select("percentual_desconto")
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      const percentualPadrao = Number(paramDesc?.percentual_desconto) || null;

      setProgresso({ feitos: 0, total: campanhas.length });
      const agora = new Date().toISOString();

      for (let i = 0; i < campanhas.length; i += LOTE_UPDATE) {
        const bloco = campanhas.slice(i, i + LOTE_UPDATE);
        await Promise.all(
          bloco.map(async (c) => {
            try {
              const calc = calculateActionFinancials(c as any, {
                quantidadeBaixa: c.baixa_operacional_id ? baixasQtd.get(c.baixa_operacional_id) : null,
                precoVendaCadastro: precoPorSku.get(chaveSku(c.sku)) ?? null,
                percentualPadrao,
              });
              const concluida = c.status === "CONCLUIDA";
              const valor = concluida ? calc.valor_recuperado : 0;
              const saving = concluida ? calc.saving_recuperado : 0;

              const { error } = await (supabase as any)
                .from("campanhas_lote")
                .update({
                  custo_unitario: calc.custo_unitario,
                  custo_acao: calc.custo_acao,
                  categoria_financeira: calc.categoria,
                  quantidade_recuperada: calc.quantidade_recuperada,
                  preco_com_desconto: calc.preco_praticado > 0 ? calc.preco_praticado : null,
                  valor_recuperado: valor,
                  saving_recuperado: saving,
                  valor_estimado_recuperado: calc.categoria === "Vendas" ? valor : 0,
                  valor_estimado_saving: calc.categoria === "Vendas" ? 0 : valor,
                  recalculado_em: agora,
                  recalculado_por: uid,
                })
                .eq("id", c.id);
              if (error) throw error;
              atualizadas++;
            } catch (e: any) {
              erros.push({
                id: c.id,
                sku: c.sku,
                lote: c.lote ?? "",
                mensagem: e?.message ?? "Erro desconhecido",
              });
            }
          }),
        );
        setProgresso({ feitos: Math.min(i + bloco.length, campanhas.length), total: campanhas.length });
      }

      await (supabase as any).from("audit_logs").insert({
        usuario: uid,
        acao: "shelf_life_recalculo_massa",
        entidade: "campanhas_lote",
        payload: {
          processadas: campanhas.length,
          atualizadas,
          com_erro: erros.length,
          duracao_ms: Date.now() - inicio,
          erros: erros.slice(0, 50),
        },
      });

      setResultado({ processadas: campanhas.length, atualizadas, erros });
      qc.invalidateQueries({ queryKey: ["shelf-campanhas"] });
      if (erros.length) {
        toast.warning(`Recálculo concluído com ${erros.length} registro(s) que não puderam ser atualizados.`);
      } else {
        toast.success(`Recálculo concluído. ${atualizadas} ações processadas.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no recálculo em massa.");
      setResultado({ processadas: progresso.feitos, atualizadas, erros });
    } finally {
      setRodando(false);
    }
  };

  const fechar = () => {
    if (rodando) return;
    setResultado(null);
    setProgresso({ feitos: 0, total: 0 });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Recalcular valores das ações?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta operação irá recalcular os valores financeiros das ações de lote utilizando os dados atuais de
            quantidade, custo unitário e preço praticado. Os valores calculados serão atualizados em massa.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rodando && (
          <p className="text-sm text-muted-foreground">
            Recalculando ações: {progresso.feitos} / {progresso.total}
          </p>
        )}

        {resultado && !rodando && (
          <div className="space-y-2 text-sm">
            <p>
              ✓ Recálculo concluído. {resultado.processadas} ações processadas · {resultado.atualizadas} atualizada(s)
              {resultado.erros.length > 0 ? ` · ${resultado.erros.length} com erro` : ""}.
            </p>
            {resultado.erros.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs space-y-1">
                {resultado.erros.map((e) => (
                  <div key={e.id}>
                    <span className="font-mono">{e.sku}</span> · Lote {e.lote || "—"} — {e.mensagem}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={rodando} onClick={fechar}>
            {resultado && !rodando ? "Fechar" : "Cancelar"}
          </AlertDialogCancel>
          {!resultado && (
            <AlertDialogAction
              disabled={rodando}
              onClick={(e) => {
                e.preventDefault();
                void executar();
              }}
            >
              {rodando ? "Recalculando..." : "Recalcular"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
