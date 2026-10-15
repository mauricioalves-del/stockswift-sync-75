// Motor de reabastecimento do CD (Almox SP Fábrica): MRP time-phased + buffers DDMRP + estoque de segurança estatístico
// + FEFO com validade + risco de baixas + cenário de estresse (ruptura fora da previsão de consumo).
export type Lote = { qtd: number; validade: string | null };
export type EntradaMotor = {
  sku: string; descricao: string; caixa: number;
  lotesCD: Lote[]; processo: Lote[]; qualidade: Lote[];          // Alm_SP_Fabrica · Alm_SP_Processo (em produção) · Alm_SP_Qualidade (retido)
  notasCD: { data: string; qtd: number }[];                       // notas pendentes destinadas ao CD (chegada prevista)
  estoqueLojas: number; emTransitoLojas: number;
  demandaMeta: number[];                                          // consenso das lojas, por dia, a partir de `inicio`
  realizacao: number | null; sigmaDia: number | null;             // venda real ÷ malha do consenso no mesmo período (1 = em linha com a meta) · desvio padrão diário da venda
  baixasPendentes: number; taxaBaixaDia: number;                  // fila de aprovação no CD · baixas aprovadas por dia (histórico)
  custo?: number;
};
export type ParamsMotor = {
  leadTimeDias: number; diasQualidade: number; diasProcesso: number; atrasoEstresseDias: number;
  shelfMinimoDespacho: number; shelfPadraoDias: number; nivelServicoZ: number; pesoMeta: number;
  cicloProducaoDias: number; coberturaMaximaDias: number; probAprovBaixa: number; fatorEstresse: number; segurancaExtraDias: number;
};
export const PARAMS_PADRAO: ParamsMotor = {
  leadTimeDias: 7, diasQualidade: 2, diasProcesso: 3, atrasoEstresseDias: 2, shelfMinimoDespacho: 30, shelfPadraoDias: 180,
  nivelServicoZ: 1.65, pesoMeta: 0, cicloProducaoDias: 7, coberturaMaximaDias: 60, probAprovBaixa: 0.9, fatorEstresse: 1.65, segurancaExtraDias: 0,
};
export type Zona = "vermelho" | "amarelo" | "verde" | "excesso";
export type Severidade = "critica" | "alta" | "media" | "baixa" | "ok";
export type OrdemProducao = { liberar: string; chegada: string; quantidade: number; atrasoDias: number; urgente: boolean; fatores: string[] };
export type ResultadoMotor = {
  sku: string; descricao: string; severidade: Severidade; dataRupturaCD: string | null; diasAteRuptura: number | null;
  dataRupturaEstresse: string | null; diasAteRupturaEstresse: number | null; riscoNaoPrevisto: boolean; qtdProtecao: number;
  adu: number; fatorBias: number; sigmaDia: number; dlt: number; red: number; yellow: number; green: number; tor: number; toy: number; tog: number; nfp: number; zona: Zona; prioridade: number;
  usavelHoje: number; bloqueadoShelf: number; wip: number; qualidade: number; notas: number; baixasPendentesEsperadas: number; perdaVencimentoUn: number; primeiraPerdaVenc: string | null;
  deficitSemPlano: number; ordens: OrdemProducao[]; coberturaDiasUsavel: number | null;
};

const DIA = 86400000;
const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const idxDia = (inicio: string, iso: string) => Math.round((ms(iso) - ms(inicio)) / DIA);
export const isoDia = (inicio: string, d: number) => new Date(ms(inicio) + d * DIA).toISOString().slice(0, 10);
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Média e desvio padrão diários de uma série de vendas (usado para o run-rate real e o estoque de segurança). */
export function estatDemanda(serie: number[]): { media: number; sigma: number } {
  if (!serie.length) return { media: 0, sigma: 0 };
  const m = soma(serie) / serie.length; const v = serie.length > 1 ? soma(serie.map((x) => (x - m) ** 2)) / (serie.length - 1) : 0;
  return { media: m, sigma: Math.sqrt(v) };
}

