import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, Download, Factory, ShoppingCart, Gauge, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acoesRecomendadas, matrizMps, mrpPorSemana, proximasSemanas, segundaDe, type OrdemMps } from "@/lib/pcp-plano";
import { Secao, Th } from "@/components/abast-dash/comum";
import { FichaItem, type ContextoFicha, type LinhaFicha } from "@/components/pcp/FichaItem";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { interpretarConsenso, aoaDaAbaConsenso, serieDiariaConsenso, type ResultadoConsenso } from "@/lib/abastecimento-consenso";
import { projetarCD, type ResultadoProjecao, type Severidade, type LinhaPlano } from "@/lib/abastecimento-projecao";
import { planejarSku, estimarDemandaReal, cargaSemanal, semanaDeProducao, type ResultadoMotor, type Lote, type Zona } from "@/lib/abastecimento-cd-motor";
import { somasRealizacao } from "@/lib/abastecimento-realizacao";
import { carregarBomCompleta, type BomLinha } from "@/lib/pcp-bom";
import { fichaPorUnidade } from "@/lib/pcp-ficha";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/projecao-cd")({
  component: ProjecaoCdPage,
  head: () => ({ meta: [{ title: "PCP · Projeção do CD, Plano de Produção e Compras" }] }),
});

const nk = (s: unknown) => String(s ?? "").replace(/^0+/, "");
const ORIGENS_PROD = ["Alm_SP_Fabrica", "Alm_SP_Processo", "Alm_SP_Qualidade"]; // mesma regra do PCP para matéria-prima
const COR: Record<Severidade, string> = { critica: "bg-red-100 text-red-700 border-red-200", alta: "bg-orange-100 text-orange-700 border-orange-200", media: "bg-amber-100 text-amber-800 border-amber-200", baixa: "bg-sky-100 text-sky-700 border-sky-200", ok: "bg-emerald-100 text-emerald-700 border-emerald-200" };
const ZONA_COR: Record<Zona, string> = { vermelho: "bg-red-100 text-red-700 border-red-200", amarelo: "bg-amber-100 text-amber-800 border-amber-200", verde: "bg-emerald-100 text-emerald-700 border-emerald-200", excesso: "bg-violet-100 text-violet-700 border-violet-200" };
const ZONA_ROT: Record<Zona, string> = { vermelho: "Vermelho", amarelo: "Amarelo", verde: "Verde", excesso: "Excesso" };
const ROT: Record<Severidade, string> = { critica: "Crítica (≤14 dias)", alta: "Alta (≤30)", media: "Média (≤60)", baixa: "Baixa (>60)", ok: "Sem ruptura" };
type LinhaPlanoCiclo = LinhaPlano & { foraDoCiclo?: boolean };
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
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
  const [diaRev, setDiaRev] = useState("5");          // dia da revisão semanal do plano (5 = sexta); "" = libera em qualquer dia
  const [capSem, setCapSem] = useState("2779");       // capacidade semanal de referência (un): mediana de 16 semanas, estimada pela ficha técnica
  const [filtro, setFiltro] = useState<Severidade | "TODOS">("TODOS");
  const [busca, setBusca] = useState("");
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [arq, setArq] = useState("");
  const [resC, setResC] = useState<ResultadoConsenso | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [leadCompra, setLeadCompra] = useState("15");    // lead time de compra de matéria-prima (dias)
  const [nSemanas, setNSemanas] = useState(8);          // horizonte do plano mestre (semanas)
  const [verPremissas, setVerPremissas] = useState(false);
  const [ficha, setFicha] = useState<ContextoFicha | null>(null);   // ficha do item (história, lotes, materiais, capacidade)
  const [abertas, setAbertas] = useState<Set<number>>(new Set()); // decisões expandidas

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
    const motor = new Map<string, ResultadoMotor & { tipo: string; custo: number; realizacao: number | null; demandaHorizonte: number }>();
    const demSemana = new Map<string, number>(); let totReal = 0, totMalha = 0;
    const pm = { leadTimeDias: lead, diasQualidade: Math.max(0, Number(diasQual) || 0), diasProcesso: Math.max(0, Number(diasProc) || 0), shelfMinimoDespacho: Math.max(0, Number(shelfMin) || 0), nivelServicoZ: Number(zServ) > 0 ? Number(zServ) : 1.65, segurancaExtraDias: seg, probAprovBaixa: probAprov, diaRevisao: diaRev === "" ? null : Number(diaRev) };
    for (const [k, o] of porSku) {
      if (!comCafe && o.tipo.toLowerCase().includes("cafeteria")) continue;
      const dem = new Array(N).fill(0); const metaLoja: Record<string, number> = {};
      for (const [lj, porMes] of Object.entries(o.porLoja)) { const s = serieDiariaConsenso(porMes, inicio, N); s.forEach((v, i) => (dem[i] += v)); metaLoja[lj] = s.slice(0, 28).reduce((a, b) => a + b, 0) / Math.min(28, N); }
      if (dem.reduce((a, b) => a + b, 0) <= 0) continue;
      const e = estPor.get(k); const ent = entradaCD.get(k) ?? 0; const est = estimarDemandaReal(vendas.get(k) ?? {}, primeira, metaLoja, inicio);
      // realização = venda real ÷ malha linear do consenso (meta ÷ dias do mês), nos mesmos dias passados e só nas lojas com histórico
      let sReal = 0, sMalha = 0; const ontem = somaDiasIso(inicio, -1);
      for (const [lj, porMes] of Object.entries(o.porLoja)) { const s = somasRealizacao((vendas.get(k) ?? {})[lj] ?? {}, porMes, ontem, { janela: 28, inicioHistorico: primeira[lj] }); if (s.dias >= 7) { sReal += s.real; sMalha += s.malha; } }
      const realizacao = sMalha > 0 ? sReal / sMalha : null;
      totReal += sReal; totMalha += sMalha;
      dem.forEach((v, i) => { if (v > 0) { const w = segundaDe(somaDiasIso(inicio, i)); demSemana.set(w, (demSemana.get(w) ?? 0) + v); } });
      const r = planejarSku({ sku: canon.get(k) ?? k, descricao: e?.desc || o.desc, caixa: fc.get(k) ?? 1, lotesCD: lotes.cd.get(k) ?? [], processo: lotes.proc.get(k) ?? [], qualidade: lotes.qual.get(k) ?? [],
        notasCD: ent > 0 ? [{ data: somaDiasIso(inicio, dTr), qtd: ent }] : [], estoqueLojas: e?.lojas ?? 0, emTransitoLojas: transitoLoja.get(k) ?? 0, demandaMeta: dem, realizacao, sigmaDia: est.sigmaDia,
        baixasPendentes: baixaPend.get(k) ?? 0, taxaBaixaDia: baixaTaxa.get(k) ?? 0, custo: e?.custo }, inicio, pm);
      if (r) motor.set(k, { ...r, tipo: o.tipo, custo: e?.custo ?? 0, realizacao, demandaHorizonte: dem.reduce((a, b) => a + b, 0) });
    }
    const limite = somaDiasIso(inicio, 30); const plano: LinhaPlanoCiclo[] = [];
    for (const [k, m] of motor) for (const o of m.ordens) if (o.liberar <= limite) plano.push({ sku: canon.get(k) ?? k, descricao: m.descricao, quantidade: o.quantidade, produzirAte: o.liberar, dataRuptura: m.dataRupturaCD ?? o.chegada, urgente: o.urgente, foraDoCiclo: o.foraDoCiclo, severidade: m.severidade });
    plano.sort((a, b) => a.produzirAte.localeCompare(b.produzirAte) || b.quantidade - a.quantidade);
    // Todas as ordens do horizonte (plano mestre e compras); o plano de 30 dias continua para a lista detalhada.
    const ordensTodas: OrdemMps[] = [];
    for (const [k, m] of motor) for (const o of m.ordens) ordensTodas.push({ sku: canon.get(k) ?? k, descricao: m.descricao, quantidade: o.quantidade, liberar: o.liberar, urgente: o.urgente });
    return { vazio: false as const, inicio, N, ultimoMes, projs, plano, almoxDe, motor, probAprov, ordensTodas, demSemana, realizacaoGeral: totMalha > 0 ? totReal / totMalha : null };
  }, [dados.data, leadTime, segCD, diasTransito, comCafe, diasQual, diasProc, shelfMin, zServ, diaRev]);

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
      setResC(null); setArq("");
      qc.invalidateQueries({ queryKey: ["proj-cd"] });
    } catch (err: any) { toast.error("Falha ao aplicar o consenso: " + (err?.message ?? err)); }
    finally { setAplicando(false); }
  }

  // ───── Plano mestre (MPS), carga x capacidade e plano de compras (MRP) ─────
  const ordensSel = useMemo(() => (calc && !calc.vazio ? calc.ordensTodas.filter((o) => !fora.has(o.sku)) : []), [calc, fora]);
  // a primeira semana do plano é a semana de produção de quem liberar hoje (no fim de semana, já é a próxima)
  const semanas = useMemo(() => (calc && !calc.vazio ? proximasSemanas(semanaDeProducao(calc.inicio), nSemanas) : []), [calc, nSemanas]);
  const mps = useMemo(() => matrizMps(ordensSel, semanas), [ordensSel, semanas]);
  const cap = Number(capSem) || 0;
  const carga = useMemo(() => {
    const c = cargaSemanal(ordensSel.map((o) => ({ liberar: o.liberar, quantidade: o.quantidade, sku: o.sku })), cap);
    return semanas.map((s, i) => { const x = c.find((y) => y.semana === s); const un = mps.totais[i] ?? 0; return { semana: s, unidades: un, ordens: x?.ordens ?? 0, skus: x?.skus ?? 0, pct: cap > 0 ? (un / cap) * 100 : null }; });
  }, [ordensSel, semanas, mps, cap]);
  const grafico = useMemo(() => (calc && !calc.vazio ? carga.map((c) => ({ semana: dataBr(c.semana).slice(0, 5), producao: Math.round(c.unidades), demanda: Math.round(calc.demSemana.get(c.semana) ?? 0), capacidade: cap || null })) : []), [calc, carga, cap]);
  const bomQ = useQuery({
    enabled: pode && !!calc && !calc.vazio, queryKey: ["proj-cd-bom"], staleTime: 10 * 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const [bom, est] = await Promise.all([
        carregarBomCompleta() as Promise<BomLinha[]>,
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, quantidade, origem, custo_unitario").in("origem", ORIGENS_PROD).order("id_produto").range(f, t)),
      ]);
      const saldos: Record<string, number> = {}, custos: Record<string, number> = {};
      for (const r of est) { saldos[r.id_produto] = (saldos[r.id_produto] ?? 0) + Number(r.quantidade || 0); if (!custos[r.id_produto] && Number(r.custo_unitario) > 0) custos[r.id_produto] = Number(r.custo_unitario); }
      return { bom, saldos, custos };
    },
  });
  const mrp = useMemo(() => {
    if (!bomQ.data || !calc || calc.vazio || !ordensSel.length) return null;
    try { return mrpPorSemana(ordensSel, bomQ.data.bom, bomQ.data.saldos, bomQ.data.custos, { leadCompraDias: Math.max(0, Number(leadCompra) || 0), hoje: calc.inicio }); }
    catch { return null; }
  }, [bomQ.data, calc, ordensSel, leadCompra]);
  const comprasFalta = useMemo(() => (mrp ? mrp.itens.filter((i) => i.falta > 0) : []), [mrp]);
  const acoes = useMemo(() => {
    if (!calc || calc.vazio || !kpi) return [];
    const m = [...calc.motor.values()];
    return acoesRecomendadas({
      ordensHoje: m.filter((x) => x.ordens[0]?.urgente).map((x) => ({ sku: x.sku, descricao: x.descricao, quantidade: x.ordens[0].quantidade })),
      carga: carga.map((c) => ({ semana: c.semana, unidades: c.unidades, pct: c.pct })), capacidade: cap,
      compras: comprasFalta, perdaValidade: m.filter((x) => x.perdaVencimentoUn > 0).sort((a, b) => b.perdaVencimentoUn - a.perdaVencimentoUn).map((x) => ({ sku: x.sku, descricao: x.descricao, un: x.perdaVencimentoUn })),
      semRegistro: calc.projs.filter((p) => p.semRegistro).map((p) => ({ sku: p.sku, descricao: p.descricao })),
      realizacao: calc.realizacaoGeral,
      semBom: (mrp?.semBom ?? []).map((k) => ({ sku: k, descricao: calc.motor.get(nk(k))?.descricao ?? ordensSel.find((o) => o.sku === k)?.descricao ?? "" })),
      realizacaoSkus: m.filter((x) => x.realizacao != null).map((x) => ({ sku: x.sku, descricao: x.descricao, realizacao: x.realizacao! })),
    });
  }, [calc, kpi, carga, cap, comprasFalta, mrp, ordensSel]);
  // Abre a ficha completa de um SKU (vendas, lotes, materiais e capacidade) ou de uma matéria-prima (consumo em OP, lotes e compra).
  const abrirSku = (sku: string, descricao?: string) => {
    if (!calc || calc.vazio) return;
    const k = nk(sku), m = calc.motor.get(k), p = calc.projs.find((x) => nk(x.sku) === k), l = mps.linhas.find((x) => nk(x.sku) === k);
    setFicha({ tipo: "sku", id: m?.sku ?? p?.sku ?? sku, descricao: descricao || m?.descricao || p?.descricao || "", hoje: calc.inicio, cdAlmox: dados.data?.cd ?? "Alm_SP_Fabrica",
      motor: m ? { adu: m.adu, usavelHoje: m.usavelHoje, zona: m.zona, dataRupturaCD: m.dataRupturaCD, ordens: m.ordens, wip: m.wip, qualidade: m.qualidade, notas: m.notas, perdaVencimentoUn: m.perdaVencimentoUn } : null,
      proj: p ? { estoqueCD: p.estoqueCD, estoqueLojas: p.estoqueLojas, trLojas: p.trLojas, deficit: p.deficit, dataRupturaCD: p.dataRupturaCD, demandaTotal: p.demandaTotal, severidade: p.severidade } : null,
      realizacao: m?.realizacao ?? null,
      plano: { semanas, totais: mps.totais, porSemanaSku: l?.porSemana ?? semanas.map(() => 0), capacidade: cap, diasQualidade: Number(diasQual) || 0, diasProcesso: Number(diasProc) || 0 },
      materiais: (mrp?.itens ?? []).filter((x) => x.usadoEm.some((u) => nk(u) === k)),
      ficha: fichaTecnica(m?.sku ?? p?.sku ?? sku, descricao || m?.descricao || p?.descricao || "", l?.total ?? 0),
      semFicha: (mrp?.semBom ?? []).some((u) => nk(u) === k) });
  };
  // Ficha técnica completa do produto (todos os níveis), pela árvore do próprio produto, para a quantidade do plano.
  const fichaTecnica = (sku: string, _nome: string, qtdPlano: number) => {
    const bom = bomQ.data?.bom; if (!bom) return null;
    const base = qtdPlano > 0 ? qtdPlano : 1;
    const comp = fichaPorUnidade(bom as any, sku);
    const linhas: LinhaFicha[] = comp.map((c) => ({ ...c, necessidade: c.porUn * base, saldo: bomQ.data?.saldos[c.id] ?? 0 }));
    return { qtdBase: base, baseEhPlano: qtdPlano > 0, linhas };
  };
  const abrirMp = (id: string, descricao?: string) => {
    if (!calc || calc.vazio) return;
    const c = mrp?.itens.find((x) => x.id === id) ?? null;
    setFicha({ tipo: "mp", id, descricao: descricao || c?.item || "", hoje: calc.inicio, origens: ORIGENS_PROD, compra: c });
  };
  const exec = useMemo(() => {
    if (!calc || calc.vazio) return null;
    const m = [...calc.motor.values()];
    const usavel = m.reduce((a, x) => a + x.usavelHoje, 0), adu = m.reduce((a, x) => a + x.adu, 0);
    const zonas = { vermelho: 0, amarelo: 0, verde: 0, excesso: 0 } as Record<Zona, number>;
    for (const x of m) zonas[x.zona]++;
    const prox4 = carga.slice(0, 4), un4 = prox4.reduce((a, c) => a + c.unidades, 0);
    return { cobertura: adu > 0 ? usavel / adu : null, zonas, un4, util4: cap > 0 && prox4.length ? un4 / (cap * prox4.length) : null, semanasSobre: carga.filter((c) => c.pct !== null && c.pct > 100).length };
  }, [calc, carga, cap]);

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const mesesNoArquivo = resC ? resC.meses : [];
  const atualizado = dados.dataUpdatedAt ? new Date(dados.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
  const toggleFora = (sku: string) => { const n = new Set(fora); if (n.has(sku)) n.delete(sku); else n.add(sku); setFora(n); };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">PCP · Projeção do CD e Plano de Produção <span className="ml-2 text-sm font-normal text-slate-300">Demanda (consenso) · Capacidade · Matéria-prima · Compras</span></h1>
          <p className="mt-1 text-xs text-slate-300">Projeta o estoque do CD <b>{dados.data?.cd}</b> pela meta (consenso) corrigida pela venda real das lojas, monta o plano mestre de produção contra a capacidade e explode a ficha técnica para o plano de compras.</p></div>
        <div className="text-right text-xs text-slate-300">Leitura: {atualizado}{calc && !calc.vazio && <><br />Horizonte: {dataBr(calc.inicio)} a {dataBr(fimDoMes(calc.ultimoMes))} ({calc.N} dias)</>}</div>
      </div>

      <Secao letra="A" titulo="Premissas do plano e consenso" acao={<button type="button" onClick={() => setVerPremissas(!verPremissas)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">{verPremissas ? "Ocultar" : "Ajustar premissas"} <ChevronDown className={`size-4 transition ${verPremissas ? "rotate-180" : ""}`} /></button>}>
        <div className="flex flex-wrap gap-2 text-xs">
          {[["Prazo de produção", `${leadTime} d`], ["Liberação da Qualidade", `${diasQual} d`], ["Processo → disponível", `${diasProc} d`], ["Chegada das notas", `${diasTransito} d`], ["Segurança do CD", `${segCD} d`], ["Shelf mínimo", `${shelfMin} d`], ["Capacidade", `${un(cap)} un/sem`], ["Lead time de compra", `${leadCompra} d`], ["Nível de serviço (z)", zServ], ["Revisão do plano", diaRev === "" ? "qualquer dia" : DIAS_SEMANA[Number(diaRev)]]].map(([t, v]) => <span key={t} className="rounded-full border bg-muted/40 px-2.5 py-1"><span className="text-muted-foreground">{t}:</span> <b>{v}</b></span>)}
        </div>
        {verPremissas && <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          {([["Prazo de produção (dias)", leadTime, setLeadTime], ["Segurança do CD (dias)", segCD, setSegCD], ["Chegada das notas ao CD (dias)", diasTransito, setDiasTransito], ["Liberação da Qualidade (dias)", diasQual, setDiasQual], ["Processo → disponível (dias)", diasProc, setDiasProc], ["Shelf mínimo p/ despacho (dias)", shelfMin, setShelfMin], ["Capacidade semanal (un)", capSem, setCapSem], ["Lead time de compra (dias)", leadCompra, setLeadCompra], ["Nível de serviço (z)", zServ, setZServ]] as [string, string, (v: string) => void][]).map(([t, v, f]) => (
            <label key={t} className="text-[11px] font-semibold text-muted-foreground">{t}<Input className="mt-1 w-32" inputMode="decimal" value={v} onChange={(e) => f(e.target.value)} /></label>))}
          <label className="text-[11px] font-semibold text-muted-foreground">Dia da revisão do plano<select value={diaRev} onChange={(e) => setDiaRev(e.target.value)} className="mt-1 block h-9 w-44 rounded-md border bg-background px-2 text-sm"><option value="">Qualquer dia</option>{DIAS_SEMANA.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}</select></label>
          <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={comCafe} onChange={(e) => setComCafe(e.target.checked)} /> incluir cafeteria</label>
        </div>}
        {isAdmin && <div className="mt-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Consenso mensal (meta da diretoria)</span>
            <span className="text-xs text-muted-foreground">Consenso_Mensal.xlsx: SKU Sistema, Almox, Canal e um mês por coluna. A carga substitui o consenso das lojas do arquivo.</span>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={aoEscolher} />
            <Button size="sm" onClick={() => inputRef.current?.click()} className="ml-auto gap-2"><Upload className="size-4" /> Escolher consenso</Button>
            {arq && <span className="text-sm text-muted-foreground">{arq}</span>}
          </div>
          {resC && (
            <div className="mt-2 space-y-2 text-sm">
              {resC.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800"><strong>Bloqueio:</strong> {resC.bloqueios.join(" ")}</div>}
              {resC.itens.length > 0 && <>
                <p>Aba <strong>{resC.aba}</strong> · {resC.itens.length} valores · meses {mesesNoArquivo.join(", ")}</p>
                <Table><TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Com meta</TableHead>{mesesNoArquivo.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{Object.entries(resC.porLoja).map(([l, o]) => <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{o.skus}</TableCell><TableCell className="text-right">{o.comMeta}</TableCell>{mesesNoArquivo.map((m) => <TableCell key={m} className="text-right">{un(o.unidadesPorMes[m] ?? 0)}</TableCell>)}</TableRow>)}</TableBody></Table>
              </>}
              {resC.alertas.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"><strong>Pontos de atenção no arquivo:</strong><ul className="list-disc pl-5">{resC.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
              <div className="flex justify-end"><Button onClick={aplicar} disabled={aplicando || resC.bloqueios.length > 0}>{aplicando ? "Aplicando..." : "Aplicar consenso"}</Button></div>
            </div>
          )}
        </div>}
      </Secao>

      {dados.isLoading && <p className="py-10 text-center text-muted-foreground">Carregando consenso, estoques e vendas…</p>}
      {!dados.isLoading && (!calc || calc.vazio) && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900">{calc && calc.vazio ? `O consenso carregado termina em ${calc.ultimoMes}, antes de hoje. Envie um consenso atual.` : "Ainda não há consenso carregado. Envie o Consenso_Mensal.xlsx para gerar a projeção."}</CardContent></Card>
      )}

      {calc && !calc.vazio && kpi && exec && (<>
        <Secao letra="B" titulo="Indicadores executivos">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi t="Cobertura do CD (estoque utilizável)" v={exec.cobertura === null ? "—" : `${exec.cobertura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`} d="Utilizável hoje ÷ demanda média diária (todos os SKUs)" tom={exec.cobertura !== null && exec.cobertura < 14 ? "text-red-600" : exec.cobertura !== null && exec.cobertura < 30 ? "text-amber-600" : "text-emerald-600"} />
            <Kpi t="SKUs que rompem no CD no horizonte" v={`${kpi.rompem} de ${kpi.analisados}`} d={`${kpi.criticos} críticos (≤14 dias) · ${kpi.vermelhos} na zona vermelha do buffer`} tom="text-red-600" />
            <Kpi t="Déficit até o fim da meta" v={`${un(kpi.deficit)} un`} d={`${formatBRL(kpi.valor)} a custo · se nada for produzido`} />
            <Kpi t="Ordens a liberar hoje" v={String(kpi.ordensHoje)} d="Sem liberar hoje, chegam ao CD depois da ruptura" tom={kpi.ordensHoje ? "text-red-600" : "text-emerald-600"} />
            <Kpi t="Produção planejada · 4 semanas" v={`${un(exec.un4)} un`} d={exec.util4 === null ? "Informe a capacidade semanal" : `${Math.round(exec.util4 * 100)}% da capacidade${exec.semanasSobre ? ` · ${exec.semanasSobre} semana(s) acima de 100%` : ""}`} tom={exec.util4 !== null && exec.util4 > 1 ? "text-red-600" : exec.util4 !== null && exec.util4 > 0.85 ? "text-amber-600" : ""} />
            <Kpi t="Compras necessárias (matéria-prima)" v={bomQ.isLoading ? "…" : mrp ? `${comprasFalta.length} itens` : "—"} d={mrp ? `${formatBRL(comprasFalta.reduce((a, c) => a + c.valorFalta, 0))} · ${comprasFalta.filter((c) => c.atrasado).length} com prazo de compra vencido` : "Ficha técnica × saldo de Fábrica, Processo e Qualidade"} tom={comprasFalta.some((c) => c.atrasado) ? "text-red-600" : comprasFalta.length ? "text-amber-600" : "text-emerald-600"} />
            <Kpi t="Realização da demanda" v={calc.realizacaoGeral === null ? "—" : `${Math.round(calc.realizacaoGeral * 100)}%`} d="Venda real das lojas ÷ consenso, últimos 28 dias" tom={calc.realizacaoGeral !== null && Math.abs(calc.realizacaoGeral - 1) > 0.15 ? "text-amber-600" : ""} />
            <Kpi t="Perda prevista por validade" v={`${un(kpi.perdaVenc)} un`} d={`${kpi.oculto} SKU(s) com risco fora da previsão (estresse)`} tom={kpi.perdaVenc ? "text-violet-600" : ""} />
          </div>
        </Secao>

        <Secao letra="C" titulo="Decisões recomendadas">
          {acoes.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />Plano equilibrado: sem ruptura, sobrecarga ou falta de matéria-prima a tratar.</p> : (
            <ul className="space-y-2">{acoes.map((a, i) => { const aberta = abertas.has(i); return (
              <li key={i} className={`rounded-md border-l-4 bg-muted/30 ${a.prioridade === "alta" ? "border-red-500" : a.prioridade === "media" ? "border-amber-500" : "border-sky-500"}`}>
                <button type="button" className="w-full p-3 text-left hover:bg-muted/50" onClick={() => { const n = new Set(abertas); if (n.has(i)) n.delete(i); else n.add(i); setAbertas(n); }}>
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.prioridade === "alta" ? "bg-red-100 text-red-700" : a.prioridade === "media" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-700"}`}>{a.prioridade}</span><span className="text-[11px] font-semibold uppercase text-muted-foreground">{a.area}</span><span className="text-sm font-semibold">{a.titulo}</span>
                    {a.itens.length > 0 && <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">{a.itens.length} item(ns) <ChevronDown className={`size-4 transition ${aberta ? "rotate-180" : ""}`} /></span>}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.detalhe}</p>
                </button>
                {aberta && a.itens.length > 0 && <div className="border-t px-3 pb-3 pt-2">
                  <p className="mb-1 text-[11px] text-muted-foreground">{a.itens[0].tipo === "semana" ? "Semanas envolvidas." : "Clique num item para ver a história completa: consumo real dos últimos 90 dias (mapa de calor), estoque por lote e dias de disponibilidade."}</p>
                  <div className="max-h-72 overflow-auto rounded border bg-background"><table className="w-full text-sm"><tbody>{a.itens.map((it) => (
                    <tr key={it.tipo + it.id} className={`border-t first:border-0 ${it.tipo !== "semana" ? "cursor-pointer hover:bg-muted/60" : ""}`} onClick={() => (it.tipo === "sku" ? abrirSku(it.id, it.descricao) : it.tipo === "mp" ? abrirMp(it.id, it.descricao) : undefined)}>
                      <td className="w-28 px-2 py-1 font-mono text-xs">{it.tipo === "semana" ? "" : it.id}</td><td className="px-2 py-1">{it.descricao || "—"}</td><td className="px-2 py-1 text-right text-xs text-muted-foreground">{it.detalhe}</td>
                      <td className="w-20 px-2 py-1 text-right text-[11px] font-semibold text-primary">{it.tipo === "sku" ? "Ver ficha" : it.tipo === "mp" ? "Ver consumo" : ""}</td></tr>))}</tbody></table></div>
                </div>}
              </li>); })}</ul>)}
        </Secao>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2"><Secao letra="D" titulo="Demanda × Plano de produção × Capacidade (semanal)" acao={<select value={nSemanas} onChange={(e) => setNSemanas(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-xs">{[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} semanas</option>)}</select>}>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={grafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10} mil` : String(v))} />
                <Tooltip formatter={(v: any, n: any) => [`${Number(v).toLocaleString("pt-BR")} un`, n]} labelFormatter={(l) => `Semana de ${l}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="producao" name="Produção planejada" fill="#2563eb" radius={[3, 3, 0, 0]} />
                <Line dataKey="demanda" name="Demanda das lojas (consenso)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                {cap > 0 && <Line dataKey="capacidade" name="Capacidade" stroke="#dc2626" strokeDasharray="6 4" dot={false} />}
              </ComposedChart>
            </ResponsiveContainer></div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">{carga.map((c) => (
              <div key={c.semana} className="rounded border p-1.5 text-center"><div className="text-muted-foreground">{dataBr(c.semana).slice(0, 5)}</div><div className="font-semibold tabular-nums">{un(c.unidades)}</div>
                <div className={`font-semibold ${c.pct !== null && c.pct > 100 ? "text-red-600" : c.pct !== null && c.pct > 85 ? "text-amber-600" : "text-emerald-600"}`}>{c.pct === null ? "—" : `${Math.round(c.pct)}%`}</div></div>))}</div>
          </Secao></div>
          <Secao letra="E" titulo="Saúde do estoque do CD (buffer)">
            <div className="space-y-2">{(["vermelho", "amarelo", "verde", "excesso"] as Zona[]).map((z) => { const n = exec.zonas[z], tot = calc.motor.size || 1; return (
              <div key={z}><div className="flex justify-between text-xs"><span className="font-semibold">{ZONA_ROT[z]}</span><span className="tabular-nums">{n} SKU(s) · {Math.round((n / tot) * 100)}%</span></div>
                <div className="h-2 rounded bg-muted"><div className={`h-2 rounded ${z === "vermelho" ? "bg-red-500" : z === "amarelo" ? "bg-amber-500" : z === "verde" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${(n / tot) * 100}%` }} /></div></div>); })}</div>
            <p className="mt-3 text-[11px] text-muted-foreground">Vermelho: abaixo da proteção, produzir já. Amarelo: dentro da zona de reposição, programar. Verde: coberto. Excesso: acima do topo do buffer, segurar produção.</p>
            <div className="mt-3 flex flex-wrap gap-1">{(["critica", "alta", "media", "baixa", "ok"] as const).map((sv) => <span key={sv} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COR[sv]}`}>{ROT[sv]}: {calc.projs.filter((p) => p.severidade === sv).length}</span>)}</div>
          </Secao>
        </div>

        <Secao letra="F" titulo="Plano mestre de produção (MPS)" acao={<Button size="sm" variant="outline" className="gap-1" onClick={() => csv(`Plano_Mestre_${calc.inicio}.csv`, ["SKU", "Produto", ...semanas.map((s) => `Semana ${dataBr(s)}`), "Depois", "Total"], mps.linhas.map((l) => [l.sku, l.descricao, ...l.porSemana.map(Math.round), Math.round(l.depois), Math.round(l.total)]))}><Download className="size-4" /> CSV</Button>}>
          <p className="mb-2 text-xs text-muted-foreground">Ordens planejadas pelo motor (campanhas semanais em múltiplos da caixa, liberadas com o prazo de produção + qualidade). Ordens já atrasadas entram na primeira semana. Desmarque um SKU para tirá-lo do plano, da carga e das compras. <b>Clique duas vezes num SKU</b> para a análise completa: vendas dos últimos 3 meses, lotes, rupturas de material pela ficha técnica, capacidade e prazo de entrega.</p>
          <div className="max-h-[520px] overflow-auto rounded-md border">
            <table className="w-full text-sm"><thead className="sticky top-0 z-10"><tr><Th c="" /><Th c="SKU" /><Th c="Produto" />{semanas.map((s) => <Th key={s} c={dataBr(s).slice(0, 5)} d />)}<Th c="Depois" d /><Th c="Total" d /></tr></thead>
              <tbody>
                {mps.linhas.map((l) => (
                  <tr key={l.sku} className={`cursor-pointer border-t hover:bg-muted/40 ${fora.has(l.sku) ? "opacity-40" : ""}`} onDoubleClick={() => abrirSku(l.sku, l.descricao)} title="Clique duas vezes para a análise completa do SKU">
                    <td className="px-2" onDoubleClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!fora.has(l.sku)} onChange={() => toggleFora(l.sku)} /></td>
                    <td className="px-2 py-1 font-mono text-xs">{l.sku}</td>
                    <td className="max-w-[240px] truncate px-2 py-1" title={l.descricao}>{l.descricao}{l.urgente && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">URGENTE</span>}</td>
                    {l.porSemana.map((q, i) => <td key={i} className={`px-2 py-1 text-right tabular-nums ${q ? "font-semibold" : "text-muted-foreground"}`}>{q ? un(q) : "·"}</td>)}
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{l.depois ? un(l.depois) : "·"}</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">{un(l.total)}</td>
                  </tr>))}
                {[...fora].filter((s) => !mps.linhas.some((l) => l.sku === s)).map((s) => <tr key={s} className="border-t opacity-40"><td className="px-2"><input type="checkbox" checked={false} onChange={() => toggleFora(s)} /></td><td className="px-2 py-1 font-mono text-xs" colSpan={semanas.length + 4}>{s} (fora do plano)</td></tr>)}
                {mps.linhas.length === 0 && <tr><td colSpan={semanas.length + 5} className="py-6 text-center text-muted-foreground">Nenhuma ordem no horizonte: o estoque cobre a demanda.</td></tr>}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted text-xs font-semibold">
                <tr><td /><td className="px-2 py-1.5" colSpan={2}>Total da semana</td>{mps.totais.map((t, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums">{un(t)}</td>)}<td className="px-2 text-right">{un(mps.depois)}</td><td /></tr>
                <tr><td /><td className="px-2 py-1.5" colSpan={2}>Utilização da capacidade ({un(cap)} un/sem)</td>{carga.map((c) => <td key={c.semana} className={`px-2 py-1.5 text-right ${c.pct !== null && c.pct > 100 ? "text-red-600" : c.pct !== null && c.pct > 85 ? "text-amber-600" : "text-emerald-600"}`}>{c.pct === null ? "—" : `${Math.round(c.pct)}%`}</td>)}<td /><td /></tr>
              </tfoot>
            </table>
          </div>
        </Secao>

        <Secao letra="G" titulo="Plano de compras de matéria-prima (MRP)" acao={mrp ? <Button size="sm" variant="outline" className="gap-1" onClick={() => csv(`Plano_Compras_${calc.inicio}.csv`, ["Código", "Matéria-prima", "UM", "Saldo atual", "Necessidade no horizonte", "Falta (comprar)", "Custo unitário", "Valor da compra", "Primeira semana com falta", "Comprar até", "Situação", "Usado em"], mrp.itens.map((c) => [c.id, c.item, c.um, c.saldoInicial, c.necessidade, c.falta, c.custo, c.valorFalta, dataBr(c.primeiraFalta), dataBr(c.comprarAte), c.falta <= 0 ? "Coberto" : c.atrasado ? "Prazo vencido" : "Comprar", c.usadoEm.join(" ")]))}><Download className="size-4" /> CSV</Button> : undefined}>
          {bomQ.isLoading ? <p className="text-sm text-muted-foreground">Explodindo a ficha técnica do plano…</p> : !mrp ? <p className="text-sm text-muted-foreground">Sem ordens no plano ou ficha técnica indisponível.</p> : (<>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Mini icon={<ShoppingCart className="size-4" />} t="Itens a comprar" v={String(comprasFalta.length)} />
              <Mini icon={<AlertTriangle className="size-4 text-red-600" />} t="Prazo de compra vencido" v={String(comprasFalta.filter((c) => c.atrasado).length)} tom="text-red-600" />
              <Mini icon={<Gauge className="size-4" />} t="Valor estimado da compra" v={formatBRL(comprasFalta.reduce((a, c) => a + c.valorFalta, 0))} />
              <Mini icon={<Factory className="size-4" />} t="SKUs sem ficha técnica" v={String(mrp.semBom.length)} tom={mrp.semBom.length ? "text-amber-600" : ""} />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Necessidade explodida semana a semana na ficha técnica, consumindo o saldo de Fábrica + Processo + Qualidade (subconjuntos com saldo são abatidos antes). Comprar até = semana da primeira falta − lead time de compra ({leadCompra} dias).</p>
            <div className="max-h-[460px] overflow-auto rounded-md border">
              <table className="w-full text-sm"><thead className="sticky top-0 z-10"><tr><Th c="Código" /><Th c="Matéria-prima" /><Th c="Saldo" d /><Th c="Necessidade" d /><Th c="Comprar" d /><Th c="Valor" d /><Th c="Falta a partir de" d /><Th c="Comprar até" d /><Th c="Usado em" /></tr></thead>
                <tbody>{mrp.itens.filter((c) => c.falta > 0).concat(mrp.itens.filter((c) => c.falta <= 0).slice(0, 30)).map((c) => (
                  <tr key={c.id} className={`cursor-pointer border-t hover:bg-muted/40 ${c.falta <= 0 ? "text-muted-foreground" : ""}`} onClick={() => abrirMp(c.id, c.item)} title="Ver consumo em OP, lotes e compra">
                    <td className="px-2 py-1 font-mono text-xs">{c.id}</td><td className="max-w-[240px] truncate px-2 py-1" title={c.item}>{c.item}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n2(c.saldoInicial)} {c.um}</td><td className="px-2 py-1 text-right tabular-nums">{n2(c.necessidade)}</td>
                    <td className={`px-2 py-1 text-right font-semibold tabular-nums ${c.falta > 0 ? "text-red-600" : ""}`}>{c.falta > 0 ? n2(c.falta) : "coberto"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.valorFalta > 0 ? formatBRL(c.valorFalta) : "—"}</td>
                    <td className="px-2 py-1 text-right">{dataBr(c.primeiraFalta)}</td>
                    <td className={`px-2 py-1 text-right ${c.atrasado ? "font-semibold text-red-600" : ""}`}>{c.comprarAte ? `${dataBr(c.comprarAte)}${c.atrasado ? " · vencido" : ""}` : "—"}</td>
                    <td className="max-w-[200px] truncate px-2 py-1 text-xs" title={c.usadoEm.join(", ")}>{c.usadoEm.slice(0, 3).join(", ")}{c.usadoEm.length > 3 ? "…" : ""}</td>
                  </tr>))}
                  {mrp.itens.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Nenhuma matéria-prima envolvida.</td></tr>}</tbody></table>
            </div>
          </>)}
        </Secao>

        <Secao letra="H" titulo="Projeção de ruptura por SKU" acao={<Button size="sm" variant="outline" className="gap-1" onClick={() => csv(`Projecao_CD_${calc.inicio}.csv`, ["SKU", "Produto", "Severidade", "Estoque CD", "Estoque lojas", "Em trânsito (lojas)", "Entrada no CD (notas)", "Demanda no horizonte", "Ruptura do CD", "Dias até a ruptura", "Déficit"], projFiltradas.map((p) => [p.sku, p.descricao, ROT[p.severidade], p.estoqueCD, p.estoqueLojas, p.trLojas, p.entCD, Math.round(p.demandaTotal), p.dataRupturaCD ?? "", p.diasAteRuptura ?? "", Math.round(p.deficit)]))}><Download className="size-4" /> CSV</Button>}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {(["TODOS", "critica", "alta", "media", "baixa", "ok"] as const).map((sv) => (
              <button key={sv} onClick={() => setFiltro(sv)} className={`rounded-full border px-3 py-1 text-xs ${filtro === sv ? "border-slate-900 bg-slate-900 font-semibold text-white" : "hover:bg-muted"}`}>
                {sv === "TODOS" ? "Todos" : ROT[sv]}{sv !== "TODOS" ? ` (${calc.projs.filter((p) => p.severidade === sv).length})` : ""}</button>))}
            <Input className="h-8 w-56" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="max-h-[520px] overflow-auto rounded-md border">
            <table className="w-full text-sm"><thead className="sticky top-0 z-10"><tr><Th c="SKU" /><Th c="Produto" /><Th c="Risco" /><Th c="Zona" /><Th c="CD" d /><Th c="Lojas" d /><Th c="Trânsito" d /><Th c="Demanda" d /><Th c="Realização" d /><Th c="Ruptura do CD" d /><Th c="Dias" d /><Th c="Déficit" d /><Th c="Próxima ordem" /></tr></thead>
              <tbody>
                {projFiltradas.length === 0 && <tr><td colSpan={13} className="py-8 text-center text-muted-foreground">Nenhum SKU neste filtro.</td></tr>}
                {projFiltradas.slice(0, 400).map((p) => { const m = calc.motor.get(nk(p.sku)); return (
                  <tr key={p.sku} className="cursor-pointer border-t hover:bg-muted/40" onDoubleClick={() => abrirSku(p.sku, p.descricao)} title="Clique duas vezes para a análise completa do SKU">
                    <td className="px-2 py-1 font-mono text-xs">{p.sku}</td>
                    <td className="max-w-[240px] truncate px-2 py-1" title={p.descricao}>{p.descricao || "—"}{p.semRegistro && <span className="ml-1 text-[10px] text-amber-600">sem registro de estoque</span>}</td>
                    <td className="px-2 py-1"><span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COR[p.severidade]}`}>{ROT[p.severidade]}</span></td>
                    <td className="px-2 py-1">{m ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ZONA_COR[m.zona]}`}>{ZONA_ROT[m.zona]}</span> : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{un(p.estoqueCD)}</td><td className="px-2 py-1 text-right tabular-nums">{un(p.estoqueLojas)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.trLojas + p.entCD > 0 ? `${un(p.trLojas)}${p.entCD ? ` (+${un(p.entCD)} CD)` : ""}` : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{un(p.demandaTotal)}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${m?.realizacao != null && Math.abs(m.realizacao - 1) > 0.2 ? "font-semibold text-amber-600" : ""}`}>{m?.realizacao != null ? `${Math.round(m.realizacao * 100)}%` : "—"}</td>
                    <td className="px-2 py-1 text-right font-semibold">{dataBr(p.dataRupturaCD)}</td><td className="px-2 py-1 text-right">{p.diasAteRuptura ?? "—"}</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">{p.deficit ? un(p.deficit) : "—"}</td>
                    <td className="px-2 py-1 text-xs">{m?.ordens[0] ? <span className={m.ordens[0].urgente ? "font-semibold text-red-600" : ""}>{un(m.ordens[0].quantidade)} un · liberar {dataBr(m.ordens[0].liberar)}</span> : "—"}</td>
                  </tr>); })}
              </tbody></table>
          </div>
        </Secao>

        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">I · Motor de reabastecimento do CD (detalhe técnico do buffer)</summary>
          <div className="overflow-x-auto p-2">
            <p className="px-2 pb-2 text-xs text-muted-foreground">Demanda = malha linear do consenso × realização (venda real ÷ malha). Buffers por SKU sobre o fluxo líquido (utilizável + WIP + qualidade + notas − demanda qualificada). Probabilidade de aprovação de baixas pendentes: {Math.round(calc.probAprov * 100)}%.</p>
            <table className="w-full text-sm"><thead><tr><Th c="SKU" /><Th c="Produto" /><Th c="Zona" /><Th c="Fluxo líquido" d /><Th c="Verm./Amar./Topo" d /><Th c="Utilizável" d /><Th c="WIP+Qual.+Notas" d /><Th c="Perda validade" d /><Th c="Baixas esperadas" d /><Th c="Ruptura" /><Th c="Ruptura (estresse)" /></tr></thead>
              <tbody>{motorLista.map((m) => (
                <tr key={m.sku} className="border-t">
                  <td className="px-2 py-1 font-mono text-xs">{m.sku}</td><td className="max-w-[220px] truncate px-2 py-1" title={m.descricao}>{m.descricao}</td>
                  <td className="px-2 py-1"><span className={`rounded-full border px-2 py-0.5 text-xs ${ZONA_COR[m.zona]}`}>{ZONA_ROT[m.zona]} · {Math.round(m.prioridade)}%</span></td>
                  <td className="px-2 py-1 text-right">{un(m.nfp)}</td><td className="px-2 py-1 text-right text-xs text-muted-foreground">{un(m.red)} / {un(m.red + m.yellow)} / {un(m.tog)}</td>
                  <td className="px-2 py-1 text-right">{un(m.usavelHoje)}{m.bloqueadoShelf > 0 && <span className="ml-1 text-[11px] text-violet-600">(+{un(m.bloqueadoShelf)} bloq.)</span>}</td>
                  <td className="px-2 py-1 text-right">{un(m.wip + m.qualidade + m.notas)}</td>
                  <td className={`px-2 py-1 text-right ${m.perdaVencimentoUn > 0 ? "font-semibold text-violet-600" : ""}`}>{m.perdaVencimentoUn > 0 ? un(m.perdaVencimentoUn) : "—"}</td>
                  <td className={`px-2 py-1 text-right ${m.baixasPendentesEsperadas > 0 ? "font-semibold text-orange-600" : ""}`}>{m.baixasPendentesEsperadas > 0 ? un(m.baixasPendentesEsperadas) : "—"}</td>
                  <td className="px-2 py-1">{dataBr(m.dataRupturaCD)}</td><td className={`px-2 py-1 ${m.riscoNaoPrevisto ? "font-semibold text-orange-600" : ""}`}>{dataBr(m.dataRupturaEstresse)}{m.riscoNaoPrevisto && " ⚠"}</td>
                </tr>))}</tbody></table>
          </div>
        </details>
      </>)}
      {ficha && <FichaItem ctx={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}

const n2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function Kpi({ t, v, d, tom }: { t: string; v: string; d?: string; tom?: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tom ?? ""}`}>{v}</div>{d && <div className="mt-0.5 text-[11px] text-muted-foreground">{d}</div>}</div>;
}
function Mini({ icon, t, v, tom }: { icon: React.ReactNode; t: string; v: string; tom?: string }) {
  return <div className="flex items-center gap-2 rounded-md border p-2">{icon}<div><div className="text-[11px] text-muted-foreground">{t}</div><div className={`text-base font-bold ${tom ?? ""}`}>{v}</div></div></div>;
}
