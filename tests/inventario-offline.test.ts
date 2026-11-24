import { describe, expect, it } from "vitest";
import { aplicarPendentes, chaveRegistrar, enfileirar, type OpOffline } from "../src/lib/inventario-offline";
const op = (qtd: number): OpOffline => ({ tipo: "registrar", chave: chaveRegistrar("i1", "contagem", "qtd"), inv: "x", item: "i1", fase: "contagem", qtd, identificado: null, obs: null, em: "" });
describe("fila offline do inventário", () => {
  it("mantém só o último valor digitado offline para o mesmo item", () => {
    const f = enfileirar(enfileirar([], op(1)), op(10));
    expect(f).toHaveLength(1); expect((f[0] as any).qtd).toBe(10);
  });
  it("mostra na tela a quantidade pendente de envio", () => {
    const l = aplicarPendentes([{ id: "i1", qtd: null, observacao: null, identificado: null }], [op(7)], "contagem");
    expect(l[0]?.qtd).toBe(7);
  });
});
