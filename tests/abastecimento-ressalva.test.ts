import { describe, expect, test } from "bun:test";
import { erroQtdExtra, passoQtd } from "../src/lib/abastecimento-ressalva";

const saldo = (n: number) => ({ estoque: n, reservado_outros: 0, saldo_inicial: n });

describe("Fracionamento comercial", () => {
  test("permite 7 unidades de caixa de 18 ao marcar Fracionar", () => {
    expect(erroQtdExtra(7, 18, saldo(263), true)).toBeNull();
    expect(erroQtdExtra(7, 18, saldo(263))).not.toBeNull();
  });
  test("permite 5 unidades quando não há uma caixa completa no estoque", () => {
    expect(erroQtdExtra(5, 18, saldo(8), true)).toBeNull();
  });
  test("fracionar não permite ultrapassar o saldo nem enviar sem estoque", () => {
    expect(erroQtdExtra(9, 18, saldo(8), true)).not.toBeNull();
    expect(erroQtdExtra(1, 18, saldo(0), true)).not.toBeNull();
  });
  test("fracionamento mantém quantidade positiva e finita", () => {
    for (const n of [0, -1, NaN, Infinity]) expect(erroQtdExtra(n, 18, saldo(263), true)).not.toBeNull();
  });
  test("botões andam uma unidade no modo fracionado, respeitando o saldo", () => {
    expect(passoQtd(7, 1, 18, saldo(263), true)).toBe(8);
    expect(passoQtd(7, -1, 18, saldo(263), true)).toBe(6);
    expect(passoQtd(8, 1, 18, saldo(8), true)).toBe(8);
  });
  test("caixa fechada continua sendo o padrão", () => {
    expect(passoQtd(18, 1, 18, saldo(263))).toBe(36);
    expect(erroQtdExtra(36, 18, saldo(263))).toBeNull();
  });
});