type Cen = { demanda: number[]; baixas: number; atraso: number; taxaBaixa: number };
type LoteSim = { qtd: number; disp: number; val: number };
type Sim = { fim: number[]; net: number[]; faltaDia: number[]; perda: number; primeiraPerda: number | null; ruptura: number | null; falta: number; bloq0: number };

function simular(e: EntradaMotor, p: ParamsMotor, cen: Cen, ordens: { chegada: number; qtd: number }[], inicio: string): Sim {
  const N = cen.demanda.length; const vi = (v: string | null) => (v ? idxDia(inicio, v) : Infinity);
  const lotes: LoteSim[] = [];
  for (const l of e.lotesCD) if (l.qtd > 0) lotes.push({ qtd: l.qtd, disp: 0, val: vi(l.validade) });
  for (const l of e.processo) if (l.qtd > 0) lotes.push({ qtd: l.qtd, disp: p.diasProcesso + cen.atraso, val: vi(l.validade) });
  for (const l of e.qualidade) if (l.qtd > 0) lotes.push({ qtd: l.qtd, disp: p.diasQualidade + cen.atraso, val: vi(l.validade) });
  for (const n of e.notasCD) { const d = Math.max(0, idxDia(inicio, n.data)) + cen.atraso; lotes.push({ qtd: n.qtd, disp: d, val: d + p.shelfPadraoDias }); }
  for (const o of ordens) lotes.push({ qtd: o.qtd, disp: o.chegada, val: o.chegada + p.shelfPadraoDias });
  let resto = cen.baixas;                                           // baixas pendentes aprovadas: saem do que já está no CD (FEFO)
  for (const l of lotes.filter((x) => x.disp === 0).sort((a, b) => a.val - b.val)) { const t = Math.min(l.qtd, resto); l.qtd -= t; resto -= t; if (resto <= 0) break; }
  const cobre = e.estoqueLojas + e.emTransitoLojas; let cum = 0, prevSai = 0, perda = 0, primeiraPerda: number | null = null, ruptura: number | null = null, falta = 0, bloq0 = 0;
  const fim: number[] = [], net: number[] = [], faltaDia: number[] = [];
  const usavel = (l: LoteSim, d: number) => l.qtd > 0 && l.disp <= d && l.val - d >= p.shelfMinimoDespacho;
  for (let d = 0; d < N; d++) {
    for (const l of lotes) if (l.qtd > 0 && l.val < d) { perda += l.qtd; if (primeiraPerda === null) primeiraPerda = d; l.qtd = 0; }
    cum += cen.demanda[d]; const sai = Math.max(0, cum - cobre); let precisa = sai - prevSai + cen.taxaBaixa; prevSai = sai;
    for (const l of lotes.filter((x) => usavel(x, d)).sort((a, b) => a.val - b.val)) { const t = Math.min(l.qtd, precisa); l.qtd -= t; precisa -= t; if (precisa <= 1e-9) break; }
    faltaDia.push(precisa > 1e-9 ? precisa : 0); if (precisa > 1e-9) { falta += precisa; if (ruptura === null) ruptura = d; }
    const f = soma(lotes.filter((x) => usavel(x, d)).map((x) => x.qtd)); fim.push(f); net.push(f - falta);
    if (d === 0) bloq0 = soma(lotes.filter((x) => x.qtd > 0 && x.disp <= 0 && x.val - 0 < p.shelfMinimoDespacho).map((x) => x.qtd));
  }
  return { fim, net, faltaDia, perda, primeiraPerda, ruptura, falta, bloq0 };
}

