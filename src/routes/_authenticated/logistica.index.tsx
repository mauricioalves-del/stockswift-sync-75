// Pilar Controle Logístico — painel de custos de transporte (envios por modal, PJ e transferências Pará ↔ SP).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Secao } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { indicadoresLogistica, lerPlanilhaFretes, type Envio, type FixoPJ, type TrechoPJ } from "@/lib/logistica";

export const Route = createFileRoute("/_authenticated/logistica/")({ component: LogisticaPage });

const sb = supabase as any;
const brl = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d }));
const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const mesRot = (m: string) => `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const NAT: Record<string, string> = { venda: "Venda (last mile)", compra: "Compra (suprimentos)", interno: "Interno (remessas)" };

function Kpi({ t, v, d, tom }: { t: string; v: string; d?: string; tom?: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tom ?? ""}`}>{v}</div>{d && <div className="mt-0.5 text-xs text-muted-foreground">{d}</div>}</div>;
}
function Tabela({ cab, linhas }: { cab: string[]; linhas: (string | number)[][] }) {
  return <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{cab.map((c, i) => <th key={c} className={`px-2 py-1 ${i ? "text-right" : "text-left"}`}>{c}</th>)}</tr></thead>
    <tbody>{linhas.map((l, i) => <tr key={i} className="border-t">{l.map((c, j) => <td key={j} className={`px-2 py-1 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody></table>;
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
    <Button variant="outline" onClick={() => setAberto(true)}><Upload className="mr-2 size-4" />Importar fechamento de fretes</Button>
    <Dialog open={aberto} onOpenChange={(v) => !gravando && setAberto(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar fechamento de fretes</DialogTitle>
          <DialogDescription>Planilha no modelo "Fechamento de fretes" (abas de envios por modal, quilometragem do PJ e LATAM) ou os controles anteriores. Linhas repetidas — na mesma planilha ou já importadas — são ignoradas.</DialogDescription></DialogHeader>
        <input ref={inp} type="file" accept=".xlsx,.xlsm,.xlsb" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        <Button onClick={() => inp.current?.click()} disabled={gravando}><Upload className="mr-2 size-4" />Escolher planilha</Button>
        {lido && <>
          <Tabela cab={["Aba", "Tipo", "Linhas"]} linhas={lido.abas.map((a) => [a.aba, a.tipo, a.linhas])} />
          <p className="text-xs text-muted-foreground">{arq}: {lido.envios.length} envios e {lido.trechos.length} trechos do PJ, sem repetições.</p>
          <div className="flex justify-end"><Button onClick={gravar} disabled={gravando}>{gravando ? "Importando…" : "Importar"}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function LogisticaPage() {
  const qc = useQueryClient();
  const [cli, setCli] = useState(false); useEffect(() => setCli(true), []);
  const q = useQuery({
    enabled: cli, queryKey: ["logistica"], staleTime: 5 * 60_000,
    queryFn: async () => {
      const [envios, trechos, fixos] = await Promise.all([
        fetchAll<Envio>((f, t) => sb.from("log_envios").select("*").order("data").range(f, t)),
        fetchAll<TrechoPJ>((f, t) => sb.from("log_trechos_pj").select("*").order("data").range(f, t)),
        fetchAll<FixoPJ>((f, t) => sb.from("log_custos_fixos").select("prestador, mes, valor, rateio").range(f, t)),
      ]);
      return { envios: envios.map((e: any) => ({ ...e, frete: Number(e.frete), isopor: Number(e.isopor), gelox: Number(e.gelox), seguro: Number(e.seguro), cobrado: Number(e.cobrado), kg: e.kg == null ? null : Number(e.kg) })), trechos: trechos.map((t: any) => ({ ...t, valor: Number(t.valor), km: t.km == null ? null : Number(t.km) })), fixos: fixos.map((f: any) => ({ ...f, valor: Number(f.valor) })) };
    },
  });
  const meses = useMemo(() => { const s = new Set<string>(); q.data?.envios.forEach((e) => s.add(e.data.slice(0, 7))); q.data?.trechos.forEach((t) => s.add(t.data.slice(0, 7))); return [...s].sort().reverse(); }, [q.data]);
  const [mesSel, setMesSel] = useState(""); const mes = mesSel || meses[0] || new Date().toISOString().slice(0, 7);
  const k = useMemo(() => (q.data ? indicadoresLogistica(q.data.envios, q.data.trechos, q.data.fixos, mes) : null), [q.data, mes]);
  const serie = useMemo(() => q.data ? [...meses].reverse().map((m) => { const x = indicadoresLogistica(q.data!.envios, q.data!.trechos, q.data!.fixos, m); const n = (nat: string) => x.porNatureza.find((p) => p.k === nat)?.valor ?? 0; return { mes: mesRot(m), venda: n("venda"), compra: n("compra"), interno: n("interno"), pj: x.kmPJ + x.fixoPJ }; }) : [], [q.data, meses]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold tracking-tight">Controle Logístico</h1><p className="text-sm text-muted-foreground">Custos de transporte por natureza (venda, compra, interno), modal, centro de custo, PJ e transferências Pará ↔ SP.</p></div>
        <div className="flex items-end gap-2"><Importador onFim={() => qc.invalidateQueries({ queryKey: ["logistica"] })} />
          <div className="w-40"><div className="mb-1 text-xs text-muted-foreground">Mês</div><Select value={mes} onValueChange={setMesSel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meses.map((m) => <SelectItem key={m} value={m}>{mesRot(m)}</SelectItem>)}</SelectContent></Select></div></div>
      </div>
      {!cli || q.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p> : q.isError ? <p className="py-10 text-center text-sm text-red-600">Erro: {String((q.error as any)?.message ?? q.error)}</p> : !k || (!q.data!.envios.length && !q.data!.trechos.length) ? <p className="py-10 text-center text-sm text-muted-foreground">Sem dados — importe a planilha de fechamento de fretes.</p> : <>
        <Secao letra="A" titulo={`Custos de ${mesRot(mes)}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi t="Custo logístico total" v={brl(k.total)} d={`envios ${brl(k.envios)} · PJ ${brl(k.kmPJ + k.fixoPJ)}`} />
            <Kpi t="Envios no mês" v={nf(k.qtdEnvios)} d={`${nf(k.cortesias)} cortesias`} />
            <Kpi t="Custo médio por entrega" v={brl(k.custoMedioEntrega, 2)} d="frete de venda, sem aéreo" />
            <Kpi t="Frete cobrado do cliente" v={brl(k.freteCobrado)} d={`resultado do frete: ${brl(k.prejuizo)}`} tom={k.prejuizo < 0 ? "text-red-600" : ""} />
            <Kpi t="PJ · km rodados" v={`${nf(k.pj.km)} km`} d={`${brl(k.pj.valorKm)} em km + ${brl(k.pj.fixo)} fixo`} />
            <Kpi t="PJ · km saindo da residência" v={brl(k.pj.residencia)} d={`${nf(k.pj.trechosResidencia)} trecho(s) — ponto a renegociar`} tom={k.pj.residencia ? "text-amber-600" : ""} />
            <Kpi t="Transferências Pará ↔ SP" v={brl(k.transf.valor)} d={`${nf(k.transf.qtd)} envio(s) · ${nf(k.transf.kg)} kg`} />
            <Kpi t="Custo por kg transferido" v={brl(k.transf.porKg, 2)} d="frete + isopor + gelox + seguro + motorista" />
          </div>
        </Secao>
        <Secao letra="B" titulo="Evolução mensal por natureza">
          <div className="h-72"><ResponsiveContainer><BarChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => brl(Number(v))} /><Legend />
            <Bar dataKey="venda" stackId="a" name={NAT.venda} fill="#34436C" /><Bar dataKey="compra" stackId="a" name={NAT.compra} fill="#D98E04" /><Bar dataKey="interno" stackId="a" name={NAT.interno} fill="#2E7D6B" /><Bar dataKey="pj" stackId="a" name="PJ (km + fixo)" fill="#9B5DE5" /></BarChart></ResponsiveContainer></div>
        </Secao>
        <div className="grid gap-4 lg:grid-cols-3">
          <Secao letra="C" titulo="Por natureza"><Tabela cab={["Natureza", "Envios", "Custo"]} linhas={k.porNatureza.map((x) => [NAT[x.k] ?? x.k, x.qtd, brl(x.valor)])} /></Secao>
          <Secao letra="D" titulo="Por modal"><Tabela cab={["Modal", "Envios", "Custo"]} linhas={k.porModal.map((x) => [x.k, x.qtd, brl(x.valor)])} /></Secao>
          <Secao letra="E" titulo="Por centro de custo"><Tabela cab={["CC", "Envios", "Custo"]} linhas={k.porCC.map((x) => [x.k, x.qtd, brl(x.valor)])} /></Secao>
        </div>
        <Secao letra="F" titulo="PJ por área (km do mês)"><Tabela cab={["Área", "Valor em km"]} linhas={k.pj.porArea.map((x) => [x.k, brl(x.valor, 2)])} />
          <p className="mt-2 text-xs text-muted-foreground">Contrato atual (como está): R$ 4.000 fixos/mês (Facilities R$ 1.000 · Ativação R$ 1.500 · Operação R$ 1.500) + R$ 4/km em ativações e R$ 2/km nas demais.</p></Secao>
      </>}
    </div>
  );
}
