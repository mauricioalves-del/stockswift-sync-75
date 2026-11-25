// Aba "Conciliação de faturamento": cobre vendas pagas na maquininha e não faturadas com as faltas de produto acabado.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAll } from "@/lib/fetch-all";
import { parseNumeroBR } from "@/lib/precos-venda";
import { usePrecosVenda } from "@/hooks/usePrecosVenda";
import { chaveSkuInv, conciliarValorAberto, divergentesAcabados, distribuirPorLote, ehAcabado, TOLERANCIA_PADRAO } from "@/lib/inventario-faturamento-pendente";
import { num, sb } from "./comum";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ConciliacaoFaturamento({ inv }: { inv: any }) {
  const [valorTxt, setValorTxt] = useState(""); const [manual, setManual] = useState<Record<string, number> | null>(null);
  const itensQ = useQuery({ queryKey: ["inv-conc-fat", inv.id], queryFn: () => fetchAll<any>((a, z) => sb.from("inv_itens").select("id,codigo_produto,descricao,grupo,qtd_sistema,qtd_final,qtd_faturada").eq("inventario_id", inv.id).order("id").range(a, z)) });
  const precosQ = usePrecosVenda();
  const precoMap = useMemo(() => { const m = new Map<string, number>(); for (const p of precosQ.data ?? []) if (p.ativo !== false && Number(p.pr_venda) > 0) m.set(chaveSkuInv(p.sku), Number(p.pr_venda)); return m; }, [precosQ.data]);
  const base = useMemo(() => divergentesAcabados(itensQ.data ?? [], precoMap), [itensQ.data, precoMap]);
  const valor = parseNumeroBR(valorTxt);
  const aplicado = base.some((l) => l.qtd > 0);
  const auto = useMemo(() => conciliarValorAberto(base, valor, TOLERANCIA_PADRAO), [base, valor]);
  const sugestao = useMemo(() => { if (!manual) return auto; const ls = auto.linhas.map((l) => { const q = l.preco ? Math.max(0, Math.min(l.falta, Math.floor(manual[l.sku] ?? 0))) : 0; return { ...l, qtd: q, valor: Math.round(q * (l.preco ?? 0) * 100) / 100 }; }); const total = Math.round(ls.reduce((s, l) => s + l.valor, 0) * 100) / 100; return { linhas: ls, total, restante: Math.round((valor - total) * 100) / 100 }; }, [auto, manual, valor]);
  const editar = (sku: string, q: number) => setManual((m) => ({ ...(m ?? Object.fromEntries(auto.linhas.map((l) => [l.sku, l.qtd]))), [sku]: q }));
  const r = aplicado ? { linhas: base, total: Math.round(base.reduce((s, l) => s + l.valor, 0) * 100) / 100, restante: 0 } : sugestao;
  const qc = useQueryClient(); const [salvando, setSalvando] = useState(false);
  const bloqueado = !!inv.fechamento_id;
  async function gravar(desfazer: boolean) {
    if (!confirm(desfazer ? "Desfazer a conciliação? As unidades voltam a contar como divergência." : `Aplicar ${brl(r.total)} faturados no resultado do inventário? Essas faltas deixam de ser divergência real.`)) return;
    setSalvando(true);
    try {
      const itens = (itensQ.data ?? []).filter((i: any) => ehAcabado(i.grupo) && i.qtd_final != null);
      const ups: { id: string; qtd_final: number; qtd_faturada: number; sistema: number }[] = [];
      if (desfazer) for (const i of itens) { const f = Number(i.qtd_faturada) || 0; if (f) ups.push({ id: i.id, qtd_final: Number(i.qtd_final) - f, qtd_faturada: 0, sistema: Number(i.qtd_sistema) }); }
      else for (const l of r.linhas.filter((x) => x.qtd > 0)) {
        const lotes = itens.filter((i: any) => chaveSkuInv(i.codigo_produto) === chaveSkuInv(l.sku));
        for (const d of distribuirPorLote(lotes, l.qtd)) { const i = lotes.find((x: any) => x.id === d.id)!; ups.push({ id: i.id, qtd_final: Number(i.qtd_final) + d.add, qtd_faturada: (Number(i.qtd_faturada) || 0) + d.add, sistema: Number(i.qtd_sistema) }); }
      }
      for (const u of ups) { const { error } = await sb.from("inv_itens").update({ qtd_final: u.qtd_final, qtd_faturada: u.qtd_faturada, divergente: u.qtd_final !== u.sistema }).eq("id", u.id); if (error) throw error; }
      const me = await sb.auth.getUser();
      await sb.from("auditoria").insert({ entidade: "inv_inventarios", entidade_id: inv.id, acao: desfazer ? "CONCILIACAO_FATURAMENTO_DESFEITA" : "CONCILIACAO_FATURAMENTO", usuario: me.data.user?.id, observacao: `Inventário #${inv.numero}: ${desfazer ? "desfeita" : `valor em aberto ${brl(valor)}, faturado ${brl(r.total)}: ${r.linhas.filter((x) => x.qtd > 0).map((x) => `${x.sku}×${x.qtd}`).join(", ")}`}` });
      toast.success(desfazer ? "Conciliação desfeita." : "Conciliação aplicada ao resultado do inventário.");
      await Promise.all([itensQ.refetch(), qc.invalidateQueries({ queryKey: ["inv-painel", inv.id] })]);
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setSalvando(false); }
  }
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
        {aplicado ? <div className="text-sm"><p className="text-xs text-muted-foreground">Situação</p><p className="font-semibold text-emerald-700">Conciliação aplicada ao resultado</p></div>
          : <label className="space-y-1 text-sm"><span className="font-medium">Valor em aberto (R$)</span><Input inputMode="decimal" placeholder="Ex.: 350,00" value={valorTxt} onChange={(e) => { setValorTxt(e.target.value); setManual(null); }} className="w-44" /></label>}
        <div className="text-sm"><p className="text-xs text-muted-foreground">Faturar com itens divergentes</p><p className="text-lg font-bold">{brl(r.total)}</p></div>
        <div className="text-sm"><p className="text-xs text-muted-foreground">{r.restante < 0 ? "Acima do valor" : "Sem cobertura"}</p><p className={`text-lg font-bold ${r.restante > 0 || r.restante < -TOLERANCIA_PADRAO ? "text-destructive" : ""}`}>{brl(Math.abs(r.restante))}</p></div>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Produtos / unidades</p><p className="text-lg font-bold">{r.linhas.filter((l) => l.qtd > 0).length} / {r.linhas.reduce((s, l) => s + l.qtd, 0)}</p></div>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Faltas disponíveis (preço de venda)</p><p className="text-lg font-bold">{brl(faltaTotal)}</p></div>
        <div className="ml-auto flex gap-2">{manual && !aplicado && <Button size="sm" variant="ghost" onClick={() => setManual(null)}>Voltar à sugestão</Button>}{aplicado ? <Button size="sm" variant="outline" disabled={salvando || bloqueado} onClick={() => gravar(true)}>Desfazer conciliação</Button> : <Button size="sm" disabled={salvando || bloqueado || r.total <= 0} onClick={() => gravar(false)}>{salvando ? "Aplicando…" : "Aplicar no resultado"}</Button>}<Button size="sm" variant="outline" disabled={r.total <= 0} onClick={exportar}><Download className="mr-1 size-4" />Exportar CSV</Button></div>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Somente produtos acabados com diferença no total dos lotes (coluna Final). A sugestão cobre o valor em aberto podendo passar até R$ {TOLERANCIA_PADRAO} e usa o maior número de produtos diferentes. Marque ou ajuste a quantidade de cada produto para montar sua própria seleção. Ao aplicar, as unidades faturadas entram na coluna Final e deixam de ser divergência real em todo o inventário (painel, lotes a corrigir e fechamento).{bloqueado ? " O fechamento oficial já foi gerado; a conciliação não pode mais ser alterada." : ""}</p>
      <div className="max-h-[60vh] overflow-auto rounded-lg border"><table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="w-8 px-2 py-1"></th><th className="px-2 py-1">Produto</th><th className="px-2 py-1">Sistema</th><th className="px-2 py-1">Final</th><th className="px-2 py-1">Dif.</th><th className="px-2 py-1">Preço venda</th><th className="px-2 py-1">Qtd a faturar</th><th className="px-2 py-1">Valor</th></tr></thead>
        <tbody>{base.length === 0 ? <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Nenhum produto acabado com divergência.</td></tr> : r.linhas.map((l) => (
          <tr key={l.sku} className={`border-t ${l.qtd > 0 ? "bg-primary/5" : ""}`}><td className="px-2 py-1">{!aplicado && l.falta > 0 && l.preco != null && <input type="checkbox" aria-label={`Selecionar ${l.sku}`} checked={l.qtd > 0} onChange={(e) => editar(l.sku, e.target.checked ? 1 : 0)} />}</td><td className="px-2 py-1">{l.sku} · {l.descricao}</td><td className="px-2 py-1 tabular-nums">{num(l.sistema)}</td><td className="px-2 py-1 tabular-nums">{num(l.final)}</td>
            <td className={`px-2 py-1 tabular-nums ${l.dif < 0 ? "text-destructive" : "text-sky-700"}`}>{l.dif > 0 ? "+" : ""}{num(l.dif)}</td>
            <td className="px-2 py-1 tabular-nums">{l.preco == null ? <span className="text-muted-foreground">sem preço</span> : brl(l.preco)}</td>
            <td className="px-2 py-1 font-semibold tabular-nums">{!aplicado && l.falta > 0 && l.preco != null ? <Input type="number" min={0} max={l.falta} value={l.qtd} onChange={(e) => editar(l.sku, Number(e.target.value) || 0)} className="h-7 w-16 px-1" aria-label={`Quantidade ${l.sku}`} /> : l.qtd || (l.dif > 0 ? <span className="font-normal text-muted-foreground">sobra</span> : "")}</td><td className="px-2 py-1 tabular-nums">{l.qtd ? brl(l.valor) : ""}</td></tr>))}</tbody>
      </table></div>
    </div>
  );
}
