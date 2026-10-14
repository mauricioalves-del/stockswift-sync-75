import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Camera } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { formatBRL } from "@/lib/inventory";
import { META_DISPONIBILIDADE, resumirMes, type FotoLinha } from "@/lib/abastecimento-disponibilidade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/disponibilidade")({
  component: DisponibilidadePage,
  head: () => ({ meta: [{ title: "Disponibilidade e rupturas — Abastecimento" }] }),
});

const LOJA: Record<string, string> = { JESUINO: "Itaim", PATIO: "Pátio Paulista", ELDORADO: "Eldorado" };
const nomeLoja = (c: string) => LOJA[c] ?? c;
const pct = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("pt-BR"));
const n1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const cor = (v: number | null) => (v === null ? "" : v >= META_DISPONIBILIDADE ? "text-emerald-600" : v >= 0.95 ? "text-amber-600" : "text-red-600");

function DisponibilidadePage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => new Date().toLocaleDateString("en-CA").slice(0, 7));
  const [soDemanda, setSoDemanda] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  const q = useQuery({
    enabled: pode, queryKey: ["abast-disp", mes], refetchInterval: 300000,
    queryFn: async () => {
      const sb = supabase as any; const [a, m] = mes.split("-").map(Number);
      const ini = `${mes}-01`, fim = `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
      const out: FotoLinha[] = [];
      for (let f = 0; ; f += 1000) {
        const { data, error } = await sb.from("abast_disponibilidade_diaria").select("*").gte("data", ini).lte("data", fim).order("data").order("loja").order("id_produto").range(f, f + 999);
        if (error) throw error; out.push(...((data ?? []) as FotoLinha[])); if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const todas = q.data ?? [];
  const r = useMemo(() => resumirMes(todas, mes, soDemanda), [todas, mes, soDemanda]);
  const rTodos = useMemo(() => resumirMes(todas, mes, false), [todas, mes]);
  const rCom = useMemo(() => resumirMes(todas, mes, true), [todas, mes]);

  async function registrar() {
    setRegistrando(true);
    try {
      const { data, error } = await (supabase as any).rpc("abast_registrar_disponibilidade", { p_data: null });
      if (error) throw error;
      toast.success(`Foto registrada: ${data?.linhas} SKUs, ${data?.rupturas} sem estoque.`);
      qc.invalidateQueries({ queryKey: ["abast-disp"] });
    } catch (err: any) { toast.error("Não consegui registrar: " + (err?.message ?? err)); }
    finally { setRegistrando(false); }
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const serie = r.serie.map((d) => ({ dia: d.data.slice(8), "Do dia": +(d.disp * 100).toFixed(1), "Acumulada do mês": +(d.acumulada * 100).toFixed(1) }));
  const minY = serie.length ? Math.max(0, Math.floor(Math.min(...serie.flatMap((s) => [s["Do dia"], s["Acumulada do mês"]]), 97) - 2)) : 90;
  const sem = r.diasColetados === 0;
  const Th = ({ c, d }: { c: string; d?: boolean }) => <th className={`p-2 font-medium text-muted-foreground ${d ? "text-right" : "text-left"}`}>{c}</th>;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="size-6" /> Disponibilidade e rupturas</h1>
          <p className="text-sm text-muted-foreground">Foto diária do estoque das lojas (23:30) para provar a meta: <strong>disponibilidade ≥ {pct(META_DISPONIBILIDADE, 0)} no mês</strong> (ruptura ≤ 3%). Ruptura = SKU da malha (produto acabado com meta no consenso) com <strong>estoque zerado</strong> na loja. A foto usa o último estoque sincronizado do ERP; para refletir o fechamento, mantenha um envio de estoque no fim do dia.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" className="h-9 w-40" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
          <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={soDemanda} onChange={(e) => setSoDemanda(e.target.checked)} /> só SKUs com venda recente</label>
          {isAdmin && <Button size="sm" variant="outline" className="gap-1" disabled={registrando} onClick={registrar}><Camera className="size-4" /> {registrando ? "Registrando..." : "Registrar foto agora"}</Button>}
        </div>
      </div>

      {sem && <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900">{q.isLoading ? "Carregando..." : "Ainda não há fotos neste mês. A primeira é registrada às 23:30 (ou use \"Registrar foto agora\"). O histórico começa na primeira foto: não é possível reconstruir dias passados, porque o sistema não guardava o estoque diário."}</CardContent></Card>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi t={`Disponibilidade do mês${soDemanda ? " (com venda recente)" : ""}`} v={pct(r.disponibilidade)} cls={cor(r.disponibilidade)} sub={sem ? "sem fotos" : `meta ≥ ${pct(META_DISPONIBILIDADE, 0)} · todos ${pct(rTodos.disponibilidade)} · com venda ${pct(rCom.disponibilidade)}`} />
        <Kpi t="Orçamento de ruptura" v={r.consumidoPct === null ? "—" : pct(r.consumidoPct, 0)} cls={r.consumidoPct !== null && r.consumidoPct > 1 ? "text-red-600" : ""} sub={sem ? "" : `${n0(r.rupturaDias)} de ${n0(r.orcamento)} dias-SKU permitidos`} />
        <Kpi t="Projeção do mês" v={pct(r.projecaoDisp)} cls={r.dentroDaMeta === null ? "" : r.dentroDaMeta ? "text-emerald-600" : "text-red-600"} sub={r.dentroDaMeta === null ? "" : r.dentroDaMeta ? "no ritmo atual: dentro da meta" : "no ritmo atual: FORA da meta"} />
        <Kpi t="Ponderada pela demanda" v={pct(r.ponderada)} sub="rupturas em itens de giro alto pesam mais" />
        <Kpi t="Vitrine completa" v={pct(r.vitrine)} sub="estoque ≥ exposição" />
        <Kpi t="Venda perdida (estimada)" v={formatBRL(r.vendaPerdidaRs)} sub={`${n0(r.vendaPerdidaUn)} un${r.semPrecoDias > 0 ? ` · ${r.semPrecoDias} dia(s)-SKU sem preço` : ""}`} />
      </div>
      <p className="text-xs text-muted-foreground">Fotos coletadas: <strong>{r.diasColetados}</strong> de {r.diasNoMes} dias · universo médio {n0(r.universoMedio)} SKUs/dia · última foto em {dataBr(r.ultimaFoto.data)}. A venda perdida é <strong>estimativa</strong> (demanda média diária × dia sem estoque × preço de "Cadastro de Preço de Venda").</p>

      {!sem && <Card><CardHeader className="pb-2"><CardTitle className="text-base">Disponibilidade por dia e acumulada</CardTitle></CardHeader><CardContent><div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer><LineChart data={serie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis domain={[minY, 100]} tick={{ fontSize: 11 }} unit="%" /><Tooltip /><ReferenceLine y={97} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "Meta 97%", fontSize: 11, fill: "#dc2626", position: "insideTopRight" }} />
          <Line type="monotone" dataKey="Do dia" stroke="#94a3b8" strokeWidth={1.5} dot={{ r: 2 }} /><Line type="monotone" dataKey="Acumulada do mês" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div></CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por loja</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Loja" /><Th c="Ruptura" d /><Th c="Disponib." d /><Th c="Perda R$" d /></tr></thead><tbody>
          {r.porLoja.map((g) => <tr key={g.chave} className="border-b"><td className="p-2">{nomeLoja(g.chave)}</td><td className="p-2 text-right">{n0(g.rupturas)} / {n0(g.skuDias)}</td><td className={`p-2 text-right font-semibold ${cor(g.disp)}`}>{pct(g.disp)}</td><td className="p-2 text-right">{formatBRL(g.perdaRs)}</td></tr>)}
          {r.porLoja.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">—</td></tr>}</tbody></table></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por causa da ruptura</CardTitle><CardDescription>O que corrigir primeiro.</CardDescription></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Causa" /><Th c="Dias-SKU" d /><Th c="%" d /></tr></thead><tbody>
          {r.porCausa.map((c) => <tr key={c.causa} className="border-b"><td className="p-2">{c.causa}</td><td className="p-2 text-right">{n0(c.dias)}</td><td className="p-2 text-right font-semibold">{pct(c.pct, 0)}</td></tr>)}
          {r.porCausa.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Sem rupturas.</td></tr>}</tbody></table></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por classe ABC</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Classe" /><Th c="Ruptura" d /><Th c="Disponib." d /></tr></thead><tbody>
          {r.porClasse.map((g) => <tr key={g.chave} className="border-b"><td className="p-2">{g.chave}</td><td className="p-2 text-right">{n0(g.rupturas)} / {n0(g.skuDias)}</td><td className={`p-2 text-right font-semibold ${cor(g.disp)}`}>{pct(g.disp)}</td></tr>)}
          {r.porClasse.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">—</td></tr>}</tbody></table></CardContent></Card>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Sem estoque na última foto ({dataBr(r.ultimaFoto.data)})</CardTitle><CardDescription>Ordenado pela demanda diária.</CardDescription></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Loja" /><Th c="SKU" /><Th c="Produto" /><Th c="Demanda/dia" d /><Th c="Saldo CD" d /><Th c="A caminho" d /><Th c="Causa" /></tr></thead><tbody>
        {r.ultimaFoto.rupturas.map((l) => <tr key={l.loja + l.id_produto} className="border-b"><td className="p-2">{nomeLoja(l.loja)}</td><td className="p-2 font-mono text-xs">{l.id_produto}</td><td className="p-2 max-w-[260px] truncate" title={l.descricao ?? ""}>{l.descricao}</td><td className="p-2 text-right">{n1(Number(l.demanda_dia))}</td><td className="p-2 text-right">{n0(Number(l.saldo_cd))}</td><td className="p-2 text-right">{n0(Number(l.a_caminho))}</td><td className="p-2 text-xs">{l.causa}</td></tr>)}
        {r.ultimaFoto.rupturas.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhum SKU sem estoque.</td></tr>}</tbody></table></CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">SKUs com mais dias de ruptura no mês</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Loja" /><Th c="Produto" /><Th c="Dias" d /><Th c="Causa" /><Th c="Perda R$" d /></tr></thead><tbody>
          {r.topSkus.map((s) => <tr key={s.loja + s.id_produto} className="border-b"><td className="p-2">{nomeLoja(s.loja)}</td><td className="p-2 max-w-[220px] truncate" title={s.descricao}>{s.descricao || s.id_produto}</td><td className="p-2 text-right font-semibold">{s.dias}</td><td className="p-2 text-xs">{s.causa}</td><td className="p-2 text-right">{formatBRL(s.perdaRs)}</td></tr>)}
          {r.topSkus.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">—</td></tr>}</tbody></table></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por família (mais rupturas)</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><Th c="Família" /><Th c="Ruptura" d /><Th c="Disponib." d /></tr></thead><tbody>
          {r.porFamilia.slice(0, 10).map((g) => <tr key={g.chave} className="border-b"><td className="p-2">{g.chave}</td><td className="p-2 text-right">{n0(g.rupturas)} / {n0(g.skuDias)}</td><td className={`p-2 text-right font-semibold ${cor(g.disp)}`}>{pct(g.disp)}</td></tr>)}
          {r.porFamilia.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">—</td></tr>}</tbody></table></CardContent></Card>
      </div>
      <p className="text-xs text-muted-foreground">Causas: <strong>CD sem saldo</strong> (o CD não tem o produto e nada está a caminho: é produção/planejamento), <strong>A caminho</strong> (há pedido ou nota de transferência pendente: aguardando entrega) e <strong>Sem pedido</strong> (o CD tem saldo e ninguém pediu: política ou ciclo semanal).</p>
    </div>
  );
}

function Kpi({ t, v, sub, cls }: { t: string; v: string; sub?: string; cls?: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{t}</div><div className={`text-2xl font-bold mt-1 ${cls ?? ""}`}>{v}</div>{sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}</CardContent></Card>;
}
