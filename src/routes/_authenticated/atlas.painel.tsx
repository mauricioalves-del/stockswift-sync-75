import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtlasGrafico, AtlasCausas, atlasCores } from "@/components/atlas/AtlasGrafico";
import { AtlasTendencia } from "@/components/atlas/AtlasTendencia";
import { ClipboardCheck, LayoutDashboard, ListChecks, Loader2 } from "lucide-react";
import { FarolMovimentadosPage } from "@/routes/_authenticated/gestao.farol-movimentados";
import { DivergenciasPage } from "@/routes/_authenticated/atlas.divergencias";
import { Secao, Th } from "@/components/abast-dash/comum";
import { faixaAcuracia } from "@/lib/atlas-inventario";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/atlas/painel")({
  component: AtlasPainel,
  validateSearch: (s: Record<string, unknown>): { visao?: Visao; div?: number } => ({ ...(s.visao === "farol" || s.visao === "divergencias" || s.visao === "painel" ? { visao: s.visao } : {}), ...(Number(s.div) > 0 ? { div: Number(s.div) } : {}) }),
  head: () => ({ meta: [{ title: "Movimentados — Atlas" }, { name: "description", content: "Acurácia das contagens diárias, Farol de Movimentados e lista de divergências do Atlas." }, { property: "og:title", content: "Movimentados — Atlas" }, { property: "og:description", content: "Acurácia das contagens diárias, Farol de Movimentados e lista de divergências do Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

type Visao = "painel" | "farol" | "divergencias";
const PERIODOS = [["mes_atual", "Mês atual"], ["30d", "Últimos 30 dias"], ["60d", "Últimos 60 dias"], ["90d", "Últimos 90 dias"], ["tudo", "Todo o histórico"]] as const;
const BORDA_FAROL = { vermelho: "border-l-red-500", amarelo: "border-l-yellow-500", verde: "border-l-emerald-500" } as const;
const TEXTO_FAROL = { vermelho: "text-red-600", amarelo: "text-yellow-600", verde: "text-emerald-600" } as const;
const sb = supabase as any;
type Hist = { sku: string; almoxarifado: string; data_movimento: string; divergencia: number | null; hipotese_confirmada: string | null; saldo_sistema: number | null; saldo_fisico: number | null };
type Dv = { sku: string; almoxarifado: string; data_deteccao: string; status: string; valor_estimado: number | null; hipotese_ia: string | null; hipotese_confirmada: string | null; saldo_sistema: number | null; saldo_fisico: number | null; divergencia_qtd: number | null };
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dt = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

async function lerTudo<T>(tabela: string, colunas: string, filtro: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order("id").range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Data de corte do filtro de período (mesma regra do Atlas). */
function corte(periodo: string): string | null {
  const h = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "mes_atual") return iso(new Date(h.getFullYear(), h.getMonth(), 1));
  const dias = { "30d": 30, "60d": 60, "90d": 90 }[periodo]; if (!dias) return null;
  const d = new Date(h); d.setDate(d.getDate() - dias); return iso(d);
}
/** Item "sem divergência": histórico com divergência zero ou confirmado como falso positivo; divergência só se confirmada como falso positivo. */
const okHist = (m: Hist) => (Number(m.divergencia) || 0) === 0 || m.hipotese_confirmada === "Sem_Divergencia_Real";
const okDiv = (d: Dv) => d.hipotese_confirmada === "Sem_Divergencia_Real";

function AtlasPainel() {
  const busca = Route.useSearch();
  const [periodo, setPeriodo] = useState<string>("mes_atual");
  const [visao, setVisao] = useState<Visao>(busca.visao ?? "painel");
  const [mostrTabelaF, setMostrTabelaF] = useState(false);
  useEffect(() => { if (busca.visao) setVisao(busca.visao); }, [busca.visao]);
  const [almox, setAlmox] = useState("todos");
  const q = useQuery({
    queryKey: ["atlas-painel-dados"],
    queryFn: async () => {
      const [hist, divs, hip, prod] = await Promise.all([
        lerTudo<Hist>("atlas_movimentacoes_historico", "sku, almoxarifado, data_movimento, divergencia, hipotese_confirmada, saldo_sistema, saldo_fisico", (x) => x.or("origem.is.null,origem.neq.fechamento_inventario")),
        lerTudo<Dv>("atlas_divergencias", "sku, almoxarifado, data_deteccao, status, valor_estimado, hipotese_ia, hipotese_confirmada, saldo_sistema, saldo_fisico, divergencia_qtd", (x) => x.or("origem.is.null,origem.neq.fechamento_inventario")),
        sb.from("atlas_hipoteses").select("codigo, nome"),
        sb.from("atlas_produtos").select("sku, descricao").limit(5000),
      ]);
      return { hist, divs, nomes: new Map<string, string>((hip.data ?? []).map((h: any) => [h.codigo, h.nome])), desc: new Map<string, string>((prod.data ?? []).map((p: any) => [p.sku, p.descricao])) };
    },
    staleTime: 120000,
  });
  const nome = (c: string) => q.data?.nomes.get(c) ?? c.replace(/_/g, " ");

  const r = useMemo(() => {
    if (!q.data) return null;
    const c = corte(periodo);
    const hist = q.data.hist.filter((m) => !c || String(m.data_movimento).slice(0, 10) >= c);
    const divs = q.data.divs.filter((d) => !c || String(d.data_deteccao).slice(0, 10) >= c);
    const almoxes = [...new Set([...q.data.hist, ...q.data.divs].map((x) => x.almoxarifado).filter(Boolean))].sort();

    // KPIs
    const resolvidas = divs.filter((d) => d.status === "Resolvida");
    const acertos = resolvidas.filter((d) => d.hipotese_ia && d.hipotese_ia === d.hipotese_confirmada).length;
    const kpi = {
      abertas: divs.filter((d) => d.status === "Aberta").length, emInv: divs.filter((d) => d.status === "Em_Investigacao").length, resolvidas: resolvidas.length,
      valor: divs.filter((d) => d.status !== "Resolvida").reduce((a, d) => a + (Number(d.valor_estimado) || 0), 0),
      acerto: resolvidas.length ? Math.round((acertos / resolvidas.length) * 1000) / 10 : null,
    };

    // acurácia por dia e mensal (respeitam o almoxarifado)
    const porDia = new Map<string, { itens: number; ok: number }>();
    const add = (k: string, ok: boolean) => { const v = porDia.get(k) ?? { itens: 0, ok: 0 }; v.itens++; if (ok) v.ok++; porDia.set(k, v); };
    for (const m of hist) if (almox === "todos" || m.almoxarifado === almox) add(String(m.data_movimento).slice(0, 10), okHist(m));
    for (const d of divs) if (almox === "todos" || d.almoxarifado === almox) add(String(d.data_deteccao).slice(0, 10), okDiv(d));
    let itensPeriodo = 0, okPeriodo = 0;
    for (const v of porDia.values()) { itensPeriodo += v.itens; okPeriodo += v.ok; }
    const acPeriodo = itensPeriodo ? Math.round((okPeriodo / itensPeriodo) * 10000) / 100 : null;
    const dia = [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([data, v]) => ({ data, rotulo: dt(data).slice(0, 5), itens: v.itens, acuracia: v.itens ? Math.round((v.ok / v.itens) * 10000) / 100 : null }));

    // causas confirmadas
    const causas = new Map<string, number>();
    for (const m of hist) if (m.hipotese_confirmada) causas.set(m.hipotese_confirmada, (causas.get(m.hipotese_confirmada) ?? 0) + 1);
    for (const d of resolvidas) if (d.hipotese_confirmada) causas.set(d.hipotese_confirmada, (causas.get(d.hipotese_confirmada) ?? 0) + 1);
    const causasL = [...causas].map(([h, n]) => ({ hipotese: nome(h), n })).sort((a, b) => b.n - a.n);

    // acurácia por almoxarifado (pior primeiro)
    const pa = new Map<string, { itens: number; ok: number }>();
    const addA = (a: string, ok: boolean) => { const v = pa.get(a) ?? { itens: 0, ok: 0 }; v.itens++; if (ok) v.ok++; pa.set(a, v); };
    for (const m of hist) addA(m.almoxarifado, okHist(m));
    for (const d of divs) addA(d.almoxarifado, okDiv(d));
    const almoxL = [...pa].map(([a, v]) => ({ almox: a, acuracia: v.itens ? Math.round((v.ok / v.itens) * 10000) / 100 : 0, itens: v.itens })).sort((a, b) => a.acuracia - b.acuracia);

    // mapa de calor almoxarifado × hipótese
    const mapa = new Map<string, Map<string, number>>();
    const addM = (a: string, h: string) => { const m = mapa.get(a) ?? new Map(); m.set(h, (m.get(h) ?? 0) + 1); mapa.set(a, m); };
    for (const m of hist) if (m.hipotese_confirmada) addM(m.almoxarifado, m.hipotese_confirmada);
    for (const d of divs) addM(d.almoxarifado, d.hipotese_ia || d.hipotese_confirmada || "Sem_Classificacao");
    const hipsMapa = [...new Set([...mapa.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => [...mapa.values()].reduce((s, m) => s + (m.get(b) ?? 0), 0) - [...mapa.values()].reduce((s, m) => s + (m.get(a) ?? 0), 0)).slice(0, 10);
    const maxMapa = Math.max(1, ...[...mapa.values()].flatMap((m) => [...m.values()]));

    // reincidência e maiores divergências
    const porSku = new Map<string, number>(), porAlmox = new Map<string, number>();
    for (const x of [...hist.map((m) => ({ sku: m.sku, a: m.almoxarifado })), ...divs.map((d) => ({ sku: d.sku, a: d.almoxarifado }))]) { porSku.set(x.sku, (porSku.get(x.sku) ?? 0) + 1); porAlmox.set(x.a, (porAlmox.get(x.a) ?? 0) + 1); }
    const topSku = [...porSku].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topAlmox = [...porAlmox].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maiores = [
      ...hist.filter((m) => (Number(m.divergencia) || 0) !== 0).map((m) => ({ sku: m.sku, almox: m.almoxarifado, sis: m.saldo_sistema, fis: m.saldo_fisico, qtd: Number(m.divergencia), status: "Histórico resolvido" })),
      ...divs.map((d) => ({ sku: d.sku, almox: d.almoxarifado, sis: d.saldo_sistema, fis: d.saldo_fisico, qtd: Number(d.divergencia_qtd), status: d.status === "Em_Investigacao" ? "Em investigação" : d.status })),
    ].sort((a, b) => Math.abs(b.qtd) - Math.abs(a.qtd)).slice(0, 10);
    return { kpi, acPeriodo, itensPeriodo, okPeriodo, dia, causasL, almoxL, mapa, hipsMapa, maxMapa, topSku, topAlmox, maiores, almoxes };
  }, [q.data, periodo, almox]);

  // Acurácia mensal: visão geral fixa (todo o histórico, todos os almoxarifados), independente dos filtros.
  const mes = useMemo(() => {
    if (!q.data) return [];
    const porMes = new Map<string, { itens: number; ok: number }>();
    const add = (data: string, ok: boolean) => { const k = String(data).slice(0, 7); const m = porMes.get(k) ?? { itens: 0, ok: 0 }; m.itens++; if (ok) m.ok++; porMes.set(k, m); };
    for (const m of q.data.hist) add(m.data_movimento, okHist(m));
    for (const d of q.data.divs) add(d.data_deteccao, okDiv(d));
    let ant: number | null = null;
    return [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => { const ac = v.itens ? Math.round((v.ok / v.itens) * 10000) / 100 : null; const varPp = ac != null && ant != null ? Math.round((ac - ant) * 100) / 100 : null; ant = ac; return { mes: m, rotulo: `${m.slice(5)}/${m.slice(2, 4)}`, acuracia: ac, varPp, itens: v.itens }; });
  }, [q.data]);

  const atualizado = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
  const rotPeriodo = PERIODOS.find((p) => p[0] === periodo)?.[1] ?? "";
  const farol = faixaAcuracia(r?.acPeriodo ?? null);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-xl font-bold"><LayoutDashboard className="size-5" /> Movimentados <span className="ml-2 text-sm font-normal text-slate-300">Acurácia das contagens diárias · Divergências do Atlas</span></h1>
          <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)}>
            <TabsList className="h-8">
              <TabsTrigger value="painel" className="text-xs"><LayoutDashboard className="mr-1 size-3.5" /> Painel</TabsTrigger>
              <TabsTrigger value="farol" className="text-xs"><ClipboardCheck className="mr-1 size-3.5" /> Farol de Movimentados</TabsTrigger>
              <TabsTrigger value="divergencias" className="text-xs"><ListChecks className="mr-1 size-3.5" /> Divergências</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="text-xs text-slate-300">Leitura: {atualizado}</div>
      </div>

      {visao === "farol" ? <FarolMovimentadosPage /> : visao === "divergencias" ? <DivergenciasPage embutido abrirId={busca.div} /> : q.isLoading || !r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando o histórico…</div> : (
        <>
          <Secao letra="A" titulo="Filtros">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-1">
                {PERIODOS.map(([v, rot]) => <button key={v} type="button" onClick={() => setPeriodo(v)} className={`h-9 rounded-md border px-3 text-xs font-semibold ${periodo === v ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>{rot}</button>)}
              </div>
              <label className="text-[11px] font-semibold text-muted-foreground">Almoxarifado<select value={almox} onChange={(e) => setAlmox(e.target.value)} className="mt-1 block h-9 min-w-[210px] rounded-md border bg-background px-2 text-sm"><option value="todos">Todos os almoxarifados</option>{r.almoxes.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
              <button type="button" onClick={() => { setPeriodo("mes_atual"); setAlmox("todos"); }} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
            </div>
          </Secao>

          <Secao letra="B" titulo="Indicadores do período">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Indicadores do período ({rotPeriodo}) · {almox === "todos" ? "Todos os almoxarifados" : almox}</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Kpi t="Acurácia do período" v={r.acPeriodo == null ? "—" : `${un(r.acPeriodo, 2)}%`} s={`${un(r.okPeriodo)} de ${un(r.itensPeriodo)} itens sem divergência real`} cor={farol ? BORDA_FAROL[farol] : "border-l-slate-300"} vc={farol ? TEXTO_FAROL[farol] : ""} />
                <Kpi t="Abertas" v={un(r.kpi.abertas)} s="divergências aguardando análise" cor="border-l-amber-500" vc="text-amber-600" />
                <Kpi t="Em investigação" v={un(r.kpi.emInv)} s="com análise em andamento" cor="border-l-sky-500" vc="text-sky-700" />
                <Kpi t="Resolvidas" v={un(r.kpi.resolvidas)} s="causa confirmada" cor="border-l-emerald-500" vc="text-emerald-600" />
                <Kpi t="Valor em aberto" v={brl(r.kpi.valor)} s="divergências não resolvidas" cor="border-l-red-500" vc="text-red-600" />
                <Kpi t="Acerto da IA" v={r.kpi.acerto == null ? "—" : `${un(r.kpi.acerto, 1)}%`} s="hipótese sugerida = causa confirmada" cor="border-l-slate-700" />
              </div>
              <p className="text-right text-[10px] italic text-muted-foreground">Não inclui os itens de fechamento de inventário. Acurácia = itens sem divergência real ÷ itens contados. Cores: abaixo de 60% vermelho, 60% a 95% amarelo, 95% ou mais verde.</p>
            </div>
          </Secao>

          <Secao letra="C" titulo={`Acurácia por dia${almox !== "todos" ? ` · ${almox}` : ""}`}>
            <div className="h-72"><AtlasGrafico data={r.dia} category="rotulo" rightPercent series={[{key: "itens", name: "Itens Inventariados", color: atlasCores.accent, opacity: 0.55, labels: false},{key: "acuracia", name: "Acurácia %", color: atlasCores.success, line: true, right: true, percent: true}]} /></div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
            <AtlasTendencia dias={r.dia} letra="D" />
            <Secao letra="E" titulo="Causas confirmadas"><AtlasCausas data={r.causasL.slice(0, 12)} /></Secao>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao letra="F" titulo="Acurácia mensal (variação MoM em p.p.)" acao={<button type="button" onClick={() => setMostrTabelaF((v) => !v)} aria-expanded={mostrTabelaF} className="h-8 shrink-0 rounded-md border bg-muted px-3 text-xs font-semibold hover:bg-muted/70">{mostrTabelaF ? "Ocultar tabela" : "Ver tabela"}</button>}>
              <p className="-mt-2 mb-2 text-xs text-muted-foreground">Visão geral de todo o histórico e almoxarifados; não muda com os filtros.</p>
              <div className="h-60"><AtlasGrafico data={mes} category="rotulo" percent height={240} series={[{key: "acuracia", name: "Acurácia do mês", color: atlasCores.blue, percent: true},{key: "varPp", name: "Variação MoM (p.p.)", color: atlasCores.warning, line: true, right: true}]} /></div>
              {mostrTabelaF && <div className="mt-2 overflow-auto rounded-md border">
                <table className="w-full text-xs"><thead><tr><Th c="Mês" /><Th c="Acurácia" d /><Th c="MoM" d /><Th c="Itens" d /></tr></thead>
                  <tbody>{[...mes].reverse().slice(0, 6).map((m) => <tr key={m.mes} className="border-t"><td className="p-1.5">{m.rotulo}</td><td className="p-1.5 text-right font-semibold">{un(m.acuracia, 2)}%</td><td className={`p-1.5 text-right ${m.varPp == null ? "" : m.varPp >= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varPp == null ? "—" : `${m.varPp > 0 ? "+" : ""}${un(m.varPp, 2)} p.p.`}</td><td className="p-1.5 text-right text-muted-foreground">{un(m.itens)}</td></tr>)}</tbody></table>
              </div>}
            </Secao>
            <Secao letra="G" titulo="Acurácia acumulada por almoxarifado">
              <div className="h-72"><AtlasGrafico data={r.almoxL} category="almox" horizontal percent legend={false} height={260} series={[{key: "acuracia", name: "Acurácia acumulada %", color: atlasCores.warning, percent: true}]} /></div>
            </Secao>
          </div>

          <Secao letra="H" titulo="Almoxarifado × hipótese">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr><th className="p-1 text-left" />{r.hipsMapa.map((h) => <th key={h} className="p-1 align-bottom font-normal text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{nome(h)}</th>)}</tr></thead>
                <tbody>{[...r.mapa].sort((a, b) => a[0].localeCompare(b[0])).map(([a, m]) => <tr key={a}><td className="whitespace-nowrap p-1">{a}</td>{r.hipsMapa.map((h) => { const n = m.get(h) ?? 0; return <td key={h} className="p-1 text-center" style={{ background: n ? `color-mix(in oklab, var(--primary) ${Math.round(10 + 80 * (n / r.maxMapa))}%, transparent)` : undefined, color: n / r.maxMapa > 0.5 ? "white" : undefined }}>{n || ""}</td>; })}</tr>)}</tbody>
              </table>
            </div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-3">
            <Secao letra="I" titulo="SKUs mais recorrentes">
              <table className="w-full text-xs"><thead><tr><Th c="SKU" /><Th c="Produto" /><Th c="Vezes" d /></tr></thead><tbody>{r.topSku.map(([s, n]) => <tr key={s} className="border-t"><td className="p-1.5 font-mono">{s}</td><td className="max-w-[160px] truncate p-1.5 text-muted-foreground">{q.data?.desc.get(s) ?? ""}</td><td className="p-1.5 text-right">{n}</td></tr>)}</tbody></table>
            </Secao>
            <Secao letra="J" titulo="Almoxarifados com mais apontamentos">
              <table className="w-full text-xs"><thead><tr><Th c="Almoxarifado" /><Th c="Apontamentos" d /></tr></thead><tbody>{r.topAlmox.map(([a, n]) => <tr key={a} className="border-t"><td className="p-1.5">{a}</td><td className="p-1.5 text-right">{un(n)}</td></tr>)}</tbody></table>
            </Secao>
            <Secao letra="K" titulo="Maiores divergências (quantidade)">
              <table className="w-full text-xs"><thead><tr><Th c="Produto" /><Th c="Qtd" d /><Th c="Status" d /></tr></thead><tbody>{r.maiores.map((m, i) => <tr key={i} className="border-t"><td className="p-1.5"><div className="font-mono">{m.sku}</div><div className="max-w-[150px] truncate text-muted-foreground">{q.data?.desc.get(m.sku) ?? m.almox}</div></td><td className={`p-1.5 text-right ${m.qtd < 0 ? "text-destructive" : "text-emerald-700"}`}>{un(m.qtd, 2)}</td><td className="p-1.5 text-right text-[10px] text-muted-foreground">{m.status}</td></tr>)}</tbody></table>
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ t, v, s, cor, vc = "" }: { t: string; v: string; s: string; cor: string; vc?: string }) {
  return <div className={`rounded-xl border border-l-4 bg-card p-3 shadow-sm ${cor}`}><div className="text-[11px] font-semibold uppercase text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold ${vc}`}>{v}</div><div className="mt-1 text-[11px] text-muted-foreground">{s}</div></div>;
}
