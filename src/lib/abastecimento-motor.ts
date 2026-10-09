// Motor único de reposição — porte fiel de "arquivo/versao5/motor.js" do Portal de Abastecimento.
//
// Por loja e SKU ATIVO no sortimento daquela loja:
//   venda/dia  = Linear Real da aba SOLICITAÇÃO LOJA
//   exposição  = exposição mínima (unidades que ficam na vitrine)
//   mínimo     = exposição + venda/dia × dias mínimos   (padrão 5)
//   ideal      = exposição + venda/dia × dias ideais    (padrão 10)
//   máximo     = exposição + venda/dia × dias máximos   (padrão 15)
//   cobertura  = (estoque − exposição) ÷ venda/dia
//   sugestão   = ideal − estoque − quantidade já em pedido/trânsito, arredondada para cima em caixa fechada
//   disponibilidade = itens avaliados sem ruptura ÷ itens avaliados (ruptura + abaixo + ok + excesso)

export type Dias = { min: number; ideal: number; max: number };
export const DIAS_PADRAO: Dias = { min: 5, ideal: 10, max: 15 };

export type StatusItem = "ruptura" | "abaixo" | "ok" | "excesso" | "semdemanda" | "cadastro" | "conferir" | "fora";

export const STATUS: Record<StatusItem, { rotulo: string; ordem: number }> = {
  ruptura: { rotulo: "Ruptura", ordem: 0 },
  abaixo: { rotulo: "Abaixo do mínimo", ordem: 1 },
  ok: { rotulo: "OK", ordem: 2 },
  excesso: { rotulo: "Excesso", ordem: 3 },
  semdemanda: { rotulo: "Sem demanda", ordem: 4 },
  cadastro: { rotulo: "Cadastro incompleto", ordem: 5 },
  conferir: { rotulo: "Dados a conferir", ordem: 6 },
  fora: { rotulo: "Fora do sortimento", ordem: 7 },
};

export type EntradaItem = {
  sku: string;
  descricao?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  ativo: boolean;            // ativo no sortimento da loja
  estoque: unknown;          // estoque da loja
  vendaDia: unknown;         // Linear Real
  exposicao: unknown;
  fullCase?: unknown;        // caixa fechada
  custo?: unknown;
  saldoCD?: unknown;
  emPedido?: number;         // já pedido e ainda não refletido no estoque
  vendas30?: unknown;
  masterPresente: boolean;   // SKU existe no cadastro/estoque do sistema
};

export type ItemReposicao = {
  sku: string; descricao: string; categoria: string; tipo: string; ativo: boolean;
  estoque: number | null; vendaDia: number | null; exposicao: number | null; caixa: number;
  custo: number | null; saldoCD: number | null; emPedido: number; vendas30: number;
  minQ: number | null; idealQ: number | null; maxQ: number | null; cobertura: number | null;
  sugestao: number; status: StatusItem; cadastroIncompleto: boolean;
};

/** Converte para número; vazio/inválido => null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function calcularItem(e: EntradaItem, dias: Dias = DIAS_PADRAO): ItemReposicao {
  const estoque = num(e.estoque);
  const venda = num(e.vendaDia);
  const vendaDia = venda === null ? null : Math.max(0, venda);
  const expo = num(e.exposicao);
  const exposicao = expo === null ? null : Math.max(0, expo);
  const fc = num(e.fullCase);
  const caixa = fc !== null && fc > 1 ? Math.ceil(fc) : 1;
  const emPedido = e.emPedido ?? 0;
  const r: ItemReposicao = {
    sku: e.sku, descricao: e.descricao ?? "", categoria: e.categoria ?? "", tipo: e.tipo ?? "", ativo: e.ativo,
    estoque, vendaDia, exposicao, caixa, custo: num(e.custo), saldoCD: num(e.saldoCD), emPedido,
    vendas30: num(e.vendas30) ?? 0,
    minQ: null, idealQ: null, maxQ: null, cobertura: null, sugestao: 0, status: "fora",
    cadastroIncompleto: !e.masterPresente,
  };
  if (!e.ativo) return r;

  if (estoque === null || estoque < 0 || vendaDia === null || exposicao === null) {
    r.status = "conferir";
    return r;
  }
  r.minQ = Math.ceil(exposicao + vendaDia * dias.min);
  r.idealQ = Math.ceil(exposicao + vendaDia * dias.ideal);
  r.maxQ = Math.ceil(exposicao + vendaDia * dias.max);
  const liquido = Math.max(0, estoque - exposicao);
  r.cobertura = vendaDia > 0 ? liquido / vendaDia : null;

  if (vendaDia <= 0) {
    if (estoque < exposicao) r.status = estoque <= 0 ? "ruptura" : "abaixo";
    else r.status = "semdemanda";
  } else if (estoque <= 0) r.status = "ruptura";
  else if ((r.cobertura as number) < dias.min) r.status = "abaixo";
  else if ((r.cobertura as number) > dias.max) r.status = "excesso";
  else r.status = "ok";

  // Item fora do cadastro: o saldo pode estar zerado só por falta de cadastro.
  // Continua com sugestão, mas não entra na disponibilidade.
  if (r.cadastroIncompleto) r.status = "cadastro";

  const q = r.idealQ - estoque - emPedido;
  r.sugestao = q > 0 ? Math.ceil(q / caixa) * caixa : 0;
  return r;
}

export type ResumoLoja = {
  contagem: Record<Exclude<StatusItem, "fora">, number>;
  ativos: number; avaliados: number; disponibilidade: number | null;
  repor: number; unidades: number; valorRepor: number;
  capital: number; acimaMax: number; semVenda: number; parado: number;
};

export function resumirLoja(itens: ItemReposicao[]): ResumoLoja {
  const c = { ruptura: 0, abaixo: 0, ok: 0, excesso: 0, semdemanda: 0, cadastro: 0, conferir: 0 };
  let ativos = 0, repor = 0, unidades = 0, valorRepor = 0, capital = 0, acimaMax = 0, semVenda = 0;
  for (const i of itens) {
    if (!i.ativo) continue;
    ativos++;
    c[i.status as keyof typeof c]++;
    if (i.sugestao > 0) { repor++; unidades += i.sugestao; valorRepor += i.sugestao * (i.custo || 0); }
    if ((i.estoque as number) > 0 && i.custo) {
      capital += (i.estoque as number) * i.custo;
      if (i.vendas30 <= 0 && (i.vendaDia || 0) <= 0) semVenda += (i.estoque as number) * i.custo;
      else if (i.maxQ !== null && (i.estoque as number) > i.maxQ) acimaMax += ((i.estoque as number) - i.maxQ) * i.custo;
    }
  }
  const avaliados = c.ruptura + c.abaixo + c.ok + c.excesso;
  return {
    contagem: c, ativos, avaliados,
    disponibilidade: avaliados ? (avaliados - c.ruptura) / avaliados : null,
    repor, unidades, valorRepor, capital, acimaMax, semVenda, parado: acimaMax + semVenda,
  };
}
