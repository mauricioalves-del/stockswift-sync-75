import { describe, expect, test } from "bun:test";
import { detalhesRupturaDia } from "../src/lib/abastecimento-ruptura-dia";
import type { HistLinha } from "../src/lib/abastecimento-dash-hist";
const foto = (data: string, em_ruptura: boolean, loja = "CD", id_produto = "05004015"): HistLinha => ({ data, em_ruptura, loja, id_produto, descricao: "Produto", categoria: "Produto Acabado" });
describe("Detalhes da ruptura de um dia", () => {
  test("inclui somente itens em ruptura na foto selecionada", () => {
    const rows = [foto("2026-10-16", true), foto("2026-10-16", false, "PATIO")];
    expect(detalhesRupturaDia(rows, rows).map((r) => r.loja)).toEqual(["CD"]);
  });
  test("mede da entrada até a primeira foto resolvida e não confunde nova ocorrência", () => {
    const rows = [foto("2026-10-14", false), foto("2026-10-15", true), foto("2026-10-16", true), foto("2026-10-17", false), foto("2026-10-18", true)];
    expect(detalhesRupturaDia([rows[2]], rows)[0]).toMatchObject({ entrada: "2026-10-15", resolvidaEm: "2026-10-17", dias: 2, parcial: false });
  });
  test("ruptura sem resolução mantém contagem até a última foto do próprio item", () => {
    const rows = [foto("2026-10-15", false), foto("2026-10-16", true), foto("2026-10-17", true), foto("2026-10-20", false, "PATIO")];
    expect(detalhesRupturaDia([rows[1]], rows)[0]).toMatchObject({ resolvidaEm: null, dias: 2 });
  });
  test("marca lacunas e início desconhecido como histórico parcial", () => {
    const rows = [foto("2026-10-16", true), foto("2026-10-19", false)];
    expect(detalhesRupturaDia([rows[0]], rows)[0]).toMatchObject({ parcial: true, dias: 3 });
  });
});