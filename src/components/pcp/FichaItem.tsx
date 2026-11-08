// Ficha do item no PCP: conta a história do produto (SKU) ou da matéria-prima (MP).
//  SKU: vendas reais das lojas (mapa de calor de 90 dias), estoque e cobertura por lote no CD, materiais do plano e
//       prazo de entrega pela capacidade livre.
//  MP:  consumo real em ordens de produção (mapa de calor de 90 dias), saldo e cobertura por lote, situação da compra.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { coberturaLotes, mapaCalor, nivel, prazoEntrega, resumoConsumo, type Ponto } from "@/lib/pcp-ficha";
import type { ItemCompra } from "@/lib/pcp-plano";

export type ContextoSku = {
  tipo: "sku"; id: string; descricao: string; hoje: string; cdAlmox: string;
  motor?: { adu: number; usavelHoje: number; zona: string; dataRupturaCD: string | null; ordens: { quantidade: number; liberar: string; urgente?: boolean }[]; wip: number; qualidade: number; notas: number; perdaVencimentoUn: number } | null;
  proj?: { estoqueCD: number; estoqueLojas: number; trLojas: number; deficit: number; dataRupturaCD: string | null; demandaTotal: number; severidade: string } | null;
  realizacao?: number | null;
  plano?: { semanas: string[]; totais: number[]; porSemanaSku: number[]; capacidade: number; diasQualidade: number; diasProcesso: number } | null;
  materiais?: ItemCompra[];
  semFicha?: boolean;
};
export type ContextoMp = { tipo: "mp"; id: string; descricao: string; hoje: string; origens: string[]; compra?: ItemCompra | null };
export type ContextoFicha = ContextoSku | ContextoMp;

