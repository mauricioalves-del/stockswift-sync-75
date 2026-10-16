import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConsultaEstoqueSku } from "@/components/abast-dash/ConsultaEstoqueSku";
import type { Bruto } from "@/lib/abastecimento-dados";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Cluster, DashLinha } from "@/lib/abastecimento-dash";
import { farolRuptura, serie, topDiasRuptura, type Agrupamento, type HistLinha } from "@/lib/abastecimento-dash-hist";
import { CLUSTER_PILL, FAROL, NOME, Pill, Secao, dm, escopoLocais, n0, n1, pct, repTexto, type Filtro } from "@/components/abast-dash/comum";

type Props = { hoje: string; filtro: Filtro; setFiltro: (f: Filtro) => void; linhas: DashLinha[]; hist: HistLinha[]; irFarol: (c: Cluster | "SEMACAO") => void };
const ultimoDia = (m: string) => { const [a, mm] = m.split("-").map(Number); return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, "0")}`; };

type Periodo = { ini: string; fim: string; dias: number; aberto: boolean };
const semZero = (s: string) => String(s).replace(/^0+/, "");
function periodosRuptura(hist: HistLinha[], local: string, sku: string): { periodos: Periodo[]; ultimaFoto: string | null } {
  const ultimaFoto = hist.reduce<string | null>((m, h) => (!m || h.data > m ? h.data : m), null);
  const rs = hist.filter((h) => h.loja === local && semZero(h.id_produto) === semZero(sku)).sort((a, b) => a.data.localeCompare(b.data));
  const out: Periodo[] = []; let cur: Periodo | null = null;
  for (const h of rs) {
    if (h.em_ruptura) { if (cur) { cur.fim = h.data; cur.dias++; } else cur = { ini: h.data, fim: h.data, dias: 1, aberto: false }; }
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) { cur.aberto = cur.fim === ultimaFoto; out.push(cur); }
  return { periodos: out, ultimaFoto };
}

export function Evolucao({ hoje, filtro, setFiltro, hist, bruto }: Omit<Props, "linhas" | "irFarol"> & { bruto?: Bruto }) {
  const [ag, setAg] = useState<Agrupamento>("dia");
  const [det, setDet] = useState<{ local: string; sku: string; produto: string } | null>(null);
  const [estq, setEstq] = useState(false);
  const pr = det ? periodosRuptura(hist, det.local, det.sku) : null;
  const f = { de: filtro.de, ate: filtro.ate, locais: escopoLocais(filtro.escopo), categoria: null as string | null };
  const pts = serie(hist, f, hoje, ag); const top = topDiasRuptura(hist, f, 10); const maxDias = Math.max(1, ...top.map((t) => t.dias));
  const dados = pts.map((p) => ({ ...p, barra: p.pct === null ? null : +(p.pct * 100).toFixed(2), vazio: p.pct === null ? 0.35 : null, acum: p.acumulado === null ? null : +(p.acumulado * 100).toFixed(2) }));
  const topo = Math.max(6, ...dados.map((d) => (d.barra ?? 0) + 0.8));
  const clique = (d: any) => { const p = d?.payload ?? d; if (ag === "mes" && p?.chave) { setFiltro({ ...filtro, de: `${p.chave}-01`, ate: ultimoDia(p.chave) }); setAg("dia"); } };
  return (
    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
      <Secao letra="D" titulo="Evolução da ruptura + acumulado do período" acao={<div className="flex items-center gap-1 text-xs"><span className="mr-1 text-muted-foreground">Ver por</span>{(["dia", "semana", "mes"] as Agrupamento[]).map((a) => <button key={a} type="button" onClick={() => setAg(a)} className={`rounded-md border px-2.5 py-1 font-medium ${ag === a ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>{a === "dia" ? "Dia" : a === "semana" ? "Semana" : "Mês"}</button>)}</div>}>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={dados} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis domain={[0, Math.ceil(topo)]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip content={({ active, payload }: any) => { if (!active || !payload?.length) return null; const p = payload[0].payload; return <div className="rounded-md border bg-background p-2 text-xs shadow"><div className="font-semibold">{ag === "dia" ? dm(p.chave) : p.rotulo}{p.parcial ? ` · parcial (${p.diasRegistrados}/${p.diasNoGrupo} dias)` : ""}</div><div>{p.pct === null ? "sem registro de contagem" : `% do ${ag === "dia" ? "dia" : "período"}: ${pct(p.pct)} (${p.rupturas} de ${p.itemDias} item-dias)`}</div><div>Acumulado: {pct(p.acumulado)}</div></div>; }} />
              <ReferenceLine y={3} stroke="#16a34a" strokeDasharray="5 4" label={{ value: "Meta 3,0%", position: "insideTopRight", fill: "#16a34a", fontSize: 11 }} />
              <ReferenceLine y={5} stroke="#dc2626" strokeDasharray="5 4" label={{ value: "Corte 5,0% (0% da meta)", position: "insideTopRight", fill: "#dc2626", fontSize: 11 }} />
              <Bar dataKey="barra" stackId="s" onClick={clique} cursor={ag === "mes" ? "pointer" : "default"} radius={[3, 3, 0, 0]}>{dados.map((d, i) => <Cell key={i} fill={d.pct === null ? "#e5e7eb" : FAROL[farolRuptura(d.pct)].hex} fillOpacity={d.parcial ? 0.55 : 1} stroke={d.parcial ? "#475569" : undefined} strokeDasharray={d.parcial ? "3 2" : undefined} />)}</Bar>
              <Bar dataKey="vazio" stackId="s" fill="#e5e7eb" />
              <Line type="monotone" dataKey="acum" stroke="#0f172a" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#0f172a" }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-600" /> % do {ag === "dia" ? "dia" : ag === "semana" ? "semana" : "mês"} (cor = farol)</span><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-900" /> Acumulado do período</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-slate-200" /> Sem registro de contagem</span>{ag === "mes" && <span>Clique numa coluna para abrir os dias do mês</span>}</div>
      </Secao>
      <Secao letra="D" titulo="Top itens · dias em ruptura no período">
        {top.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item com ruptura no período.</p> : <ul className="space-y-3">{top.map((t) => <li key={t.local + t.id_produto}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="cursor-pointer truncate text-sm font-semibold hover:underline" title="Clique duas vezes para ver os detalhes da ruptura" onDoubleClick={() => setDet({ local: t.local, sku: t.id_produto, produto: t.produto })}>{t.produto}</div><div className="text-[11px] text-muted-foreground">{NOME[t.local] ?? t.local}</div></div><span className="shrink-0 text-sm font-bold text-red-600">{t.dias} {t.dias === 1 ? "dia" : "dias"}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-red-500" style={{ width: `${(t.dias / maxDias) * 100}%` }} /></div></li>)}</ul>}
        <p className="mt-4 text-[11px] italic text-muted-foreground">Lista completa no detalhe (bloco F). Clique duas vezes no produto para ver os detalhes.</p>
      </Secao>
      <Dialog open={!!det && !estq} onOpenChange={(o) => { if (!o) setDet(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Detalhe da ruptura · {det?.sku}</DialogTitle><DialogDescription>{det?.produto} · {det ? NOME[det.local] ?? det.local : ""}</DialogDescription></DialogHeader>
          {pr && pr.periodos.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Sem ruptura no período filtrado.</p> : pr && (
            <table className="w-full text-sm"><thead><tr className="border-b bg-muted text-[11px] uppercase"><th className="px-2 py-2 text-left">Entrou em ruptura</th><th className="px-2 py-2 text-left">Até</th><th className="px-2 py-2 text-right">Dias</th><th className="px-2 py-2 text-left">Situação</th></tr></thead>
              <tbody>{pr.periodos.map((p) => <tr key={p.ini} className="border-b last:border-0"><td className="px-2 py-1.5">{dm(p.ini)}</td><td className="px-2 py-1.5">{p.aberto ? "—" : dm(p.fim)}</td><td className="px-2 py-1.5 text-right font-semibold tabular-nums">{p.dias}</td><td className="px-2 py-1.5">{p.aberto ? <span className="font-semibold text-destructive">Pendente (em ruptura)</span> : "Resolvida"}</td></tr>)}
                <tr className="bg-muted/50"><td colSpan={2} className="px-2 py-1.5 font-semibold">Total no período</td><td className="px-2 py-1.5 text-right font-bold tabular-nums">{pr.periodos.reduce((a, p) => a + p.dias, 0)}</td><td /></tr></tbody></table>)}
          <p className="text-[11px] text-muted-foreground">Contagem pela foto diária, entre {dm(filtro.de)} e {dm(filtro.ate)}.</p>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setEstq(true)}>Ver estoque do item</Button></div>
        </DialogContent>
      </Dialog>
      <ConsultaEstoqueSku aberto={!!det && estq} onFechar={() => setEstq(false)} bruto={bruto} sku={det?.sku ?? ""} descricao={det?.produto ?? ""} lojaDestino="" cdNaoAtende={false} />
    </div>
  );
}

export function Rankings({ filtro, linhas, irFarol }: Pick<Props, "filtro" | "linhas" | "irFarol">) {
  const locais = escopoLocais(filtro.escopo); const ls = linhas.filter((l) => locais.includes(l.local));
  const zerados = ls.filter((l) => l.status === "ruptura").sort((a, b) => b.vbm - a.vbm);
  const prox = ls.filter((l) => l.cluster !== "ok" && l.cluster !== "ruptura" && (l.diasAteZerar ?? 99) <= 7).sort((a, b) => (a.diasAteZerar ?? 0) - (b.diasAteZerar ?? 0));
  const cnt = (c: Cluster) => ls.filter((l) => l.cluster === c).length; const over = ls.filter((l) => l.status === "stockover").sort((a, b) => b.excessoRs - a.excessoRs).slice(0, 5);
  const Cx = ({ c, r, cls }: { c: Cluster; r: string; cls: string }) => <button type="button" onClick={() => irFarol(c)} className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-semibold hover:shadow ${cls}`}><span>{r}</span><span className="text-lg">{cnt(c)}</span></button>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-t-4 border-t-red-600 bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">E</span><h2 className="text-sm font-bold">Out of Stock agora</h2></div>
        {zerados.length === 0 ? <p className="py-6 text-center text-sm text-emerald-700">✓ Nenhum SKU zerado.</p> : <ul className="space-y-3">{zerados.slice(0, 6).map((l) => { const r = repTexto(l); return <li key={l.local + l.sku} className="border-b pb-2 last:border-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold" title={l.produto}>{l.produto}</div><div className="text-[11px] text-muted-foreground">{NOME[l.local]}</div></div><div className="shrink-0 text-right text-xs"><div>Venda/D <b>{n1(l.vbm)}</b></div><div className="font-bold text-red-600">Sugestão {n0(l.sugestao)}</div></div></div><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.c}`}>{r.t}</span></li>; })}</ul>}
        <p className="mt-3 text-[11px] italic text-muted-foreground">Ruptura continua contando na meta até a mercadoria chegar.</p></section>
      <section className="rounded-xl border border-t-4 border-t-red-600 bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">E</span><h2 className="text-sm font-bold">Próximos a romper (até 7 dias)</h2></div>
        <div className="mb-3 flex gap-2"><Cx c="critico" r="≤ 3 d" cls="border-red-400 bg-red-50 text-red-700" /><Cx c="urgente" r="4–5 d" cls="border-red-200 bg-red-50/60 text-red-500" /><Cx c="alerta" r="6–7 d" cls="border-orange-200 bg-orange-50 text-orange-600" /></div>
        {prox.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nada zera nos próximos 7 dias.</p> : <ul className="space-y-2">{prox.slice(0, 4).map((l) => { const r = repTexto(l); return <li key={l.local + l.sku} className={`rounded-lg border p-2 ${l.alerta ? "border-red-200 bg-red-50" : ""}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold" title={l.produto}>{l.produto}</div><div className="text-[11px] font-semibold text-red-600">{NOME[l.local]} · zera em {dm(l.zeraEm)} ({l.diasAteZerar} d)</div></div><Pill cls={CLUSTER_PILL[l.cluster]}>{l.cluster === "critico" ? "CRÍTICO" : l.cluster === "urgente" ? "URGENTE" : "ALERTA"}</Pill></div><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.c}`}>{r.t}{l.reposicao === "sem_pedido" ? ` · sugestão ${n0(l.sugestao)} un` : ""}</span></li>; })}</ul>}
        <p className="mt-3 text-[11px] italic text-muted-foreground">Fora da semana: {cnt("atencao")} em 8–10 d · {cnt("monitorar")} em 11–15 d (bloco G).</p></section>
      <section className="rounded-xl border border-t-4 border-t-violet-600 bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">E</span><h2 className="text-sm font-bold">Top Stock Over</h2></div>
        {over.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum SKU acima do máximo.</p> : <table className="w-full text-sm"><thead><tr className="border-b text-[11px] uppercase text-muted-foreground"><th className="py-1 text-left">Produto · local</th><th className="py-1 text-right">Excesso</th><th className="py-1 text-right">Cobertura</th></tr></thead><tbody>{over.map((l) => <tr key={l.local + l.sku} className="border-b last:border-0"><td className="py-2 pr-2"><div className="max-w-[210px] truncate font-semibold" title={l.produto}>{l.produto}</div><div className="text-[11px] text-muted-foreground">{NOME[l.local]}</div></td><td className="py-2 text-right"><div>{n0(l.excessoUn)} un</div><div className="text-[11px] text-muted-foreground">{n0(l.excessoRs)} R$</div></td><td className="py-2 text-right font-bold text-violet-600">{l.cobertura === null ? "—" : `${n0(l.cobertura)} d`}</td></tr>)}</tbody></table>}
        <p className="mt-3 text-[11px] italic text-muted-foreground">Ordenado por capital em excesso (R$), não por unidades.</p></section>
    </div>
  );
}
