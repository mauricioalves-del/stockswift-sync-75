// Análise assistida da divergência: IA (sinais de todo o sistema × motor × histórico), evidências por fonte e
// gráficos do histórico do SKU (divergências, falta × sobra, motivos e acurácia dos apontamentos).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, PackageSearch, Truck, ClipboardList, Factory, Receipt, History, Boxes } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { analisarIA, coletarSinais, type DivAnalise, type Sinal } from "@/lib/atlas-analise";

const sb = supabase as any;
const ICONE: Record<string, any> = { Baixas: PackageSearch, "Trânsito": Truck, "Contagem de loja / inventário": ClipboardList, Movimentados: Boxes, OP: Factory, Faturamento: Receipt };
const COMPAT: Record<string, { rot: string; cls: string }> = {
  exata: { rot: "quantidade igual", cls: "bg-emerald-100 text-emerald-800" }, compativel: { rot: "quantidade compatível", cls: "bg-sky-100 text-sky-800" },
  parcial: { rot: "parcial", cls: "bg-amber-100 text-amber-800" }, presenca: { rot: "contexto", cls: "bg-muted text-muted-foreground" },
};
const CORES = ["#2563eb", "#f59e0b", "#16a34a", "#dc2626", "#8b5cf6", "#0891b2", "#db2777", "#65a30d"];
const dm = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");

