// Indicador de Produção — painel executivo no padrão da Dispersão de Lote.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Secao } from "@/components/abast-dash/comum";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { indicadorProducao, maisVendidos, opsDeConsumo, paretoCusto, type ConsumoLinha } from "@/lib/producao-indicador";

export const Route = createFileRoute("/_authenticated/producao/indicador")({ component: IndicadorProducaoPage });

const sb = supabase as any;
const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const pc = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d })}%`);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const mesRot = (m: string) => `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const mom = (v: number | null) => (v == null ? "sem mês anterior" : `${v >= 0 ? "▲" : "▼"} ${pc(Math.abs(v), 1)} vs. mês anterior`);
const k0 = (s: unknown) => String(s ?? "").trim().replace(/^0+/, "");

function Kpi({ t, v, d, tom }: { t: string; v: string; d?: string; tom?: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tom ?? ""}`}>{v}</div>{d && <div className="mt-0.5 text-xs text-muted-foreground">{d}</div>}</div>;
}

function IndicadorProducaoPage() {
  const hoje = new Date().toISOString().slice(0, 10);
  // só busca no navegador, já autenticado: no servidor a consulta volta vazia (RLS) e ficava em cache
  const [noCliente, setNoCliente] = useState(false);
  useEffect(() => setNoCliente(true), []);
  const q = useQuery({
    enabled: noCliente, queryKey: ["indicador-producao", "v4"], staleTime: 10 * 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10), d90 = new Date(Date.now() - 95 * 86400000).toISOString().slice(0, 10);
      const [consumo, grupos, estoque, vendas, bom, apont, disp] = await Promise.all([
        fetchAll<ConsumoLinha>((f, t) => sb.from("producao_consumo").select("id_op, data_producao, produto, desc_produto, qtd_produzida, material, qtd_consumo, qtd_previsto, impacto_rs_congelado, um, custo_unit_medio_congelado").gte("data_producao", desde).order("data_producao").range(f, t)),
        fetchAll<any>((f, t) => sb.from("grupo_produtos").select("codigo_produto, grupo").range(f, t)),
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, quantidade").gt("quantidade", 0).range(f, t)).catch(() => []),
        fetchAll<any>((f, t) => sb.from("historico_consumo").select("sku, data_movimento, quantidade").gte("data_movimento", d90).range(f, t)).catch(() => []),
        fetchAll<any>((f, t) => sb.from("ficha_tecnica_bom").select("id_produto, id_subconjunto, id_item, qtd").range(f, t)).catch(() => []),
        fetchAll<any>((f, t) => sb.from("atlas_ordens_producao").select("numero_op, qtd_produzida").gt("qtd_produzida", 0).range(f, t)).catch(() => []),
        fetchAll<any>((f, t) => sb.from("abast_disponibilidade_diaria").select("id_produto, descricao, familia, data, loja, em_ruptura, venda_perdida_rs").gte("data", d90).range(f, t)).catch(() => []),
      ]);
      return { consumo, grupos, estoque, vendas, bom, apont, disp };
    },
  });
  const ops = useMemo(() => {
    if (!q.data) return [];
    const g = new Map<string, string>(q.data.grupos.map((x: any) => [k0(x.codigo_produto), String(x.grupo ?? "")]));
    // quantidade por unidade do 1º nível da ficha (componente direto do produto da OP)
    // produto acabado: ficha própria (1º nível); produto em processo: a quebra do subconjunto dentro de qualquer ficha
    const pu = new Map<string, number>(), puSub = new Map<string, number>();
    for (const b of q.data.bom) { const qt = Number(b.qtd); if (!(qt > 0)) continue; const kk = `${k0(b.id_subconjunto)}|${k0(b.id_item)}`; if (k0(b.id_subconjunto) === k0(b.id_produto)) pu.set(kk, qt); else if (!puSub.has(kk)) puSub.set(kk, qt); }
    const ap = new Map<string, number>(q.data.apont.map((a: any) => [String(a.numero_op), Number(a.qtd_produzida)]));
    return opsDeConsumo(q.data.consumo, (s) => g.get(k0(s)) ?? null, (p, m) => pu.get(`${k0(p)}|${k0(m)}`) ?? puSub.get(`${k0(p)}|${k0(m)}`) ?? null, ap);
  }, [q.data]);
  const meses = useMemo(() => [...new Set(ops.map((o) => o.mes))].sort().reverse(), [ops]);
  const [mesSel, setMesSel] = useState<string>("");
  const mes = mesSel || meses[0] || hoje.slice(0, 7);
  const r = useMemo(() => (q.data && ops.length ? indicadorProducao(ops, q.data.consumo, mes, { estoque: q.data.estoque, vendas: q.data.vendas, hoje }) : null), [q.data, ops, mes, hoje]);
  const [tipoTop, setTipoTop] = useState<"PA" | "PP">("PA");
  const [tipoPar, setTipoPar] = useState<"PA" | "PP">("PA");
  const [nPar, setNPar] = useState(10);
  const [escopoPar, setEscopoPar] = useState<"mes" | "periodo">("mes");
  const [familia, setFamilia] = useState("Todas");
  const par = useMemo(() => (r ? paretoCusto(ops, tipoPar, escopoPar === "mes" ? (o) => o.mes === mes : (o) => r.serie.some((x) => x.mes === o.mes), nPar) : null), [ops, r, tipoPar, escopoPar, nPar, mes]);
  const mv = useMemo(() => (q.data && r ? maisVendidos(ops, q.data.vendas, q.data.disp, q.data.estoque, hoje, familia, 10) : null), [q.data, r, ops, hoje, familia]);
  const Chip = ({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) => <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-0.5 ${ativo ? "bg-primary text-primary-foreground" : ""}`}>{children}</button>;
  const [filtroDoi, setFiltroDoi] = useState<string>("todos");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold tracking-tight">Indicador de Produção</h1><p className="text-sm text-muted-foreground">Volume produzido, mix Produto Acabado × Produto em Processo, capacidade, aderência à ficha e dias de suficiência do estoque produzido. Base: OPs apontadas (Dispersão de Lote); acabado: quantidade deduzida da ficha técnica (previsto ÷ quantidade por unidade); em processo: massa consumida em kg.</p></div>
        <div className="w-44"><div className="mb-1 text-xs text-muted-foreground">Mês analisado</div>
          <Select value={mes} onValueChange={setMesSel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meses.map((m) => <SelectItem key={m} value={m}>{mesRot(m)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {q.isLoading || !noCliente || q.fetchStatus === "fetching" && !q.data ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando as OPs apontadas…</p> : q.isError ? <p className="py-10 text-center text-sm text-red-600">Não foi possível ler as OPs: {String((q.error as any)?.message ?? q.error)}</p> : !r ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma OP apontada no período.</p> : <>
        <Secao letra="A" titulo={`Indicadores de ${mesRot(mes)}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi t="Produto acabado produzido" v={`${nf(r.kpis.paUn)} un`} d={mom(r.kpis.momPA)} tom={r.kpis.momPA != null && r.kpis.momPA < 0 ? "text-red-600" : "text-emerald-700"} />
            <Kpi t="Produto em processo e subconjuntos" v={`${nf(r.kpis.ppKg, 1)} kg`} d={mom(r.kpis.momPP)} tom={r.kpis.momPP != null && r.kpis.momPP < 0 ? "text-red-600" : "text-emerald-700"} />
            <Kpi t="Ordens de produção" v={nf(r.kpis.ops)} d={`${nf(r.kpis.skus)} SKUs · ${mom(r.kpis.momOps)}`} />
            <Kpi t="Utilização da capacidade" v={pc(r.kpis.utilizacao)} d={`capacidade demonstrada: ${nf(r.capSemana)} un/semana`} tom={(r.kpis.utilizacao ?? 0) < 0.5 ? "text-amber-600" : ""} />
            <Kpi t="Lote médio" v={`${nf(r.kpis.lotePA)} un`} d={`PP: ${nf(r.kpis.lotePP, 1)} kg por OP`} />
            <Kpi t="Produção por dia produtivo" v={`${nf(r.kpis.porDiaPA)} un`} d={`${nf(r.kpis.dias)} dia(s) com OP no mês`} />
            <Kpi t="Aderência à ficha técnica" v={pc(r.kpis.aderencia)} d={`linhas dentro de ±5% · mês anterior ${pc(r.kpis.aderenciaAnt)}`} tom={(r.kpis.aderencia ?? 1) < 0.7 ? "text-amber-600" : "text-emerald-700"} />
            <Kpi t="Perda de processo" v={brl(r.kpis.perda)} d={`${r.kpis.perdaPorMilUn == null ? "—" : brl(r.kpis.perdaPorMilUn)} por 1.000 un produzidas`} tom={r.kpis.perda ? "text-red-600" : ""} />
            <Kpi t="DOI · produto acabado" v={r.kpis.doiPA == null ? "—" : `${nf(r.kpis.doiPA)} dias`} d="estoque ÷ venda média diária das lojas (90 d)" />
            <Kpi t="DOI · produto em processo" v={r.kpis.doiPP == null ? "—" : `${nf(r.kpis.doiPP)} dias`} d="saldo ÷ consumo médio diário em OP (90 d)" />
            <Kpi t="Itens críticos (< 7 dias)" v={nf(r.kpis.criticos)} d={`${nf(r.kpis.excesso)} com excesso (> 60 dias)`} tom={r.kpis.criticos ? "text-red-600" : "text-emerald-700"} />
            <Kpi t="Concentração do top 10" v={pc(r.kpis.top10PA)} d="do volume de produto acabado no mês" />
          </div>
        </Secao>

        <Secao letra="B" titulo="Evolução mensal da produção (MoM)">
          <div className="h-72"><ResponsiveContainer><ComposedChart data={r.serie.map((s) => ({ ...s, rot: mesRot(s.mes) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="rot" fontSize={11} /><YAxis yAxisId="un" fontSize={11} /><YAxis yAxisId="kg" orientation="right" fontSize={11} />
            <Tooltip formatter={(v: any, n: any) => [nf(Number(v), 1), n]} /><Legend />
            <Bar yAxisId="un" dataKey="paUn" name="Produto acabado (un)" fill="#34436C" radius={[3, 3, 0, 0]} />
            <Line yAxisId="kg" dataKey="ppKg" name="Produto em processo e subconjuntos (kg)" stroke="#D98E04" strokeWidth={2} dot />
          </ComposedChart></ResponsiveContainer></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Mês</th><th className="px-2 py-1 text-right">PA (un)</th><th className="px-2 py-1 text-right">MoM</th><th className="px-2 py-1 text-right">PP (kg)</th><th className="px-2 py-1 text-right">MoM</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-right">SKUs</th><th className="px-2 py-1 text-right">Dias com OP</th><th className="px-2 py-1 text-right">Aderência à ficha</th><th className="px-2 py-1 text-right">Perda de processo</th></tr></thead>
            <tbody>{r.serie.map((s, i) => { const a = r.serie[i - 1]; const v = (x: number, y?: number) => (y ? (x - y) / y : null); const c = (n: number | null) => (n == null ? "" : n >= 0 ? "text-emerald-700" : "text-red-600"); const mp = v(s.paUn, a?.paUn), mk = v(s.ppKg, a?.ppKg);
              return <tr key={s.mes} className={`border-t ${s.mes === mes ? "bg-amber-50/60 dark:bg-amber-950/20 font-medium" : ""}`}><td className="px-2 py-1">{mesRot(s.mes)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(s.paUn)}</td><td className={`px-2 py-1 text-right ${c(mp)}`}>{mp == null ? "—" : `${mp >= 0 ? "+" : ""}${pc(mp, 1)}`}</td><td className="px-2 py-1 text-right tabular-nums">{nf(s.ppKg, 1)}</td><td className={`px-2 py-1 text-right ${c(mk)}`}>{mk == null ? "—" : `${mk >= 0 ? "+" : ""}${pc(mk, 1)}`}</td><td className="px-2 py-1 text-right">{nf(s.ops)}</td><td className="px-2 py-1 text-right">{nf(s.skus)}</td><td className="px-2 py-1 text-right">{nf(s.dias)}</td><td className="px-2 py-1 text-right">{pc(s.aderencia)}</td><td className="px-2 py-1 text-right">{s.perda ? brl(s.perda) : "—"}</td></tr>; })}</tbody></table></div>
        </Secao>

        <Secao letra="C" titulo={`Produção diária — ${mesRot(mes)}`}>
          <div className="h-64"><ResponsiveContainer><ComposedChart data={r.diario}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" fontSize={11} /><YAxis yAxisId="un" fontSize={11} /><YAxis yAxisId="kg" orientation="right" fontSize={11} />
            <Tooltip labelFormatter={(d: any) => `Dia ${d}`} formatter={(v: any, n: any) => [nf(Number(v), 1), n]} /><Legend />
            <Bar yAxisId="un" dataKey="paUn" name="Produto acabado (un)" fill="#34436C" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="kg" dataKey="ppKg" name="Produto em processo (kg)" fill="#D98E04" radius={[3, 3, 0, 0]} />
          </ComposedChart></ResponsiveContainer></div>
          <p className="mt-1 text-xs text-muted-foreground">Dias sem barra = sem OP apontada. Picos isolados indicam produção concentrada (lote grande) — compare com o lote médio e a capacidade demonstrada.</p>
        </Secao>

        <Secao letra="D" titulo={`Pareto das produções mais caras — ${escopoPar === "mes" ? mesRot(mes) : `${mesRot(r.serie[0].mes)} a ${mesRot(r.serie.at(-1)!.mes)}`}`} acao={<div className="flex flex-wrap gap-1 text-xs">
            <Chip ativo={tipoPar === "PA"} onClick={() => setTipoPar("PA")}>Produto acabado</Chip><Chip ativo={tipoPar === "PP"} onClick={() => setTipoPar("PP")}>Em processo</Chip>
            <span className="mx-1 text-muted-foreground">|</span>{[10, 20, 30].map((n) => <Chip key={n} ativo={nPar === n} onClick={() => setNPar(n)}>Top {n}</Chip>)}
            <span className="mx-1 text-muted-foreground">|</span><Chip ativo={escopoPar === "mes"} onClick={() => setEscopoPar("mes")}>Mês</Chip><Chip ativo={escopoPar === "periodo"} onClick={() => setEscopoPar("periodo")}>Período ativo</Chip></div>}>
          {!par?.itens.length ? <p className="text-sm text-muted-foreground">Sem produção com custo neste recorte.</p> : <>
            <p className="mb-2 text-xs text-muted-foreground">Custo de material consumido nas OPs (consumo real × custo médio congelado). Total do recorte: <b>{brl(par.total)}</b> · o top {par.itens.length} soma {pc(par.itens.at(-1)!.acum, 0)}.</p>
            <div className="h-72"><ResponsiveContainer><ComposedChart data={par.itens.map((x) => ({ ...x, rot: x.descricao.slice(0, 18) }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="rot" fontSize={10} angle={-30} textAnchor="end" height={70} interval={0} /><YAxis yAxisId="r" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><YAxis yAxisId="p" orientation="right" fontSize={11} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip formatter={(v: any, n: any) => [n === "% acumulado" ? pc(Number(v), 1) : brl(Number(v)), n]} /><Legend />
              <Bar yAxisId="r" dataKey="custo" name="Custo da produção" fill={tipoPar === "PA" ? "#34436C" : "#D98E04"} radius={[3, 3, 0, 0]} />
              <Line yAxisId="p" dataKey="acum" name="% acumulado" stroke="#C62828" strokeWidth={2} dot />
            </ComposedChart></ResponsiveContainer></div>
            <div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">Produto</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-right">{tipoPar === "PA" ? "Un" : "Kg"}</th><th className="px-2 py-1 text-right">Custo</th><th className="px-2 py-1 text-right">Custo / {tipoPar === "PA" ? "un" : "kg"}</th><th className="px-2 py-1 text-right">Part.</th><th className="px-2 py-1 text-right">Acum.</th></tr></thead>
              <tbody>{par.itens.map((x, i) => <tr key={x.produto} className="border-t"><td className="px-2 py-1 text-muted-foreground">{i + 1}</td><td className="px-2 py-1"><span className="font-mono text-[11px] text-muted-foreground">{x.produto}</span> {x.descricao}</td><td className="px-2 py-1 text-right">{x.ops}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.qtd, tipoPar === "PA" ? 0 : 1)}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{brl(x.custo)}</td><td className="px-2 py-1 text-right tabular-nums">{x.custoUn == null ? "—" : x.custoUn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td className="px-2 py-1 text-right">{pc(x.part, 1)}</td><td className="px-2 py-1 text-right">{pc(x.acum, 0)}</td></tr>)}</tbody></table></div>
          </>}
        </Secao>

        <Secao letra="E" titulo="Mais vendidos × produção — itens que não podem faltar" acao={<div className="flex flex-wrap gap-1 text-xs">{["Todas", ...(mv?.familias ?? [])].map((f) => <Chip key={f} ativo={familia === f} onClick={() => setFamilia(f)}>{f}</Chip>)}</div>}>
          {!mv ? null : <>
            <p className="mb-2 text-xs text-muted-foreground">Top 10 por venda das lojas nos últimos 90 dias (produto acabado), com a produção do mesmo período e as rupturas nas lojas (Dashboard de Disponibilidade{mv.inicioRupturas ? `, desde ${mv.inicioRupturas.slice(8, 10)}/${mv.inicioRupturas.slice(5, 7)}` : ""}). Cobertura = produção ÷ venda.</p>
            <div className="mb-3 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Família</th><th className="px-2 py-1 text-right">SKUs vendidos</th><th className="px-2 py-1 text-right">Venda 90 d (un)</th><th className="px-2 py-1 text-right">Produção 90 d (un)</th><th className="px-2 py-1 text-right">Cobertura</th><th className="px-2 py-1 text-right">SKUs com ruptura</th><th className="px-2 py-1 text-right">Dias-loja em ruptura</th><th className="px-2 py-1 text-right">Venda perdida</th></tr></thead>
              <tbody>{mv.porFamilia.filter((f) => f.venda > 0).map((f) => <tr key={f.familia} className={`border-t cursor-pointer ${familia === f.familia ? "bg-amber-50/60 dark:bg-amber-950/20 font-medium" : ""}`} onClick={() => setFamilia(f.familia)}><td className="px-2 py-1">{f.familia}</td><td className="px-2 py-1 text-right">{nf(f.skus)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(f.venda)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(f.producao)}</td><td className={`px-2 py-1 text-right ${f.cobertura != null && f.cobertura < 0.8 ? "font-semibold text-red-600" : ""}`}>{pc(f.cobertura)}</td><td className="px-2 py-1 text-right">{nf(f.comRuptura)}</td><td className={`px-2 py-1 text-right ${f.diasLoja ? "font-semibold text-red-600" : ""}`}>{nf(f.diasLoja)}</td><td className="px-2 py-1 text-right">{f.perda ? brl(f.perda) : "—"}</td></tr>)}</tbody></table></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">Produto</th><th className="px-2 py-1 text-left">Família</th><th className="px-2 py-1 text-right">Venda/dia</th><th className="px-2 py-1 text-right">Venda 90 d</th><th className="px-2 py-1 text-right">Produção 90 d</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-right">Cobertura</th><th className="px-2 py-1 text-right">Estoque</th><th className="px-2 py-1 text-right">DOI</th><th className="px-2 py-1 text-right">Rupturas (dias · dias-loja)</th><th className="px-2 py-1 text-right">Venda perdida</th></tr></thead>
              <tbody>{mv.top.map((x, i) => <tr key={x.sku} className={`border-t ${x.diasRuptura >= 3 ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}><td className="px-2 py-1 text-muted-foreground">{i + 1}</td><td className="px-2 py-1"><span className="font-mono text-[11px] text-muted-foreground">{x.sku}</span> {x.descricao}</td><td className="px-2 py-1 text-xs">{x.familia}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.vendaDia, 1)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.venda)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.producao)}</td><td className="px-2 py-1 text-right">{x.ops}</td><td className={`px-2 py-1 text-right ${x.cobertura != null && x.cobertura < 0.8 ? "font-semibold text-red-600" : "text-emerald-700"}`}>{pc(x.cobertura)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.estoque)}</td><td className={`px-2 py-1 text-right ${x.doi != null && x.doi < 7 ? "font-semibold text-red-600" : ""}`}>{x.doi == null ? "—" : `${nf(x.doi)} d`}</td><td className={`px-2 py-1 text-right ${x.diasRuptura ? "font-semibold text-red-600" : "text-emerald-700"}`}>{x.diasRuptura ? `${x.diasRuptura} · ${x.diasLoja}` : "sem ruptura"}</td><td className="px-2 py-1 text-right">{x.perda ? brl(x.perda) : "—"}</td></tr>)}
                {!mv.top.length && <tr><td colSpan={12} className="py-4 text-center text-muted-foreground">Sem venda nesta família nos últimos 90 dias.</td></tr>}</tbody></table></div>
            <p className="mt-1 text-xs text-muted-foreground">Linha em vermelho: item entre os mais vendidos com ruptura em 3 ou mais dias — produção abaixo da venda ou lote mal distribuído. Cobertura abaixo de 80%: a produção não acompanhou a venda no período.</p>
          </>}
        </Secao>

        <div className="grid gap-4 lg:grid-cols-2">
          <Secao letra="F" titulo="Top 10 produções do mês (volume)" acao={<div className="flex gap-1 text-xs">{(["PA", "PP"] as const).map((t) => <button key={t} type="button" onClick={() => setTipoTop(t)} className={`rounded-full border px-2.5 py-0.5 ${tipoTop === t ? "bg-primary text-primary-foreground" : ""}`}>{t === "PA" ? "Produto acabado (un)" : "Em processo (kg)"}</button>)}</div>}>
            <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">Produto</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-right">{tipoTop === "PA" ? "Un" : "Kg"}</th><th className="px-2 py-1 text-right">Part.</th></tr></thead>
              <tbody>{(tipoTop === "PA" ? r.topPA : r.topPP).map((x, i) => <tr key={x.produto} className="border-t"><td className="px-2 py-1 text-muted-foreground">{i + 1}</td><td className="px-2 py-1"><span className="font-mono text-[11px] text-muted-foreground">{x.produto}</span> {x.descricao}</td><td className="px-2 py-1 text-right">{x.ops}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{nf(x.qtd, tipoTop === "PA" ? 0 : 1)}</td><td className="px-2 py-1 text-right">{pc(x.part, 1)}</td></tr>)}
                {!(tipoTop === "PA" ? r.topPA : r.topPP).length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sem produção neste tipo no mês.</td></tr>}</tbody></table>
          </Secao>

          <Secao letra="G" titulo="DOI — dias de suficiência do estoque produzido">
            <div className="mb-2 flex flex-wrap gap-1 text-xs">{[{ faixa: "todos", pa: r.doi.filter((x) => x.tipo === "PA").length, pp: r.doi.filter((x) => x.tipo === "PP").length }, ...r.faixasDoi].map((f) => <button key={f.faixa} type="button" onClick={() => setFiltroDoi(f.faixa)} className={`rounded-full border px-2.5 py-0.5 ${filtroDoi === f.faixa ? "bg-primary text-primary-foreground" : ""} ${f.faixa.startsWith("Crítico") ? "border-red-300" : f.faixa.startsWith("Excesso") ? "border-violet-300" : ""}`}>{f.faixa === "todos" ? "Todos" : f.faixa} ({f.pa + f.pp})</button>)}</div>
            <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Produto</th><th className="px-2 py-1 text-left">Tipo</th><th className="px-2 py-1 text-right">Estoque</th><th className="px-2 py-1 text-right">Demanda/dia</th><th className="px-2 py-1 text-right">DOI</th></tr></thead>
              <tbody>{r.doi.filter((x) => filtroDoi === "todos" || x.faixa === filtroDoi).slice(0, 60).map((x) => <tr key={x.produto} className="border-t"><td className="px-2 py-1"><span className="font-mono text-[11px] text-muted-foreground">{x.produto}</span> {x.descricao}</td><td className="px-2 py-1 text-xs">{x.tipo === "PA" ? "Acabado" : "Em processo"}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.estoque, x.tipo === "PA" ? 0 : 1)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(x.demandaDia, 2)}</td><td className={`px-2 py-1 text-right font-semibold ${x.faixa.startsWith("Crítico") ? "text-red-600" : x.faixa.startsWith("Atenção") ? "text-amber-600" : x.faixa.startsWith("Excesso") ? "text-violet-600" : x.faixa.startsWith("Saudável") ? "text-emerald-700" : "text-muted-foreground"}`}>{x.doi == null ? x.faixa : `${nf(x.doi)} d`}</td></tr>)}</tbody></table></div>
            <p className="mt-1 text-xs text-muted-foreground">Itens produzidos nos últimos 90 dias. Acabado: estoque sistêmico total ÷ venda média diária das lojas. Em processo: saldo ÷ consumo médio diário em OP.</p>
          </Secao>
        </div>

        <Secao letra="H" titulo="Como ler os indicadores (referência de mercado adaptada)">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {[["Volume e MoM", "Produção de acabado em unidades e de processo em kg, mês a mês. Separar as duas evita somar unidades com quilos e mostra se o processo antecipa (kg sobe antes) ou segura o acabado."],
              ["Utilização da capacidade", "Equivalente ao fator de utilização usado em OEE: produção do mês ÷ capacidade demonstrada (melhor semana dos últimos 12 meses). Sem apontamento de horas de máquina, o OEE completo (disponibilidade × desempenho × qualidade) não é calculável — este é o substituto mais fiel."],
              ["Aderência à ficha (rendimento)", "Equivale ao rendimento de material (yield): % das linhas de consumo dentro de ±5% da ficha. Junto com a perda de processo por 1.000 un, mede a qualidade do uso de matéria-prima."],
              ["Lote médio e dias produtivos", "Lote grande e poucos dias de produção indicam produção concentrada — mais estoque e risco de validade. Lote pequeno e diário indica fluxo nivelado (boa prática de produção puxada)."],
              ["DOI (dias de estoque)", "Quantos dias o estoque produzido cobre a demanda. Abaixo de 7 dias: risco de ruptura; acima de 60: excesso e risco de validade. Combine com o shelf mínimo e o prazo de produção das premissas do PCP."],
              ["Concentração (top 10)", "Quanto do volume vem dos 10 maiores SKUs. Alta concentração facilita nivelar a produção; baixa indica mix pulverizado e mais setups."]].map(([t, d]) => <div key={t} className="rounded-lg border p-3"><div className="font-semibold">{t}</div><div className="mt-1 text-muted-foreground">{d}</div></div>)}
          </div>
        </Secao>
      </>}
    </div>
  );
}