const sb = supabase as any;
const un = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}${iso.slice(0, 4) !== new Date().getFullYear().toString() ? `/${iso.slice(2, 4)}` : ""}` : "—");
const variantes = (id: string) => { const s = String(id).trim().replace(/^0+/, ""); return [...new Set([String(id).trim(), s, `0${s}`, `00${s}`, `000${s}`])]; };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const COR = ["bg-muted", "bg-emerald-100 dark:bg-emerald-950", "bg-emerald-300 dark:bg-emerald-800", "bg-emerald-500 dark:bg-emerald-600", "bg-emerald-700 dark:bg-emerald-400"];

export function FichaItem({ ctx, onClose }: { ctx: ContextoFicha; onClose: () => void }) {
  const ehSku = ctx.tipo === "sku";
  const abas = ehSku ? ["historia", "lotes", ...((ctx as ContextoSku).plano ? ["materiais", "capacidade"] : [])] : ["historia", "lotes", "compra"];
  const [aba, setAba] = useState(abas[0]);
  const desde = useMemo(() => { const d = new Date(`${ctx.hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 90); return d.toISOString().slice(0, 10); }, [ctx.hoje]);

  const q = useQuery({
    queryKey: ["pcp-ficha", ctx.tipo, ctx.id, desde],
    queryFn: async () => {
      const ids = variantes(ctx.id);
      if (ehSku) {
        const [vendas, lotes] = await Promise.all([
          fetchAll<any>((f, t) => sb.from("historico_consumo").select("data_movimento, quantidade, origem").in("sku", ids).gte("data_movimento", desde).order("data_movimento").range(f, t)).catch(() => []),
          fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("lote, data_validade, quantidade, origem").in("id_produto", ids).gt("quantidade", 0).range(f, t)).catch(() => []),
        ]);
        return { pontos: vendas.map((v: any) => ({ data: v.data_movimento, qtd: Number(v.quantidade) || 0 })) as Ponto[], lotes, porOp: [] as any[], fonte: "Vendas reais das lojas (histórico de consumo)" };
      }
      const [cons, lotes] = await Promise.all([
        fetchAll<any>((f, t) => sb.from("producao_consumo").select("data_producao, qtd_consumo, produto, desc_produto, id_op").in("material", ids).gte("data_producao", desde).order("data_producao").range(f, t)).catch(() => []),
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("lote, data_validade, quantidade, origem").in("id_produto", ids).in("origem", (ctx as ContextoMp).origens).gt("quantidade", 0).range(f, t)).catch(() => []),
      ]);
      let pontos: Ponto[] = cons.map((c: any) => ({ data: c.data_producao, qtd: Number(c.qtd_consumo) || 0 }));
      let fonte = "Consumo real em ordens de produção";
      let porOp = cons;
      if (!pontos.length) {
        const alt = await fetchAll<any>((f, t) => sb.from("atlas_consumo_op").select("data_producao, qtd_consumo, sku_produto_final, numero_op").in("sku_material", ids).gte("data_producao", desde).range(f, t)).catch(() => []);
        pontos = alt.map((c: any) => ({ data: c.data_producao, qtd: Number(c.qtd_consumo) || 0 }));
        porOp = alt.map((c: any) => ({ produto: c.sku_produto_final, desc_produto: "", qtd_consumo: c.qtd_consumo, id_op: c.numero_op }));
        fonte = "Consumo real em ordens de produção (Atlas)";
      }
      return { pontos, lotes, porOp, fonte };
    },
  });

  const mapa = useMemo(() => (q.data ? mapaCalor(q.data.pontos, ctx.hoje) : null), [q.data, ctx.hoje]);
  const res = useMemo(() => (q.data ? resumoConsumo(q.data.pontos, ctx.hoje) : null), [q.data, ctx.hoje]);
  const s = ehSku ? (ctx as ContextoSku) : null, m = !ehSku ? (ctx as ContextoMp) : null;
  // Demanda diária para a cobertura por lote: SKU = demanda do CD no motor (ou média de vendas); MP = consumo médio em OP.
  const demandaDia = s ? (s.motor?.adu || res?.media || 0) : (res?.media || 0);
  const lotesAlvo = useMemo(() => (q.data?.lotes ?? []).filter((l: any) => (s ? l.origem === s.cdAlmox : true)).map((l: any) => ({ lote: l.lote, validade: l.data_validade, qtd: Number(l.quantidade) || 0, almox: l.origem })), [q.data, s]);
  const cob = useMemo(() => coberturaLotes(lotesAlvo, demandaDia, ctx.hoje), [lotesAlvo, demandaDia, ctx.hoje]);
  const lotesLojas = s ? (q.data?.lotes ?? []).filter((l: any) => l.origem !== s.cdAlmox).reduce((a: number, l: any) => a + (Number(l.quantidade) || 0), 0) : 0;
  const prazo = useMemo(() => {
    if (!s?.plano) return null;
    const qtd = Math.max(s.proj?.deficit ?? 0, s.plano.porSemanaSku.reduce((a, b) => a + b, 0));
    return { qtd, ...prazoEntrega({ semanas: s.plano.semanas, cargaOutros: s.plano.totais.map((t, i) => t - (s.plano!.porSemanaSku[i] ?? 0)), capacidade: s.plano.capacidade, quantidade: qtd, diasQualidade: s.plano.diasQualidade, diasProcesso: s.plano.diasProcesso, hoje: ctx.hoje }) };
  }, [s, ctx.hoje]);

  // A história do item, em frases.
  const historia = useMemo(() => {
    if (!res) return [];
    const f: string[] = [];
    const tend = res.tendencia === null ? "" : res.tendencia > 0.15 ? ` O último mês está ${Math.round(res.tendencia * 100)}% acima da média: demanda em alta.` : res.tendencia < -0.15 ? ` O último mês está ${Math.round(-res.tendencia * 100)}% abaixo da média: demanda em queda.` : " O último mês está em linha com a média.";
    if (s) {
      f.push(res.total > 0 ? `Nos últimos 90 dias as lojas venderam ${un(res.total)} un (${un(res.media, 1)} por dia), com venda em ${res.diasComMovimento} dos 91 dias; o maior dia foi ${dm(res.pico.data)} com ${un(res.pico.qtd)} un.${tend}` : "Não houve venda registrada nas lojas nos últimos 90 dias.");
      if (s.realizacao != null) f.push(`A venda real corresponde a ${Math.round(s.realizacao * 100)}% do consenso, e o motor ajusta a demanda por esse fator.`);
      f.push(`Hoje há ${un(s.proj?.estoqueCD ?? cob.total)} un no CD${cob.diasCobertura != null ? `, suficientes para ${un(cob.diasCobertura)} dias` : ""}, e ${un(s.proj?.estoqueLojas ?? lotesLojas)} un nas lojas${s.proj?.trLojas ? ` (+${un(s.proj.trLojas)} em trânsito)` : ""}.`);
      if (cob.emRisco > 0) f.push(`${un(cob.emRisco)} un estão em lotes que vencem antes de serem consumidos no ritmo atual.`);
      if (s.proj?.dataRupturaCD) f.push(`Sem nova produção, o CD rompe em ${dm(s.proj.dataRupturaCD)}, com déficit de ${un(s.proj.deficit)} un até o fim da meta.`); else f.push("O estoque cobre a demanda até o fim do horizonte da meta.");
      const o = s.motor?.ordens?.[0];
      if (o) f.push(`Próxima ordem: ${un(o.quantidade)} un, liberar em ${dm(o.liberar)}${o.urgente ? " (urgente)" : ""}.`);
      if (prazo?.entrega) f.push(`Com a capacidade livre do plano, ${un(prazo.qtd)} un ficam prontas na semana de ${dm(prazo.semana)} e chegam disponíveis ao CD por volta de ${dm(prazo.entrega)}${s.proj?.dataRupturaCD ? (prazo.entrega <= s.proj.dataRupturaCD ? ", antes da ruptura." : ", depois da ruptura prevista: antecipar ou priorizar.") : "."}`);
      const faltas = (s.materiais ?? []).filter((x) => x.falta > 0);
      if (faltas.length) f.push(`${faltas.length} matéria(s)-prima(s) da ficha técnica faltam no plano: ${faltas.slice(0, 3).map((x) => `${x.item} a partir da semana de ${dm(x.primeiraFalta)}`).join("; ")}.`);
      if (s.semFicha) f.push("O produto não tem ficha técnica cadastrada: a necessidade de matéria-prima não entra no plano de compras.");
    } else if (m) {
      f.push(res.total > 0 ? `Nos últimos 90 dias foram consumidos ${un(res.total, 2)} em ordens de produção (${un(res.media, 2)} por dia), em ${res.diasComMovimento} dias de produção; o maior consumo foi em ${dm(res.pico.data)} (${un(res.pico.qtd, 2)}).${tend}` : "Não houve consumo registrado em ordens de produção nos últimos 90 dias.");
      f.push(`Saldo atual em Fábrica, Processo e Qualidade: ${un(cob.total, 2)}${cob.diasCobertura != null ? `, cobertura de ${un(cob.diasCobertura)} dias no ritmo de consumo real` : ""}.`);
      if (cob.emRisco > 0) f.push(`${un(cob.emRisco, 2)} estão em lotes que vencem antes de serem consumidos.`);
      const c = m.compra;
      if (c) f.push(c.falta > 0 ? `O plano de produção precisa de ${un(c.necessidade, 2)} ${c.um} no horizonte e faltam ${un(c.falta, 2)} a partir da semana de ${dm(c.primeiraFalta)}: comprar até ${dm(c.comprarAte)}${c.atrasado ? " (prazo já vencido)" : ""}. Usada em ${c.usadoEm.length} produto(s) do plano.` : `O saldo cobre a necessidade do plano (${un(c.necessidade, 2)} ${c.um}).`);
    }
    return f;
  }, [res, s, m, cob, lotesLojas, prazo]);

  const nomeAba: Record<string, string> = { historia: ehSku ? "Vendas e história" : "Consumo em OP e história", lotes: "Lotes e disponibilidade", materiais: "Materiais (ficha técnica)", capacidade: "Capacidade e prazo", compra: "Compra" };
  const topOps = useMemo(() => {
    if (ehSku || !q.data) return [];
    const mm = new Map<string, { produto: string; desc: string; qtd: number; ops: Set<string> }>();
    for (const c of q.data.porOp) { const k = String(c.produto ?? ""); const a = mm.get(k) ?? { produto: k, desc: c.desc_produto ?? "", qtd: 0, ops: new Set<string>() }; a.qtd += Math.abs(Number(c.qtd_consumo) || 0); if (c.id_op) a.ops.add(String(c.id_op)); mm.set(k, a); }
    return [...mm.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 8);
  }, [q.data, ehSku]);

  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{ctx.descricao || ctx.id} <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">{ctx.id}</span></DialogTitle>
        <DialogDescription>{ehSku ? "Produto acabado: vendas reais, estoque por lote, materiais e capacidade." : "Matéria-prima: consumo real em ordens de produção, saldo por lote e compra."}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ehSku ? <>
          <Kpi t="Venda média (90 d)" v={`${un(res?.media, 1)} un/dia`} d={res?.tendencia == null ? "" : `último mês ${res.tendencia >= 0 ? "+" : ""}${Math.round(res.tendencia * 100)}%`} />
          <Kpi t="Estoque no CD" v={`${un(s!.proj?.estoqueCD ?? cob.total)} un`} d={cob.diasCobertura == null ? "sem demanda" : `${un(cob.diasCobertura)} dias de cobertura`} />
          <Kpi t="Ruptura do CD" v={dm(s!.proj?.dataRupturaCD)} d={s!.proj?.deficit ? `déficit ${un(s!.proj.deficit)} un` : "sem ruptura no horizonte"} tom={s!.proj?.dataRupturaCD ? "text-red-600" : "text-emerald-600"} />
          <Kpi t="Entrega estimada" v={prazo?.entrega ? dm(prazo.entrega) : s!.plano ? "fora do horizonte" : "—"} d={prazo?.qtd ? `${un(prazo.qtd)} un pela capacidade livre` : ""} />
        </> : <>
          <Kpi t="Consumo médio em OP" v={`${un(res?.media, 2)}/dia`} d={res?.tendencia == null ? "" : `último mês ${res.tendencia >= 0 ? "+" : ""}${Math.round(res.tendencia * 100)}%`} />
          <Kpi t="Saldo (Fáb.+Proc.+Qual.)" v={un(cob.total, 2)} d={cob.diasCobertura == null ? "sem consumo" : `${un(cob.diasCobertura)} dias de cobertura`} />
          <Kpi t="Falta no plano" v={m!.compra?.falta ? un(m!.compra.falta, 2) : "coberto"} d={m!.compra?.primeiraFalta ? `a partir de ${dm(m!.compra.primeiraFalta)}` : ""} tom={m!.compra?.falta ? "text-red-600" : "text-emerald-600"} />
          <Kpi t="Comprar até" v={dm(m!.compra?.comprarAte)} d={m!.compra?.atrasado ? "prazo vencido" : ""} tom={m!.compra?.atrasado ? "text-red-600" : ""} />
        </>}
      </div>
      <div className="flex flex-wrap gap-1 border-b">{abas.map((a) => <button key={a} type="button" onClick={() => setAba(a)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${aba === a ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{nomeAba[a]}</button>)}</div>

      {q.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando a história do item…</p> : <>
        {aba === "historia" && mapa && res && <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">{historia.map((t, i) => <p key={i} className="mb-1 last:mb-0">{t}</p>)}</div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>{q.data?.fonte} · últimos 90 dias</span><span className="flex items-center gap-1">menos {COR.map((c, i) => <span key={i} className={`inline-block size-3 rounded-sm ${c}`} />)} mais</span></div>
            <div className="overflow-x-auto"><div className="inline-flex gap-1">
              <div className="flex flex-col gap-1 pr-1 text-[10px] text-muted-foreground">{DIAS.map((d) => <div key={d} className="h-4 leading-4">{d}</div>)}</div>
              {mapa.semanas.map((w) => <div key={w.inicio} className="flex flex-col gap-1">
                {w.dias.map((d) => <div key={d.data} title={`${dm(d.data)}: ${un(d.qtd, 2)}`} className={`size-4 rounded-sm ${d.fora ? "opacity-0" : COR[nivel(d.qtd, mapa.limites)]}`} />)}
                <div className="h-3 text-center text-[9px] text-muted-foreground">{w.inicio.slice(8, 10) <= "07" ? dm(w.inicio).slice(3, 5) : ""}</div>
              </div>)}
            </div></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">{res.porMes.map(([mes, v]) => <span key={mes} className="rounded-full border px-2 py-0.5"><span className="text-muted-foreground">{mes.slice(5, 7)}/{mes.slice(2, 4)}:</span> <b>{un(v, ehSku ? 0 : 2)}</b></span>)}
            <span className="rounded-full border px-2 py-0.5"><span className="text-muted-foreground">dias sem movimento:</span> <b>{res.diasSemMovimento}</b></span></div>
          {!ehSku && topOps.length > 0 && <div className="rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="px-2 py-1 text-left">Produto que consumiu</th><th className="px-2 py-1 text-right">Consumo (90 d)</th><th className="px-2 py-1 text-right">OPs</th></tr></thead>
            <tbody>{topOps.map((o) => <tr key={o.produto} className="border-t"><td className="px-2 py-1"><span className="font-mono text-xs">{o.produto}</span> {o.desc}</td><td className="px-2 py-1 text-right tabular-nums">{un(o.qtd, 2)}</td><td className="px-2 py-1 text-right">{o.ops.size}</td></tr>)}</tbody></table></div>}
        </div>}

        {aba === "lotes" && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Lotes {ehSku ? `no CD (${s!.cdAlmox})` : "em Fábrica, Processo e Qualidade"}, consumidos na ordem de validade (FEFO) ao ritmo de {un(demandaDia, 2)} por dia {ehSku ? (s!.motor?.adu ? "(demanda do CD no motor)" : "(venda média)") : "(consumo médio em OP)"}. Cada lote mostra até quando cobre e quanto vence antes de ser consumido.</p>
          <div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Lote</th><th className="px-2 py-1 text-left">Validade</th><th className="px-2 py-1 text-right">Qtd</th><th className="px-2 py-1 text-right">Cobre do dia</th><th className="px-2 py-1 text-right">até o dia</th><th className="px-2 py-1 text-right">Cobertura até</th><th className="px-2 py-1 text-right">Vence em</th><th className="px-2 py-1 text-right">Vence antes do uso</th></tr></thead>
            <tbody>{cob.linhas.map((l, i) => <tr key={i} className={`border-t ${l.emRisco > 0 ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
              <td className="px-2 py-1 font-mono text-xs">{l.lote || "—"}{!ehSku && l.almox ? <span className="ml-1 text-[10px] text-muted-foreground">{l.almox}</span> : null}</td><td className="px-2 py-1">{dm(l.validade)}</td><td className="px-2 py-1 text-right tabular-nums">{un(l.qtd, 2)}</td>
              <td className="px-2 py-1 text-right">{l.diasInicio == null ? "—" : `${un(l.diasInicio)}`}</td><td className="px-2 py-1 text-right">{l.diasFim == null ? "—" : un(l.diasFim)}</td>
              <td className="px-2 py-1 text-right">{dm(l.ateData)}</td><td className={`px-2 py-1 text-right ${l.diasAteVencer != null && l.diasAteVencer < 30 ? "font-semibold text-amber-600" : ""}`}>{l.diasAteVencer == null ? "—" : `${l.diasAteVencer} d`}</td>
              <td className={`px-2 py-1 text-right ${l.emRisco > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>{l.emRisco > 0 ? un(l.emRisco, 2) : "—"}</td></tr>)}
              {cob.linhas.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem saldo em lote.</td></tr>}</tbody>
            <tfoot className="bg-muted text-xs font-semibold"><tr><td className="px-2 py-1" colSpan={2}>Total</td><td className="px-2 py-1 text-right">{un(cob.total, 2)}</td><td colSpan={2} /><td className="px-2 py-1 text-right">{cob.diasCobertura == null ? "—" : `${un(cob.diasCobertura)} dias`}</td><td /><td className="px-2 py-1 text-right text-red-600">{cob.emRisco > 0 ? un(cob.emRisco, 2) : ""}</td></tr></tfoot></table></div>
          {ehSku && <p className="text-xs text-muted-foreground">Nas lojas: {un(s!.proj?.estoqueLojas ?? lotesLojas)} un{s!.proj?.trLojas ? ` · em trânsito: ${un(s!.proj.trLojas)} un` : ""}{s!.motor ? ` · em produção/qualidade/notas: ${un(s!.motor.wip + s!.motor.qualidade + s!.motor.notas)} un` : ""}.</p>}
        </div>}

        {aba === "materiais" && s && <div className="space-y-2">
          {s.semFicha ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Produto sem ficha técnica cadastrada: não é possível verificar os materiais.</p> : <>
            <p className="text-xs text-muted-foreground">Materiais da ficha técnica deste produto no plano de compras: o saldo de Fábrica + Processo + Qualidade é consumido semana a semana por todas as ordens do plano. Itens com falta podem romper a produção deste SKU.</p>
            <div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Matéria-prima</th><th className="px-2 py-1 text-right">Saldo</th><th className="px-2 py-1 text-right">Necessidade do plano</th><th className="px-2 py-1 text-right">Falta</th><th className="px-2 py-1 text-right">Rompe na semana</th><th className="px-2 py-1 text-right">Comprar até</th></tr></thead>
              <tbody>{(s.materiais ?? []).map((x) => <tr key={x.id} className="border-t">
                <td className="px-2 py-1"><span className="font-mono text-xs">{x.id}</span> {x.item}</td><td className="px-2 py-1 text-right tabular-nums">{un(x.saldoInicial, 2)} {x.um}</td><td className="px-2 py-1 text-right tabular-nums">{un(x.necessidade, 2)}</td>
                <td className={`px-2 py-1 text-right font-semibold ${x.falta > 0 ? "text-red-600" : "text-emerald-600"}`}>{x.falta > 0 ? un(x.falta, 2) : "coberto"}</td>
                <td className="px-2 py-1 text-right">{dm(x.primeiraFalta)}</td><td className={`px-2 py-1 text-right ${x.atrasado ? "font-semibold text-red-600" : ""}`}>{dm(x.comprarAte)}{x.atrasado ? " · vencido" : ""}</td></tr>)}
                {!(s.materiais ?? []).length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma ordem deste produto no plano, ou a ficha técnica não tem matéria-prima.</td></tr>}</tbody></table></div>
          </>}
        </div>}

        {aba === "capacidade" && s?.plano && <div className="space-y-2">
          <div className="h-64"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={s.plano.semanas.map((w, i) => ({ semana: dm(w).slice(0, 5), outros: Math.round(s.plano!.totais[i] - s.plano!.porSemanaSku[i]), este: Math.round(s.plano!.porSemanaSku[i]), adicional: Math.round(prazo?.porSemana[i] ?? 0) > Math.round(s.plano!.porSemanaSku[i]) ? Math.round((prazo?.porSemana[i] ?? 0) - s.plano!.porSemanaSku[i]) : 0, capacidade: s.plano!.capacidade || null }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} /><XAxis dataKey="semana" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, n: any) => [`${Number(v).toLocaleString("pt-BR")} un`, n]} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="outros" stackId="a" name="Demais SKUs do plano" fill="#94a3b8" />
              <Bar dataKey="este" stackId="a" name="Este SKU (plano)" fill="#2563eb" />
              <Bar dataKey="adicional" stackId="a" name="Este SKU (para cobrir o déficit)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              {s.plano.capacidade > 0 && <Line dataKey="capacidade" name="Capacidade" stroke="#dc2626" strokeDasharray="6 4" dot={false} />}
            </ComposedChart></ResponsiveContainer></div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">{!prazo || prazo.qtd <= 0 ? "Não há quantidade a produzir para este SKU no horizonte." : prazo.entrega
            ? <>Para entregar <b>{un(prazo.qtd)} un</b> usando a capacidade livre (capacidade − demais ordens do plano), a produção fecha na semana de <b>{dm(prazo.semana)}</b> e o lote fica disponível no CD por volta de <b>{dm(prazo.entrega)}</b> ({prazo.dias} dias, já com {s.plano.diasQualidade} d de qualidade e {s.plano.diasProcesso} d de processo).{s.proj?.dataRupturaCD && <> Ruptura prevista: <b>{dm(s.proj.dataRupturaCD)}</b> — {prazo.entrega <= s.proj.dataRupturaCD ? <span className="font-semibold text-emerald-700">entrega antes da ruptura.</span> : <span className="font-semibold text-red-600">entrega depois da ruptura: antecipar a ordem ou priorizar este SKU na linha.</span>}</>}</>
            : <span className="text-red-600">A capacidade livre do horizonte não é suficiente para produzir {un(prazo.qtd)} un.</span>}</div>
        </div>}

        {aba === "compra" && m && <div className="space-y-2">{m.compra ? <>
          <div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Semana</th><th className="px-2 py-1 text-right">Necessidade</th><th className="px-2 py-1 text-right">Falta</th></tr></thead>
            <tbody>{Object.entries(m.compra.porSemana).sort(([a], [b]) => a.localeCompare(b)).map(([w, v]) => <tr key={w} className="border-t"><td className="px-2 py-1">Semana de {dm(w)}</td><td className="px-2 py-1 text-right tabular-nums">{un(v.necessidade, 2)} {m.compra!.um}</td><td className={`px-2 py-1 text-right ${v.falta > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>{v.falta > 0 ? un(v.falta, 2) : "—"}</td></tr>)}</tbody></table></div>
          <p className="text-xs text-muted-foreground">Usada em: {m.compra.usadoEm.join(", ") || "—"}. Valor estimado da compra: {m.compra.valorFalta > 0 ? m.compra.valorFalta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}.</p>
        </> : <p className="text-sm text-muted-foreground">Esta matéria-prima não aparece no plano de compras do horizonte.</p>}</div>}
      </>}
    </DialogContent>
  </Dialog>;
}

function Kpi({ t, v, d, tom }: { t: string; v: string; d?: string; tom?: string }) {
  return <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{t}</div><div className={`text-lg font-bold tabular-nums ${tom ?? ""}`}>{v}</div>{d && <div className="text-[11px] text-muted-foreground">{d}</div>}</div>;
}
