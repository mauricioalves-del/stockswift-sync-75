import { describe, expect, test } from "bun:test";
import { mapaGrupos } from "../src/lib/obsoletos";
import { chaveSku } from "../src/lib/abastecimento-ressalva";

// grupo_produtos guarda o código sem zeros à esquerda; o radar de obsoletos guarda com zeros.
describe("Filtro por grupo no Mapeamento de Risco — Obsoletos", () => {
  const grupos = mapaGrupos([
    { codigo_produto: "5104083", grupo: "Produto Acabado" },
    { codigo_produto: "190213159", grupo: "Embalagem" },
    { codigo_produto: "70303003", grupo: "  " },
    { codigo_produto: "70303003", grupo: "Materia Prima" },
  ]);

  test("SKU com zeros à esquerda encontra o grupo do cadastro", () => {
    expect(grupos.get(chaveSku("005104083"))).toBe("Produto Acabado");
    expect(grupos.get(chaveSku("0190213159"))).toBe("Embalagem");
  });

  test("grupo em branco não entra no mapa; a anotação válida vale", () => {
    expect(grupos.get(chaveSku("70303003"))).toBe("Materia Prima");
    expect(mapaGrupos([{ codigo_produto: "70303003", grupo: "  " }]).has("70303003")).toBe(false);
  });

  test("SKU fora do cadastro não tem grupo (cai em Sem grupo)", () => {
    expect(grupos.has(chaveSku("09908660622"))).toBe(false);
  });
});
