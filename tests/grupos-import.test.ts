import { describe, expect, test } from "bun:test";
import { lerPlanilhaGrupos, limparCodigo, planejarGrupos } from "../src/lib/grupos-import";

describe("Importador de Grupos — planilha do sistema", () => {
  test("lê as colunas Cód. Produto e Grupo e remove o marcador &apos;", () => {
    expect(limparCodigo("&apos;00104007")).toBe("00104007");
    const r = lerPlanilhaGrupos([{ "Cód. Produto": "05004148", Grupo: "Produto Acabado" }]);
    expect(r.linhas).toEqual([{ codigo: "05004148", grupo: "Produto Acabado", linha: 2 }]);
  });

  test("linha sem grupo é ignorada e não apaga o grupo atual", () => {
    const r = lerPlanilhaGrupos([{ "Cód. Produto": "00304009", Grupo: "" }]);
    expect(r.linhas).toHaveLength(0);
    expect(r.semGrupo).toEqual([2]);
  });

  test("código repetido: vale o cadastro ativo", () => {
    const r = lerPlanilhaGrupos([
      { "Cód. Produto": "&apos;00504007", Ativo: "Não", Grupo: "Produto Acabado" },
      { "Cód. Produto": "00504007", Ativo: "Sim", Grupo: "SubConjunto" },
    ]);
    expect(r.linhas.map((l) => l.grupo)).toEqual(["SubConjunto"]);
    expect(r.repetidos).toBe(1);
  });

  test("código já cadastrado sem zeros à esquerda é atualizado, sem duplicar", () => {
    const p = planejarGrupos([{ codigo: "005104083", grupo: "Embalagem" }], [{ codigo_produto: "5104083", grupo: "Produto Acabado" }]);
    expect(p.gravar).toEqual([{ codigo_produto: "5104083", grupo: "Embalagem" }]);
    expect(p.alterados).toBe(1);
  });

  test("grupo igual não é regravado; código novo é cadastrado", () => {
    const p = planejarGrupos(
      [{ codigo: "05004148", grupo: "Produto Acabado" }, { codigo: "9999", grupo: "EPIs" }],
      [{ codigo_produto: "05004148", grupo: "Produto Acabado" }],
    );
    expect(p.iguais).toBe(1);
    expect(p.novos).toBe(1);
    expect(p.gravar).toEqual([{ codigo_produto: "9999", grupo: "EPIs" }]);
  });
});
