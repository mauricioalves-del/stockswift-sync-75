// Painel executivo da Dispersão de Lote, no padrão do Dashboard de Disponibilidade:
// indicadores, evolução, Pareto de perda, matriz viés × variabilidade (onde agir), unidades, não previstos,
// qualidade do modelo e decisões recomendadas.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Secao } from "@/components/abast-dash/comum";
import type { Faixas } from "@/lib/dispersao";
import { matriz, mensal, naoPrevistos, pareto, porUnidade, resumo, topOps, QUAD, type LinhaDisp, type Quadrante } from "@/lib/dispersao-painel";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pc = (v: number | null, d = 0) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d })}%`);
const mesRot = (m: string) => { const [a, mm] = m.split("-"); return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(mm) - 1]}/${a.slice(2)}`; };

function Kpi({ t, v, d, tom }: { t: string; v: string; d?: string; tom?: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tom ?? ""}`}>{v}</div>{d && <div className="mt-0.5 text-[11px] text-muted-foreground">{d}</div>}</div>;
}

export function PainelDispersao({ linhas, faixas }: { linhas: LinhaDisp[]; faixas: Faixas }) {
  const [quad, setQuad] = useState<Quadrante | "todos">("todos");
  const r = useMemo(() => resumo(linhas, faixas), [linhas, faixas]);
  const serie = useMemo(() => mensal(linhas, faixas), [linhas, faixas]);
  const par = useMemo(() => pareto(linhas), [linhas]);
  const mat = useMemo(() => matriz(linhas, faixas), [linhas, faixas]);
  const uni = useMemo(() => porUnidade(linhas, faixas), [linhas, faixas]);
  const np = useMemo(() => naoPrevistos(linhas), [linhas]);
  const ops = useMemo(() => topOps(linhas), [linhas]);
  const contQ = useMemo(() => { const c = { revisar_ft: 0, instavel: 0, apontamento: 0, controle: 0 } as Record<Quadrante, number>; for (const x of mat) c[x.quadrante]++; return c; }, [mat]);
  const matFiltrada = quad === "todos" ? mat : mat.filter((x) => x.quadrante === quad);
  const tend = serie.length >= 2 && serie[0].aderencia !== null && serie[serie.length - 1].aderencia !== null ? serie[serie.length - 1].aderencia! - serie[0].aderencia! : null;

  const acoes = useMemo(() => {
    const a: { p: "alta" | "media" | "baixa"; t: string; d: string }[] = [];
    const inst = mat.filter((x) => x.quadrante === "instavel").sort((x, y) => y.perda - x.perda);
    if (inst.length) a.push({ p: "alta", t: `Atacar a perda de processo em ${inst.length} material(is) instável(is)`, d: inst.slice(0, 4).map((x) => `${x.desc} (${brl(x.perda)}, viés ${x.vies > 0 ? "+" : ""}${x.vies}%)`).join("; ") + "." });
    if (np.length) a.push({ p: "alta", t: `Atualizar a ficha técnica: ${np.length} material(is) consumido(s) sem estar previsto(s)`, d: `${brl(r.naoPrevistoRs)} lançados como perda são, na prática, substituição ou ficha desatualizada. Maiores: ${np.slice(0, 3).map((x) => `${x.desc} (${brl(x.rs)})`).join("; ")}.` });
    const ft = mat.filter((x) => x.quadrante === "revisar_ft").sort((x, y) => Math.abs(y.liquido) - Math.abs(x.liquido));
    if (ft.length) a.push({ p: "media", t: `Revisar a quantidade da ficha técnica de ${ft.length} material(is) com desvio sistemático`, d: ft.slice(0, 4).map((x) => `${x.desc} (${x.vies > 0 ? "consome" : "sobra"} ${Math.abs(x.vies)}% ${x.vies > 0 ? "acima" : "da ficha"})`).join("; ") + "." });
    const ap = mat.filter((x) => x.quadrante === "apontamento").sort((x, y) => (y.perda - y.economia) - (x.perda - x.economia));
    if (ap.length) a.push({ p: "media", t: `Corrigir apontamentos em ${ap.length} material(is) que perdem numa OP e sobram em outra`, d: ap.slice(0, 4).map((x) => `${x.desc} (perda ${brl(x.perda)} × sobra ${brl(-x.economia)})`).join("; ") + "." });
    if (r.semCusto) a.push({ p: "baixa", t: `${r.semCusto} linha(s) com desvio e sem custo cadastrado`, d: "O impacto dessas linhas aparece como R$ 0. Cadastrar o custo no mestre de custos para medir a perda real." });
    if (par.top10 !== null && par.top10 > 0.5) a.push({ p: "baixa", t: `Concentração: 10 materiais respondem por ${pc(par.top10)} da perda de processo`, d: "Foco do plano de ação nesses materiais traz o maior retorno." });
    return a;
  }, [mat, np, r, par]);

  if (!linhas.length) return <p className="py-10 text-center text-sm text-muted-foreground">Sem dados no filtro selecionado.</p>;

  return <div className="space-y-4">
    <Secao letra="A" titulo="Indicadores do período">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi t="Aderência à ficha técnica" v={pc(r.aderencia, 1)} d={`linhas dentro de ±${faixas.atencao}%${tend !== null ? ` · ${tend >= 0 ? "+" : ""}${tend.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p. no período` : ""}`} tom={r.aderencia !== null && r.aderencia >= 0.8 ? "text-emerald-600" : r.aderencia !== null && r.aderencia >= 0.6 ? "text-amber-600" : "text-red-600"} />
        <Kpi t="OPs sem desvio crítico" v={pc(r.pctOpsOk)} d={`${r.opsOk.toLocaleString("pt-BR")} de ${r.ops.toLocaleString("pt-BR")} OPs · crítico > ${faixas.critico}%`} />
        <Kpi t="Perda de processo" v={brl(r.perda)} d={`economia ${brl(-r.economia)} · líquido ${brl(r.liquido)}`} tom="text-red-600" />
        <Kpi t="Material não previsto" v={brl(r.naoPrevistoRs)} d={`${r.naoPrevistoLin} linha(s): substituição ou ficha desatualizada`} tom={r.naoPrevistoRs ? "text-violet-600" : ""} />
        <Kpi t="Linhas críticas" v={pc(r.pctCriticas)} d={`desvio > ${faixas.critico}% sobre a ficha`} tom={r.pctCriticas !== null && r.pctCriticas > 0.2 ? "text-red-600" : "text-amber-600"} />
        <Kpi t="Concentração da perda" v={par.top10 === null ? "—" : pc(par.top10)} d={`nos 10 maiores de ${par.materiais} materiais com perda`} />
        <Kpi t="Materiais a revisar na ficha" v={String(contQ.revisar_ft + np.length)} d={`${contQ.revisar_ft} com viés sistemático · ${np.length} não previstos`} tom="text-blue-600" />
        <Kpi t="Linhas sem custo" v={String(r.semCusto)} d="desvio sem valor: impacto subestimado" tom={r.semCusto ? "text-amber-600" : ""} />
      </div>
    </Secao>

    <Secao letra="B" titulo="Decisões recomendadas">
      <ul className="space-y-2">{acoes.map((a, i) => <li key={i} className={`rounded-md border-l-4 bg-muted/30 p-3 ${a.p === "alta" ? "border-red-500" : a.p === "media" ? "border-amber-500" : "border-sky-500"}`}>
        <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.p === "alta" ? "bg-red-100 text-red-700" : a.p === "media" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-700"}`}>{a.p}</span><span className="text-sm font-semibold">{a.t}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{a.d}</p></li>)}</ul>
    </Secao>

    <div className="grid gap-4 xl:grid-cols-2">
      <Secao letra="C" titulo="Evolução mensal: perda × economia × aderência">
        <div className="h-72"><ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serie.map((s) => ({ ...s, rot: mesRot(s.mes) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="rot" tick={{ fontSize: 11 }} /><YAxis yAxisId="rs" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v: any, n: any) => (n === "Aderência" ? [`${v}%`, n] : [brl(Number(v)), n])} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="rs" dataKey="perda" name="Perda de processo" stackId="p" fill="#dc2626" />
            <Bar yAxisId="rs" dataKey="naoPrevisto" name="Não previsto" stackId="p" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="rs" dataKey="economia" name="Economia" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Line yAxisId="pct" dataKey="aderencia" name="Aderência" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart></ResponsiveContainer></div>
      </Secao>
      <Secao letra="D" titulo="Pareto da perda de processo por material">
        <div className="h-72"><ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={par.itens.map((x) => ({ ...x, rot: x.desc.length > 16 ? x.desc.slice(0, 15) + "…" : x.desc }))} margin={{ bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="rot" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" /><YAxis yAxisId="rs" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v: any, n: any) => (n === "% acumulado" ? [`${Math.round(v)}%`, n] : [brl(Number(v)), n])} labelFormatter={(_l, p: any) => p?.[0]?.payload?.desc ?? ""} />
            <Bar yAxisId="rs" dataKey="perda" name="Perda" fill="#dc2626" radius={[3, 3, 0, 0]} />
            <Line yAxisId="pct" dataKey="acumPct" name="% acumulado" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
            <ReferenceLine yAxisId="pct" y={80} stroke="#94a3b8" strokeDasharray="4 4" />
          </ComposedChart></ResponsiveContainer></div>
      </Secao>
    </div>

    <Secao letra="E" titulo="Onde agir: viés × variabilidade por material" acao={<div className="flex flex-wrap gap-1">{(["todos", "instavel", "revisar_ft", "apontamento", "controle"] as const).map((q) => <button key={q} type="button" onClick={() => setQuad(q)} className={`rounded-full border px-2 py-0.5 text-[11px] ${quad === q ? "bg-foreground text-background" : "hover:bg-muted"}`}>{q === "todos" ? `Todos (${mat.length})` : `${QUAD[q].nome} (${contQ[q]})`}</button>)}</div>}>
      <p className="mb-2 text-xs text-muted-foreground">Cada ponto é um material com ao menos 3 OPs. <b>Viés</b> = consumo real acima (+) ou abaixo (−) da ficha no total; <b>variabilidade</b> = quanto o desvio oscila de uma OP para outra. Tamanho do ponto = perda. Faixas: viés ±{faixas.atencao}% e variabilidade {faixas.critico}%.</p>
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="h-80 xl:col-span-3"><ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" dataKey="vies" name="Viés" unit="%" domain={[-60, 60]} allowDataOverflow tick={{ fontSize: 11 }} label={{ value: "Viés (consumo real vs ficha)", position: "insideBottom", offset: -10, fontSize: 11 }} />
            <YAxis type="number" dataKey="variab" name="Variabilidade" unit="%" domain={[0, 100]} allowDataOverflow tick={{ fontSize: 11 }} />
            <ZAxis type="number" dataKey="perda" range={[30, 600]} />
            <ReferenceArea x1={-faixas.atencao} x2={faixas.atencao} y1={0} y2={faixas.critico} fill="#16a34a" fillOpacity={0.08} />
            <ReferenceLine x={0} stroke="#94a3b8" /><ReferenceLine y={faixas.critico} stroke="#94a3b8" strokeDasharray="4 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }: any) => { const x = payload?.[0]?.payload; if (!x) return null; return <div className="rounded border bg-background p-2 text-xs shadow"><b>{x.desc}</b><div>{QUAD[x.quadrante as Quadrante].nome}</div><div>Viés {x.vies}% · variabilidade {x.variab}% · {x.ops} OPs</div><div>Perda {brl(x.perda)} · economia {brl(-x.economia)}</div></div>; }} />
            <Scatter data={matFiltrada}>{matFiltrada.map((x) => <Cell key={x.material} fill={QUAD[x.quadrante].cor} fillOpacity={0.75} />)}</Scatter>
          </ScatterChart></ResponsiveContainer></div>
        <div className="space-y-2 xl:col-span-2">{(["instavel", "revisar_ft", "apontamento", "controle"] as Quadrante[]).map((q) => <div key={q} className="rounded-md border p-2" style={{ borderLeft: `4px solid ${QUAD[q].cor}` }}>
          <div className="flex justify-between text-sm font-semibold"><span>{QUAD[q].nome}</span><span>{contQ[q]}</span></div><p className="text-[11px] text-muted-foreground">{QUAD[q].acao}</p></div>)}</div>
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Material</th><th className="px-2 py-1 text-left">Diagnóstico</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-right">Viés</th><th className="px-2 py-1 text-right">Variab.</th><th className="px-2 py-1 text-right">Perda</th><th className="px-2 py-1 text-right">Economia</th><th className="px-2 py-1 text-right">Líquido</th></tr></thead>
        <tbody>{matFiltrada.slice(0, 60).map((x) => <tr key={x.material} className="border-t">
          <td className="px-2 py-1"><Link to="/producao/material/$material" params={{ material: x.material }} className="hover:underline"><span className="font-mono text-xs">{x.material}</span> {x.desc}</Link></td>
          <td className="px-2 py-1 text-xs"><span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: QUAD[x.quadrante].cor }}>{QUAD[x.quadrante].nome}</span></td>
          <td className="px-2 py-1 text-right">{x.ops}</td><td className={`px-2 py-1 text-right tabular-nums ${Math.abs(x.vies) > faixas.atencao ? "font-semibold" : ""}`}>{x.vies > 0 ? "+" : ""}{x.vies}%</td><td className="px-2 py-1 text-right tabular-nums">{x.variab}%</td>
          <td className="px-2 py-1 text-right tabular-nums text-red-600">{brl(x.perda)}</td><td className="px-2 py-1 text-right tabular-nums text-emerald-700">{brl(-x.economia)}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{brl(x.liquido)}</td></tr>)}</tbody></table></div>
    </Secao>

    <div className="grid gap-4 xl:grid-cols-2">
      <Secao letra="F" titulo="Por unidade">
        <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left">Unidade</th><th className="text-right">OPs</th><th className="text-right">Aderência</th><th className="text-right">Perda</th><th className="text-right">Não previsto</th><th className="text-right">Economia</th></tr></thead>
          <tbody>{uni.map((u) => <tr key={u.unidade} className="border-t"><td className="py-1.5 font-medium">{u.unidade}</td><td className="text-right">{u.ops}</td>
            <td className={`text-right font-semibold ${u.aderencia !== null && u.aderencia >= 0.8 ? "text-emerald-600" : u.aderencia !== null && u.aderencia >= 0.6 ? "text-amber-600" : "text-red-600"}`}>{pc(u.aderencia)}</td>
            <td className="text-right tabular-nums text-red-600">{brl(u.perda)}</td><td className="text-right tabular-nums text-violet-600">{brl(u.naoPrevistoRs)}</td><td className="text-right tabular-nums text-emerald-700">{brl(-u.economia)}</td></tr>)}</tbody></table>
      </Secao>
      <Secao letra="G" titulo="OPs com maior perda de processo">
        <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left">OP</th><th className="text-left">Produto</th><th className="text-right">Mês</th><th className="text-right">Perda</th><th className="text-right">Economia</th></tr></thead>
          <tbody>{ops.map((o) => <tr key={o.op} className="border-t"><td className="py-1 font-mono text-xs">{o.op}</td><td className="max-w-[220px] truncate" title={o.produto}>{o.produto}</td><td className="text-right text-xs">{o.mes !== "sem-data" ? mesRot(o.mes) : "—"}</td><td className="text-right tabular-nums text-red-600">{brl(o.perda)}</td><td className="text-right tabular-nums text-emerald-700">{brl(-o.economia)}</td></tr>)}</tbody></table>
      </Secao>
    </div>

    <Secao letra="H" titulo="Material consumido sem estar na ficha técnica (não previsto)">
      {np.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum material fora da ficha no período.</p> : <>
        <p className="mb-2 text-xs text-muted-foreground">O modelo anterior somava esse consumo como perda. Na prática indica substituição de material ou ficha técnica desatualizada: o tratamento é atualizar a ficha, não cobrar a linha.</p>
        <div className="max-h-72 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Material</th><th className="px-2 py-1 text-right">Consumo</th><th className="px-2 py-1 text-right">Valor</th><th className="px-2 py-1 text-right">OPs</th><th className="px-2 py-1 text-left">Produtos</th></tr></thead>
          <tbody>{np.slice(0, 40).map((x) => <tr key={x.material} className="border-t"><td className="px-2 py-1"><span className="font-mono text-xs">{x.material}</span> {x.desc}</td><td className="px-2 py-1 text-right tabular-nums">{x.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td><td className="px-2 py-1 text-right tabular-nums text-violet-600">{brl(x.rs)}</td><td className="px-2 py-1 text-right">{x.ops}</td><td className="max-w-[260px] truncate px-2 py-1 text-xs" title={x.produtos.join(", ")}>{x.produtos.slice(0, 3).join(", ")}</td></tr>)}</tbody></table></div>
      </>}
    </Secao>
  </div>;
}
