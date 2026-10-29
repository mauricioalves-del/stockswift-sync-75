import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download, Search, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { criarElegibilidade } from "@/lib/abastecimento-validacao";
import { nk } from "@/lib/abastecimento-dados";
import { CabCol } from "@/components/abast-dash/CabecalhoFiltro";
import { comparar, filtroAtivo, opcoesCategoria, passaFiltros, type Filtro, type Ordem } from "@/lib/tabela-filtro";
import { COLS_GERAL, COLUNAS, FILTRO_VAZIO, ROTULO, contar, csvEstoque, filtrarLinhas, montarEstoqueGeral, proximaOrdemMenorMaior, type Celula, type Estado, type FiltroGeral } from "@/lib/abastecimento-estoque-geral";

export const Route = createFileRoute("/_authenticated/abastecimento/estoque")({
  component: EstoquePage,
  // ?sku=… abre a tela já filtrada em um SKU (link da tabela de divergências do Indicador de Inventário).
  validateSearch: (s: Record<string, unknown>): { sku?: string } => (typeof s.sku === "string" && s.sku.trim() ? { sku: s.sku.trim() } : {}),
  head: () => ({ meta: [{ title: "Visão Geral de Estoque — Abastecimento" }] }),
});

const hojeBrt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const COR: Record<Estado, string> = {
  ruptura: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-100",
  abaixo: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-100",
  ok: "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-100",
  excesso: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100",
};
const CHIP: Record<Estado, string> = {
  ruptura: "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100",
  abaixo: "border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-100",
  ok: "border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950/60 dark:text-green-100",
  excesso: "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100",
};
const un = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function CelulaTd({ c }: { c: Celula }) {
  const dica = c.estado ? `${ROTULO[c.estado]}${c.minimo !== null ? ` · mín ${un(c.minimo)}` : ""}${c.maximo !== null ? ` · máx ${un(c.maximo)}` : ""}` : c.foraMeta ? "No portfólio, mas fora da meta OOS (sem cor)" : undefined;
  return <td title={dica} className={`px-2 py-1.5 text-right tabular-nums ${c.estado ? COR[c.estado] + " font-semibold" : c.qtd === 0 ? "text-muted-foreground/50" : ""}`}>{c.qtd === 0 && !c.estado ? "·" : un(c.qtd)}</td>;
}

