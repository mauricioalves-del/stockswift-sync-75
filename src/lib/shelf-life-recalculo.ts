// Camada única de cálculo financeiro das Ações de Lote (Shelf Life).
// Usada tanto no formulário (edição individual) quanto no recálculo em massa.
// Preserva as regras já existentes em shelf-life-financeiro.ts por categoria.

import {
  categoriaDaCampanha,
  custoAcaoCalculado,
  savingRecuperadoCalculado,
  valorRecuperadoCalculado,
  type CategoriaFinanceira,
} from "@/lib/shelf-life-financeiro";
import { calcularPrecoComDesconto, PERCENTUAL_DESCONTO_PADRAO } from "@/lib/precos-venda";

export type AcaoBase = {
  id?: string;
  status: string;
  tipo_nome?: string | null;
  categoria_financeira?: string | null;
  quantidade_enderecada?: number | null;
  quantidade_recuperada?: number | null;
  custo_unitario?: number | null;
  custo_acao?: number | null;
  preco_venda_referencia?: number | null;
  percentual_desconto_aplicado?: number | null;
  preco_com_desconto?: number | null;
  valor_recuperado?: number | null;
  saving_recuperado?: number | null;
  baixa_operacional_id?: string | null;
};

export type ContextoCalculo = {
  /** Quantidade da baixa vinculada (quando houver), para derivar a recuperada. */
  quantidadeBaixa?: number | null;
  /** Preço de venda cadastrado do SKU, usado como fallback. */
  precoVendaCadastro?: number | null;
  /** % de desconto padrão vigente (parâmetro do sistema). */
  percentualPadrao?: number | null;
  /** A baixa vinculada é a execução da ação (ex.: Degustação)? Então não é perda. */
  baixaEhExecucao?: boolean;
};

export type ResultadoCalculo = {
  categoria: CategoriaFinanceira;
  custo_unitario: number;
  custo_acao: number;
  quantidade_recuperada: number;
  preco_praticado: number;
  valor_recuperado: number;
  saving_recuperado: number;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula todos os valores derivados de uma ação a partir dos dados-base.
 * Dados-base nunca são alterados aqui — a função é pura.
 */
export function calculateActionFinancials(acao: AcaoBase, ctx: ContextoCalculo = {}): ResultadoCalculo {
  const categoria = categoriaDaCampanha(acao as any);
  const qtdEnderecada = Math.max(0, num(acao.quantidade_enderecada));

  // Custo unitário: usa o cadastrado; se ausente, deriva do custo da ação histórico.
  let custoUnit = num(acao.custo_unitario);
  if (custoUnit <= 0 && qtdEnderecada > 0 && num(acao.custo_acao) > 0) {
    custoUnit = num(acao.custo_acao) / qtdEnderecada;
  }

  const custoAcao = custoAcaoCalculado(qtdEnderecada, custoUnit);

  // Quantidade recuperada é dado de negócio: preservada quando já informada.
  // Quando ausente (registros legados/importados), deriva de endereçada − baixa vinculada.
  let qtdRecuperada = num(acao.quantidade_recuperada);
  if (qtdRecuperada <= 0) {
    const qtdBaixa = acao.baixa_operacional_id && !ctx.baixaEhExecucao ? num(ctx.quantidadeBaixa) : 0;
    qtdRecuperada = Math.max(0, qtdEnderecada - qtdBaixa);
  }

  // Preço praticado (apenas categoria Vendas).
  let precoPraticado = num(acao.preco_com_desconto);
  if (precoPraticado <= 0) {
    const pv = num(acao.preco_venda_referencia) || num(ctx.precoVendaCadastro);
    const pct = acao.percentual_desconto_aplicado == null || acao.percentual_desconto_aplicado === ("" as any)
      ? num(ctx.percentualPadrao) || PERCENTUAL_DESCONTO_PADRAO
      : num(acao.percentual_desconto_aplicado);
    precoPraticado = pv > 0 ? calcularPrecoComDesconto(pv, pct) : 0;
  }

  const valorRecuperado = valorRecuperadoCalculado({
    categoria,
    quantidadeRecuperada: qtdRecuperada,
    custoUnitario: custoUnit,
    precoPraticado,
  });

  return {
    categoria,
    custo_unitario: round2(custoUnit * 100) / 100,
    custo_acao: custoAcao,
    quantidade_recuperada: qtdRecuperada,
    preco_praticado: round2(precoPraticado),
    valor_recuperado: valorRecuperado,
    saving_recuperado: savingRecuperadoCalculado(valorRecuperado, custoAcao),
  };
}

// ————— Janela de vinculação de baixa operacional —————

export const DIAS_JANELA_VINCULO = 7;

const soData = (v: unknown) => String(v ?? "").slice(0, 10);

export function janelaVinculo(dataValidade: string | null | undefined): { inicio: string; fim: string } | null {
  const d = soData(dataValidade);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const fim = new Date(`${d}T00:00:00`);
  fim.setDate(fim.getDate() + DIAS_JANELA_VINCULO);
  return { inicio: d, fim: fim.toISOString().slice(0, 10) };
}

export function dataDaBaixa(b: { data_ocorrencia?: string | null; data_solicitacao?: string | null }): string {
  return soData(b.data_ocorrencia ?? b.data_solicitacao);
}

/** Regra dos 7 dias: baixa entre a validade do lote e validade + 7 dias corridos. */
export function baixaDentroDaJanela(
  dataBaixa: string | null | undefined,
  dataValidade: string | null | undefined,
): boolean {
  const janela = janelaVinculo(dataValidade);
  if (!janela) return true; // sem validade informada, não há janela a validar
  const d = soData(dataBaixa);
  if (!d) return false;
  return d >= janela.inicio && d <= janela.fim;
}

export function formatarDataBR(iso: string | null | undefined): string {
  const d = soData(iso);
  return d ? d.split("-").reverse().join("/") : "—";
}
