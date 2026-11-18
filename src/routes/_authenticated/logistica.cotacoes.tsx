// Solicitações de transporte e cotações (3 por destino) — a cotação escolhida vira ordem de serviço.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plus, Sparkles, Trash2, Trophy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Secao } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRole } from "@/hooks/useRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, Campo, dataBR, Hero, inputCls, nf, sb, Status } from "@/components/logistica/ui";
import { cotarPorTabelas, erroExclusaoSolicitacao, podeExcluirSolicitacao, ZONA_ROTULO, zonaPorCep, type Zona } from "@/lib/tms";
import { buscarCep, formatarCep, soDigitosCep } from "@/lib/cep";
import { estimarMercadoIA } from "@/lib/cotacao-ia.functions";
import { prestadorDaPlataforma, type OpcaoIA, type PremissasIA } from "@/lib/cotacao-ia";

export const Route = createFileRoute("/_authenticated/logistica/cotacoes")({ component: Cotacoes, head: () => ({ meta: [{ title: "Cotações de transporte — Controle Logístico" }] }) });

const TIPOS: Record<string, [string, "venda" | "compra" | "interno"]> = { entrega_b2b: ["Entrega B2B", "venda"], transferencia: ["Transferência Pará ↔ SP", "interno"], ativacao: ["Ativação / evento", "interno"], coleta: ["Coleta em fornecedor", "compra"], devolucao: ["Devolução / remessa interna", "interno"], outro: ["Outro", "venda"] };
const vazio = { tipo: "entrega_b2b", centro_custo: "", pedido: "", valor_pedido: "", cliente: "", origem: "Fábrica Mágio (SP)", destino_endereco: "", destino_cep: "", destino_cidade: "", destino_uf: "SP", zona: "" as "" | Zona, peso_kg: "", volumes: "", km_estimado: "", termico: true, data_limite: "", observacao: "" };

/** Coordenada do destino: BrasilAPI (CEP v2) e, sem ela, busca por endereço/cidade no OpenStreetMap. */
async function geocodificar(cep: string, cidade: string, uf: string, endereco: string): Promise<{ lat: number | null; lng: number | null }> {
  const d = cep.replace(/\D/g, "");
  try { if (d.length === 8) { const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${d}`); if (r.ok) { const j = await r.json(); const c = j?.location?.coordinates; if (c?.latitude && c?.longitude) return { lat: +c.latitude, lng: +c.longitude }; if (!cidade && j?.city) cidade = j.city; } } } catch { /* segue */ }
  for (const q of [[endereco, cidade, uf].filter(Boolean).join(", "), [cidade, uf].filter(Boolean).join(", ")]) {
    if (!q) continue;
    try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`); const j = await r.json(); if (j?.[0]) return { lat: +j[0].lat, lng: +j[0].lon }; } catch { /* segue */ }
  }
  return { lat: null, lng: null };
}