function EstoquePage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const { sku: skuParam } = Route.useSearch();
  const hoje = hojeBrt();
  const bruto = useAbastBruto(pode);
  const clsQ = useQuery({
    enabled: pode, queryKey: ["abast-portfolio-cls"], staleTime: 60000,
    queryFn: async () => fetchAll<any>((f, t) => (supabase as any).from("abast_classificacoes_portfolio").select("sku, classe, vigencia, registrado_em, inicio_inovacao").order("id").range(f, t)),
  });
  const elegivel = useMemo(() => criarElegibilidade(clsQ.data ?? []), [clsQ.data]);
  // categoria do produto: tela "Cadastro de Categoria" (pilar Cadastro). Mesma chave de cache da tela de origem.
  const catQ = useQuery({
    enabled: pode, queryKey: ["categorias-produto"], staleTime: 60000,
    queryFn: async () => fetchAll<any>((fr, to) => (supabase as any).from("categorias_produto").select("*").order("segmento").order("categoria").order("codigo_produto").range(fr, to)),
  });
  const categorias = useMemo(() => { const m = new Map<string, string>(); for (const c of catQ.data ?? []) if (c.categoria) m.set(nk(String(c.codigo_produto)), String(c.categoria)); return m; }, [catQ.data]);
  const [f, setF] = useState<FiltroGeral>(FILTRO_VAZIO); const [limite, setLimite] = useState(100);
  const [filtros, setFiltros] = useState<Record<string, Filtro>>({}); const [ordem, setOrdem] = useState<Ordem>(null);
  const todas = useMemo(() => (bruto.data ? montarEstoqueGeral(bruto.data, hoje, elegivel, undefined, categorias) : []), [bruto.data, hoje, elegivel, categorias]);
  const cnt = useMemo(() => contar(todas), [todas]);
  const nomesCategoria = useMemo(() => [...new Set(todas.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })), [todas]);
  const lista = useMemo(() => {
    const base = filtrarLinhas(todas, f).filter((l) => passaFiltros(l, COLS_GERAL, filtros) && (!skuParam || nk(l.sku) === nk(skuParam)));
    const col = ordem ? COLS_GERAL.find((c) => c.k === ordem.k) : null;
    return col && ordem ? [...base].sort((a, b) => comparar(a, b, col, ordem.dir)) : base;
  }, [todas, f, filtros, ordem, skuParam]);
  const nFiltros = Object.values(filtros).filter((x) => filtroAtivo(x)).length;
  const set = (p: Partial<FiltroGeral>) => { setF({ ...f, ...p }); setLimite(100); };
  const alterna = (e: Estado) => set({ estados: f.estados.includes(e) ? f.estados.filter((x) => x !== e) : [...f.estados, e] });
  const atualizado = bruto.dataUpdatedAt ? new Date(bruto.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
  const baixar = () => {
    const url = URL.createObjectURL(new Blob([csvEstoque(lista)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Estoque_Visao_Geral_${hoje}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const filtrando = f.estados.length > 0 || f.stockout || f.stockover || f.busca !== "" || f.categoria !== "" || nFiltros > 0 || ordem !== null;
  const estados: Estado[] = ["ruptura", "abaixo", "ok", "excesso"];
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">Visão Geral de Estoque</h1><p className="text-xs text-slate-300">Portfólio aprovado: saldo por almoxarifado (planilha do ERP) com a posição de cada loja e do CD no plano de abastecimento</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link to="/abastecimento/dashboard" className="flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 hover:bg-slate-800">Disponibilidade <ArrowUpRight className="size-3" /></Link>
          <Link to="/abastecimento/reposicao" className="flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 hover:bg-slate-800">Reposição de Lojas <ArrowUpRight className="size-3" /></Link>
          <Link to="/abastecimento/projecao-cd" className="flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 hover:bg-slate-800">Projeção do CD <ArrowUpRight className="size-3" /></Link>
          <span className="text-slate-400">Estoque lido em {atualizado}</span>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase text-muted-foreground">Posição no plano</span>
          {estados.map((e) => <button key={e} type="button" onClick={() => alterna(e)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${CHIP[e]} ${f.estados.includes(e) ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : "opacity-80 hover:opacity-100"}`}>{ROTULO[e]} <b>{cnt[e]}</b></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase text-muted-foreground" title="Mesma definição da Disponibilidade, nas lojas: Stockout = saldo abaixo do mínimo; Stock Over = saldo acima do máximo">Status (lojas)</span>
          <button type="button" onClick={() => set({ stockout: !f.stockout })} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${f.stockout ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Stockout <b>{cnt.stockout}</b></button>
          <button type="button" onClick={() => set({ stockover: !f.stockover })} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${f.stockover ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Stock Over <b>{cnt.stockover}</b></button>
          <div className="relative ml-auto"><Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" /><input value={f.busca} onChange={(e) => set({ busca: e.target.value })} placeholder="Buscar SKU ou produto" className="h-8 w-60 rounded-md border bg-background pl-7 pr-2 text-xs" /></div>
          <select value={f.categoria} onChange={(e) => set({ categoria: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs" title="Categoria do Cadastro de Categoria"><option value="">Todas as categorias</option>{nomesCategoria.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <Link to="/categorias" className="flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted" title="Abrir o Cadastro de Categoria (pilar Cadastro)"><Tags className="size-3.5" /> Cadastro de Categoria <ArrowUpRight className="size-3" /></Link>
          {filtrando && <button type="button" onClick={() => { setF(FILTRO_VAZIO); setFiltros({}); setOrdem(null); setLimite(100); }} className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-muted">Limpar{nFiltros > 0 ? ` (${nFiltros} de coluna)` : ""}</button>}
          <button type="button" onClick={baixar} className="flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted"><Download className="size-3.5" /> Exportar CSV</button>
        </div>
        {skuParam && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
            <span>Filtrado pelo SKU <b className="font-mono">{skuParam}</b> (aberto pelo Indicador de Inventário).</span>
            {bruto.data && lista.length === 0 && <span className="text-amber-700 dark:text-amber-300">Este SKU não está no portfólio aprovado desta visão.</span>}
            <Link to="/abastecimento/estoque" search={{}} className="ml-auto font-semibold text-primary hover:underline">Mostrar todos os SKUs</Link>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>Cores (lojas e CD):</span>
          {estados.map((e) => <span key={e} className="flex items-center gap-1"><span className={`inline-block size-3 rounded-sm border ${COR[e]}`} />{ROTULO[e]}</span>)}
          <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm border bg-background" />Fora do planejamento (sem cor)</span>
          <span>· Processo, Qualidade e PDV são informativos. Clique no título para ordenar (menor → maior) e no funil para filtrar cada coluna.</span>
        </div>
      </section>

      {bruto.isLoading ? <p className="py-10 text-center text-muted-foreground">Carregando o estoque…</p> : bruto.error ? <p className="py-10 text-center text-red-600">Não consegui ler o estoque.</p> : (
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="max-h-[72vh] overflow-auto"><table className="w-full text-sm">
            <thead><tr className="border-b text-[11px] uppercase">{COLS_GERAL.map((c) => <CabCol key={c.k} col={c} ordem={ordem} onOrdem={() => setOrdem(proximaOrdemMenorMaior(ordem, c))} filtro={filtros[c.k]} onFiltro={(x) => setFiltros({ ...filtros, [c.k]: x })} opcoes={c.t === "cat" ? opcoesCategoria(todas, c) : []} />)}</tr></thead>
            <tbody>{lista.slice(0, limite).map((l) => (
              <tr key={l.sku} className="border-b hover:bg-muted/30">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{l.sku}</td>
                <td className="max-w-[300px] truncate px-2 py-1.5" title={l.descricao}>{l.descricao}{l.foraMeta && !l.noPlano && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="No portfólio, mas fora da meta OOS">fora da meta OOS</span>}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs">{l.classe}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs">{l.categoria}</td>
                {COLUNAS.map((c) => <CelulaTd key={c.k} c={l.celulas[c.k]} />)}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{un(l.total)}</td>
              </tr>))}
              {lista.length === 0 && <tr><td colSpan={COLS_GERAL.length} className="p-8 text-center text-muted-foreground">Nenhum SKU neste filtro.</td></tr>}</tbody>
          </table></div>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span>{un(lista.length)} de {un(cnt.total)} SKUs · ● = coluna com posição no plano</span>{lista.length > limite && <button type="button" onClick={() => setLimite(limite + 150)} className="rounded-md border px-3 py-1 font-semibold hover:bg-muted">Mostrar mais</button>}</div>
        </section>)}
    </div>
  );
}