export function planejarSku(e: EntradaMotor, inicio: string, pp: Partial<ParamsMotor> = {}): ResultadoMotor | null {
  const p = { ...PARAMS_PADRAO, ...pp }; const N = e.demandaMeta.length; if (N < 1 || soma(e.demandaMeta) <= 0) return null;
  const caixa = Math.max(1, e.caixa || 1); const dlt = p.leadTimeDias + p.diasQualidade;
  // 1) demanda: malha linear do consenso (meta ÷ dias do mês, já com a sazonalidade da meta) × realização (venda real ÷ malha no mesmo período). Sem índice sazonal.
  const janela = Math.min(N, 28);
  const fator = e.realizacao === null ? 1 : clamp(p.pesoMeta + (1 - p.pesoMeta) * e.realizacao, 0.25, 2);
  const dem = e.demandaMeta.map((v) => v * fator); const adu = soma(dem.slice(0, janela)) / janela;
  const sigma = Math.max(e.sigmaDia ?? 0.5 * adu, 0.25 * adu);      // piso: CV mínimo de 25% (σ=0 costuma ser venda censurada por falta de estoque)
  const esp: Cen = { demanda: dem, baixas: e.baixasPendentes * p.probAprovBaixa, atraso: 0, taxaBaixa: e.taxaBaixaDia };
  const est: Cen = { demanda: dem.map((v) => Math.min(2 * v + 1e-9, v + p.fatorEstresse * sigma)), baixas: e.baixasPendentes, atraso: p.atrasoEstresseDias, taxaBaixa: e.taxaBaixaDia * 1.5 };
  // 2) buffers DDMRP (em unidades): vermelho = base + segurança estatística (+ baixa média no prazo); amarelo = ADU × DLT; verde = ciclo de produção
  const redBase = adu * dlt * 0.5; const redSeg = (e.sigmaDia !== null ? p.nivelServicoZ * sigma * Math.sqrt(dlt) : 0.5 * redBase) + e.taxaBaixaDia * dlt + adu * p.segurancaExtraDias;
  const red = redBase + redSeg, yellow = adu * dlt, green = Math.max(caixa, adu * p.cicloProducaoDias);
  const tor = red, toy = red + yellow, tog = toy + green;
  // 3) posição de fluxo líquido (NFP) e zona
  const base = simular(e, p, esp, [], inicio);
  const usavelHoje = base.fim[0] + 0; const wip = soma(e.processo.map((l) => l.qtd)), qual = soma(e.qualidade.map((l) => l.qtd)), notas = soma(e.notasCD.map((n) => n.qtd));
  const nfp = soma(e.lotesCD.map((l) => l.qtd)) - base.bloq0 + wip + qual + notas + e.estoqueLojas + e.emTransitoLojas - esp.baixas;
  const zona: Zona = nfp <= tor ? "vermelho" : nfp <= toy ? "amarelo" : nfp <= tog ? "verde" : "excesso";
  // 4) ordens planejadas (MRP time-phased, lote = período de suprimento, múltiplo de caixa, teto de cobertura)
  const seg = redSeg; const ordens: { chegada: number; qtd: number; fatores: string[]; atraso: number }[] = [];
  const capQtd = Math.ceil((adu * p.coberturaMaximaDias + seg) / caixa) * caixa; let ultimaChegada = -1;
  const semPerdas = simular(e, p, { ...esp, baixas: 0, taxaBaixa: 0 }, [], inicio);
  for (let it = 0; it < 8; it++) {
    const s = simular(e, p, esp, ordens, inicio); const t = s.fim.findIndex((v, d) => d > ultimaChegada && (v < seg - 1e-9 || s.faltaDia[d] > 1e-9)); if (t < 0) break;
    const chegada = Math.max(t, dlt); if (chegada >= N || chegada <= ultimaChegada) break;
    const w = Math.min(N - 1, chegada + p.cicloProducaoDias - 1); const bruta = soma(dem.slice(chegada, w + 1));
    const ok = (q: number) => { const r = simular(e, p, esp, [...ordens, { chegada, qtd: q }], inicio); return Math.min(...r.fim.slice(chegada, w + 1)) >= seg - 1e-9 && r.faltaDia.slice(chegada, w + 1).every((x) => x <= 1e-9); };
    let lo = 1, hi = Math.max(1, Math.ceil(((bruta + seg) * 1.5 + caixa) / caixa));
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ok(mid * caixa)) hi = mid; else lo = mid + 1; }
    const q = Math.min(lo * caixa, capQtd);
    const fatores = ["consumo"]; if (semPerdas.ruptura === null ? base.ruptura !== null : (base.ruptura ?? Infinity) < semPerdas.ruptura - 1) fatores.push("baixas"); if (base.perda > 0) fatores.push("validade");
    ordens.push({ chegada, qtd: q, fatores, atraso: Math.max(0, dlt - t) }); ultimaChegada = chegada;
  }
  // 5) riscos fora da previsão: estresse (sem plano) e proteção residual com o plano
  const sEst = simular(e, p, est, [], inicio); const sEstPlano = simular(e, p, est, ordens.map((o) => ({ chegada: o.chegada, qtd: o.qtd })), inicio);
  const qtdProtecao = Math.ceil(sEstPlano.falta / caixa) * caixa;
  const rEsp = base.ruptura, rEst = sEst.ruptura;
  const risco = rEst !== null && rEst <= 30 && (rEsp === null || rEst < rEsp);
  const sev: Severidade = rEsp === null ? "ok" : rEsp <= 14 ? "critica" : rEsp <= 30 ? "alta" : rEsp <= 60 ? "media" : "baixa";
  return {
    sku: e.sku, descricao: e.descricao, severidade: sev, dataRupturaCD: rEsp === null ? null : isoDia(inicio, rEsp), diasAteRuptura: rEsp,
    dataRupturaEstresse: rEst === null ? null : isoDia(inicio, rEst), diasAteRupturaEstresse: rEst, riscoNaoPrevisto: risco, qtdProtecao,
    adu, fatorBias: fator, sigmaDia: sigma, dlt, red, yellow, green, tor, toy, tog, nfp, zona, prioridade: tog > 0 ? (nfp / tog) * 100 : 0,
    usavelHoje, bloqueadoShelf: base.bloq0, wip, qualidade: qual, notas, baixasPendentesEsperadas: esp.baixas, perdaVencimentoUn: base.perda,
    primeiraPerdaVenc: base.primeiraPerda === null ? null : isoDia(inicio, base.primeiraPerda), deficitSemPlano: base.falta,
    ordens: ordens.map((o) => ({ liberar: isoDia(inicio, Math.max(0, o.chegada - dlt)), chegada: isoDia(inicio, o.chegada), quantidade: o.qtd, atrasoDias: o.atraso, urgente: o.chegada - dlt <= 0, fatores: o.fatores })),
    coberturaDiasUsavel: adu > 0 ? usavelHoje / adu : null,
  };
}

