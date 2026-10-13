// Motor v2 de reposição de lojas — migra o motor de Suprimentos (sazonalidade, segurança, classe ABC, limite pelo CD)
// e soma as regras de loja do portal (exposição, caixa fechada, pedido manual) e o ESTOQUE EM TRÂNSITO.
//
//   demanda/dia   = real × índice sazonal   |   consenso (já traz a sazonalidade da meta)   |   a maior das duas
//   exposição     = estoque que fica na vitrine; NÃO conta como vendável
//   mínimo/ideal/máximo = exposição + demanda × dias (+ segurança no ideal e no máximo)
//   projetado     = estoque + em trânsito + pedido em aberto  (evita pedir em duplicidade e falsa ruptura)
//   sugestão      = SÓ quando o projetado cai abaixo do MÍNIMO (ponto de pedido): repõe até o ideal, arredondando para cima em caixa fechada.
//                   Acima do mínimo não se pede (senão uma falta de 1 un viraria uma caixa inteira). Pedido manual substitui a sugestão.
import { num } from "./abastecimento-motor";

export type Base2 = "real" | "consenso" | "maior";
export type Param2 = { diasMin: number; diasIdeal: number; diasMax: number; diasSeguranca: number };
export const PARAM2_PADRAO: Param2 = { diasMin: 5, diasIdeal: 10, diasMax: 15, diasSeguranca: 0 };
/** Acima disto (dias de cobertura depois do pedido) a linha recebe um AVISO; o pedido continua sugerido. */
export const LIMITE_COBERTURA_AVISO = 20;

export type Status2 = "ruptura" | "abaixo" | "ok" | "excesso" | "semdemanda" | "em_transito" | "cadastro" | "conferir" | "fora";
export const STATUS2: Record<Status2, { rotulo: string; ordem: number }> = {
  ruptura: { rotulo: "Ruptura", ordem: 0 },
  abaixo: { rotulo: "Abaixo do mínimo", ordem: 1 },
  em_transito: { rotulo: "Reposição a caminho", ordem: 2 },
  ok: { rotulo: "OK", ordem: 3 },
  excesso: { rotulo: "Excesso", ordem: 4 },
  semdemanda: { rotulo: "Sem demanda", ordem: 5 },
  cadastro: { rotulo: "Cadastro incompleto", ordem: 6 },
  conferir: { rotulo: "Dados a conferir", ordem: 7 },
  fora: { rotulo: "Fora do sortimento", ordem: 8 },
};

export type Entrada2 = {
  sku: string; descricao?: string | null; categoria?: string | null;
  ativo: boolean; masterPresente: boolean;
  estoque: unknown; exposicao: unknown;
  vendaDiaReal: unknown;            // venda/dia observada (Linear Real)
  consensoDia?: unknown;            // meta diária média do consenso na janela de cobertura
  indiceSazonal?: number;           // multiplicador médio do período (1 = sem efeito)
  classeAbc?: string | null;        // A/B reforçam o estoque de segurança (×1,5), como em Suprimentos
  fullCase?: unknown; custo?: unknown;
  saldoCD?: unknown;
  emTransito?: number;              // notas de transferência pendentes de recebimento
  pedidoAberto?: number;            // pedidos já feitos e ainda não recebidos
  pedidoManual?: number | null;     // quantidade digitada pelo usuário (substitui a sugestão)
};

export type Item2 = {
  sku: string; descricao: string; categoria: string; ativo: boolean; cadastroIncompleto: boolean;
  estoque: number | null; exposicao: number | null; emTransito: number; pedidoAberto: number; projetado: number | null;
  demandaDia: number | null; demandaReal: number | null; demandaConsenso: number | null; indiceSazonal: number; baseUsada: "real" | "consenso" | null;
  seguranca: number; minQ: number | null; idealQ: number | null; maxQ: number | null;
  coberturaFisica: number | null; coberturaProjetada: number | null;
  caixa: number; sugestao: number; sugestaoCaixas: number;
  qtdPedido: number; pedidoOrigem: "SUGESTAO" | "MANUAL" | "NENHUM"; manualOriginal: number | null; manualAjustado: boolean;
  qtdAtendida: number; faltaCD: number; caixasCD: number; cobPosPedido: number | null; disponivelCD: number | null; fracionado: boolean; avisoCobertura: boolean;
  saldoCD: number | null; custo: number | null; valorPedido: number;
  status: Status2; alertas: string[];
};

