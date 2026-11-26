// 3ª contagem (só Administrador): SKUs em que a 1ª e a 2ª contagem ficaram fora da tolerância em relação ao sistema.
// O lançamento da 3ª vira a contagem final de ajuste; sem 3ª, vale a contagem mais próxima do sistema (1ª ou 2ª).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAll } from "@/lib/fetch-all";
import { num, sb } from "./comum";

const fora = (cont: number, sis: number, tol: number) => (sis === 0 ? cont !== 0 : (Math.abs(cont - sis) / Math.abs(sis)) * 100 > tol);

export function TerceiraContagem({ inv }: { inv: any }) {
  const qc = useQueryClient(); const tol = Number(inv.tolerancia_pct ?? 5); const aberta = inv.status === "em_recontagem";
  const q = useQuery({ queryKey: ["inv-terceira", inv.id], queryFn: async () => fetchAll<any>((f, t) => sb.from("inv_itens").select("id, codigo_produto, descricao, lote, unidade, qtd_sistema, qtd_contagem, qtd_recontagem, qtd_terceira, terceira_obs, qtd_final, qtd_faturada, custo_unitario, divergente").eq("inventario_id", inv.id).eq("divergente", true).order("codigo_produto").range(f, t)) });
  const [val, setVal] = useState<Record<string, string>>({}); const [obs, setObs] = useState<Record<string, string>>({}); const [todos, setTodos] = useState(false);
  const skus = useMemo(() => {
    const m = new Map<string, any[]>(); for (const i of q.data ?? []) m.set(i.codigo_produto, [...(m.get(i.codigo_produto) ?? []), i]);
    return [...m].map(([sku, ls]) => {
      const fat = ls.reduce((s, l) => s + Number(l.qtd_faturada || 0), 0), sis = ls.reduce((s, l) => s + Number(l.qtd_sistema || 0), 0);
      const c1 = ls.reduce((s, l) => s + Number(l.qtd_contagem || 0), 0) + fat, rec = ls.some((l) => l.qtd_recontagem != null), c2 = ls.reduce((s, l) => s + Number(l.qtd_recontagem ?? l.qtd_contagem ?? 0), 0) + fat;
      const inconsistente = rec && fora(c1, sis, tol) && fora(c2, sis, tol);
      return { sku, ls, desc: ls[0].descricao, un: ls[0].unidade, sis, c1, c2, rec, inconsistente, feita: ls.every((l) => l.qtd_terceira != null), fin: ls.reduce((s, l) => s + Number(l.qtd_final ?? 0), 0) };
    });
  }, [q.data, tol]);
  const lista = skus.filter((x) => todos || x.inconsistente);
  const pend = skus.filter((x) => x.inconsistente && !x.feita).length, total = skus.filter((x) => x.inconsistente).length;
  async function salvar(l: any) {
    const v = val[l.id]; const qtd = v == null || v === "" ? null : Number(String(v).replace(",", "."));
    if (qtd != null && !(qtd >= 0)) return toast.error("Quantidade inválida.");
    const r = await sb.rpc("inv_registrar_terceira", { p_item: l.id, p_qtd: qtd, p_obs: obs[l.id] ?? l.terceira_obs ?? null });
    if (r.error) return toast.error(r.error.message);
    toast.success(qtd == null ? "3ª contagem removida: vale a contagem mais próxima do sistema." : `3ª contagem registrada: final ${num(Number(r.data))}.`);
    setVal((s) => { const n = { ...s }; delete n[l.id]; return n; }); qc.invalidateQueries({ queryKey: ["inv-terceira", inv.id] }); qc.invalidateQueries({ queryKey: ["inv-painel", inv.id] });
  }
  if (!q.data) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  return (
    <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2"><Scale className="size-4" /><b>3ª contagem do Administrador</b>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{total - pend}/{total} SKU(s) inconsistentes com 3ª contagem</span>
        <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Mostrar todos os divergentes</label></div>
      <p className="text-xs text-muted-foreground">Lista os SKUs em que a 1ª e a 2ª contagem ficaram fora da tolerância ({num(tol)}%) em relação ao sistema. Sem 3ª contagem, o final de ajuste é a contagem mais próxima do sistema; com a 3ª lançada, ela passa a ser o final. Deixe a quantidade em branco e salve para desfazer.</p>
      {!aberta && <p className="rounded-md bg-muted p-2 text-xs">A 3ª contagem só pode ser lançada com o inventário em recontagem.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-xs"><thead className="bg-muted"><tr>{["SKU / produto", "Lote", "Sistema", "1ª", "2ª", "Final atual", "3ª contagem", "Observação", ""].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
        <tbody>{lista.map((x) => x.ls.map((l: any, k: number) => {
          const fim = l.qtd_final == null ? null : Number(l.qtd_final), ori = l.qtd_terceira != null ? "3ª" : l.qtd_recontagem == null ? "1ª" : fim === Number(l.qtd_recontagem) + Number(l.qtd_faturada || 0) ? "2ª" : "1ª";
          return (
            <tr key={l.id} className={`border-t align-top ${x.inconsistente && !x.feita ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
              <td className="px-2 py-1">{k === 0 && <><div className="font-mono">{x.sku}</div><div>{x.desc}</div><div className="text-[10px] text-muted-foreground">SKU: sistema {num(x.sis)} · 1ª {num(x.c1)} · 2ª {num(x.c2)}{x.inconsistente ? " · inconsistente" : ""}</div></>}</td>
              <td className="px-2 py-1 font-mono">{l.lote || "—"}</td><td className="px-2 py-1 tabular-nums">{num(l.qtd_sistema)}</td><td className="px-2 py-1 tabular-nums">{num(l.qtd_contagem)}</td><td className="px-2 py-1 tabular-nums">{num(l.qtd_recontagem)}</td>
              <td className="px-2 py-1 font-semibold tabular-nums">{num(fim)} <span className="text-[10px] font-normal text-muted-foreground">({ori})</span></td>
              <td className="px-2 py-1"><Input disabled={!aberta} className="h-8 w-28 text-right" inputMode="decimal" placeholder="—" value={val[l.id] ?? (l.qtd_terceira != null ? String(l.qtd_terceira) : "")} onChange={(e) => setVal({ ...val, [l.id]: e.target.value })} /></td>
              <td className="px-2 py-1"><Input disabled={!aberta} className="h-8 min-w-[180px]" placeholder="Motivo / evidência" value={obs[l.id] ?? l.terceira_obs ?? ""} onChange={(e) => setObs({ ...obs, [l.id]: e.target.value })} /></td>
              <td className="px-2 py-1">{aberta && <Button size="sm" variant="outline" onClick={() => salvar(l)}>Salvar</Button>}</td>
            </tr>); }))}</tbody></table></div>
      {!lista.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum SKU com 1ª e 2ª contagem inconsistentes.</p>}
    </CardContent></Card>
  );
}