export function AnaliseDivergencia({ d, motor, nomeHip, descricao, onUsar }: { d: DivAnalise; motor: { hipotese: string; confianca: number }[]; nomeHip: (c?: string | null) => string; descricao: string | null; onUsar?: (hipotese: string) => void }) {
  const [aba, setAba] = useState<"ia" | "sinais" | "graficos">("ia");
  const sinaisQ = useQuery({ queryKey: ["atlas-analise-sinais", d.id], queryFn: () => coletarSinais(d, descricao), staleTime: 60_000 });
  const histQ = useQuery({
    queryKey: ["atlas-analise-hist", d.sku], staleTime: 60_000,
    queryFn: async () => {
      const [h, v] = await Promise.all([
        sb.from("atlas_movimentacoes_historico").select("data_movimento, almoxarifado, divergencia, hipotese_confirmada, categoria_produto").eq("sku", d.sku).order("data_movimento").limit(2000),
        sb.from("atlas_divergencias").select("data_deteccao, almoxarifado, divergencia_qtd, status, hipotese_confirmada, categoria_produto").eq("sku", d.sku).order("data_deteccao").limit(1000),
      ]);
      return { hist: h.data ?? [], divs: v.data ?? [] };
    },
  });
  const historico = useMemo(() => [
    ...(histQ.data?.hist ?? []).filter((x: any) => Number(x.divergencia) !== 0).map((x: any) => ({ hipotese: x.hipotese_confirmada, almoxarifado: x.almoxarifado, categoria: x.categoria_produto })),
    ...(histQ.data?.divs ?? []).filter((x: any) => x.status === "Resolvida").map((x: any) => ({ hipotese: x.hipotese_confirmada, almoxarifado: x.almoxarifado, categoria: x.categoria_produto })),
  ], [histQ.data]);
  const ia = useMemo(() => (sinaisQ.data ? analisarIA(motor, sinaisQ.data.sinais, historico, d) : null), [sinaisQ.data, motor, historico, d]);
  const porFonte = useMemo(() => { const m = new Map<string, Sinal[]>(); for (const s of sinaisQ.data?.sinais ?? []) m.set(s.fonte, [...(m.get(s.fonte) ?? []), s]); return [...m]; }, [sinaisQ.data]);
  const FONTES = ["Baixas", "Trânsito", "Contagem de loja / inventário", "Movimentados", "OP", "Faturamento"];

  // séries para os gráficos
  const graf = useMemo(() => {
    const eventos = [
      ...(histQ.data?.hist ?? []).map((x: any) => ({ data: String(x.data_movimento).slice(0, 10), almox: x.almoxarifado, q: Number(x.divergencia) || 0, hip: x.hipotese_confirmada, apont: true })),
      ...(histQ.data?.divs ?? []).filter((x: any) => x.status !== "Resolvida").map((x: any) => ({ data: String(x.data_deteccao).slice(0, 10), almox: x.almoxarifado, q: Number(x.divergencia_qtd) || 0, hip: x.hipotese_confirmada, apont: false })),
    ].sort((a, b) => a.data.localeCompare(b.data));
    const linha = eventos.filter((e) => e.q !== 0 || e.apont).slice(-80).map((e) => ({ data: dm(e.data), q: e.q, almox: e.almox }));
    const meses = new Map<string, { mes: string; falta: number; sobra: number; apont: number; ok: number }>();
    for (const e of eventos) { const k = e.data.slice(0, 7); const o = meses.get(k) ?? { mes: k, falta: 0, sobra: 0, apont: 0, ok: 0 }; if (e.q < 0) o.falta += -e.q; else o.sobra += e.q; if (e.apont) { o.apont++; if (e.q === 0) o.ok++; } meses.set(k, o); }
    const mensal = [...meses.values()].map((m) => ({ ...m, rot: `${m.mes.slice(5, 7)}/${m.mes.slice(2, 4)}`, acuracia: m.apont ? Math.round((m.ok / m.apont) * 1000) / 10 : null }));
    // tendência linear da acurácia
    const pts = mensal.map((m, i) => [i, m.acuracia] as [number, number | null]).filter((p): p is [number, number] => p[1] !== null);
    if (pts.length >= 2) {
      const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0);
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
      mensal.forEach((m, i) => { (m as any).tendencia = Math.round(Math.max(0, Math.min(100, a + b * i)) * 10) / 10; });
      (mensal as any).inclinacao = b;
    }
    const motivos = new Map<string, number>();
    for (const e of eventos) if (e.hip && e.q !== 0) motivos.set(e.hip, (motivos.get(e.hip) ?? 0) + 1);
    const almox = new Map<string, number>();
    for (const e of eventos) if (e.q !== 0) almox.set(e.almox, (almox.get(e.almox) ?? 0) + Math.abs(e.q));
    return { linha, mensal, motivos: [...motivos].map(([h, n]) => ({ nome: nomeHip(h), n })).sort((a, b) => b.n - a.n), almox: [...almox].map(([a, q]) => ({ almox: a, q })).sort((x, y) => y.q - x.q), inclinacao: (mensal as any).inclinacao as number | undefined };
  }, [histQ.data, nomeHip]);

  const top = ia?.ranking[0];
  return <div className="rounded-xl border bg-gradient-to-b from-violet-50/60 to-transparent p-4 dark:from-violet-950/20">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Brain className="size-5 text-violet-600" /><span className="text-base font-bold">Análise da IA</span>
      <span className="text-xs text-muted-foreground">sinais de todo o sistema × motor de regras e modelo × histórico de resoluções do SKU</span>
      <div className="ml-auto flex gap-1">{([["ia", "Causa provável"], ["sinais", `Evidências do sistema${sinaisQ.data ? ` (${sinaisQ.data.sinais.length})` : ""}`], ["graficos", "Gráficos e histórico"]] as const).map(([k, t]) =>
        <button key={k} type="button" onClick={() => setAba(k)} className={`rounded-full border px-3 py-1 text-xs ${aba === k ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>{t}</button>)}</div>
    </div>
    {sinaisQ.isLoading || histQ.isLoading ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cruzando baixas, trânsito, contagens, OPs, faturamento e histórico…</p> : <>
      {aba === "ia" && ia && <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {top && <div className="rounded-lg border bg-background p-3">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Causa mais provável</div>
            <div className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">{nomeHip(top.hipotese)}</div>
            <div className="text-3xl font-bold tabular-nums">{Math.round(top.prob * 100)}%</div>
            <div className="mt-1 text-xs text-muted-foreground">Confiabilidade <b className={ia.confiabilidade === "alta" ? "text-emerald-700" : ia.confiabilidade === "media" ? "text-amber-700" : "text-red-600"}>{ia.confiabilidade}</b> · {ia.sinaisFortes} sinal(is) com quantidade compatível · {top.historico} caso(s) iguais no histórico do SKU</div>
            {onUsar && <button type="button" onClick={() => onUsar(top.hipotese)} className="mt-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">Usar esta causa na confirmação</button>}
          </div>}
          {top && top.motivos.length > 0 && <ul className="mt-3 space-y-1 text-xs">{top.motivos.map((m, i) => <li key={i} className="flex gap-1.5"><span className="text-violet-600">●</span>{m}</li>)}</ul>}
        </div>
        <div className="space-y-2 lg:col-span-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Ranking de causas</div>
          {ia.ranking.slice(0, 7).map((r, i) => <div key={r.hipotese}>
            <div className="flex justify-between text-sm"><span className={i === 0 ? "font-semibold" : ""}>{nomeHip(r.hipotese)}</span><span className="tabular-nums">{(r.prob * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></div>
            <div className="h-2.5 rounded bg-muted"><div className="h-2.5 rounded" style={{ width: `${Math.max(2, r.prob * 100)}%`, background: CORES[i % CORES.length] }} /></div>
            {r.motivos.length > 0 && i > 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{r.motivos.slice(0, 2).join(" · ")}</div>}
          </div>)}
          <p className="pt-1 text-[11px] text-muted-foreground">Modelo bayesiano: parte da probabilidade do motor (regras + modelo treinado nas resoluções) e do histórico do SKU, e multiplica pelas evidências encontradas — quanto mais a quantidade bate com a divergência, maior o peso. Confirmar a causa continua ensinando o motor.</p>
        </div>
      </div>}

      {aba === "sinais" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{FONTES.map((f) => { const ss = porFonte.find(([k]) => k === f)?.[1] ?? []; const Ic = ICONE[f] ?? History; return (
        <div key={f} className={`rounded-lg border bg-background p-3 ${ss.some((s) => s.compat === "exata" || s.compat === "compativel") ? "ring-1 ring-violet-400" : ""}`}>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Ic className="size-4 text-violet-600" />{f}<span className="ml-auto text-xs font-normal text-muted-foreground">{ss.length ? `${ss.length} achado(s)` : "nada encontrado"}</span></div>
          {ss.length === 0 ? <p className="text-xs text-muted-foreground">Sem registro na janela da divergência.</p> : <ul className="space-y-1.5">{ss.slice(0, 6).map((s, i) => <li key={i} className="text-xs">
            <div className="flex items-start gap-1.5"><span className={`shrink-0 rounded px-1.5 text-[10px] font-semibold ${COMPAT[s.compat].cls}`}>{COMPAT[s.compat].rot}</span><span className="font-medium">{s.titulo}</span></div>
            <div className="pl-1 text-muted-foreground">{s.detalhe} → <span className="text-foreground">{nomeHip(s.hipotese)}</span></div></li>)}</ul>}
        </div>); })}</div>}

      {aba === "graficos" && <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-background p-3"><div className="text-sm font-semibold">Histórico do SKU</div><div className="text-[11px] text-muted-foreground">Divergência em cada apontamento (0 = contagem bateu)</div>
          <div className="h-56"><ResponsiveContainer><ComposedChart data={graf.linha}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="data" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(v: any, _n: any, p: any) => [`${v} un · ${p?.payload?.almox ?? ""}`, "Divergência"]} /><ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="q" name="Divergência">{graf.linha.map((x, i) => <Cell key={i} fill={x.q < 0 ? "#dc2626" : x.q > 0 ? "#16a34a" : "#94a3b8"} />)}</Bar><Line dataKey="q" stroke="#f59e0b" dot={false} strokeWidth={1.5} /></ComposedChart></ResponsiveContainer></div></div>
        <div className="rounded-lg border bg-background p-3"><div className="text-sm font-semibold">Acurácia dos apontamentos e tendência</div><div className="text-[11px] text-muted-foreground">% de contagens sem divergência por mês{graf.inclinacao !== undefined ? ` · tendência ${graf.inclinacao >= 0 ? "+" : ""}${graf.inclinacao.toFixed(1)} p.p./mês` : ""}</div>
          <div className="h-56"><ResponsiveContainer><ComposedChart data={graf.mensal}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="rot" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="acuracia" name="Acurácia" fill="#2563eb" radius={[3, 3, 0, 0]} /><Line dataKey="tendencia" name="Tendência" stroke="#f59e0b" strokeDasharray="5 4" dot={false} /></ComposedChart></ResponsiveContainer></div></div>
        <div className="rounded-lg border bg-background p-3"><div className="text-sm font-semibold">Falta × sobra por mês</div><div className="text-[11px] text-muted-foreground">Contam separadamente (não se compensam)</div>
          <div className="h-56"><ResponsiveContainer><BarChart data={graf.mensal}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="rot" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="falta" name="Falta (un)" fill="#dc2626" radius={[3, 3, 0, 0]} /><Bar dataKey="sobra" name="Sobra (un)" fill="#16a34a" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="rounded-lg border bg-background p-3"><div className="text-sm font-semibold">Causas confirmadas deste SKU · onde diverge</div>
          <div className="grid h-56 grid-cols-2 gap-2">
            {graf.motivos.length ? <ResponsiveContainer><PieChart><Pie data={graf.motivos} dataKey="n" nameKey="nome" innerRadius="45%" outerRadius="80%">{graf.motivos.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer> : <p className="self-center text-center text-xs text-muted-foreground">Sem causas confirmadas ainda.</p>}
            <ul className="self-center space-y-1 text-xs">{graf.almox.map((a) => <li key={a.almox} className="flex justify-between gap-2"><span className="truncate">{a.almox}</span><b className="tabular-nums">{a.q.toLocaleString("pt-BR")} un</b></li>)}</ul>
          </div></div>
      </div>}
    </>}
  </div>;
}
