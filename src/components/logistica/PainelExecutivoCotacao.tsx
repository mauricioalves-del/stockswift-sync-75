// Visão executiva por solicitação: calculadora de custo real da carga (custo-alvo com base em dados), avaliação
// das cotações contra o alvo e aprovação da diretoria — pronta para salvar, imprimir (PDF) e compartilhar.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Copy, Plus, Printer, Save, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { brl, Campo, dataBR, inputCls, nf, sb } from "./ui";
import { avaliarCotacoes, calcularCustoAlvo, referenciaHistorica, type ParamsCalc, type Volume } from "@/lib/calculadora-frete";
import { embalagemTermica, ZONA_ROTULO, zonaEnvio, type Zona } from "@/lib/tms";

const STATUS: Record<string, [string, string]> = { rascunho: ["Rascunho", "bg-slate-200 text-slate-700"], enviada: ["Aguardando diretoria", "bg-amber-100 text-amber-800"], aprovada: ["Aprovada pela diretoria", "bg-emerald-100 text-emerald-800"], reprovada: ["Reprovada", "bg-red-100 text-red-800"] };
const n = (v: string | number) => Number(String(v).replace(",", ".")) || 0;
function Kpi({ t, v, sub, tom = "" }: { t: string; v: string; sub?: string; tom?: string }) {
  return <div className="rounded-xl border border-l-4 border-l-slate-800 bg-card p-3 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{v}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}

export function PainelExecutivoCotacao({ sol, cots, nomeP, embalagens }: { sol: any; cots: any[]; nomeP: (id: string) => string; embalagens: any[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tms-analise", sol.id], queryFn: async () => {
    const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const [a, e] = await Promise.all([sb.from("log_analises_cotacao").select("*").eq("solicitacao_id", sol.id).maybeSingle(), sb.from("log_envios").select("data, kg, frete, isopor, gelox, seguro, uf, fora_sp, origem_destino, zona, natureza").gte("data", desde).limit(5000)]);
    return { analise: a.data as any, envios: (e.data ?? []) as any[] };
  } });
  const zona = sol.zona as Zona;
  const hist = useMemo(() => referenciaHistorica((q.data?.envios ?? []).filter((e) => zonaEnvio(e) === zona).map((e) => ({ data: e.data, kg: e.kg == null ? null : +e.kg, total: +e.frete + +e.isopor + +e.gelox + +e.seguro }))), [q.data, zona]);
  const modalRef = cots[0]?.modal ?? (zona === "grande_sp" ? "aplicativo" : zona === "fora_estado" ? "rodoviario" : "aereo");
  const padrao = (): ParamsCalc => ({ pesoReal: +sol.peso_kg || 0, volumes: [{ qtd: +sol.volumes || 1, c: 40, l: 30, a: 30 }], modal: modalRef, valorNF: +sol.valor_pedido || 0,
    tarifaKg: Math.round((hist.rkgMediana ?? 3) * 100) / 100, minimo: 0, adValoremPct: 0.3, grisPct: 0.2, pedagio: 0, coletaEntrega: 0,
    termica: sol.termico ? embalagemTermica(+sol.peso_kg || 0, embalagens.map((x) => ({ ...x, custo: +x.custo, capacidade_kg: x.capacidade_kg == null ? null : +x.capacidade_kg }))).custo : 0, icmsPct: 0, tolerancia: 10 });
  const [p, setP] = useState<ParamsCalc | null>(null);
  useEffect(() => { if (q.data && !p) setP(q.data.analise?.parametros ?? padrao()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q.data]);
  const [coment, setComent] = useState("");
  if (!q.data || !p) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando análise…</p>;
  const calc = calcularCustoAlvo(p); const P = p;
  const prazoLim = sol.data_limite ? Math.max(0, Math.round((Date.parse(sol.data_limite) - Date.now()) / 86400000)) : null;
  const aval = avaliarCotacoes(cots.map((c) => ({ id: c.id, prestador: nomeP(c.prestador_id), modal: c.modal, total: +c.total, prazo: c.prazo_dias == null ? null : +c.prazo_dias })), calc.alvo, calc.teto, calc.taxavel, p.valorNF, prazoLim, !!sol.termico);
  const rec = aval.recomendada, media = aval.cotacoes.length ? aval.cotacoes.reduce((s, c) => s + c.total, 0) / aval.cotacoes.length : null, maior = aval.cotacoes.at(-1);
  const st = q.data.analise?.status ?? "rascunho";
  const set = (k: keyof ParamsCalc, v: any) => setP({ ...p, [k]: v });
  const setVol = (i: number, k: keyof Volume, v: string) => setP({ ...p, volumes: p.volumes.map((x, j) => (j === i ? { ...x, [k]: n(v) } : x)) });
  const resultado = { calc, avaliacao: aval.cotacoes, recomendada: rec, historico: hist, zona, gerado_em: new Date().toISOString() };

  async function salvar(status?: "enviada") {
    const { data: u } = await sb.auth.getUser();
    const linha: any = { solicitacao_id: sol.id, parametros: p, resultado, cotacao_recomendada: rec?.id ?? null, updated_at: new Date().toISOString() };
    if (status) Object.assign(linha, { status, enviado_por: u.user?.id, enviado_em: new Date().toISOString() });
    const r = await sb.from("log_analises_cotacao").upsert(linha, { onConflict: "solicitacao_id" });
    if (r.error) return toast.error(r.error.message);
    toast.success(status ? "Análise enviada para aprovação da diretoria." : "Análise salva."); qc.invalidateQueries({ queryKey: ["tms-analise", sol.id] });
  }
  async function decidir(status: "aprovada" | "reprovada") {
    if (status === "reprovada" && !coment.trim()) return toast.error("Informe o motivo da reprovação.");
    const { data: u } = await sb.auth.getUser();
    const r = await sb.from("log_analises_cotacao").update({ status, decidido_por: u.user?.id, decidido_em: new Date().toISOString(), comentario: coment || null, updated_at: new Date().toISOString() }).eq("solicitacao_id", sol.id);
    if (r.error) return toast.error(r.error.message.includes("row-level") ? "Somente a gestão/diretoria pode aprovar ou reprovar." : r.error.message);
    toast.success(status === "aprovada" ? "Aprovada pela diretoria." : "Reprovada."); qc.invalidateQueries({ queryKey: ["tms-analise", sol.id] });
  }
  function copiar() {
    const t = [`Solicitação de transporte #${sol.numero} — ${sol.cliente ?? sol.destino_cidade ?? ""} (${ZONA_ROTULO[zona] ?? ""})`, `Pedido ${sol.pedido || "—"} · ${brl(P.valorNF)} · ${nf(P.pesoReal, 1)} kg real / ${nf(calc.taxavel, 1)} kg taxável (${nf(calc.m3, 3)} m³)`,
      `Custo-alvo (dados Mágio): ${brl(calc.alvo)} · faixa ${brl(calc.piso)} a ${brl(calc.teto)} · ${nf(calc.pctNF, 1)}% do pedido`,
      ...aval.cotacoes.map((c) => `• ${c.prestador} (${c.modal}): ${brl(c.total)} · ${c.desvio > 0 ? "+" : ""}${nf(c.desvio, 1)}% vs alvo · ${c.prazo ?? "—"} d · nota ${c.nota}`),
      rec ? `Recomendação: ${rec.prestador} — ${brl(rec.total)} (${rec.desvio > 0 ? "+" : ""}${nf(rec.desvio, 1)}% vs alvo, ${rec.prazo ?? "—"} dias).` : "Sem cotação dentro do prazo.", `Status: ${STATUS[st][0]}`].join("\n");
    navigator.clipboard.writeText(t).then(() => toast.success("Resumo copiado para colar no e-mail ou WhatsApp."));
  }
  const dadosGraf = aval.cotacoes.map((c) => ({ nome: c.prestador, total: c.total, rec: c.id === rec?.id }));

  return (
    <div id="painel-exec" className="space-y-3">
      <style>{`@media print { body * { visibility: hidden !important; } #painel-exec, #painel-exec * { visibility: visible !important; } #painel-exec { position: absolute; inset: 0; padding: 16px; background: white; } .nao-imprimir { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <div><div className="text-lg font-bold">Visão executiva · Solicitação #{sol.numero}</div><div className="text-xs text-slate-300">{sol.cliente ?? "—"} · {sol.origem} → {[sol.destino_cidade, sol.destino_uf].filter(Boolean).join("/")} · {ZONA_ROTULO[zona] ?? ""} · limite {dataBR(sol.data_limite)}</div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[st][1]}`}>{STATUS[st][0]}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi t="Valor do pedido" v={brl(p.valorNF, 0)} sub={`pedido ${sol.pedido || "—"}`} />
        <Kpi t="Peso real / taxável" v={`${nf(p.pesoReal, 1)} / ${nf(calc.taxavel, 1)} kg`} sub={`${nf(calc.m3, 3)} m³ · cubado ${nf(calc.cubado, 1)} kg`} />
        <Kpi t="Custo-alvo (dados)" v={brl(calc.alvo)} sub={`faixa ${brl(calc.piso, 0)} – ${brl(calc.teto, 0)} · ${nf(calc.pctNF, 1)}% do pedido`} />
        <Kpi t="Melhor cotação" v={aval.cotacoes[0] ? brl(aval.cotacoes[0].total) : "—"} sub={aval.cotacoes[0] ? `${aval.cotacoes[0].prestador} · ${aval.cotacoes[0].desvio > 0 ? "+" : ""}${nf(aval.cotacoes[0].desvio, 1)}% vs alvo` : "sem cotações"} tom={aval.cotacoes[0] && !aval.cotacoes[0].dentroTeto ? "text-red-600" : "text-emerald-700"} />
        <Kpi t="Economia da recomendada" v={rec && maior ? brl(maior.total - rec.total) : "—"} sub={rec && media ? `vs maior · ${brl(media - rec.total, 0)} vs média` : ""} />
        <Kpi t={`Histórico ${ZONA_ROTULO[zona] ?? ""}`} v={hist.rkgMediana != null ? `${brl(hist.rkgMediana)}/kg` : "—"} sub={`${hist.nComKg} envios com peso · faixa ${hist.rkgP25 != null ? `${brl(hist.rkgP25)}–${brl(hist.rkgP75!)}` : "—"}/kg`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-xl border p-3"><div className="mb-1 text-xs font-bold">Cotações × custo-alvo</div>
          <div className="h-56"><ResponsiveContainer><BarChart data={dadosGraf} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="nome" fontSize={10} /><YAxis fontSize={10} tickFormatter={(v) => `${Math.round(v / 100) / 10}k`} /><Tooltip formatter={(v: any) => brl(+v)} />
            <ReferenceLine y={calc.alvo} stroke="#16a34a" strokeDasharray="5 3" label={{ value: "alvo", fontSize: 10, fill: "#16a34a", position: "right" }} /><ReferenceLine y={calc.teto} stroke="#dc2626" strokeDasharray="3 3" label={{ value: "teto", fontSize: 10, fill: "#dc2626", position: "right" }} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>{dadosGraf.map((d) => <Cell key={d.nome} fill={d.rec ? "#16a34a" : d.total > calc.teto ? "#dc2626" : "#34436C"} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        <div className="overflow-x-auto rounded-xl border p-3"><div className="mb-1 text-xs font-bold">Avaliação das cotações</div>
          <table className="w-full text-xs"><thead className="bg-muted"><tr>{["Prestador", "Modal", "Total", "vs alvo", "R$/kg tax.", "% pedido", "Prazo", "Nota"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{aval.cotacoes.map((c) => <tr key={c.id} className={`border-t ${c.id === rec?.id ? "bg-emerald-50 font-semibold" : ""}`}><td className="px-2 py-1">{c.prestador}{c.id === rec?.id && " ★"}</td><td className="px-2 py-1">{c.modal}</td><td className="px-2 py-1 tabular-nums">{brl(c.total)}</td>
              <td className={`px-2 py-1 tabular-nums ${c.desvio > 10 ? "text-red-600" : c.desvio < 0 ? "text-emerald-700" : ""}`}>{c.desvio > 0 ? "+" : ""}{nf(c.desvio, 1)}%</td><td className="px-2 py-1 tabular-nums">{c.rkg != null ? brl(c.rkg) : "—"}</td><td className="px-2 py-1 tabular-nums">{c.pctNF != null ? `${nf(c.pctNF, 1)}%` : "—"}</td>
              <td className={`px-2 py-1 ${c.atendePrazo ? "" : "text-red-600"}`}>{c.prazo ?? "—"} d</td><td className="px-2 py-1 tabular-nums">{c.nota}</td></tr>)}</tbody></table>
          <p className="mt-2 text-[11px] text-muted-foreground">Nota = custo vs alvo (60%) + prazo (25%) + adequação térmica (15%). ★ recomendada: maior nota entre as que cumprem o prazo.</p></div>
      </div>
      <div className="rounded-xl border border-l-4 border-l-emerald-600 bg-card p-3 text-sm">
        <b>Recomendação:</b> {rec ? <>contratar <b>{rec.prestador}</b> ({rec.modal}) por <b>{brl(rec.total)}</b> — {rec.desvio > 0 ? "+" : ""}{nf(rec.desvio, 1)}% vs custo-alvo, {nf(rec.pctNF ?? 0, 1)}% do pedido, {rec.prazo ?? "—"} dia(s){!rec.dentroTeto && <span className="text-red-600"> · acima do teto: negociar antes de aprovar</span>}.</> : "nenhuma cotação cumpre o prazo; buscar nova opção."}
        {q.data.analise?.comentario && <div className="mt-1 text-xs text-muted-foreground">Diretoria: {q.data.analise.comentario}</div>}
      </div>
      <details className="rounded-xl border p-3" open={st === "rascunho"}>
        <summary className="cursor-pointer text-xs font-bold">Calculadora de custo real da carga (base do custo-alvo)</summary>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Volumes (cm) — cubagem</div>
            {p.volumes.map((v, i) => <div key={i} className="flex items-center gap-1 text-xs">{(["qtd", "c", "l", "a"] as const).map((k) => <input key={k} className="h-8 w-16 rounded border bg-background px-1 text-right" value={v[k]} onChange={(e) => setVol(i, k, e.target.value)} title={{ qtd: "Quantidade", c: "Comprimento", l: "Largura", a: "Altura" }[k]} />)}<span className="text-muted-foreground">qtd · C · L · A</span>{p.volumes.length > 1 && <button className="nao-imprimir" onClick={() => setP({ ...p, volumes: p.volumes.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>}</div>)}
            <Button size="sm" variant="outline" className="nao-imprimir" onClick={() => setP({ ...p, volumes: [...p.volumes, { qtd: 1, c: 40, l: 30, a: 30 }] })}><Plus className="mr-1 size-3.5" />Volume</Button>
            <div className="grid grid-cols-3 gap-2">
              <Campo l="Peso real (kg)"><input className={inputCls} value={p.pesoReal} onChange={(e) => set("pesoReal", n(e.target.value))} /></Campo>
              <Campo l="Modal de referência"><select className={inputCls} value={p.modal} onChange={(e) => set("modal", e.target.value)}>{["rodoviario", "aereo", "correios", "aplicativo", "veiculo_proprio"].map((m) => <option key={m}>{m}</option>)}</select></Campo>
              <Campo l="Valor da NF (R$)"><input className={inputCls} value={p.valorNF} onChange={(e) => set("valorNF", n(e.target.value))} /></Campo>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Campo l="Tarifa R$/kg (histórico)"><input className={inputCls} value={p.tarifaKg} onChange={(e) => set("tarifaKg", n(e.target.value))} /></Campo>
            <Campo l="Frete mínimo (R$)"><input className={inputCls} value={p.minimo} onChange={(e) => set("minimo", n(e.target.value))} /></Campo>
            <Campo l="Ad valorem (%)"><input className={inputCls} value={p.adValoremPct} onChange={(e) => set("adValoremPct", n(e.target.value))} /></Campo>
            <Campo l="GRIS (%)"><input className={inputCls} value={p.grisPct} onChange={(e) => set("grisPct", n(e.target.value))} /></Campo>
            <Campo l="Pedágio (R$)"><input className={inputCls} value={p.pedagio} onChange={(e) => set("pedagio", n(e.target.value))} /></Campo>
            <Campo l="Coleta/entrega (R$)"><input className={inputCls} value={p.coletaEntrega} onChange={(e) => set("coletaEntrega", n(e.target.value))} /></Campo>
            <Campo l="Térmica (R$)"><input className={inputCls} value={p.termica} onChange={(e) => set("termica", n(e.target.value))} /></Campo>
            <Campo l="ICMS (%)"><input className={inputCls} value={p.icmsPct} onChange={(e) => set("icmsPct", n(e.target.value))} /></Campo>
            <Campo l="Tolerância (%)"><input className={inputCls} value={p.tolerancia} onChange={(e) => set("tolerancia", n(e.target.value))} /></Campo>
            <table className="col-span-3 mt-1 w-full text-xs"><tbody>{calc.componentes.map((c) => <tr key={c.nome} className="border-t"><td className="py-0.5">{c.nome}</td><td className="py-0.5 text-right tabular-nums">{brl(c.valor)}</td></tr>)}<tr className="border-t font-bold"><td className="py-0.5">Custo-alvo</td><td className="py-0.5 text-right tabular-nums">{brl(calc.alvo)} ({calc.rkgAlvo != null ? `${brl(calc.rkgAlvo)}/kg` : "—"})</td></tr></tbody></table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Tarifa sugerida = mediana do R$/kg pago pela Mágio na mesma região nos últimos 12 meses ({hist.nComKg} envios com peso). Fator de cubagem: rodoviário 300 kg/m³; aéreo e Correios 167 kg/m³.</p>
      </details>
      <div className="nao-imprimir flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => salvar()}><Save className="mr-1 size-4" />Salvar análise</Button>
        {(st === "rascunho" || st === "reprovada") && <Button size="sm" onClick={() => salvar("enviada")}><Send className="mr-1 size-4" />Enviar para diretoria</Button>}
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 size-4" />Imprimir / PDF</Button>
        <Button size="sm" variant="outline" onClick={copiar}><Copy className="mr-1 size-4" />Copiar resumo</Button>
        {st === "enviada" && <><input className="h-8 min-w-[220px] flex-1 rounded-md border bg-background px-2 text-sm" placeholder="Comentário da diretoria (obrigatório para reprovar)" value={coment} onChange={(e) => setComent(e.target.value)} />
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => decidir("aprovada")}><CheckCircle2 className="mr-1 size-4" />Aprovar</Button>
          <Button size="sm" variant="outline" className="text-red-700" onClick={() => decidir("reprovada")}><XCircle className="mr-1 size-4" />Reprovar</Button></>}
      </div>
    </div>
  );
}
