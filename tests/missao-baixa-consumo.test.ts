import { describe, expect, it } from "vitest";
import { sugerirBaixaConsumo, type ItemConsumo, type LinhaContadaConsumo } from "../src/lib/missao-baixa-consumo";

const item: ItemConsumo = { id: "i1", codigo_produto: "01902120370", descricao: "Embalagem caixa 4 bombons P", lote: "26112050", quantidade_prevista: 82 };
const linha = (q: number, lote = "26112050"): LinhaContadaConsumo => ({ lote, eh_nao_relacionado: false, quantidade_contada: q, saldo_sistemico_lote: 82 });
const lotes = new Map([["01902120370", [{ lote: "26112050", saldo: 90, custo_unitario: 1.5, unidade: "PC" }]]]);

function sugerir(opts: { contado?: number; pendente?: number; gerado?: number; transito?: number; linhas?: LinhaContadaConsumo[] } = {}) {
  return sugerirBaixaConsumo({
    itens: [item],
    linhasPorItem: new Map([["i1", opts.linhas ?? [linha(opts.contado ?? 65)]]]),
    lotesPorSku: lotes,
    pendentesPorSkuLote: new Map(opts.pendente ? [["01902120370|26112050", opts.pendente]] : []),
    geradasPorSkuLote: new Map(opts.gerado ? [["01902120370|26112050", opts.gerado]] : []),
    transitoPorSku: () => opts.transito ?? 0,
  });
}

describe("Baixa por consumo da missão", () => {
  it("gera a diferença Sistema − Contagem do lote usando o saldo congelado da missão", () => {
    const [s] = sugerir();
    expect(s.sistema).toBe(82);
    expect(s.quantidade).toBe(17);
    expect(s.custo_unitario).toBe(1.5);
    expect(s.marcadoPadrao).toBe(true);
  });
  it("não gera baixa quando a contagem é igual ou maior que o sistema", () => {
    expect(sugerir({ contado: 82 })).toHaveLength(0);
    expect(sugerir({ contado: 90 })).toHaveLength(0);
  });
  it("desconta baixas do mesmo lote já na fila de aprovação", () => {
    expect(sugerir({ pendente: 5 })[0].quantidade).toBe(12);
    const [coberto] = sugerir({ pendente: 20 });
    expect(coberto.quantidade).toBe(0);
    expect(coberto.marcadoPadrao).toBe(false);
  });
  it("não repete baixa já gerada por esta missão", () => {
    expect(sugerir({ gerado: 17 })[0].quantidade).toBe(0);
  });
  it("com estoque em trânsito mantém a quantidade mas exige confirmação manual", () => {
    const [s] = sugerir({ transito: 10 });
    expect(s.quantidade).toBe(17);
    expect(s.marcadoPadrao).toBe(false);
  });
  it("ignora lotes manuais e itens ainda não contados", () => {
    const manual: LinhaContadaConsumo = { lote: null, eh_nao_relacionado: true, quantidade_contada: 3, saldo_sistemico_lote: null };
    expect(sugerir({ linhas: [linha(65), manual] })[0].quantidade).toBe(17);
    expect(sugerir({ linhas: [] })).toHaveLength(0);
  });
});
