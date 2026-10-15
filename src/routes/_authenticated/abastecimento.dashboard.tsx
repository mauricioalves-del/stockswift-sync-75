import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { criarElegibilidade, nomeMes } from "@/lib/abastecimento-validacao";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarDash, transitoPorLocal, type Cluster } from "@/lib/abastecimento-dash";
import type { HistLinha } from "@/lib/abastecimento-dash-hist";
import { Kpis, ResumoLocais } from "@/components/abast-dash/Resumo";
import { Evolucao, Rankings } from "@/components/abast-dash/Evolucao";
import { Detalhe } from "@/components/abast-dash/Detalhe";
import { Farol, type ChipG } from "@/components/abast-dash/Farol";
import { NOME, Secao, type Categoria, type Escopo, type Filtro } from "@/components/abast-dash/comum";

export const Route = createFileRoute("/_authenticated/abastecimento/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Disponibilidade de Estoque — Abastecimento" }] }),
});

const hojeBrt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const padrao = (hoje: string): Filtro => ({ de: `${hoje.slice(0, 7)}-01`, ate: hoje, escopo: "TODOS", categoria: "AMBAS" });

function DashboardPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const hoje = hojeBrt();
  const [filtro, setFiltro] = useState<Filtro>(() => padrao(hoje));
  const [chipG, setChipG] = useState<ChipG>("TODOS");
  const bruto = useAbastBruto(pode);

  const histQ = useQuery({
    enabled: pode, queryKey: ["abast-dash-hist", filtro.de, filtro.ate], refetchInterval: 300000,
    queryFn: async () => {
      const sb = supabase as any; const out: HistLinha[] = [];
      for (let f = 0; ; f += 1000) {
        const { data, error } = await sb.from("abast_disponibilidade_diaria").select("data, loja, id_produto, categoria, descricao, em_ruptura").gte("data", filtro.de).lte("data", filtro.ate).order("data").order("loja").order("id_produto").range(f, f + 999);
        if (error) throw error; out.push(...((data ?? []) as HistLinha[])); if (!data || data.length < 1000) break;
      }
      return out;
    },
  });

  // Meta OOS: só SKUs elegíveis pela classificação vigente na data (MTO, Decomplex e Inovação < 3 meses ficam fora)
  const clsQ = useQuery({
    enabled: pode, queryKey: ["abast-portfolio-cls"], staleTime: 60000,
    queryFn: async () => fetchAll<any>((f, t) => (supabase as any).from("abast_classificacoes_portfolio").select("sku, classe, vigencia, registrado_em, inicio_inovacao").order("id").range(f, t)),
  });
  const elegivel = useMemo(() => criarElegibilidade(clsQ.data ?? []), [clsQ.data]);
  // Política: loja com portfólio validado (ou herdado do último aprovado) filtra pela lista aprovada;
  // loja nunca validada usa a lista operacional padrão e é sinalizada como "Sem portfólio validado".
  const noPortfolio = useMemo(() => { const ap = bruto.data?.portfolioAprovado ?? {}; const sets = Object.fromEntries(Object.entries(ap).map(([l, a]) => [l, new Set(a)])); return (loja: string, sku: string) => !sets[loja] || sets[loja].has(String(sku).replace(/^0+/, "")); }, [bruto.data]);
  const lojasSemValidacao = useMemo(() => !bruto.data ? [] : bruto.data.lojas.filter((l) => !bruto.data!.portfolioAprovado?.[l.codigo]).map((l) => l.nome), [bruto.data]);
  const lojasHerdadas = useMemo(() => !bruto.data ? [] : bruto.data.lojas.filter((l) => { const o = bruto.data!.portfolioOrigem?.[l.codigo]; return o && o.competencia !== hoje.slice(0, 7); }).map((l) => `${l.nome} (${nomeMes(bruto.data!.portfolioOrigem![l.codigo].competencia)} · v${bruto.data!.portfolioOrigem![l.codigo].versao})`), [bruto.data, hoje]);
  const todas = useMemo(() => (bruto.data ? montarDash(bruto.data, hoje) : []), [bruto.data, hoje]);
  const catOk = (c: string | null) => filtro.categoria === "AMBAS" || c === filtro.categoria;
  const linhas = useMemo(() => todas.filter((l: any) => catOk(l.categoria) && elegivel(l.sku, hoje)), [todas, filtro.categoria, elegivel]);
  const hist = useMemo(() => (histQ.data ?? []).filter((h) => catOk(h.categoria) && elegivel(h.id_produto, h.data) && noPortfolio(h.loja, h.id_produto)), [histQ.data, filtro.categoria, elegivel, noPortfolio]);
  const transito = useMemo(() => (bruto.data ? transitoPorLocal(bruto.data, hoje, filtro.categoria === "AMBAS" ? null : filtro.categoria) : {}), [bruto.data, hoje, filtro.categoria]);
  const irFarol = (c: Cluster | "SEMACAO") => { setChipG(c); document.getElementById("bloco-g")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const atualizado = bruto.dataUpdatedAt ? new Date(bruto.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const set = (p: Partial<Filtro>) => setFiltro({ ...filtro, ...p });
  const mesAtual = filtro.de === `${hoje.slice(0, 7)}-01` && filtro.ate === hoje, soHoje = filtro.de === hoje && filtro.ate === hoje;
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">Disponibilidade de Estoque <span className="ml-2 text-sm font-normal text-slate-300">Out of Stock · Stockout · Stock Over</span></h1>
          {lojasHerdadas.length > 0 && <p className="mt-1 text-xs text-amber-300">Pendente de validação — utilizando última versão aprovada: {lojasHerdadas.join(", ")}.</p>}
          {lojasSemValidacao.length > 0 && <p className="mt-1 text-xs text-amber-300">Sem portfólio validado — exibindo lista operacional padrão: {lojasSemValidacao.join(", ")}.</p>}</div>
        <div className="text-xs text-slate-300">Leitura: {atualizado} · última foto diária: {histQ.data?.length ? histQ.data[histQ.data.length - 1].data.split("-").reverse().join("/") : "—"}</div>
      </div>

      <Secao letra="A" titulo="Filtros">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2"><CalendarDays className="mb-2 size-4 text-muted-foreground" />
            <label className="text-[11px] font-semibold text-muted-foreground">De<input type="date" value={filtro.de} max={filtro.ate} onChange={(e) => e.target.value && set({ de: e.target.value })} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" /></label>
            <label className="text-[11px] font-semibold text-muted-foreground">Até<input type="date" value={filtro.ate} min={filtro.de} max={hoje} onChange={(e) => e.target.value && set({ ate: e.target.value })} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" /></label></div>
          <div className="flex gap-1"><button type="button" onClick={() => set({ de: hoje, ate: hoje })} className={`h-9 rounded-md border px-3 text-xs font-semibold ${soHoje ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Hoje</button><button type="button" onClick={() => set({ de: `${hoje.slice(0, 7)}-01`, ate: hoje })} className={`h-9 rounded-md border px-3 text-xs font-semibold ${mesAtual ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Mês atual</button></div>
          <label className="text-[11px] font-semibold text-muted-foreground">Local<select value={filtro.escopo} onChange={(e) => set({ escopo: e.target.value as Escopo })} className="mt-1 block h-9 min-w-[190px] rounded-md border bg-background px-2 text-sm"><option value="TODOS">Todos (lojas + CD)</option><option value="LOJAS">Todas as lojas (meta)</option><option value="ELDORADO">{NOME.ELDORADO}</option><option value="JESUINO">{NOME.JESUINO}</option><option value="PATIO">{NOME.PATIO}</option><option value="CD">{NOME.CD}</option></select></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Categoria<select value={filtro.categoria} onChange={(e) => set({ categoria: e.target.value as Categoria })} className="mt-1 block h-9 min-w-[210px] rounded-md border bg-background px-2 text-sm"><option value="AMBAS">Prod. Acabado + Revenda</option><option value="Produto Acabado">Produto Acabado</option><option value="Mercadoria de Revenda">Mercadoria de Revenda</option></select></label>
          <button type="button" onClick={() => setFiltro(padrao(hoje))} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
        </div>
      </Secao>

      {bruto.isLoading ? <p className="py-10 text-center text-muted-foreground">Carregando a posição de estoque…</p> : bruto.error ? <p className="py-10 text-center text-red-600">Não consegui ler os dados de abastecimento.</p> : (<>
        <Secao letra="B" titulo="Indicadores do período"><Kpis hoje={hoje} filtro={filtro} linhas={linhas} hist={hist} /></Secao>
        <ResumoLocais hoje={hoje} filtro={filtro} setFiltro={setFiltro} linhas={linhas} hist={hist} transito={transito} />
        <Evolucao hoje={hoje} filtro={filtro} setFiltro={setFiltro} hist={hist} />
        <Rankings filtro={filtro} linhas={linhas} irFarol={irFarol} />
        <Detalhe filtro={filtro} linhas={linhas} />
        <div id="bloco-g"><Farol hoje={hoje} filtro={filtro} setFiltro={setFiltro} linhas={linhas} chip={chipG} setChip={setChipG} /></div>
      </>)}
    </div>
  );
}