const paraCima = (q: number, caixa: number) => (q > 0 ? Math.ceil(q / caixa) * caixa : 0);

export function calcularItem2(e: Entrada2, p: Param2 = PARAM2_PADRAO, base: Base2 = "real"): Item2 {
  const estoque = num(e.estoque);
  const expo0 = num(e.exposicao);
  const exposicao = expo0 === null ? null : Math.max(0, expo0);
  const idx = e.indiceSazonal && e.indiceSazonal > 0 ? e.indiceSazonal : 1;
  const vr = num(e.vendaDiaReal);
  const demandaReal = vr === null ? null : Math.max(0, vr) * idx;
  const cd = num(e.consensoDia);
  const demandaConsenso = cd === null ? null : Math.max(0, cd);
  let demandaDia: number | null = null; let baseUsada: "real" | "consenso" | null = null;
  if (base === "real") { demandaDia = demandaReal; baseUsada = demandaReal === null ? null : "real"; }
  else if (base === "consenso") { demandaDia = demandaConsenso; baseUsada = demandaConsenso === null ? null : "consenso"; }
  else if (demandaReal !== null && demandaConsenso !== null) { const consMaior = demandaConsenso > demandaReal; demandaDia = consMaior ? demandaConsenso : demandaReal; baseUsada = consMaior ? "consenso" : "real"; }
  else if (demandaReal !== null) { demandaDia = demandaReal; baseUsada = "real"; }
  else if (demandaConsenso !== null) { demandaDia = demandaConsenso; baseUsada = "consenso"; }

  const fc = num(e.fullCase);
  const caixa = fc !== null && fc > 1 ? Math.ceil(fc) : 1;
  const emTransito = Math.max(0, e.emTransito ?? 0);
  const pedidoAberto = Math.max(0, e.pedidoAberto ?? 0);
  const custo = num(e.custo);
  const r: Item2 = {
    sku: e.sku, descricao: e.descricao ?? "", categoria: e.categoria ?? "", ativo: e.ativo, cadastroIncompleto: !e.masterPresente,
    estoque, exposicao, emTransito, pedidoAberto, projetado: estoque === null ? null : estoque + emTransito + pedidoAberto,
    demandaDia, demandaReal, demandaConsenso, indiceSazonal: idx, baseUsada,
    seguranca: 0, minQ: null, idealQ: null, maxQ: null, coberturaFisica: null, coberturaProjetada: null,
    caixa, sugestao: 0, sugestaoCaixas: 0, qtdPedido: 0, pedidoOrigem: "NENHUM", manualOriginal: null, manualAjustado: false,
    qtdAtendida: 0, faltaCD: 0, caixasCD: 0, cobPosPedido: null, disponivelCD: null, fracionado: false, avisoCobertura: false, saldoCD: num(e.saldoCD), custo, valorPedido: 0, status: "fora", alertas: [],
  };
  if (!e.ativo) return r;
  if (estoque === null || estoque < 0 || demandaDia === null || exposicao === null) { r.status = "conferir"; aplicarManual(r, e); return r; }

  const classeAB = e.classeAbc === "A" || e.classeAbc === "B";
  r.seguranca = demandaDia * (p.diasSeguranca || 0) * (classeAB ? 1.5 : 1);
  r.minQ = Math.ceil(exposicao + demandaDia * p.diasMin);
  r.idealQ = Math.ceil(exposicao + demandaDia * p.diasIdeal + r.seguranca);
  r.maxQ = Math.ceil(exposicao + demandaDia * p.diasMax + r.seguranca);
  const projetado = r.projetado as number;
  const liquidoFis = Math.max(0, estoque - exposicao), liquidoProj = Math.max(0, projetado - exposicao);
  r.coberturaFisica = demandaDia > 0 ? liquidoFis / demandaDia : null;
  r.coberturaProjetada = demandaDia > 0 ? liquidoProj / demandaDia : null;

  if (demandaDia <= 0) {
    if (estoque < exposicao) r.status = estoque <= 0 ? (projetado <= 0 ? "ruptura" : "em_transito") : "abaixo";
    else r.status = "semdemanda";
  } else if (estoque <= 0) {
    r.status = projetado <= 0 ? "ruptura" : "em_transito"; // nota/pedido a caminho NÃO é ruptura
  } else if ((r.coberturaProjetada as number) < p.diasMin) r.status = "abaixo";
  else if ((r.coberturaFisica as number) < p.diasMin) r.status = "em_transito";
  else if ((r.coberturaProjetada as number) > p.diasMax) r.status = "excesso";
  else r.status = "ok";
  if (r.cadastroIncompleto) r.status = "cadastro";

  // Ponto de pedido: só repõe quando a cobertura projetada (com trânsito e pedidos abertos) cai abaixo do mínimo.
  const precisaRepor = demandaDia > 0 ? liquidoProj < demandaDia * p.diasMin : projetado < exposicao;
  const falta = r.idealQ - projetado;
  r.sugestao = precisaRepor ? paraCima(falta, caixa) : 0;
  r.sugestaoCaixas = r.sugestao / caixa;
  if (emTransito > 0 && estoque <= 0) r.alertas.push(`${emTransito} un em trânsito`);
  aplicarManual(r, e);
  return r;
}

