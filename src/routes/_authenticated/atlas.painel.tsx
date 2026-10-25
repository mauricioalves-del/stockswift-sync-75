import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtlasGrafico, AtlasCausas, atlasCores } from "@/components/atlas/AtlasGrafico";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/atlas/painel")({
  component: AtlasPainel,
  head: () => ({ meta: [{ title: "Painel de Divergências — Atlas" }, { name: "description", content: "Acurácia diária, causas confirmadas e evolução mensal das divergências do Atlas." }, { property: "og:title", content: "Painel de Divergências — Atlas" }, { property: "og:description", content: "Acurácia diária, causas confirmadas e evolução mensal das divergências do Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

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
  const [periodo, setPeriodo] = useState("tudo");
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
    const dia = [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([data, v]) => ({ data, rotulo: dt(data).slice(0, 5), itens: v.itens, acuracia: v.itens ? Math.round((v.ok / v.itens) * 10000) / 100 : null }));
    const porMes = new Map<string, { itens: number; ok: number }>();
    for (const [data, v] of porDia) { const k = data.slice(0, 7); const m = porMes.get(k) ?? { itens: 0, ok: 0 }; m.itens += v.itens; m.ok += v.ok; porMes.set(k, m); }
    let ant: number | null = null;
    const mes = [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => { const ac = v.itens ? Math.round((v.ok / v.itens) * 10000) / 100 : null; const varPp = ac != null && ant != null ? Math.round((ac - ant) * 100) / 100 : null; ant = ac; return { mes: m, rotulo: `${m.slice(5)}/${m.slice(2, 4)}`, acuracia: ac, varPp, itens: v.itens }; });

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
    return { kpi, dia, mes, causasL, almoxL, mapa, hipsMapa, maxMapa, topSku, topAlmox, maiores, almoxes };
  }, [q.data, periodo, almox]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><LayoutDashboard className="size-6" /> Painel</h1>
          <p className="text-sm text-muted-foreground">Acurácia das contagens diárias (movimentação) e divergências do Atlas. Não inclui os itens de fechamento de inventário. Acurácia = itens sem divergência real ÷ itens contados.</p>
        </div>
        <div className="flex gap-2">
          <Select value={periodo} onValueChange={setPeriodo}><SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tudo">Todo o histórico</SelectItem><SelectItem value="mes_atual">Mês atual</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem><SelectItem value="60d">Últimos 60 dias</SelectItem><SelectItem value="90d">Últimos 90 dias</SelectItem></SelectContent></Select>
          <Select value={almox} onValueChange={setAlmox}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{(r?.almoxes ?? []).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      {q.isLoading || !r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando o histórico…</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[["Abertas", un(r.kpi.abertas)], ["Em investigação", un(r.kpi.emInv)], ["Resolvidas", un(r.kpi.resolvidas)], ["Valor em aberto", brl(r.kpi.valor)], ["Acerto da IA", r.kpi.acerto == null ? "—" : `${un(r.kpi.acerto, 1)}%`]].map(([rot, v]) => (
              <Card key={rot}><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{rot}</div><div className="mt-1 text-xl font-semibold">{v}</div></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Acurácia por dia {almox !== "todos" ? `· ${almox}` : ""}</CardTitle></CardHeader>
            <CardContent className="h-72">
              <AtlasGrafico data={r.dia} category="rotulo" rightPercent series={[{key: "itens", name: "Itens Inventariados", color: atlasCores.accent, opacity: 0.55, labels: false},{key: "acuracia", name: "Acurácia %", color: atlasCores.success, line: true, right: true, percent: true}]} />
            </CardContent>
          </Card>

<Card><CardHeader><CardTitle>Tendência de Acurácia</CardTitle></CardHeader><CardContent><AtlasGrafico data={r.dia} category="rotulo" percent series={[{key: "acuracia", name: "Acurácia real", color: atlasCores.blue, line: true, percent: true}]} /></CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Acurácia mensal (variação MoM em p.p.)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-60"><AtlasGrafico data={r.mes} category="rotulo" percent height={240} series={[{key: "acuracia", name: "Acurácia do mês", color: atlasCores.blue, percent: true},{key: "varPp", name: "Variação MoM (p.p.)", color: atlasCores.warning, line: true, right: true}]} /></div>
                <table className="mt-2 w-full text-xs"><tbody>{[...r.mes].reverse().slice(0, 6).map((m) => <tr key={m.mes} className="border-b last:border-0"><td className="p-1">{m.rotulo}</td><td className="p-1 text-right">{un(m.acuracia, 2)}%</td><td className={`p-1 text-right ${m.varPp == null ? "" : m.varPp >= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varPp == null ? "—" : `${m.varPp > 0 ? "+" : ""}${un(m.varPp, 2)} p.p.`}</td><td className="p-1 text-right text-muted-foreground">{un(m.itens)} itens</td></tr>)}</tbody></table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Acurácia acumulada por almoxarifado</CardTitle></CardHeader>
              <CardContent className="h-72"><AtlasGrafico data={r.almoxL} category="almox" horizontal percent legend={false} height={260} series={[{key: "acuracia", name: "Acurácia acumulada %", color: atlasCores.warning, percent: true}]} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Causas confirmadas</CardTitle></CardHeader>
              <CardContent><AtlasCausas data={r.causasL.slice(0, 12)} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Almoxarifado × hipótese</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr><th className="p-1 text-left" />{r.hipsMapa.map((h) => <th key={h} className="p-1 align-bottom font-normal text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{nome(h)}</th>)}</tr></thead>
                  <tbody>{[...r.mapa].sort((a, b) => a[0].localeCompare(b[0])).map(([a, m]) => <tr key={a}><td className="whitespace-nowrap p-1">{a}</td>{r.hipsMapa.map((h) => { const n = m.get(h) ?? 0; return <td key={h} className="p-1 text-center" style={{ background: n ? `color-mix(in oklab, var(--primary) ${Math.round(10 + 80 * (n / r.maxMapa))}%, transparent)` : undefined, color: n / r.maxMapa > 0.5 ? "white" : undefined }}>{n || ""}</td>; })}</tr>)}</tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">SKUs mais recorrentes</CardTitle></CardHeader>
              <CardContent><table className="w-full text-xs"><tbody>{r.topSku.map(([s, n]) => <tr key={s} className="border-b last:border-0"><td className="p-1 font-mono">{s}</td><td className="max-w-[160px] truncate p-1 text-muted-foreground">{q.data?.desc.get(s) ?? ""}</td><td className="p-1 text-right">{n}</td></tr>)}</tbody></table></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Almoxarifados com mais apontamentos</CardTitle></CardHeader>
              <CardContent><table className="w-full text-xs"><tbody>{r.topAlmox.map(([a, n]) => <tr key={a} className="border-b last:border-0"><td className="p-1">{a}</td><td className="p-1 text-right">{un(n)}</td></tr>)}</tbody></table></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Maiores divergências (quantidade)</CardTitle></CardHeader>
              <CardContent><table className="w-full text-xs"><tbody>{r.maiores.map((m, i) => <tr key={i} className="border-b last:border-0"><td className="p-1"><div className="font-mono">{m.sku}</div><div className="max-w-[150px] truncate text-muted-foreground">{q.data?.desc.get(m.sku) ?? m.almox}</div></td><td className={`p-1 text-right ${m.qtd < 0 ? "text-destructive" : "text-emerald-700"}`}>{un(m.qtd, 2)}</td><td className="p-1 text-right text-[10px] text-muted-foreground">{m.status}</td></tr>)}</tbody></table></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
