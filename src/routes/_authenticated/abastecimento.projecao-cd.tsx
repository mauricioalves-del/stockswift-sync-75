import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { TrendingDown, Upload, Download, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { interpretarConsenso, aoaDaAbaConsenso, serieDiariaConsenso, type ResultadoConsenso } from "@/lib/abastecimento-consenso";
import { projetarCD, planoProducao, paraPcp, type ResultadoProjecao, type Severidade, type LinhaPlano } from "@/lib/abastecimento-projecao";
import { planejarSku, estimarDemandaReal, type ResultadoMotor, type Lote, type Zona } from "@/lib/abastecimento-cd-motor";
import { carregarBomCompleta, explodirSimulacao, type BomLinha } from "@/lib/pcp-bom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/projecao-cd")({
  component: ProjecaoCdPage,
  head: () => ({ meta: [{ title: "Projeção do CD e Plano de Produção" }] }),
});

const nk = (s: unknown) => String(s ?? "").replace(/^0+/, "");
const ORIGENS_PROD = ["Alm_SP_Fabrica", "Alm_SP_Processo", "Alm_SP_Qualidade"]; // mesma regra do PCP para matéria-prima
const COR: Record<Severidade, string> = { critica: "bg-red-100 text-red-700 border-red-200", alta: "bg-orange-100 text-orange-700 border-orange-200", media: "bg-amber-100 text-amber-800 border-amber-200", baixa: "bg-sky-100 text-sky-700 border-sky-200", ok: "bg-emerald-100 text-emerald-700 border-emerald-200" };
const ZONA_COR: Record<Zona, string> = { vermelho: "bg-red-100 text-red-700 border-red-200", amarelo: "bg-amber-100 text-amber-800 border-amber-200", verde: "bg-emerald-100 text-emerald-700 border-emerald-200", excesso: "bg-violet-100 text-violet-700 border-violet-200" };
const ZONA_ROT: Record<Zona, string> = { vermelho: "Vermelho", amarelo: "Amarelo", verde: "Verde", excesso: "Excesso" };
const ROT: Record<Severidade, string> = { critica: "Crítica (≤14 dias)", alta: "Alta (≤30)", media: "Média (≤60)", baixa: "Baixa (>60)", ok: "Sem ruptura" };
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const fimDoMes = (mes: string) => { const d = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000) + 1;
const somaDiasIso = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
function csv(nome: string, cab: string[], linhas: unknown[][]) {
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ProjecaoCdPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [leadTime, setLeadTime] = useState("7");
  const [segCD, setSegCD] = useState("0");
  const [diasTransito, setDiasTransito] = useState("3");
  const [diasQual, setDiasQual] = useState("2");
  const [diasProc, setDiasProc] = useState("3");
  const [shelfMin, setShelfMin] = useState("30");
  const [zServ, setZServ] = useState("1.65");
  const [comCafe, setComCafe] = useState(false);
  const [filtro, setFiltro] = useState<Severidade | "TODOS">("TODOS");
  const [busca, setBusca] = useState("");
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [arq, setArq] = useState("");
  const [resC, setResC] = useState<ResultadoConsenso | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [mp, setMp] = useState<null | { faltas: { id: string; item: string; um: string; necessidade: number; saldo: number; usadoEm: string }[]; bloqueados: Map<string, number>; semBom: string[]; total: number }>(null);

  const dados = useQuery({
    enabled: pode, queryKey: ["proj-cd"], staleTime: 30_000,
    queryFn: async () => {
      const sb = supabase as any;
      const [{ data: lojas }, { data: cfg }, consenso, est, notas, prod] = await Promise.all([
        sb.from("abast_lojas").select("codigo, nome, almoxarifado").eq("ativo", true),
        sb.from("abast_config").select("chave, valor"),
        fetchAll<any>((f, t) => sb.from("abast_consenso").select("loja, id_produto, mes, unidades, tipo, produto").range(f, t)),
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, descricao, origem, quantidade, custo_unitario, data_validade").gt("quantidade", 0).range(f, t)),
        fetchAll<any>((f, t) => sb.from("notas_transferencia_recebimento").select("cod_prod, almox, qtd, recebimento, nota_cancelada").eq("recebimento", "Pendente").range(f, t)),
        fetchAll<any>((f, t) => sb.from("abast_produto").select("id_produto, full_case").range(f, t)),
      ]);
      const c = Object.fromEntries((cfg ?? []).map((x: any) => [x.chave, x.valor]));
      const cdAlmox = String(c.cd_almoxarifado || "Alm_SP_Fabrica");
      const desde = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10), desde90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [hist, baixas] = await Promise.all([
        fetchAll<any>((f, t) => sb.from("historico_consumo").select("origem, sku, data_movimento, quantidade").gte("data_movimento", desde).range(f, t)).catch(() => [] as any[]),
        fetchAll<any>((f, t) => sb.from("baixa_operacional").select("codigo_produto, quantidade, status_fluxo, data_solicitacao").eq("id_local", cdAlmox).or(`status_fluxo.eq.PENDENTE,data_solicitacao.gte.${desde90}`).range(f, t)).catch(() => [] as any[]),
      ]);
      return { lojas: (lojas ?? []) as { codigo: string; nome: string; almoxarifado: string }[], cd: String(c.cd_almoxarifado || "Alm_SP_Fabrica"), consenso, est, notas: notas.filter((n: any) => n.nota_cancelada !== "S"), prod, hist, baixas };
    },
  });

  const calc = useMemo(() => {
    const d = dados.data;
    if (!d || d.consenso.length === 0) return null;
    const ultimoMes = d.consenso.reduce((m: string, x: any) => (x.mes > m ? x.mes : m), "0000-00");
    const inicio = new Date().toLocaleDateString("en-CA");
    const N = diasEntre(inicio, fimDoMes(ultimoMes));
    if (N < 1) return { vazio: true as const, ultimoMes, inicio };
    const almoxDe = new Map(d.lojas.map((l) => [l.codigo, l.almoxarifado]));
    const lojaPorAlmox = new Map(d.lojas.map((l) => [l.almoxarifado, l.codigo]));
    const estPor = new Map<string, { cd: number; lojas: number; desc: string; custo: number; temRegistro: boolean }>();
    const canon = new Map<string, string>();
    for (const e of d.est) {
      const k = nk(e.id_produto), q = Number(e.quantidade) || 0;
      const o = estPor.get(k) ?? { cd: 0, lojas: 0, desc: "", custo: 0, temRegistro: true };
      if (e.origem === d.cd) o.cd += q;
      else if (lojaPorAlmox.has(e.origem)) o.lojas += q;
      if (!o.desc && e.descricao) o.desc = e.descricao;
      if (!o.custo && Number(e.custo_unitario) > 0) o.custo = Number(e.custo_unitario);
      estPor.set(k, o);
      if (!canon.has(k) || String(e.id_produto).length > canon.get(k)!.length) canon.set(k, String(e.id_produto));
    }
    const destino = (s: string) => { const t = s.toLowerCase(); return t.includes("eldorado") ? "ELDORADO" : t.includes("patio") ? "PATIO" : t.includes("itaim") ? "JESUINO" : t.includes("fabrica") ? "CD" : null; };
    const transitoLoja = new Map<string, number>(), entradaCD = new Map<string, number>();
    for (const n of d.notas) { const k = nk(n.cod_prod), q = Number(n.qtd) || 0, dest = destino(String(n.almox ?? "")); if (dest === "CD") entradaCD.set(k, (entradaCD.get(k) ?? 0) + q); else if (dest) transitoLoja.set(k, (transitoLoja.get(k) ?? 0) + q); }
    const fc = new Map<string, number>(d.prod.map((p: any) => [nk(p.id_produto), Number(p.full_case) || 1]));

    const porSku = new Map<string, { desc: string; tipo: string; porLoja: Record<string, Record<string, number>> }>();
    for (const r of d.consenso) {
      const k = nk(r.id_produto);
      const o = porSku.get(k) ?? { desc: r.produto ?? "", tipo: r.tipo ?? "", porLoja: {} as Record<string, Record<string, number>> };
      const pl = o.porLoja[r.loja] ?? (o.porLoja[r.loja] = {});
      pl[r.mes] = (pl[r.mes] ?? 0) + Number(r.unidades);
      porSku.set(k, o);
    }
    const lead = Math.max(0, Number(leadTime) || 0), seg = Math.max(0, Number(segCD) || 0), dTr = Math.max(0, Number(diasTransito) || 0);
    const projs: (ResultadoProjecao & { tipo: string; semRegistro: boolean; custo: number; trLojas: number; entCD: number })[] = [];
    for (const [k, o] of porSku) {
      if (!comCafe && o.tipo.toLowerCase().includes("cafeteria")) continue;
      const dem = new Array(N).fill(0);
      for (const porMes of Object.values(o.porLoja)) serieDiariaConsenso(porMes, inicio, N).forEach((v, i) => (dem[i] += v));
      if (dem.reduce((a, b) => a + b, 0) <= 0) continue;
      const e = estPor.get(k);
      const ent = entradaCD.get(k) ?? 0;
      const p = projetarCD({ sku: canon.get(k) ?? k, descricao: e?.desc || o.desc, estoqueCD: e?.cd ?? 0, estoqueLojas: e?.lojas ?? 0, emTransito: transitoLoja.get(k) ?? 0, producao: ent > 0 ? [{ data: somaDiasIso(inicio, dTr), qtd: ent }] : [], demandaDia: dem }, inicio);
      projs.push({ ...p, tipo: o.tipo, semRegistro: !e, custo: e?.custo ?? 0, trLojas: transitoLoja.get(k) ?? 0, entCD: ent });
    }
    // ───── Motor de reabastecimento: lotes com validade, venda real das lojas e baixas do CD ─────
    const lotes = { cd: new Map<string, Lote[]>(), proc: new Map<string, Lote[]>(), qual: new Map<string, Lote[]>() };
    for (const e of d.est) {
      const q = Number(e.quantidade) || 0; if (q <= 0) continue; const k = nk(e.id_produto);
      const alvo = e.origem === d.cd ? lotes.cd : e.origem === "Alm_SP_Processo" ? lotes.proc : e.origem === "Alm_SP_Qualidade" ? lotes.qual : null;
      if (alvo) (alvo.get(k) ?? alvo.set(k, []).get(k)!).push({ qtd: q, validade: e.data_validade ? String(e.data_validade).slice(0, 10) : null });
    }
    const vendas = new Map<string, Record<string, Record<string, number>>>(), primeira: Record<string, string> = {};
    for (const h of d.hist) {
      const lj = lojaPorAlmox.get(h.origem); if (!lj) continue; const dia = String(h.data_movimento).slice(0, 10);
      if (!primeira[lj] || dia < primeira[lj]) primeira[lj] = dia;
      const k = nk(h.sku); const m = vendas.get(k) ?? vendas.set(k, {}).get(k)!; const o = m[lj] ?? (m[lj] = {}); o[dia] = (o[dia] ?? 0) + (Number(h.quantidade) || 0);
    }
    const baixaPend = new Map<string, number>(), baixaTaxa = new Map<string, number>(); let aprQ = 0, repQ = 0;
    for (const b of d.baixas) {
      const k = nk(b.codigo_produto), q = Number(b.quantidade) || 0, st = String(b.status_fluxo);
      if (st === "PENDENTE") baixaPend.set(k, (baixaPend.get(k) ?? 0) + q);
      else if (st === "APROVADA" || st === "EXECUTADA") { baixaTaxa.set(k, (baixaTaxa.get(k) ?? 0) + q / 90); aprQ += q; }
      else if (st === "REPROVADA") repQ += q;
    }
    const probAprov = aprQ + repQ >= 50 ? Math.min(0.98, Math.max(0.5, aprQ / (aprQ + repQ))) : 0.9;
    const motor = new Map<string, ResultadoMotor & { tipo: string; custo: number }>();
    const pm = { leadTimeDias: lead, diasQualidade: Math.max(0, Number(diasQual) || 0), diasProcesso: Math.max(0, Number(diasProc) || 0), shelfMinimoDespacho: Math.max(0, Number(shelfMin) || 0), nivelServicoZ: Number(zServ) > 0 ? Number(zServ) : 1.65, segurancaExtraDias: seg, probAprovBaixa: probAprov };
    for (const [k, o] of porSku) {
      if (!comCafe && o.tipo.toLowerCase().includes("cafeteria")) continue;
      const dem = new Array(N).fill(0); const metaLoja: Record<string, number> = {};
      for (const [lj, porMes] of Object.entries(o.porLoja)) { const s = serieDiariaConsenso(porMes, inicio, N); s.forEach((v, i) => (dem[i] += v)); metaLoja[lj] = s.slice(0, 28).reduce((a, b) => a + b, 0) / Math.min(28, N); }
      if (dem.reduce((a, b) => a + b, 0) <= 0) continue;
      const e = estPor.get(k); const ent = entradaCD.get(k) ?? 0; const est = estimarDemandaReal(vendas.get(k) ?? {}, primeira, metaLoja, inicio);
      const r = planejarSku({ sku: canon.get(k) ?? k, descricao: e?.desc || o.desc, caixa: fc.get(k) ?? 1, lotesCD: lotes.cd.get(k) ?? [], processo: lotes.proc.get(k) ?? [], qualidade: lotes.qual.get(k) ?? [],
        notasCD: ent > 0 ? [{ data: somaDiasIso(inicio, dTr), qtd: ent }] : [], estoqueLojas: e?.lojas ?? 0, emTransitoLojas: transitoLoja.get(k) ?? 0, demandaMeta: dem, realDia: est.realDia, sigmaDia: est.sigmaDia,
        baixasPendentes: baixaPend.get(k) ?? 0, taxaBaixaDia: baixaTaxa.get(k) ?? 0, custo: e?.custo }, inicio, pm);
      if (r) motor.set(k, { ...r, tipo: o.tipo, custo: e?.custo ?? 0 });
    }
    const limite = somaDiasIso(inicio, 30); const plano: LinhaPlano[] = [];
    for (const [k, m] of motor) for (const o of m.ordens) if (o.liberar <= limite) plano.push({ sku: canon.get(k) ?? k, descricao: m.descricao, quantidade: o.quantidade, produzirAte: o.liberar, dataRuptura: m.dataRupturaCD ?? o.chegada, urgente: o.urgente, severidade: m.severidade });
    plano.sort((a, b) => a.produzirAte.localeCompare(b.produzirAte) || b.quantidade - a.quantidade);
    return { vazio: false as const, inicio, N, ultimoMes, projs, plano, almoxDe, motor, probAprov };
  }, [dados.data, leadTime, segCD, diasTransito, comCafe, diasQual, diasProc, shelfMin, zServ]);

  const projFiltradas = useMemo(() => {
    if (!calc || calc.vazio) return [];
    const q = busca.trim().toLowerCase();
    const ordem: Record<Severidade, number> = { critica: 0, alta: 1, media: 2, baixa: 3, ok: 4 };
    return calc.projs.filter((p) => (filtro === "TODOS" || p.severidade === filtro) && (!q || p.sku.includes(q) || p.descricao.toLowerCase().includes(q)))
      .sort((a, b) => ordem[a.severidade] - ordem[b.severidade] || (a.diasAteRuptura ?? 9999) - (b.diasAteRuptura ?? 9999) || b.deficit - a.deficit);
  }, [calc, filtro, busca]);

  const kpi = useMemo(() => {
    if (!calc || calc.vazio) return null;
    const rompem = calc.projs.filter((p) => p.dataRupturaCD);
    return { analisados: calc.projs.length, rompem: rompem.length, criticos: calc.projs.filter((p) => p.severidade === "critica").length, deficit: rompem.reduce((a, b) => a + b.deficit, 0), valor: rompem.reduce((a, b) => a + b.deficit * b.custo, 0), semRegistro: calc.projs.filter((p) => p.semRegistro).length,
      oculto: [...calc.motor.values()].filter((m) => m.riscoNaoPrevisto).length, perdaVenc: [...calc.motor.values()].reduce((a, m) => a + m.perdaVencimentoUn, 0), baixas: [...calc.motor.values()].reduce((a, m) => a + m.baixasPendentesEsperadas, 0),
      ordensHoje: [...calc.motor.values()].filter((m) => m.ordens[0]?.urgente).length, vermelhos: [...calc.motor.values()].filter((m) => m.zona === "vermelho").length };
  }, [calc]);
  const motorLista = useMemo(() => (calc && !calc.vazio ? projFiltradas.map((p) => calc.motor.get(nk(p.sku))).filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => a.prioridade - b.prioridade) : []), [calc, projFiltradas]);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setArq(f.name); setResC(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const conhecidos = new Set<string>((dados.data?.est ?? []).map((x: any) => String(x.id_produto)));
      setResC(interpretarConsenso(wb.SheetNames.map((n) => ({ nome: n, aoa: aoaDaAbaConsenso(wb.Sheets[n]) })), { conhecidos }));
    } catch (err: any) { toast.error("Não consegui ler o consenso: " + (err?.message ?? err)); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  }
  async function aplicar() {
    if (!resC || resC.bloqueios.length > 0) return;
    setAplicando(true);
    try {
      const itens = resC.itens.map((i) => ({ loja: i.loja, id_produto: i.id_produto, mes: i.mes, canal: i.canal || "PDV", unidades: i.unidades, tipo: i.tipo, produto: i.produto }));
      const { data, error } = await (supabase as any).rpc("abast_aplicar_consenso", { p_arquivo: arq, p_itens: itens });
      if (error) throw error;
      toast.success(`Consenso aplicado: ${data?.linhas ?? 0} linhas.`);
      setResC(null); setArq(""); setMp(null);
      qc.invalidateQueries({ queryKey: ["proj-cd"] });
    } catch (err: any) { toast.error("Falha ao aplicar o consenso: " + (err?.message ?? err)); }
    finally { setAplicando(false); }
  }

  const planoSel = useMemo(() => (calc && !calc.vazio ? calc.plano.filter((l) => !fora.has(l.sku)) : []), [calc, fora]);
  async function verificarMp() {
    if (!dados.data || planoSel.length === 0) return;
    setVerificando(true);
    try {
      const bom = (await carregarBomCompleta()) as BomLinha[];
      const saldos: Record<string, number> = {};
      const sb = supabase as any;
      const est = await fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, quantidade, origem").in("origem", ORIGENS_PROD).order("id_produto").range(f, t));
      for (const r of est) saldos[r.id_produto] = (saldos[r.id_produto] ?? 0) + Number(r.quantidade || 0);
      const itens = explodirSimulacao(paraPcp(planoSel), bom, saldos);
      const agg = new Map<string, { id: string; item: string; um: string; tipo: string; necessidade: number; contribs: any[] }>();
      for (const n of itens) { const a = agg.get(n.id_item) ?? { id: n.id_item, item: n.item ?? n.id_item, um: n.um ?? "", tipo: n.tipo, necessidade: 0, contribs: [] }; a.necessidade += n.necessidade; a.contribs.push(...n.contribs); agg.set(n.id_item, a); }
      const faltas: { id: string; item: string; um: string; necessidade: number; saldo: number; usadoEm: string }[] = [];
      const bloqueados = new Map<string, number>(); const comBom = new Set<string>();
      for (const a of agg.values()) for (const c of a.contribs) comBom.add(c.id_produto);
      for (const a of agg.values()) {
        if (a.tipo !== "Matéria-Prima") continue;
        const saldo = saldos[a.id] ?? 0;
        if (saldo - a.necessidade >= 0) continue;
        const prods = [...new Set(a.contribs.map((c: any) => c.id_produto as string))];
        for (const p of prods) bloqueados.set(p, (bloqueados.get(p) ?? 0) + 1);
        faltas.push({ id: a.id, item: a.item, um: a.um, necessidade: a.necessidade, saldo, usadoEm: prods.slice(0, 3).join(", ") + (prods.length > 3 ? "…" : "") });
      }
      faltas.sort((x, y) => (x.saldo - x.necessidade) - (y.saldo - y.necessidade));
      setMp({ faltas, bloqueados, semBom: planoSel.filter((l) => !comBom.has(l.sku)).map((l) => l.sku), total: agg.size });
    } catch (err: any) { toast.error("Não consegui checar a matéria-prima: " + (err?.message ?? err)); }
    finally { setVerificando(false); }
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const mesesNoArquivo = resC ? resC.meses : [];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingDown className="size-6" /> Projeção do CD e Plano de Produção</h1>
        <p className="text-sm text-muted-foreground">
          Usa a <strong>meta (consenso)</strong> das lojas para prever quando cada SKU acaba no CD <strong>{dados.data?.cd}</strong>, descontando o que as lojas já têm e o que está em trânsito, e monta um plano de produção. A matéria-prima é checada com o mesmo motor de ficha técnica do PCP.
          A meta cobre só as lojas (PDV): outros canais que o CD abasteça não entram.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Consenso mensal (meta da diretoria)</CardTitle>
            <CardDescription>Envie o <code>Consenso_Mensal.xlsx</code> (SKU Sistema, Almox, Canal e um mês por coluna). A carga substitui o consenso das lojas que estiverem no arquivo.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={aoEscolher} />
              <Button onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="size-4" /> Escolher consenso</Button>
              {arq && <span className="text-sm text-muted-foreground">{arq}</span>}
            </div>
            {resC && (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                {resC.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800"><strong>Bloqueio:</strong> {resC.bloqueios.join(" ")}</div>}
                {resC.itens.length > 0 && <>
                  <p>Aba <strong>{resC.aba}</strong> · {resC.itens.length} valores · meses {mesesNoArquivo.join(", ")}</p>
                  <Table><TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Com meta</TableHead>{mesesNoArquivo.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>{Object.entries(resC.porLoja).map(([l, o]) => <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{o.skus}</TableCell><TableCell className="text-right">{o.comMeta}</TableCell>{mesesNoArquivo.map((m) => <TableCell key={m} className="text-right">{un(o.unidadesPorMes[m] ?? 0)}</TableCell>)}</TableRow>)}</TableBody></Table>
                </>}
                {resC.alertas.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"><strong>Pontos de atenção no arquivo:</strong><ul className="list-disc pl-5">{resC.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
                {resC.pendencias.length > 0 && <details><summary className="cursor-pointer font-medium">{resC.pendencias.length} linha(s) ignorada(s)</summary><ul className="mt-1 max-h-40 overflow-auto text-xs">{resC.pendencias.slice(0, 40).map((p, i) => <li key={i}>linha {p.linha}, {p.campo}: "{p.valor}": {p.motivo}</li>)}</ul></details>}
                <div className="flex justify-end"><Button onClick={aplicar} disabled={aplicando || resC.bloqueios.length > 0}>{aplicando ? "Aplicando..." : "Aplicar consenso"}</Button></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!dados.isLoading && (!calc || calc.vazio) && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900">{calc && calc.vazio ? `O consenso carregado termina em ${calc.ultimoMes}, antes de hoje. Envie um consenso atual.` : "Ainda não há consenso carregado. Um administrador precisa enviar o Consenso_Mensal.xlsx."}</CardContent></Card>
      )}

      {calc && !calc.vazio && kpi && (<>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
          <Kpi t="SKUs analisados" v={String(kpi.analisados)} />
          <Kpi t="Rompem no CD" v={`${kpi.rompem} (${kpi.analisados ? Math.round((kpi.rompem / kpi.analisados) * 100) : 0}%)`} tom="text-red-600" />
          <Kpi t="Críticos (≤14 dias)" v={String(kpi.criticos)} tom="text-red-600" />
          <Kpi t="Déficit até o fim da meta" v={`${un(kpi.deficit)} un`} />
          <Kpi t="Valor do déficit (custo)" v={formatBRL(kpi.valor)} />
          <Kpi t="Sem registro de estoque" v={String(kpi.semRegistro)} tom="text-amber-600" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi t="Zona vermelha (buffer)" v={String(kpi.vermelhos)} tom="text-red-600" />
          <Kpi t="Ordens a liberar hoje" v={String(kpi.ordensHoje)} tom="text-red-600" />
          <Kpi t="Risco fora da previsão (estresse)" v={String(kpi.oculto)} tom="text-orange-600" />
          <Kpi t="Perda prevista por validade" v={`${un(kpi.perdaVenc)} un`} tom="text-violet-600" />
          <Kpi t="Baixas pendentes esperadas" v={`${un(kpi.baixas)} un`} />
        </div>

        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground mb-1">Prazo de produção (dias)</div><Input className="w-28" inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Segurança do CD (dias)</div><Input className="w-28" inputMode="numeric" value={segCD} onChange={(e) => setSegCD(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Chegada das notas ao CD (dias)</div><Input className="w-28" inputMode="numeric" value={diasTransito} onChange={(e) => setDiasTransito(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Liberação da Qualidade (dias)</div><Input className="w-28" inputMode="numeric" value={diasQual} onChange={(e) => setDiasQual(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Processo → disponível (dias)</div><Input className="w-28" inputMode="numeric" value={diasProc} onChange={(e) => setDiasProc(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Shelf mínimo p/ despacho (dias)</div><Input className="w-28" inputMode="numeric" value={shelfMin} onChange={(e) => setShelfMin(e.target.value)} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Nível de serviço (z)</div><Input className="w-28" inputMode="decimal" value={zServ} onChange={(e) => setZServ(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={comCafe} onChange={(e) => setComCafe(e.target.checked)} /> incluir cafeteria</label>
          <span className="text-xs text-muted-foreground">Horizonte: de {dataBr(calc.inicio)} até {dataBr(fimDoMes(calc.ultimoMes))} ({calc.N} dias)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["TODOS", "critica", "alta", "media", "baixa", "ok"] as const).map((s) => (
            <button key={s} onClick={() => setFiltro(s)} className={`rounded-full border px-3 py-1 text-xs ${filtro === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>
              {s === "TODOS" ? "Todos" : ROT[s]}{s !== "TODOS" ? ` (${calc.projs.filter((p) => p.severidade === s).length})` : ""}
            </button>))}
          <Input className="h-8 w-56" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={() => csv(`Projecao_CD_${calc.inicio}.csv`, ["SKU", "Produto", "Severidade", "Estoque CD", "Estoque lojas", "Em trânsito (lojas)", "Entrada no CD (notas)", "Demanda no período", "Ruptura do CD", "Dias até a ruptura", "Déficit (un)"], projFiltradas.map((p) => [p.sku, p.descricao, ROT[p.severidade], Math.round(p.estoqueCD), Math.round(p.estoqueLojas), p.trLojas, p.entCD, Math.round(p.demandaTotal), p.dataRupturaCD ?? "", p.diasAteRuptura ?? "", Math.round(p.deficit)]))}><Download className="size-4" /> CSV da projeção</Button>
        </div>

        <Card><CardContent className="p-0 overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Risco</TableHead><TableHead className="text-right">CD</TableHead><TableHead className="text-right">Lojas</TableHead><TableHead className="text-right">Trânsito</TableHead><TableHead className="text-right">Demanda</TableHead><TableHead className="text-right">Ruptura do CD</TableHead><TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Déficit</TableHead></TableRow></TableHeader>
          <TableBody>
            {projFiltradas.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum SKU neste filtro.</TableCell></TableRow>}
            {projFiltradas.slice(0, 400).map((p) => (
              <TableRow key={p.sku}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="max-w-[260px] truncate">{p.descricao || "—"}{p.semRegistro && <span className="ml-1 text-[10px] text-amber-600">sem registro de estoque</span>}</TableCell>
                <TableCell><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${COR[p.severidade]}`}>{ROT[p.severidade]}</span></TableCell>
                <TableCell className="text-right">{un(p.estoqueCD)}</TableCell><TableCell className="text-right">{un(p.estoqueLojas)}</TableCell><TableCell className="text-right">{p.trLojas + p.entCD > 0 ? `${un(p.trLojas)}${p.entCD ? ` (+${un(p.entCD)} CD)` : ""}` : "—"}</TableCell>
                <TableCell className="text-right">{un(p.demandaTotal)}</TableCell><TableCell className="text-right font-semibold">{dataBr(p.dataRupturaCD)}</TableCell><TableCell className="text-right">{p.diasAteRuptura ?? "—"}</TableCell><TableCell className="text-right font-semibold">{p.deficit > 0 ? un(p.deficit) : "—"}</TableCell>
              </TableRow>))}
          </TableBody></Table></CardContent></Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Motor de reabastecimento do CD</CardTitle>
            <CardDescription>Buffers por SKU (vermelho/amarelo/verde) sobre o fluxo líquido, com validade (FEFO e shelf mínimo), baixas e estoque em processo. <b>Ruptura em estresse</b> = demanda +σ, baixas pendentes aprovadas e atraso de produção: a ruptura que a previsão de consumo não enxerga. Aprovação de baixa assumida: {Math.round(calc.probAprov * 100)}% (histórico do CD).</CardDescription></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="flex justify-end p-2"><Button size="sm" variant="outline" className="gap-1" onClick={() => csv(`Motor_CD_${calc.inicio}.csv`, ["SKU", "Produto", "Zona", "Fluxo líquido", "Vermelho", "Amarelo", "Topo", "Utilizável", "Bloqueado shelf", "Em processo", "Qualidade", "Notas ao CD", "Perda por validade", "Baixas pendentes", "Ruptura prevista", "Ruptura em estresse", "Risco fora da previsão", "Qtd proteção", "Próxima ordem (un)", "Liberar", "Chega"], motorLista.map((m) => [m.sku, m.descricao, ZONA_ROT[m.zona], Math.round(m.nfp), Math.round(m.red), Math.round(m.red + m.yellow), Math.round(m.tog), Math.round(m.usavelHoje), Math.round(m.bloqueadoShelf), Math.round(m.wip), Math.round(m.qualidade), Math.round(m.notas), Math.round(m.perdaVencimentoUn), Math.round(m.baixasPendentesEsperadas), m.dataRupturaCD ?? "", m.dataRupturaEstresse ?? "", m.riscoNaoPrevisto ? "sim" : "não", m.qtdProtecao, m.ordens[0]?.quantidade ?? "", m.ordens[0]?.liberar ?? "", m.ordens[0]?.chegada ?? ""]))}><Download className="size-4" /> CSV do motor</Button></div>
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Zona</TableHead><TableHead className="text-right">Fluxo líquido</TableHead><TableHead className="text-right">Verm. / Amar. / Topo</TableHead><TableHead className="text-right">Utilizável (shelf)</TableHead><TableHead className="text-right">A receber</TableHead><TableHead className="text-right">Perda validade</TableHead><TableHead className="text-right">Baixas pend.</TableHead><TableHead>Ruptura prevista</TableHead><TableHead>Em estresse</TableHead><TableHead>Próxima ordem</TableHead></TableRow></TableHeader>
              <TableBody>{motorLista.map((m) => (
                <TableRow key={m.sku}>
                  <TableCell className="font-mono text-xs">{m.sku}</TableCell><TableCell className="max-w-[240px] truncate" title={m.descricao}>{m.descricao}</TableCell>
                  <TableCell><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ZONA_COR[m.zona]}`}>{ZONA_ROT[m.zona]} · {Math.round(m.prioridade)}%</span></TableCell>
                  <TableCell className="text-right">{un(m.nfp)}</TableCell><TableCell className="text-right text-xs text-muted-foreground">{un(m.red)} / {un(m.red + m.yellow)} / {un(m.tog)}</TableCell>
                  <TableCell className="text-right">{un(m.usavelHoje)}{m.bloqueadoShelf > 0 && <span className="ml-1 text-[11px] text-violet-600" title="bloqueado por shelf mínimo">(+{un(m.bloqueadoShelf)} bloq.)</span>}</TableCell>
                  <TableCell className="text-right">{un(m.wip + m.qualidade + m.notas)}</TableCell>
                  <TableCell className={`text-right ${m.perdaVencimentoUn > 0 ? "font-semibold text-violet-600" : ""}`}>{m.perdaVencimentoUn > 0 ? un(m.perdaVencimentoUn) : "—"}</TableCell>
                  <TableCell className={`text-right ${m.baixasPendentesEsperadas > 0 ? "font-semibold text-orange-600" : ""}`}>{m.baixasPendentesEsperadas > 0 ? un(m.baixasPendentesEsperadas) : "—"}</TableCell>
                  <TableCell>{dataBr(m.dataRupturaCD)}</TableCell>
                  <TableCell className={m.riscoNaoPrevisto ? "font-semibold text-orange-600" : ""}>{dataBr(m.dataRupturaEstresse)}{m.riscoNaoPrevisto && " ⚠"}</TableCell>
                  <TableCell>{m.ordens[0] ? <span className={m.ordens[0].urgente ? "font-semibold text-red-600" : ""}>{un(m.ordens[0].quantidade)} un · liberar {dataBr(m.ordens[0].liberar)}{m.ordens[0].atrasoDias > 0 && ` (chega ${m.ordens[0].atrasoDias} d depois do necessário)`}</span> : "—"}</TableCell>
                </TableRow>))}
                {motorLista.length === 0 && <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Nenhum SKU neste filtro.</TableCell></TableRow>}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Plano de produção sugerido</CardTitle>
            <CardDescription>Ordens planejadas pelo motor: campanhas por ciclo de produção, liberadas com antecedência igual ao prazo (produção + qualidade), em múltiplos da caixa e limitadas à cobertura máxima. Mostra as liberações dos próximos 30 dias. Desmarque o que não quiser produzir e verifique a matéria-prima.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={verificarMp} disabled={verificando || planoSel.length === 0} className="gap-2"><FlaskConical className="size-4" /> {verificando ? "Checando..." : `Verificar matéria-prima (${planoSel.length} SKUs)`}</Button>
              <Button variant="outline" className="gap-1" onClick={() => csv(`Plano_Producao_${calc.inicio}.csv`, ["SKU", "Produto", "Quantidade", "Produzir até", "Ruptura prevista", "Urgente", "Matéria-prima insuficiente (itens)"], planoSel.map((l) => [l.sku, l.descricao, l.quantidade, l.produzirAte, l.dataRuptura, l.urgente ? "SIM" : "", mp ? (mp.bloqueados.get(l.sku) ?? 0) : ""]))}><Download className="size-4" /> CSV do plano</Button>
            </div>
            <Table><TableHeader><TableRow><TableHead className="w-8" /><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Produzir</TableHead><TableHead className="text-right">Produzir até</TableHead><TableHead className="text-right">Ruptura</TableHead>{mp && <TableHead>Matéria-prima</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {calc.plano.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma ruptura prevista: não há o que produzir.</TableCell></TableRow>}
                {calc.plano.map((l) => (
                  <TableRow key={l.sku} className={fora.has(l.sku) ? "opacity-40" : ""}>
                    <TableCell><input type="checkbox" checked={!fora.has(l.sku)} onChange={() => { const n = new Set(fora); if (n.has(l.sku)) n.delete(l.sku); else n.add(l.sku); setFora(n); setMp(null); }} /></TableCell>
                    <TableCell className="font-mono text-xs">{l.sku}</TableCell><TableCell className="max-w-[260px] truncate">{l.descricao || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{un(l.quantidade)}</TableCell>
                    <TableCell className="text-right">{dataBr(l.produzirAte)}{l.urgente && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">URGENTE</span>}</TableCell>
                    <TableCell className="text-right">{dataBr(l.dataRuptura)}</TableCell>
                    {mp && <TableCell className="text-xs">{mp.semBom.includes(l.sku) ? <span className="text-amber-600">sem ficha técnica: não verificável</span> : (mp.bloqueados.get(l.sku) ?? 0) > 0 ? <span className="text-red-600 font-semibold">{mp.bloqueados.get(l.sku)} MP insuficiente(s)</span> : <span className="text-emerald-600">MP suficiente</span>}</TableCell>}
                  </TableRow>))}
              </TableBody></Table>
            {mp && (
              <div className="rounded-md border p-3 text-sm space-y-2">
                <p><strong>{mp.faltas.length}</strong> matéria(s)-prima(s) insuficiente(s) em {mp.total} itens explodidos (saldo de Fábrica + Processo + Qualidade, como no PCP){mp.semBom.length > 0 ? ` · ${mp.semBom.length} SKU(s) sem ficha técnica` : ""}.</p>
                {mp.faltas.length > 0 && <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Matéria-prima</TableHead><TableHead className="text-right">Necessidade</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">Falta</TableHead><TableHead>Usada em</TableHead></TableRow></TableHeader>
                  <TableBody>{mp.faltas.slice(0, 60).map((f) => <TableRow key={f.id}><TableCell className="font-mono text-xs">{f.id}</TableCell><TableCell className="max-w-[240px] truncate">{f.item}</TableCell><TableCell className="text-right">{un(f.necessidade)} {f.um}</TableCell><TableCell className="text-right">{un(f.saldo)}</TableCell><TableCell className="text-right font-semibold text-red-600">{un(f.necessidade - f.saldo)}</TableCell><TableCell className="text-xs font-mono">{f.usadoEm}</TableCell></TableRow>)}</TableBody></Table>}
              </div>)}
          </CardContent>
        </Card>
      </>)}
    </div>
  );
}

function Kpi({ t, v, tom }: { t: string; v: string; tom?: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground truncate">{t}</div><div className={`text-lg font-bold mt-1 ${tom ?? ""}`}>{v}</div></CardContent></Card>;
}