function aplicarManual(r: Item2, e: Entrada2) {
  const m = e.pedidoManual;
  if (m !== null && m !== undefined && Number.isFinite(m) && m >= 0) {
    // O pedido manual vale exatamente como digitado (decisão da gestão); só avisa se não for múltiplo da caixa.
    r.manualOriginal = m;
    r.qtdPedido = Math.round(m);
    r.manualAjustado = false;
    r.pedidoOrigem = "MANUAL";
    if (r.caixa > 1 && r.qtdPedido % r.caixa !== 0) r.alertas.push(`Pedido manual de ${r.qtdPedido} un não é múltiplo da caixa (${r.caixa})`);
  } else {
    r.qtdPedido = r.sugestao;
    r.pedidoOrigem = r.sugestao > 0 ? "SUGESTAO" : "NENHUM";
  }
  r.valorPedido = r.qtdPedido * (r.custo ?? 0);
}

/**
 * Limita os pedidos ao saldo do CD, por SKU. Quando o CD não cobre todas as lojas, atende primeiro o pedido
 * MANUAL (decisão da gestão), depois ruptura, abaixo do mínimo e menor cobertura; sempre em caixa fechada.
 */
export function alocarCD(itens: Item2[], saldoCD: Map<string, number>): Item2[] {
  const porSku = new Map<string, Item2[]>();
  for (const i of itens) { const l = porSku.get(i.sku) ?? []; l.push(i); porSku.set(i.sku, l); }
  for (const [sku, lista] of porSku) {
    let restante = Math.max(0, saldoCD.get(sku) ?? 0);
    const ordenados = [...lista].sort((a, b) =>
      (a.pedidoOrigem === "MANUAL" ? 0 : 1) - (b.pedidoOrigem === "MANUAL" ? 0 : 1) ||
      STATUS2[a.status].ordem - STATUS2[b.status].ordem ||
      (a.coberturaProjetada ?? 9999) - (b.coberturaProjetada ?? 9999));
    const saldoTotal = Math.max(0, saldoCD.get(sku) ?? 0);
    for (const it of ordenados) {
      const quer = it.qtdPedido;
      it.disponivelCD = restante;                       // o que sobra do CD para esta loja, depois das de maior prioridade
      const emCaixas = Math.floor(restante / it.caixa) * it.caixa;
      const urgente = it.status === "ruptura" || it.status === "abaixo";
      let da = 0;
      if (quer > 0) {
        if (it.pedidoOrigem === "MANUAL") da = Math.min(quer, restante);   // decisão da gestão: a quantidade exata, até o saldo
        else if (restante >= quer) da = quer;                              // o CD cobre a sugestão (já em caixas)
        else if (urgente) da = restante;                                   // CD curto e a loja precisa: aloca o saldo que existe (solto)
        else da = Math.min(quer, emCaixas);                                // sem urgência: só caixa fechada
      }
      it.qtdAtendida = da; it.faltaCD = quer - da; it.saldoCD = saldoTotal; it.caixasCD = Math.floor(saldoTotal / it.caixa);
      it.fracionado = da > 0 && it.pedidoOrigem !== "MANUAL" && it.caixa > 1 && da % it.caixa !== 0;
      restante -= da;
      if (it.fracionado) it.alertas.push(`CD sem caixa fechada: enviando o saldo solto de ${da} un (caixa de ${it.caixa})`);
      if (it.faltaCD > 0) it.alertas.push(`CD não cobre: faltam ${it.faltaCD} un (saldo do CD: ${saldoTotal} un${it.caixa > 1 ? `, ${it.caixasCD} cx` : ""})`);
      if (it.demandaDia !== null && it.demandaDia > 0 && it.estoque !== null && it.exposicao !== null) {
        it.cobPosPedido = Math.max(0, (it.estoque + it.emTransito + it.pedidoAberto + da - it.exposicao)) / it.demandaDia;
        // Só avisa quando a CAIXA força o excesso (ou o pedido manual é grande); item solto (caixa 1) pedindo o mínimo de 1 un não é excesso.
        it.avisoCobertura = da > 0 && it.cobPosPedido > LIMITE_COBERTURA_AVISO && (it.caixa > 1 || it.pedidoOrigem === "MANUAL");
        if (it.avisoCobertura) it.alertas.push(`Cobertura de ${Math.round(it.cobPosPedido)} dias depois do pedido (acima de ${LIMITE_COBERTURA_AVISO})`);
      }
    }
  }
  return itens;
}

