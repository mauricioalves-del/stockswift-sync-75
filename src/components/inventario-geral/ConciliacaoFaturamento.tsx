// Aba "Conciliação de faturamento": cobre vendas pagas na maquininha e não faturadas com as faltas de produto acabado.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAll } from "@/lib/fetch-all";
import { parseNumeroBR } from "@/lib/precos-venda";
import { usePrecosVenda } from "@/hooks/usePrecosVenda";
import { chaveSkuInv, conciliarValorAberto, divergentesAcabados } from "@/lib/inventario-faturamento-pendente";
import { num, sb } from "./comum";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ConciliacaoFaturamento({ inv }: { inv: any }) {
  const [valorTxt, setValorTxt] = useState("");
  const itensQ = useQuery({ queryKey: ["inv-conc-fat", inv.id], queryFn: () => fetchAll<any>((a, z) => sb.from("inv_itens").select("codigo_produto,descricao,grupo,qtd_sistema,qtd_final").eq("inventario_id", inv.id).order("id").range(a, z)) });
  const precosQ = usePrecosVenda();
  const precoMap = useMemo(() => { const m = new Map<string, number>(); for (const p of precosQ.data ?? []) if (p.ativo !== false && Number(p.pr_venda) > 0) m.set(chaveSkuInv(p.sku), Number(p.pr_venda)); return m; }, [precosQ.data]);
  const base = useMemo(() => divergentesAcabados(itensQ.data ?? [], precoMap), [itensQ.data, precoMap]);
  const valor = parseNumeroBR(valorTxt);
  const r = useMemo(() => conciliarValorAberto(base, valor), [base, valor]);
  if (itensQ.isLoading || precosQ.isLoading) return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  const faltaTotal = base.reduce((s, l) => s + l.falta * (l.preco ?? 0), 0);
  function exportar() {
    const linhas = [["Código", "Descrição", "Sistema", "Final", "Dif.", "Preço venda", "Qtd a faturar", "Valor"], ...r.linhas.filter((l) => l.qtd > 0).map((l) => [`="${l.sku}"`, l.descricao, num(l.sistema, 4), num(l.final, 4), num(l.dif, 4), num(l.preco, 2), num(l.qtd, 0), num(l.valor, 2)]), ["", "Total", "", "", "", "", "", num(r.total, 2)]];
    const csv = "\uFEFF" + linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `conciliacao-faturamento-inv${inv.numero}.csv`; a.click();
  }
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-4 p-4">
        <label className="space-y-1 text-sm"><span className="font-medium">Valor em aberto (R$)</span><Input inputMode="decimal" placeholder="Ex.: 350,00" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} className="w-44" /></label>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Faturar com itens divergentes</p><p className="text-lg font-bold">{brl(r.total)}</p></div>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Sem cobertura</p><p className={`text-lg font-bold ${r.restante > 0 ? "text-destructive" : ""}`}>{brl(Math.max(0, r.restante))}</p></div>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Faltas disponíveis (preço de venda)</p><p className="text-lg font-bold">{brl(faltaTotal)}</p></div>
        <Button size="sm" variant="outline" className="ml-auto" disabled={r.total <= 0} onClick={exportar}><Download className="mr-1 size-4" />Exportar CSV</Button>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Somente produtos acabados com diferença no total dos lotes (coluna Final). Só as faltas podem ser faturadas, em unidades inteiras, pelo preço de venda cadastrado, sem passar do valor em aberto.</p>
      <div className="max-h-[60vh] overflow-auto rounded-lg border"><table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="px-2 py-1">Produto</th><th className="px-2 py-1">Sistema</th><th className="px-2 py-1">Final</th><th className="px-2 py-1">Dif.</th><th className="px-2 py-1">Preço venda</th><th className="px-2 py-1">Qtd a faturar</th><th className="px-2 py-1">Valor</th></tr></thead>
        <tbody>{base.length === 0 ? <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Nenhum produto acabado com divergência.</td></tr> : r.linhas.map((l) => (
          <tr key={l.sku} className={`border-t ${l.qtd > 0 ? "bg-primary/5" : ""}`}><td className="px-2 py-1">{l.sku} · {l.descricao}</td><td className="px-2 py-1 tabular-nums">{num(l.sistema)}</td><td className="px-2 py-1 tabular-nums">{num(l.final)}</td>
            <td className={`px-2 py-1 tabular-nums ${l.dif < 0 ? "text-destructive" : "text-sky-700"}`}>{l.dif > 0 ? "+" : ""}{num(l.dif)}</td>
            <td className="px-2 py-1 tabular-nums">{l.preco == null ? <span className="text-muted-foreground">sem preço</span> : brl(l.preco)}</td>
            <td className="px-2 py-1 font-semibold tabular-nums">{l.qtd || (l.dif > 0 ? <span className="font-normal text-muted-foreground">sobra</span> : "")}</td><td className="px-2 py-1 tabular-nums">{l.qtd ? brl(l.valor) : ""}</td></tr>))}</tbody>
      </table></div>
    </div>
  );
}
