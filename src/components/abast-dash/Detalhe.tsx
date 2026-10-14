import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { DashLinha } from "@/lib/abastecimento-dash";
import { CLUSTER_PILL, CLUSTER_ROTULO, Chip, NOME, Pill, STATUS_PILL, Secao, Th, dm, escopoLocais, n0, n1, pct, type Filtro } from "@/components/abast-dash/comum";

export type ChipF = "TODOS" | "ruptura" | "stockout" | "ok" | "stockover" | "SEMACAO";
const ORDEM: Record<string, number> = { ruptura: 0, stockout: 1, stockover: 2, ok: 3 };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const zeraTexto = (l: DashLinha) => (l.status === "ruptura" ? "já zerado" : l.zeraEm ? `${dm(l.zeraEm)} · ${l.diasAteZerar} d` : "—");

export function Detalhe({ filtro, linhas }: { filtro: Filtro; linhas: DashLinha[] }) {
  const [chip, setChip] = useState<ChipF>("TODOS"); const [busca, setBusca] = useState(""); const [limite, setLimite] = useState(80);
  const locais = escopoLocais(filtro.escopo); const base = useMemo(() => linhas.filter((l) => locais.includes(l.local)), [linhas, filtro.escopo]);
  const conta = (c: ChipF) => (c === "TODOS" ? base.length : c === "SEMACAO" ? base.filter((l) => l.semAcao).length : base.filter((l) => l.status === c).length);
  const q = norm(busca.trim());
  const lista = useMemo(() => base.filter((l) => (chip === "TODOS" ? true : chip === "SEMACAO" ? l.semAcao : l.status === chip) && (!q || norm(l.produto).includes(q) || l.sku.includes(q)))
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || b.excessoRs - a.excessoRs || a.produto.localeCompare(b.produto, "pt-BR")), [base, chip, q]);
  function csv() {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["Local", "SKU", "Produto", "Categoria", "Status", "Estoque", "Mínimo", "Máximo", "Venda/dia", "Cobertura (d)", "Em trânsito", "Chega em", "Zera em", "Sugestão", "Excesso R$"];
    const corpo = lista.map((l) => [NOME[l.local], l.sku, l.produto, l.categoria, STATUS_PILL[l.status].r, l.estoque, l.minimo ?? "", l.maximo ?? "", n1(l.vbm), l.cobertura === null ? "" : n1(l.cobertura), l.emTransito || "", l.chegaEm ?? "", zeraTexto(l), l.sugestao || "", l.excessoRs ? l.excessoRs.toFixed(2).replace(".", ",") : ""]);
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab, ...corpo].map((r) => r.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Disponibilidade_detalhe_${filtro.escopo}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const chips: { c: ChipF; r: string; cls?: string }[] = [{ c: "TODOS", r: "Todos" }, { c: "ruptura", r: "Ruptura" }, { c: "stockout", r: "Stockout" }, { c: "ok", r: "OK" }, { c: "stockover", r: "Stock Over" }, { c: "SEMACAO", r: "Sem ação", cls: "border-red-300 text-red-700" }];
  return (
    <Secao letra="F" titulo="Detalhe por SKU" acao={<div className="flex flex-wrap items-center gap-2">
      <div className="relative"><Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(80); }} placeholder="Buscar produto ou SKU" className="h-8 w-56 rounded-md border bg-background pl-7 pr-2 text-xs" /></div>
      <button type="button" onClick={csv} className="flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted"><Download className="size-3.5" /> Exportar CSV</button></div>}>
      <div className="mb-3 flex flex-wrap gap-2">{chips.map((x) => <Chip key={x.c} ativo={chip === x.c} onClick={() => { setChip(x.c); setLimite(80); }} cls={x.cls}>{x.r} <b>{conta(x.c)}</b></Chip>)}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40"><Th c="Local" /><Th c="SKU" /><Th c="Produto" /><Th c="Categoria" /><Th c="Status" /><Th c="Estoque" d /><Th c="Mín" d /><Th c="Máx" d /><Th c="Venda/d" d /><Th c="Cobert. (d)" d /><Th c="Em trâns." d /><Th c="Chega em" d /><Th c="Zera em" d /><Th c="Sugestão" d /><Th c="Excesso R$" d /></tr></thead>
        <tbody>{lista.slice(0, limite).map((l) => <tr key={l.local + l.sku} className="border-b hover:bg-muted/40"><td className="px-2 py-2 whitespace-nowrap">{NOME[l.local]}</td><td className="px-2 py-2 font-mono text-xs">{l.sku}</td><td className="px-2 py-2 max-w-[260px] truncate" title={l.produto}>{l.produto}</td><td className="px-2 py-2 text-xs text-muted-foreground">{l.categoria === "Mercadoria de Revenda" ? "Revenda" : "Prod. Acabado"}</td>
          <td className="px-2 py-2"><Pill cls={STATUS_PILL[l.status].c}>{STATUS_PILL[l.status].r}</Pill></td><td className="px-2 py-2 text-right font-semibold">{n0(l.estoque)}</td><td className="px-2 py-2 text-right text-muted-foreground">{l.minimo === null ? "—" : n0(l.minimo)}</td><td className="px-2 py-2 text-right text-muted-foreground">{l.maximo === null ? "—" : n0(l.maximo)}</td>
          <td className="px-2 py-2 text-right">{n1(l.vbm)}</td><td className="px-2 py-2 text-right">{l.cobertura === null ? "—" : n1(l.cobertura)}</td><td className="px-2 py-2 text-right font-semibold text-teal-700">{l.emTransito ? `${n0(l.emTransito)} un` : "—"}</td><td className="px-2 py-2 text-right font-semibold text-teal-700">{l.chegaEm ? dm(l.chegaEm) : "—"}</td>
          <td className="px-2 py-2 text-right">{l.status === "ruptura" || l.zeraEm ? <Pill cls={CLUSTER_PILL[l.cluster]}>{zeraTexto(l)}</Pill> : "—"}</td><td className="px-2 py-2 text-right font-semibold">{l.sugestao ? n0(l.sugestao) : "—"}</td><td className="px-2 py-2 text-right">{l.excessoRs ? n0(l.excessoRs) : "—"}</td></tr>)}
          {lista.length === 0 && <tr><td colSpan={15} className="p-6 text-center text-muted-foreground">Nenhum SKU neste filtro.</td></tr>}</tbody></table></div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{n0(lista.length)} SKU(s) · {n0(base.filter((l) => l.status === "ruptura").length)} em ruptura · {n0(base.filter((l) => l.status === "stockout").length)} em stockout · {n0(base.filter((l) => l.status === "stockover").length)} em stock over{base.length ? ` · ${pct(base.filter((l) => l.status === "ruptura").length / base.length, 1)} de ruptura` : ""}</span>{lista.length > limite && <button type="button" onClick={() => setLimite(limite + 120)} className="rounded-md border px-3 py-1 font-semibold hover:bg-muted">Mostrar mais</button>}</div>
      <details className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold text-foreground">Como calculamos</summary><ul className="mt-2 list-disc space-y-1 pl-5">
        <li><b>Out of Stock (ruptura):</b> estoque físico = 0 em SKU do sortimento ativo (Produto Acabado + Mercadoria de Revenda). É o indicador com meta (≤ 3,0%).</li><li><b>Stockout:</b> 0 &lt; estoque &lt; mínimo da política. <b>Stock Over:</b> estoque &gt; máximo da política. Mínimo e máximo vêm de "Cobertura e parâmetros" (mínimo = exposição + venda/dia × dias mínimos; máximo = exposição + venda/dia × (dias máximos + segurança)).</li>
        <li><b>Venda/dia (VBM):</b> venda média ponderada dos últimos 7/30/90 dias com índice sazonal. <b>Cobertura:</b> (estoque − exposição) ÷ VBM. <b>Excesso R$:</b> (estoque − máximo) × custo unitário.</li><li><b>Em trânsito:</b> pedidos (aberto/separação/separado chegam na próxima quarta; enviado chega no dia seguinte) e notas de transferência pendentes (D+1 da emissão). Não entra no estoque físico: não reduz a ruptura.</li>
        <li><b>Zera em:</b> primeiro dia em que o estoque projetado (início do dia) fica abaixo de 1 unidade: estoque + entradas − venda/dia × dias. <b>Sem ação:</b> zera em até 15 dias e a reposição não chega antes de zerar ou não existe.</li></ul></details>
    </Secao>
  );
}