function Cotacoes() {
  const qc = useQueryClient();
  const { role } = useRole(); const podeExcluir = podeExcluirSolicitacao(role);
  const q = useQuery({ queryKey: ["tms-cotacoes"], queryFn: async () => {
    const [s, c, p, t, e, cc, ia] = await Promise.all([
      sb.from("log_solicitacoes").select("*").order("numero", { ascending: false }).limit(300), sb.from("log_cotacoes").select("*"), sb.from("log_prestadores").select("*").order("nome"),
      sb.from("log_tabelas_frete").select("*"), sb.from("log_embalagens").select("*").eq("ativo", true), sb.from("log_centros_custo").select("centro_custo").order("centro_custo"),
      sb.from("log_estimativas_ia").select("*").order("created_at", { ascending: false }).limit(500)]);
    for (const r of [s, c, p, t, e]) if (r.error) throw r.error;
    return { sol: s.data as any[], cot: c.data as any[], pres: p.data as any[], tab: (t.data as any[]).map((x) => ({ ...x, valor_fixo: +x.valor_fixo, valor_km: +x.valor_km, valor_kg: +x.valor_kg, minimo: +x.minimo, prazo_dias: x.prazo_dias == null ? null : +x.prazo_dias })), emb: (e.data as any[]).map((x) => ({ ...x, custo: +x.custo, capacidade_kg: x.capacidade_kg == null ? null : +x.capacidade_kg })), cc: ((cc.data ?? []) as any[]).map((x) => x.centro_custo as string), ia: (ia.data ?? []) as any[] };
  } });
  const [nova, setNova] = useState(false); const [f, setF] = useState(vazio); const [sel, setSel] = useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  async function mudarCep(v: string) {
    const fmt = formatarCep(v); setF((f) => ({ ...f, destino_cep: fmt, zona: "" }));
    if (soDigitosCep(fmt).length !== 8) return;
    setBuscandoCep(true);
    const e = await buscarCep(fmt);
    setBuscandoCep(false);
    if (!e) return toast.error("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
    setF((f) => (soDigitosCep(f.destino_cep) === e.cep ? { ...f, destino_endereco: e.endereco || f.destino_endereco, destino_cidade: e.cidade, destino_uf: e.uf, zona: "" } : f));
    if (!e.endereco) toast.message("CEP geral da cidade: informe a rua manualmente.");
  }
  const [manual, setManual] = useState({ prestador_id: "", modal: "aplicativo", frete: "", embalagem: "", prazo: "" });
  const [filtro, setFiltro] = useState("cotacao");
  const [paraExcluir, setParaExcluir] = useState<any | null>(null); const [excluindo, setExcluindo] = useState(false);
  const nExcluir = paraExcluir ? (q.data?.cot ?? []).filter((c) => c.solicitacao_id === paraExcluir.id).length : 0;
  const atual = q.data?.sol.find((s) => s.id === sel);
  const cots = useMemo(() => (q.data?.cot ?? []).filter((c) => c.solicitacao_id === sel).sort((a, b) => +a.total - +b.total), [q.data, sel]);
  const estimativa = useMemo(() => (q.data?.ia ?? []).find((x) => x.solicitacao_id === sel) ?? null, [q.data, sel]);
  const estimar = useServerFn(estimarMercadoIA); const [estimando, setEstimando] = useState(false);
  async function gerarEstimativa(id: string) {
    setEstimando(true);
    try { await estimar({ data: { solicitacaoId: id } }); toast.success("Estimativa de mercado pronta — 3 opções externas."); await recarregar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar a estimativa agora."); }
    finally { setEstimando(false); }
  }
  function usarEstimativa(o: OpcaoIA, pr: PremissasIA) {
    const pid = prestadorDaPlataforma(o.plataforma, q.data?.pres ?? []);
    setManual({ prestador_id: pid ?? "", modal: o.modal, frete: String(o.valor_estimado).replace(".", ","), embalagem: pr.termica_custo ? String(pr.termica_custo).replace(".", ",") : "", prazo: o.prazo_dias == null ? "" : String(o.prazo_dias) });
    toast.message(pid ? `Valores de ${o.plataforma} copiados. Confirme com a plataforma e clique em Adicionar.` : `Valores de ${o.plataforma} copiados. Escolha o prestador (cadastre ${o.plataforma} em Cadastros se precisar) e clique em Adicionar.`);
  }
  const nomeP = (id: string) => q.data?.pres.find((p) => p.id === id)?.nome ?? "—";
  const recarregar = () => qc.invalidateQueries({ queryKey: ["tms-cotacoes"] });

  async function criar() {
    if (!f.centro_custo) return toast.error("Escolha o centro de custo.");
    const zona = f.zona || (f.tipo === "transferencia" ? "para_sp" : zonaPorCep(f.destino_cep, f.destino_uf)) || "grande_sp";
    const num = (v: string) => (v === "" ? null : Number(String(v).replace(",", ".")));
    const geo = await geocodificar(f.destino_cep, f.destino_cidade, f.destino_uf, f.destino_endereco);
    const { data, error } = await sb.from("log_solicitacoes").insert({ ...f, ...geo, zona, natureza: TIPOS[f.tipo][1], valor_pedido: num(f.valor_pedido), peso_kg: num(f.peso_kg), volumes: num(f.volumes), km_estimado: num(f.km_estimado), data_limite: f.data_limite || null }).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Solicitação aberta — gerando cotações automáticas."); setNova(false); setF(vazio); setSel(data.id); await recarregar(); await cotarAuto(data.id);
  }
  async function cotarAuto(id: string) {
    const d = (await qc.fetchQuery({ queryKey: ["tms-cotacoes"] })) as any; const s = d.sol.find((x: any) => x.id === id); if (!s) return;
    const dias = s.data_limite ? Math.max(0, Math.round((Date.parse(s.data_limite) - Date.now()) / 86400000)) : null;
    const ops = cotarPorTabelas({ zona: s.zona, peso_kg: +s.peso_kg || 0, km_estimado: s.km_estimado == null ? null : +s.km_estimado, termico: s.termico, dias_ate_limite: dias }, d.tab, d.pres, d.emb);
    const ja = new Set(d.cot.filter((c: any) => c.solicitacao_id === id).map((c: any) => c.prestador_id));
    const novas = ops.filter((o) => !ja.has(o.prestador_id)).map((o) => ({ solicitacao_id: id, prestador_id: o.prestador_id, modal: o.modal, frete: o.frete, embalagem: o.embalagem, prazo_dias: o.prazo_dias, origem: "tabela", detalhe: { calculo: o.detalhe, atende_prazo: o.atendePrazo } }));
    if (novas.length) { const r = await sb.from("log_cotacoes").insert(novas); if (r.error) return toast.error(r.error.message); }
    toast.message(`${novas.length} cotação(ões) pelas tabelas de serviço${ops.length < 3 ? " — complete até 3 com cotações manuais (app, Melhor Envio, companhia aérea)" : ""}.`); recarregar();
  }
  async function addManual() {
    if (!sel || !manual.prestador_id || !manual.frete) return toast.error("Informe prestador e valor.");
    const r = await sb.from("log_cotacoes").insert({ solicitacao_id: sel, prestador_id: manual.prestador_id, modal: manual.modal, frete: +manual.frete.replace(",", "."), embalagem: +(manual.embalagem || "0").replace(",", "."), prazo_dias: manual.prazo ? +manual.prazo : null, origem: "manual" });
    if (r.error) return toast.error(r.error.message); setManual({ ...manual, frete: "", embalagem: "", prazo: "" }); recarregar();
  }
  async function escolher(id: string) {
    const n = new Set(cots.map((c) => c.prestador_id)).size; let just: string | null = null;
    if (n < 3) { just = prompt(`Há ${n} cotação(ões). Justifique para seguir com menos de 3:`); if (!just) return; }
    const r = await sb.rpc("log_escolher_cotacao", { p_cotacao: id, p_justificativa: just }); if (r.error) return toast.error(r.error.message);
    toast.success("Cotação aprovada — ordem de serviço criada em Follow-up."); recarregar();
  }
  async function excluir() {
    const alvo = paraExcluir; if (!alvo) return;
    setExcluindo(true);
    const { data, error } = await sb.from("log_solicitacoes").delete().eq("id", alvo.id).select("id");
    setExcluindo(false);
    if (error) return toast.error(erroExclusaoSolicitacao(error.message));
    if (!data?.length) return toast.error("Só administradores e gerentes podem excluir solicitações.");
    toast.success(`Solicitação #${alvo.numero} excluída.`);
    if (sel === alvo.id) setSel(null);
    setParaExcluir(null); recarregar();
  }
  const lista = (q.data?.sol ?? []).filter((s) => filtro === "todas" || s.status === filtro);

  return (
    <div className="w-full space-y-4">
      <Hero titulo="Cotações de transporte" sub="Solicitação → 3 cotações por destino (automáticas pelas tabelas + manuais) → decisão do gestor → ordem de serviço.">
        <button type="button" onClick={() => setNova(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"><Plus className="size-3.5" />Nova solicitação</button>
      </Hero>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Secao letra="A" titulo="Solicitações">
          <div className="mb-2 flex flex-wrap gap-1">{["cotacao", "aprovada", "em_transporte", "entregue", "todas"].map((s) => <button key={s} onClick={() => setFiltro(s)} className={`h-7 rounded-md border px-2 text-xs font-semibold ${filtro === s ? "bg-slate-900 text-white" : "bg-background"}`}>{s === "todas" ? "Todas" : s === "cotacao" ? "Em cotação" : s === "aprovada" ? "Aprovadas" : s === "em_transporte" ? "Em transporte" : "Entregues"}</button>)}</div>
          <div className="max-h-[560px] space-y-1.5 overflow-auto">{lista.map((s) => { const n = (q.data?.cot ?? []).filter((c) => c.solicitacao_id === s.id).length; return (
            <div key={s.id} className={`flex items-stretch overflow-hidden rounded-lg border ${sel === s.id ? "border-slate-900 ring-1 ring-slate-900" : ""}`}>
              <button onClick={() => setSel(s.id)} className="flex-1 p-2 text-left text-sm hover:bg-muted">
              <div className="flex items-center justify-between gap-2"><b>#{s.numero} · {TIPOS[s.tipo]?.[0]}</b><Status s={s.status} /></div>
              <div className="text-xs text-muted-foreground">{s.cliente || s.destino_cidade || "—"} · {ZONA_ROTULO[s.zona as Zona] ?? "—"} · {nf(s.peso_kg, 1)} kg · {s.centro_custo}</div>
              <div className="text-xs text-muted-foreground">{n} cotação(ões) · limite {dataBR(s.data_limite)}</div></button>
              {podeExcluir && <button type="button" aria-label={`Excluir solicitação ${s.numero}`} title="Excluir solicitação" onClick={() => setParaExcluir(s)} className="grid w-9 shrink-0 place-items-center border-l text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button>}
            </div>); })}
            {!lista.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma solicitação neste filtro.</p>}</div>
        </Secao>
        <Secao letra="B" titulo={atual ? `Cotações da solicitação #${atual.numero}` : "Cotações"}>
          {!atual ? <p className="py-10 text-center text-sm text-muted-foreground">Escolha uma solicitação.</p> : <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-2 text-xs">{atual.origem} → {[atual.destino_endereco, atual.destino_cidade, atual.destino_uf, atual.destino_cep].filter(Boolean).join(" · ") || "—"}<br />{nf(atual.peso_kg, 1)} kg · {atual.volumes ?? "—"} vol · {atual.km_estimado ? `${nf(atual.km_estimado)} km` : "km não informado"} · {atual.termico ? "precisa de proteção térmica" : "sem térmica"} · pedido {atual.pedido || "—"} {atual.valor_pedido ? `(${brl(atual.valor_pedido)})` : ""}</div>
            <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1 text-left">Prestador</th><th className="px-2 py-1 text-left">Modal</th><th className="px-2 py-1 text-right">Frete</th><th className="px-2 py-1 text-right">Térmica</th><th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1 text-right">Prazo</th><th className="px-2 py-1" /></tr></thead>
              <tbody>{cots.map((c, i) => <tr key={c.id} className={`border-t ${c.escolhida ? "bg-emerald-50" : ""}`}>
                <td className="px-2 py-1">{i === 0 && <Trophy className="mr-1 inline size-3.5 text-amber-500" />}{nomeP(c.prestador_id)}<div className="text-[10px] text-muted-foreground">{c.origem === "tabela" ? (c.detalhe?.calculo ?? []).join(" · ") : "cotação manual"}</div></td>
                <td className="px-2 py-1 text-xs">{c.modal}</td><td className="px-2 py-1 text-right tabular-nums">{brl(c.frete)}</td><td className="px-2 py-1 text-right tabular-nums">{+c.embalagem ? brl(c.embalagem) : ""}</td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">{brl(c.total)}{atual.valor_pedido ? <div className="text-[10px] font-normal text-muted-foreground">{nf((c.total / atual.valor_pedido) * 100, 1)}% do pedido</div> : null}</td>
                <td className="px-2 py-1 text-right text-xs">{c.prazo_dias == null ? "—" : `${c.prazo_dias} d`}</td>
                <td className="px-2 py-1 text-right">{atual.status === "cotacao" ? <Button size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => escolher(c.id)}>Escolher</Button> : c.escolhida ? <Status s="aprovada" /> : null}</td></tr>)}</tbody></table>
            {cots.length > 1 && <p className="text-xs text-muted-foreground">Diferença entre a mais barata e a mais cara: <b>{brl(+cots[cots.length - 1].total - +cots[0].total)}</b>. {new Set(cots.map((c) => c.prestador_id)).size < 3 && <span className="text-amber-700">Faltam cotações para chegar a 3 prestadores.</span>}</p>}
            <EstimativaIA est={estimativa} podeGerar={atual.status === "cotacao"} gerando={estimando} onGerar={() => gerarEstimativa(atual.id)} onUsar={usarEstimativa} />
            {atual.status === "cotacao" && <div className="space-y-2 rounded-lg border p-2">
              <div className="flex items-center justify-between"><b className="text-xs">Adicionar cotação</b><Button size="sm" variant="outline" onClick={() => cotarAuto(atual.id)}><Sparkles className="mr-1 size-3.5" />Recalcular pelas tabelas</Button></div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Campo l="Prestador" className="md:col-span-2"><select className={inputCls} value={manual.prestador_id} onChange={(e) => setManual({ ...manual, prestador_id: e.target.value })}><option value="">—</option>{(q.data?.pres ?? []).filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
                <Campo l="Modal"><select className={inputCls} value={manual.modal} onChange={(e) => setManual({ ...manual, modal: e.target.value })}>{["aplicativo", "veiculo_proprio", "correios", "rodoviario", "aereo"].map((m) => <option key={m}>{m}</option>)}</select></Campo>
                <Campo l="Frete (R$)"><input className={inputCls} value={manual.frete} onChange={(e) => setManual({ ...manual, frete: e.target.value })} /></Campo>
                <Campo l="Térmica (R$)"><input className={inputCls} value={manual.embalagem} onChange={(e) => setManual({ ...manual, embalagem: e.target.value })} /></Campo>
                <Campo l="Prazo (dias)"><input className={inputCls} value={manual.prazo} onChange={(e) => setManual({ ...manual, prazo: e.target.value })} /></Campo>
              </div><div className="flex justify-end"><Button size="sm" onClick={addManual}>Adicionar</Button></div></div>}
          </div>}
        </Secao>
      </div>
      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Nova solicitação de transporte</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Campo l="Tipo" className="md:col-span-2"><select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></Campo>
            <Campo l="Centro de custo" className="md:col-span-2"><select className={inputCls} value={f.centro_custo} onChange={(e) => setF({ ...f, centro_custo: e.target.value })}><option value="">—</option>{(q.data?.cc ?? []).map((c) => <option key={c}>{c}</option>)}</select></Campo>
            <Campo l="Cliente / destinatário" className="md:col-span-2"><input className={inputCls} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></Campo>
            <Campo l="Pedido / NF"><input className={inputCls} value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} /></Campo>
            <Campo l="Valor do pedido (R$)"><input className={inputCls} value={f.valor_pedido} onChange={(e) => setF({ ...f, valor_pedido: e.target.value })} /></Campo>
            <Campo l="Origem" className="md:col-span-2"><input className={inputCls} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} /></Campo>
            <Campo l="Endereço de entrega" className="md:col-span-2"><input className={inputCls} value={f.destino_endereco} onChange={(e) => setF({ ...f, destino_endereco: e.target.value })} /></Campo>
            <Campo l="CEP"><div className="relative"><input className={inputCls} inputMode="numeric" placeholder="00000-000" value={f.destino_cep} onChange={(e) => mudarCep(e.target.value)} />{buscandoCep && <Loader2 aria-label="Buscando CEP" className="absolute right-2 top-1/2 mt-0.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div></Campo>
            <Campo l="Cidade"><input className={inputCls} value={f.destino_cidade} onChange={(e) => setF({ ...f, destino_cidade: e.target.value })} /></Campo>
            <Campo l="UF"><input className={inputCls} maxLength={2} value={f.destino_uf} onChange={(e) => setF({ ...f, destino_uf: e.target.value.toUpperCase(), zona: "" })} /></Campo>
            <Campo l="Zona"><select className={inputCls} value={f.zona || (f.tipo === "transferencia" ? "para_sp" : zonaPorCep(f.destino_cep, f.destino_uf) ?? "")} onChange={(e) => setF({ ...f, zona: e.target.value as Zona })}>{(Object.keys(ZONA_ROTULO) as Zona[]).map((z) => <option key={z} value={z}>{ZONA_ROTULO[z]}</option>)}</select></Campo>
            <Campo l="Peso (kg)"><input className={inputCls} value={f.peso_kg} onChange={(e) => setF({ ...f, peso_kg: e.target.value })} /></Campo>
            <Campo l="Volumes"><input className={inputCls} value={f.volumes} onChange={(e) => setF({ ...f, volumes: e.target.value })} /></Campo>
            <Campo l="Km estimado (ida)"><input className={inputCls} value={f.km_estimado} onChange={(e) => setF({ ...f, km_estimado: e.target.value })} /></Campo>
            <Campo l="Entregar até"><input type="date" className={inputCls} value={f.data_limite} onChange={(e) => setF({ ...f, data_limite: e.target.value })} /></Campo>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.termico} onChange={(e) => setF({ ...f, termico: e.target.checked })} />Precisa de proteção térmica (isopor + gelox calculados pelo peso)</label>
            <Campo l="Observação" className="col-span-2 md:col-span-4"><input className={inputCls} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Campo>
          </div>
          <div className="flex justify-end"><Button onClick={criar}>Abrir e cotar</Button></div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o && !excluindo) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação {paraExcluir ? `#${paraExcluir.numero}` : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraExcluir ? <>{paraExcluir.cliente || paraExcluir.destino_cidade || "Sem cliente"} · {ZONA_ROTULO[paraExcluir.zona as Zona] ?? "—"}<br />
                {nExcluir} cotação(ões) desta solicitação também serão excluídas, sem como recuperar. Se a solicitação já virou ordem de serviço, ela não será excluída.</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Manter</AlertDialogCancel>
            <AlertDialogAction disabled={excluindo} onClick={(e) => { e.preventDefault(); excluir(); }} className="bg-red-600 text-white hover:bg-red-700">{excluindo ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Bloco "Estimativa de mercado (IA)": 3 opções externas, só referência de preço. */
function EstimativaIA({ est, podeGerar, gerando, onGerar, onUsar }: { est: any | null; podeGerar: boolean; gerando: boolean; onGerar: () => void; onUsar: (o: OpcaoIA, p: PremissasIA) => void }) {
  const opcoes = (Array.isArray(est?.opcoes) ? est.opcoes : []) as OpcaoIA[];
  const pr = (est?.premissas ?? {}) as PremissasIA;
  const kmTxt = pr.km != null ? `${nf(pr.km)} km ${pr.km_fonte === "rota" ? "(rota calculada)" : "(informado)"}` : "sem distância";
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5"><Bot className="size-4 text-muted-foreground" /><b className="text-xs">Estimativa de mercado (IA)</b>{est && <span className="text-[10px] text-muted-foreground">gerada em {new Date(est.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>}</div>
        {podeGerar && <Button size="sm" variant="outline" disabled={gerando} onClick={onGerar}>{gerando ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}{gerando ? "Avaliando o mercado…" : est ? "Refazer estimativa" : "Estimar 3 opções com IA"}</Button>}
      </div>
      {!est ? <p className="text-xs text-muted-foreground">{podeGerar ? "A IA avalia o mercado com os dados da solicitação e sugere 3 plataformas ou transportadoras diferentes, com faixa de preço e prazo." : "Nenhuma estimativa gerada para esta solicitação."}</p> : <>
        <div className="grid gap-2 md:grid-cols-3">{opcoes.map((o) => { const total = o.valor_estimado + (pr.termica_custo || 0); return (
          <div key={o.plataforma} className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2 text-xs">
            <div className="flex items-start justify-between gap-2"><b className="text-sm">{o.plataforma}</b><span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{o.modal}</span></div>
            <div className="text-base font-semibold tabular-nums">{brl(o.valor_estimado)}</div>
            <div className="text-muted-foreground">faixa {brl(o.valor_min)} – {brl(o.valor_max)} · {o.prazo_dias == null ? "prazo n/d" : o.prazo_dias === 0 ? "mesmo dia" : `${o.prazo_dias} d`}</div>
            {pr.termica_custo ? <div className="text-muted-foreground">+ térmica {brl(pr.termica_custo)} = <b className="text-foreground">{brl(total)}</b></div> : null}
            {o.observacao && <p className="text-[11px] leading-snug text-muted-foreground">{o.observacao}</p>}
            {podeGerar && <Button size="sm" variant="ghost" className="mt-auto h-7 justify-start px-1 text-xs" onClick={() => onUsar(o, pr)}>Usar como cotação</Button>}
          </div>); })}</div>
        {est.resumo && <p className="text-xs"><b>Recomendação:</b> {est.resumo}</p>}
        <p className="text-[10px] text-muted-foreground">Premissas: {kmTxt} · {nf(pr.peso_kg, 1)} kg{pr.termico ? ` · térmica ${pr.termica_itens?.join(" + ") || "—"}` : ""}. Valores estimados por IA com base no mercado, não são preços contratados: confirme com a plataforma antes de escolher. A estimativa não conta como uma das 3 cotações.</p>
      </>}
    </div>
  );
}
