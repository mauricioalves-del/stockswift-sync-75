import { describe, expect, test } from "bun:test";
import { CAIXA_GRANEL, ehSolto } from "../src/lib/abastecimento-dados";
import { caixaDoProduto } from "../src/lib/abastecimento-ressalva";
import { calcularItem2 } from "../src/lib/abastecimento-motor2";

describe("Caixaria dos granéis", () => {
  test("granéis usam caixa de 30 bombons", () => {
    expect(CAIXA_GRANEL).toBe(30);
    expect(ehSolto("Granéis")).toBe(true);
    expect(caixaDoProduto(null, true)).toBe(30);
    expect(caixaDoProduto(50, true)).toBe(30);   // cadastro antigo de 50/100 não vale para granel
  });
  test("demais famílias seguem o cadastro de caixa", () => {
    expect(ehSolto("Tabletes")).toBe(false);
    expect(caixaDoProduto(12, false)).toBe(12);
  });
  test("sugestão de granel abaixo do mínimo arredonda para múltiplo de 30", () => {
    const it = calcularItem2({ sku: "05104039", ativo: true, masterPresente: true, estoque: 10, exposicao: 10, vendaDiaReal: 2.25, consensoDia: null, fatorRealizacao: null, classeAbc: null, fullCase: CAIXA_GRANEL, custo: null, saldoCD: 293, emTransito: 0, pedidoAberto: 0, pedidoManual: null } as any);
    expect(it.caixa).toBe(30);
    expect(it.sugestao).toBeGreaterThan(0);
    expect(it.sugestao % 30).toBe(0);
  });
});
