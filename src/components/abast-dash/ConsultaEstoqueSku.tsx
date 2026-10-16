// Janela com a linha da Visão Geral de Estoque filtrada por um SKU (aberta por clique duplo na Reposição de Lojas).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { criarElegibilidade } from "@/lib/abastecimento-validacao";
import { nk, type Bruto } from "@/lib/abastecimento-dados";
import { COLUNAS, ROTULO, montarEstoqueGeral, origemDe, type Celula, type Estado } from "@/lib/abastecimento-estoque-geral";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const COR: Record<Estado, string> = {
  ruptura: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-100",
  abaixo: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-100",
  ok: "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-100",
  excesso: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100",
};
const un = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function dica(c: Celula) {
  return c.estado ? `${ROTULO[c.estado]}${c.minimo !== null ? ` · mín ${un(c.minimo)}` : ""}${c.maximo !== null ? ` · máx ${un(c.maximo)}` : ""}` : c.foraMeta ? "No portfólio, mas fora da meta OOS (sem cor)" : "Fora do planejamento";
}

/** valor da Origem para cada coluna: código da loja quando a coluna é loja do plano; senão o almoxarifado. "CD" para o CD. */
export function valorOrigemColuna(k: string, planilhaOuAlmox: string, plano: string | null) {
  return k === "CD" ? "CD" : plano ?? planilhaOuAlmox;
}

export function ConsultaEstoqueSku({ aberto, onFechar, bruto, sku, descricao, lojaDestino, cdNaoAtende, onUsar }: {
  aberto: boolean; onFechar: () => void; bruto: Bruto | undefined; sku: string; descricao: string; lojaDestino: string; cdNaoAtende: boolean;
  onUsar: (origem: string) => void;
}) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const clsQ = useQuery({ enabled: aberto, queryKey: ["abast-portfolio-cls"], staleTime: 60000,
    queryFn: async () => fetchAll<any>((f, t) => (supabase as any).from("abast_classificacoes_portfolio").select("sku, classe, vigencia, registrado_em, inicio_inovacao").order("id").range(f, t)) });
  const catQ = useQuery({ enabled: aberto, queryKey: ["categorias-produto"], staleTime: 60000,
    queryFn: async () => fetchAll<any>((fr, to) => (supabase as any).from("categorias_produto").select("*").order("segmento").order("categoria").order("codigo_produto").range(fr, to)) });
  const elegivel = useMemo(() => criarElegibilidade(clsQ.data ?? []), [clsQ.data]);
  const categorias = useMemo(() => { const m = new Map<string, string>(); for (const c of catQ.data ?? []) if (c.categoria) m.set(nk(String(c.codigo_produto)), String(c.categoria)); return m; }, [catQ.data]);
  const linha = useMemo(() => {
    if (!aberto || !bruto) return null;
    return montarEstoqueGeral(bruto, hoje, elegivel, undefined, categorias).find((l) => nk(l.sku) === nk(sku)) ?? null;
  }, [aberto, bruto, hoje, elegivel, categorias, sku]);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Visão Geral de Estoque · {sku}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {cdNaoAtende && <div className="rounded-md border border-l-4 border-l-warning bg-warning/10 px-3 py-2 text-sm">CD não atende a demanda — escolha a origem.</div>}
        {!linha ? <p className="py-6 text-center text-sm text-muted-foreground">{bruto ? "SKU sem saldo nem posição no plano." : "Carregando…"}</p> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted text-[11px] uppercase">
                <th className="px-2 py-2 text-left">SKU</th><th className="px-2 py-2 text-left">Produto</th><th className="px-2 py-2 text-left">Classe</th><th className="px-2 py-2 text-left">Categoria</th>
                {COLUNAS.map((c) => <th key={c.k} className="px-2 py-2 text-right">{c.rot}</th>)}<th className="px-2 py-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                <tr className="border-b">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{linha.sku}</td>
                  <td className="max-w-[260px] px-2 py-1.5 text-xs">{linha.descricao}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs">{linha.classe}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs">{linha.categoria}</td>
                  {COLUNAS.map((c) => { const cel = linha.celulas[c.k]; return <td key={c.k} title={dica(cel)} className={`px-2 py-1.5 text-right tabular-nums ${cel.estado ? COR[cel.estado] + " font-semibold" : cel.qtd === 0 ? "text-muted-foreground/50" : ""}`}>{cel.qtd === 0 && !cel.estado ? "·" : un(cel.qtd)}</td>; })}
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{un(linha.total)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-right text-[11px] text-muted-foreground">Usar como origem</td>
                  {COLUNAS.map((c) => {
                    const v = valorOrigemColuna(c.k, bruto ? origemDe(c, bruto) : c.planilha, c.plano);
                    const pode = linha.celulas[c.k].qtd > 0 && v !== lojaDestino;
                    return <td key={c.k} className="px-1 py-2 text-right">{pode && <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onUsar(v)}>Usar</Button>}</td>;
                  })}
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">Cores: Ruptura (vermelho), Abaixo do mínimo (amarelo), OK (verde), Excesso (azul). Passe o mouse para ver mín/máx.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