export type ResumoLoja2 = {
  ativos: number; avaliados: number; disponibilidade: number | null; contagem: Record<Status2, number>;
  itensPedido: number; unidadesPedido: number; valorPedido: number; emTransito: number; capitalParado: number; faltaCD: number;
};
export function resumirLoja2(itens: Item2[]): ResumoLoja2 {
  const contagem: Record<Status2, number> = { ruptura: 0, abaixo: 0, ok: 0, excesso: 0, semdemanda: 0, em_transito: 0, cadastro: 0, conferir: 0, fora: 0 };
  let ativos = 0, itensPedido = 0, unidadesPedido = 0, valorPedido = 0, emTransito = 0, capital = 0, faltaCD = 0;
  for (const i of itens) {
    if (!i.ativo) continue;
    ativos++; contagem[i.status]++;
    if (i.qtdPedido > 0) { itensPedido++; unidadesPedido += i.qtdPedido; valorPedido += i.valorPedido; }
    emTransito += i.emTransito; faltaCD += i.faltaCD;
    if ((i.estoque ?? 0) > 0 && i.custo && i.maxQ !== null && (i.estoque as number) > i.maxQ) capital += ((i.estoque as number) - i.maxQ) * i.custo;
    if ((i.estoque ?? 0) > 0 && i.custo && (i.demandaDia ?? 0) <= 0) capital += (i.estoque as number) * i.custo;
  }
  const avaliados = contagem.ruptura + contagem.abaixo + contagem.em_transito + contagem.ok + contagem.excesso;
  return { ativos, avaliados, disponibilidade: avaliados ? (avaliados - contagem.ruptura) / avaliados : null, contagem, itensPedido, unidadesPedido, valorPedido, emTransito, capitalParado: capital, faltaCD };
}
