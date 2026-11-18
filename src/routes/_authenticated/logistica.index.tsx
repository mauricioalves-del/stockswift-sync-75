// Pilar Controle Logístico — Painel Logístico no padrão do Dashboard de Disponibilidade (cabeçalho escuro, blocos A, B, C…).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarDays, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { fetchAll } from "@/lib/fetch-all";
import { Secao, TabelaRolavel, Th } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { indicadoresLogistica, lerPlanilhaFretes, type Envio, type FixoPJ, type TrechoPJ } from "@/lib/logistica";
import { oportunidades, ZONA_ROTULO, zonaEnvio, type Zona } from "@/lib/tms";
import { MapaEntregasGeo } from "@/components/logistica/MapaEntregasGeo";

export const Route = createFileRoute("/_authenticated/logistica/")({
  component: LogisticaPage,
  head: () => ({ meta: [{ title: "Painel Logístico — Controle Logístico" }, { name: "description", content: "Custos de transporte por natureza, modal, centro de custo, PJ e transferências Pará ↔ SP." }] }),
});

const sb = supabase as any;
const brl = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d, minimumFractionDigits: d }));
const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const mesRot = (m: string) => `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const NAT: Record<string, string> = { venda: "Venda (last mile)", compra: "Compra (suprimentos)", interno: "Interno (remessas)" };
const COR_NAT: Record<string, string> = { venda: "#34436C", compra: "#D98E04", interno: "#2E7D6B", pj: "#9B5DE5" };
const hojeBrt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const fimMes = (m: string) => { const [a, b] = m.split("-").map(Number); return `${m}-${String(new Date(a, b, 0).getDate()).padStart(2, "0")}`; };
type Filtro = { de: string; ate: string; natureza: string; cc: string; modal: string };

function Card({ t, v, sub, borda = "border-l-slate-300", cls = "" }: { t: string; v: string; sub?: string; borda?: string; cls?: string }) {
  return <div className={`rounded-xl border border-l-4 bg-card p-3 shadow-sm ${borda}`}><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{v}</div>{sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
function Barra({ v, max, cor }: { v: number; max: number; cor: string }) {
  return <div className="h-1.5 w-full rounded bg-muted"><div className="h-1.5 rounded" style={{ width: `${max ? Math.max(2, (v / max) * 100) : 0}%`, background: cor }} /></div>;
}
function Ranking({ titulo, linhas, cor, total }: { titulo: string; linhas: { k: string; qtd: number; valor: number }[]; cor: string; total: number }) {
  const max = Math.max(0, ...linhas.map((l) => l.valor));
  return <div className="rounded-lg border p-3"><div className="mb-2 text-xs font-bold">{titulo}</div>
    <div className="space-y-2">{linhas.slice(0, 8).map((l) => <div key={l.k}><div className="flex justify-between text-xs"><span className="truncate pr-2">{l.k}</span><span className="tabular-nums font-semibold">{brl(l.valor)} <span className="font-normal text-muted-foreground">· {total ? Math.round((l.valor / total) * 100) : 0}% · {l.qtd}</span></span></div><Barra v={l.valor} max={max} cor={cor} /></div>)}</div></div>;
}

function Importador({ onFim }: { onFim: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [lido, setLido] = useState<ReturnType<typeof lerPlanilhaFretes> | null>(null);
  const [arq, setArq] = useState(""); const [gravando, setGravando] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  async function ler(f: File) { try { setArq(f.name); setLido(lerPlanilhaFretes(await f.arrayBuffer(), f.name)); } catch (e: any) { toast.error("Não consegui ler: " + (e?.message ?? e)); } finally { if (inp.current) inp.current.value = ""; } }
  async function gravar() {
    if (!lido) return; setGravando(true);
    try {
      for (let i = 0; i < lido.envios.length; i += 500) { const r = await sb.from("log_envios").upsert(lido.envios.slice(i, i + 500), { onConflict: "chave", ignoreDuplicates: true }); if (r.error) throw r.error; }
      for (let i = 0; i < lido.trechos.length; i += 500) { const r = await sb.from("log_trechos_pj").upsert(lido.trechos.slice(i, i + 500), { onConflict: "chave", ignoreDuplicates: true }); if (r.error) throw r.error; }
      toast.success(`Importado: ${lido.envios.length} envios e ${lido.trechos.length} trechos do PJ (linhas já existentes foram ignoradas).`); setAberto(false); setLido(null); onFim();
    } catch (e: any) { toast.error("Falha: " + (e?.message ?? e)); } finally { setGravando(false); }
  }
  return <>
    <button type="button" onClick={() => setAberto(true)} className="flex h-8 items-center gap-1 rounded-md border border-slate-600 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Upload className="size-3.5" />Importar fechamento de fretes</button>
    <Dialog open={aberto} onOpenChange={(v) => !gravando && setAberto(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar fechamento de fretes</DialogTitle>
          <DialogDescription>Planilha no modelo "Fechamento de fretes" (envios por modal, quilometragem do PJ e LATAM) ou os controles anteriores. Linhas repetidas — na mesma planilha ou já importadas — são ignoradas.</DialogDescription></DialogHeader>
        <input ref={inp} type="file" accept=".xlsx,.xlsm,.xlsb" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        <Button onClick={() => inp.current?.click()} disabled={gravando}><Upload className="mr-2 size-4" />Escolher planilha</Button>
        {lido && <>
          <table className="w-full text-sm"><thead><tr><Th c="Aba" /><Th c="Tipo" /><Th c="Linhas" d /></tr></thead><tbody>{lido.abas.map((a) => <tr key={a.aba} className="border-t"><td className="px-2 py-1">{a.aba}</td><td className="px-2 py-1">{a.tipo}</td><td className="px-2 py-1 text-right tabular-nums">{a.linhas}</td></tr>)}</tbody></table>
          <p className="text-xs text-muted-foreground">{arq}: {lido.envios.length} envios e {lido.trechos.length} trechos do PJ, sem repetições.</p>
          <div className="flex justify-end"><Button onClick={gravar} disabled={gravando}>{gravando ? "Importando…" : "Importar"}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

// Mapa do Brasil em grade de estados (cada quadrado = UF), sem dependência de mapa externo
const GRADE: Record<string, [number, number]> = { RR: [2, 0], AP: [4, 0], AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1], AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2], MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3], PR: [2, 4], SP: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4], SC: [2, 5], RJ: [4, 5], RS: [2, 6] };
const ZCOR: Record<Zona, string> = { grande_sp: "#34436C", interior_sp: "#5B7DB8", fora_estado: "#D98E04", para_sp: "#2E7D6B", sp_para: "#6BAF9D" };
function MapaEntregas({ envios }: { envios: Envio[] }) {
  const porUf = new Map<string, number>(); const porZona = new Map<Zona, { n: number; v: number }>();
  for (const e of envios) { const uf = (e.uf ?? "SP").toUpperCase(); porUf.set(uf, (porUf.get(uf) ?? 0) + 1); const z = zonaEnvio(e as any); const a = porZona.get(z) ?? { n: 0, v: 0 }; a.n++; a.v += e.frete + e.isopor + e.gelox + e.seguro; porZona.set(z, a); }
  const max = Math.max(1, ...porUf.values()), tot = envios.length || 1;
  const gsp = porZona.get("grande_sp")?.n ?? 0, fora = tot - gsp - (porZona.get("para_sp")?.n ?? 0) - (porZona.get("sp_para")?.n ?? 0);
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-l-4 border-l-[#34436C] bg-card p-3 shadow-sm"><div className="text-[11px] font-semibold uppercase text-muted-foreground">Entregas na Grande SP</div><div className="text-2xl font-bold tabular-nums">{gsp}</div><div className="text-xs text-muted-foreground">{Math.round((gsp / tot) * 100)}% dos envios</div></div>
        <div className="rounded-xl border border-l-4 border-l-[#D98E04] bg-card p-3 shadow-sm"><div className="text-[11px] font-semibold uppercase text-muted-foreground">Fora da Grande SP</div><div className="text-2xl font-bold tabular-nums">{fora}</div><div className="text-xs text-muted-foreground">interior/litoral + outros estados · capacidade de distribuição</div></div>
        <div className="rounded-xl border border-l-4 border-l-[#2E7D6B] bg-card p-3 shadow-sm"><div className="text-[11px] font-semibold uppercase text-muted-foreground">Transferências Pará ↔ SP</div><div className="text-2xl font-bold tabular-nums">{(porZona.get("para_sp")?.n ?? 0) + (porZona.get("sp_para")?.n ?? 0)}</div></div>
      </div>
      <table className="w-full text-sm"><thead><tr><Th c="Região" /><Th c="Envios" d /><Th c="% dos envios" d /><Th c="Custo" d /><Th c="Custo médio" d /></tr></thead>
        <tbody>{(Object.keys(ZONA_ROTULO) as Zona[]).filter((z) => porZona.get(z)).map((z) => { const a = porZona.get(z)!; return <tr key={z} className="border-t"><td className="px-2 py-1"><span className="mr-2 inline-block size-2.5 rounded-sm" style={{ background: ZCOR[z] }} />{ZONA_ROTULO[z]}</td><td className="px-2 py-1 text-right tabular-nums">{a.n}</td><td className="px-2 py-1 text-right tabular-nums">{Math.round((a.n / tot) * 100)}%</td><td className="px-2 py-1 text-right tabular-nums">{a.v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</td><td className="px-2 py-1 text-right tabular-nums">{(a.v / a.n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })}</td></tr>; })}</tbody></table>
      <p className="text-xs text-muted-foreground">Histórico importado usa UF + “fora de SP capital”; as novas solicitações usam o CEP (01000–09999 = Grande SP; 11000–19999 = interior e litoral).</p>
    </div>
    <svg viewBox="0 0 280 280" className="w-full" role="img" aria-label="Envios por estado">
      {Object.entries(GRADE).map(([uf, [c, r]]) => { const n = porUf.get(uf) ?? 0; const a = n ? 0.15 + 0.85 * (n / max) : 0; return <g key={uf}><rect x={c * 40 + 2} y={r * 40 + 2} width={36} height={36} rx={6} fill={n ? (uf === "SP" ? "#34436C" : uf === "PA" ? "#2E7D6B" : "#D98E04") : "currentColor"} fillOpacity={n ? a : 0.06} stroke="currentColor" strokeOpacity={0.15} />
        <text x={c * 40 + 20} y={r * 40 + 18} textAnchor="middle" fontSize="10" fontWeight={700} fill={n && a > 0.5 ? "#fff" : "currentColor"}>{uf}</text><text x={c * 40 + 20} y={r * 40 + 31} textAnchor="middle" fontSize="9" fill={n && a > 0.5 ? "#fff" : "currentColor"} fillOpacity={n ? 1 : 0.4}>{n || ""}</text></g>; })}
    </svg>
  </div>;
}

function LogisticaPage() {
  const { isAdmin } = useRole();
  // Módulo restrito: somente Administrador.
  const pode = isAdmin;
  const qc = useQueryClient(); const hoje = hojeBrt();
  const [cli, setCli] = useState(false); useEffect(() => setCli(true), []);
  const q = useQuery({
    enabled: cli && pode, queryKey: ["logistica"], staleTime: 5 * 60_000,
    queryFn: async () => {
      const [envios, trechos, fixos, org] = await Promise.all([
        fetchAll<any>((f, t) => sb.from("log_envios").select("*").order("data").range(f, t)),
        fetchAll<any>((f, t) => sb.from("log_trechos_pj").select("*").order("data").range(f, t)),
        fetchAll<any>((f, t) => sb.from("log_custos_fixos").select("prestador, mes, valor, rateio").range(f, t)),
        sb.from("app_config").select("valor").eq("chave", "log_origem").maybeSingle(),
      ]);
      const o = (org as any)?.data?.valor ?? {};
      return { origem: { nome: String(o.nome ?? "Fábrica Mágio (SP)"), lat: Number(o.lat ?? -23.5505), lng: Number(o.lng ?? -46.6333) }, envios: envios.map((e: any) => ({ ...e, frete: +e.frete, isopor: +e.isopor, gelox: +e.gelox, seguro: +e.seguro, cobrado: +e.cobrado, kg: e.kg == null ? null : +e.kg, km: e.km == null ? null : +e.km })) as Envio[], trechos: trechos.map((t: any) => ({ ...t, valor: +t.valor, km: t.km == null ? null : +t.km })) as TrechoPJ[], fixos: fixos.map((f: any) => ({ ...f, valor: +f.valor })) as FixoPJ[] };
    },
  });
  const ultimoDado = useMemo(() => { const d = [...(q.data?.envios ?? []).map((e) => e.data), ...(q.data?.trechos ?? []).map((t) => t.data)].sort(); return d[d.length - 1] ?? hoje; }, [q.data, hoje]);
  const padrao = (): Filtro => ({ de: `${ultimoDado.slice(0, 7)}-01`, ate: fimMes(ultimoDado.slice(0, 7)), natureza: "TODAS", cc: "TODOS", modal: "TODOS" });
  const [filtro, setFiltro] = useState<Filtro | null>(null); const f = filtro ?? padrao();
  const set = (p: Partial<Filtro>) => setFiltro({ ...f, ...p });

  const filtrados = useMemo(() => (q.data?.envios ?? []).filter((e) => (f.natureza === "TODAS" || e.natureza === f.natureza) && (f.cc === "TODOS" || (e.cc ?? "—") === f.cc) && (f.modal === "TODOS" || (e.modal ?? "—").toUpperCase() === f.modal)), [q.data, f]);
  const soEnvios = f.natureza !== "TODAS" || f.cc !== "TODOS" || f.modal !== "TODOS"; // filtros de envio tiram o PJ da conta
  const k = useMemo(() => (q.data ? indicadoresLogistica(filtrados, soEnvios ? [] : q.data.trechos, soEnvios ? [] : q.data.fixos, f.de, f.ate) : null), [q.data, filtrados, f, soEnvios]);
  const meses = useMemo(() => { const s = new Set<string>(); q.data?.envios.forEach((e) => s.add(e.data.slice(0, 7))); q.data?.trechos.forEach((t) => s.add(t.data.slice(0, 7))); return [...s].sort(); }, [q.data]);
  const serie = useMemo(() => q.data ? meses.map((m) => { const x = indicadoresLogistica(filtrados, soEnvios ? [] : q.data!.trechos, soEnvios ? [] : q.data!.fixos, m, fimMes(m)); const n = (nat: string) => x.porNatureza.find((p) => p.k === nat)?.valor ?? 0; return { mes: mesRot(m), venda: Math.round(n("venda")), compra: Math.round(n("compra")), interno: Math.round(n("interno")), pj: Math.round(x.kmPJ + x.fixoPJ), envios: x.qtdEnvios }; }) : [], [q.data, meses, filtrados, soEnvios]);
  const opcoes = useMemo(() => ({ cc: [...new Set((q.data?.envios ?? []).map((e) => e.cc ?? "—"))].sort(), modal: [...new Set((q.data?.envios ?? []).map((e) => (e.modal ?? "—").toUpperCase()))].sort() }), [q.data]);
  const detalhe = useMemo(() => filtrados.filter((e) => e.data >= f.de && e.data <= f.ate).sort((a, b) => b.data.localeCompare(a.data)), [filtrados, f]);
  const trechosPer = useMemo(() => (q.data?.trechos ?? []).filter((t) => t.data >= f.de && t.data <= f.ate), [q.data, f]);

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;
  const atual = f.de === `${ultimoDado.slice(0, 7)}-01` && f.ate === fimMes(ultimoDado.slice(0, 7));
  const ano = `${ultimoDado.slice(0, 4)}`;
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">Painel Logístico <span className="ml-2 text-sm font-normal text-slate-300">Fretes · PJ · Transferências Pará ↔ SP</span></h1>
          <p className="mt-1 text-xs text-slate-300">Custos de transporte por natureza (venda, compra, interno), modal e centro de custo.</p></div>
        <div className="flex items-center gap-3"><Importador onFim={() => qc.invalidateQueries({ queryKey: ["logistica"] })} /><div className="text-xs text-slate-300">Último lançamento: {ultimoDado.split("-").reverse().join("/")}</div></div>
      </div>

      <Secao letra="A" titulo="Filtros">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2"><CalendarDays className="mb-2 size-4 text-muted-foreground" />
            <label className="text-[11px] font-semibold text-muted-foreground">De<input type="date" value={f.de} max={f.ate} onChange={(e) => e.target.value && set({ de: e.target.value })} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" /></label>
            <label className="text-[11px] font-semibold text-muted-foreground">Até<input type="date" value={f.ate} min={f.de} onChange={(e) => e.target.value && set({ ate: e.target.value })} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" /></label></div>
          <div className="flex gap-1">
            <button type="button" onClick={() => set({ de: `${ultimoDado.slice(0, 7)}-01`, ate: fimMes(ultimoDado.slice(0, 7)) })} className={`h-9 rounded-md border px-3 text-xs font-semibold ${atual ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Último mês</button>
            <button type="button" onClick={() => set({ de: `${ano}-01-01`, ate: `${ano}-12-31` })} className={`h-9 rounded-md border px-3 text-xs font-semibold ${f.de === `${ano}-01-01` && f.ate === `${ano}-12-31` ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>Ano {ano}</button></div>
          <label className="text-[11px] font-semibold text-muted-foreground">Natureza<select value={f.natureza} onChange={(e) => set({ natureza: e.target.value })} className="mt-1 block h-9 min-w-[190px] rounded-md border bg-background px-2 text-sm"><option value="TODAS">Todas</option>{Object.entries(NAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Centro de custo<select value={f.cc} onChange={(e) => set({ cc: e.target.value })} className="mt-1 block h-9 min-w-[170px] rounded-md border bg-background px-2 text-sm"><option value="TODOS">Todos</option>{opcoes.cc.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Modal<select value={f.modal} onChange={(e) => set({ modal: e.target.value })} className="mt-1 block h-9 min-w-[190px] rounded-md border bg-background px-2 text-sm"><option value="TODOS">Todos</option>{opcoes.modal.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button type="button" onClick={() => setFiltro(null)} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
        </div>
        {soEnvios && <p className="mt-2 text-[11px] text-muted-foreground">Com filtro de natureza, centro de custo ou modal, o PJ (km e fixo) sai da conta e os indicadores mostram só os envios filtrados.</p>}
      </Secao>

      {!cli || q.isLoading ? <p className="py-10 text-center text-muted-foreground">Carregando os custos logísticos…</p> : q.isError ? <p className="py-10 text-center text-red-600">Não consegui ler os dados: {String((q.error as any)?.message ?? q.error)}</p> : !k || (!q.data!.envios.length && !q.data!.trechos.length) ? <p className="py-10 text-center text-muted-foreground">Sem dados — importe a planilha de fechamento de fretes (botão no cabeçalho).</p> : (<>
        <Secao letra="B" titulo="Indicadores do período">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-muted-foreground">Período {dm(f.de)} a {dm(f.ate)} · {f.natureza === "TODAS" ? "todas as naturezas" : NAT[f.natureza]}</span>
              {k.pj.residencia > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800"><AlertTriangle className="size-3.5" /> {brl(k.pj.residencia)} de km do PJ saindo da residência ({k.pj.trechosResidencia} trecho(s))</span>}</div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card t="Custo logístico total" v={brl(k.total)} sub={`envios ${brl(k.envios)} · PJ ${brl(k.kmPJ + k.fixoPJ)}`} borda="border-l-slate-900" />
              <Card t="Envios" v={nf(k.qtdEnvios)} sub={`${nf(k.cortesias)} cortesia(s) · ${k.qtdEnvios ? Math.round((k.cortesias / k.qtdEnvios) * 100) : 0}% do total`} borda="border-l-sky-600" />
              <Card t="Custo médio por entrega" v={brl(k.custoMedioEntrega, 2)} sub="frete de venda, sem aéreo" borda="border-l-sky-600" />
              <Card t="Resultado do frete de venda" v={brl(k.prejuizo)} sub={`cobrado do cliente: ${brl(k.freteCobrado)} · sem remessas internas e compras`} borda={k.prejuizo < 0 ? "border-l-red-500" : "border-l-emerald-500"} cls={k.prejuizo < 0 ? "text-red-600" : "text-emerald-700"} />
              <Card t="PJ · km rodados" v={`${nf(k.pj.km)} km`} sub={`${brl(k.pj.valorKm)} em km + ${brl(k.pj.fixo)} fixo`} borda="border-l-violet-500" />
              <Card t="PJ · km da residência" v={brl(k.pj.residencia)} sub={`${nf(k.pj.trechosResidencia)} trecho(s) · ponto a renegociar`} borda={k.pj.residencia ? "border-l-amber-500" : "border-l-emerald-500"} cls={k.pj.residencia ? "text-amber-600" : ""} />
              <Card t="Transferências Pará ↔ SP" v={brl(k.transf.valor)} sub={`${nf(k.transf.qtd)} envio(s) · ${nf(k.transf.kg)} kg`} borda="border-l-teal-600" />
              <Card t="Custo por kg transferido" v={brl(k.transf.porKg, 2)} sub="frete + isopor + gelox + seguro + motorista" borda="border-l-teal-600" />
            </div>
          </div>
        </Secao>

        <Secao letra="C" titulo="Evolução mensal por natureza">
          <div className="h-72"><ResponsiveContainer><BarChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => brl(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="venda" stackId="a" name={NAT.venda} fill={COR_NAT.venda} /><Bar dataKey="compra" stackId="a" name={NAT.compra} fill={COR_NAT.compra} /><Bar dataKey="interno" stackId="a" name={NAT.interno} fill={COR_NAT.interno} />{!soEnvios && <Bar dataKey="pj" stackId="a" name="PJ (km + fixo)" fill={COR_NAT.pj} />}</BarChart></ResponsiveContainer></div>
        </Secao>

        <Secao letra="M" titulo="Mapa de entregas — Brasil por estado e zonas de São Paulo">
          <MapaEntregasGeo pontos={detalhe.map((e: any) => ({ data: e.data, cliente: e.cliente, uf: e.uf, cidade: e.cidade, cep: e.cep, lat: e.lat == null ? null : Number(e.lat), lng: e.lng == null ? null : Number(e.lng), km: e.km == null ? null : Number(e.km), zona: e.zona, fora_sp: e.fora_sp, custo: e.frete + e.isopor + e.gelox + e.seguro }))} />
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Resumo por região (Grande SP × fora)</summary><div className="mt-2"><MapaEntregas envios={detalhe} /></div></details>
        </Secao>
        <Secao letra="R" titulo="Oportunidades de redução de custo">
          <div className="grid gap-2 md:grid-cols-2">{oportunidades(detalhe, k.pj.residencia).map((o) => <div key={o.titulo} className="rounded-lg border border-l-4 border-l-emerald-500 p-3 text-sm"><div className="flex justify-between gap-2"><b>{o.titulo}</b><span className="whitespace-nowrap text-xs font-semibold text-emerald-700">potencial ~{o.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</span></div><p className="mt-1 text-xs text-muted-foreground">{o.acao}</p></div>)}</div>
          <p className="mt-2 text-xs text-muted-foreground">Estimativas de economia são metas iniciais (não medidas): servem para priorizar as frentes e serão recalculadas com as cotações reais.</p>
        </Secao>
        <Secao letra="D" titulo="Onde está o custo">
          <div className="grid gap-3 lg:grid-cols-3">
            <Ranking titulo="Por natureza" linhas={k.porNatureza.map((x) => ({ ...x, k: NAT[x.k] ?? x.k }))} cor={COR_NAT.venda} total={k.envios} />
            <Ranking titulo="Por modal" linhas={k.porModal} cor="#0369A1" total={k.envios} />
            <Ranking titulo="Por centro de custo" linhas={k.porCC} cor="#B45309" total={k.envios} />
          </div>
        </Secao>

        {!soEnvios && <Secao letra="E" titulo="PJ (Nelson) — km por área e trechos">
          <div className="grid gap-3 lg:grid-cols-3">
            <Ranking titulo="Valor em km por área" linhas={k.pj.porArea.map((x) => ({ k: x.k, qtd: trechosPer.filter((t) => (t.cc || "—") === x.k).length, valor: x.valor }))} cor={COR_NAT.pj} total={k.pj.valorKm} />
            <div className="lg:col-span-2"><TabelaRolavel titulo={`${trechosPer.length} trecho(s) no período`} altura="max-h-[320px]">
              <table className="w-full text-xs"><thead className="sticky top-0"><tr><Th c="Data" /><Th c="Saída" /><Th c="Destino" /><Th c="Operação" /><Th c="km" d /><Th c="Valor" d /></tr></thead>
                <tbody>{[...trechosPer].sort((a, b) => b.data.localeCompare(a.data)).map((t) => { const res = /resid/i.test(`${t.saida} ${t.destino}`); return <tr key={t.chave} className={`border-t ${res ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}><td className="px-2 py-1 whitespace-nowrap">{dm(t.data)}</td><td className="px-2 py-1">{t.saida}</td><td className="px-2 py-1">{t.destino}</td><td className="px-2 py-1">{t.operacao}</td><td className="px-2 py-1 text-right tabular-nums">{nf(t.km, 1)}</td><td className="px-2 py-1 text-right tabular-nums">{brl(t.valor, 2)}</td></tr>; })}</tbody></table></TabelaRolavel></div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Contrato atual (como está): R$ 4.000 fixos/mês (Facilities R$ 1.000 · Ativação R$ 1.500 · Operação R$ 1.500) + R$ 4/km em ativações e R$ 2/km nas demais. Linhas em destaque saem ou chegam na residência do PJ.</p>
        </Secao>}

        <Secao letra={soEnvios ? "E" : "F"} titulo="Detalhe dos envios">
          <TabelaRolavel titulo={`${detalhe.length} envio(s) · ${brl(detalhe.reduce((a, e) => a + e.frete + e.isopor + e.gelox + e.seguro, 0))}`}>
            <table className="w-full text-xs"><thead className="sticky top-0"><tr><Th c="Data" /><Th c="Pedido / NF" /><Th c="Cliente" /><Th c="Natureza" /><Th c="CC" /><Th c="Modal" /><Th c="UF" /><Th c="kg" d /><Th c="Frete" d /><Th c="Isopor + gelox" d /><Th c="Cobrado" d /><Th c="Observação" /></tr></thead>
              <tbody>{detalhe.map((e) => <tr key={e.chave} className="border-t"><td className="px-2 py-1 whitespace-nowrap">{dm(e.data)}</td><td className="px-2 py-1">{e.pedido ?? "—"}</td><td className="px-2 py-1">{e.cliente ?? "—"}</td><td className="px-2 py-1"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: COR_NAT[e.natureza] }}>{e.natureza}</span></td><td className="px-2 py-1">{e.cc ?? "—"}</td><td className="px-2 py-1">{e.modal}</td><td className="px-2 py-1">{e.uf ?? "—"}</td><td className="px-2 py-1 text-right tabular-nums">{nf(e.kg, 1)}</td><td className="px-2 py-1 text-right tabular-nums">{brl(e.frete, 2)}</td><td className="px-2 py-1 text-right tabular-nums">{brl(e.isopor + e.gelox, 2)}</td><td className="px-2 py-1 text-right tabular-nums">{brl(e.cobrado, 2)}</td><td className="px-2 py-1">{e.observacao ?? ""}</td></tr>)}</tbody></table>
          </TabelaRolavel>
        </Secao>
      </>)}
    </div>
  );
}