/** Venda real das lojas (un/dia) e desvio padrão diário, dos últimos `janela` dias. Lojas com histórico curto são extrapoladas pela participação na meta. */
export function estimarDemandaReal(porOrigem: Record<string, Record<string, number>>, primeira: Record<string, string>, metaPorOrigem: Record<string, number>, inicio: string, janela = 28, minDias = 14): { realDia: number | null; sigmaDia: number | null } {
  const dias: string[] = []; for (let i = janela; i >= 1; i--) dias.push(isoDia(inicio, -i));
  const validas = Object.keys(metaPorOrigem).filter((o) => primeira[o] !== undefined && dias.filter((d) => d >= primeira[o]).length >= minDias);
  if (!validas.length) return { realDia: null, sigmaDia: null };
  const comum = validas.map((o) => primeira[o]).reduce((a, b) => (a > b ? a : b)); const diasComuns = dias.filter((d) => d >= comum);
  let real = 0; for (const o of validas) { const ds = dias.filter((d) => d >= primeira[o]); real += ds.reduce((a, d) => a + (porOrigem[o]?.[d] ?? 0), 0) / ds.length; }
  const metaTotal = soma(Object.values(metaPorOrigem)), metaValida = soma(validas.map((o) => metaPorOrigem[o])); const escala = metaValida > 0 ? metaTotal / metaValida : 1;
  const serie = diasComuns.map((d) => soma(validas.map((o) => porOrigem[o]?.[d] ?? 0)));
  return { realDia: real * escala, sigmaDia: serie.length >= minDias ? estatDemanda(serie).sigma * escala : null };
}
