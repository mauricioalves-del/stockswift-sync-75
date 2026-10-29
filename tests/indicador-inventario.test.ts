import { expect, test } from "bun:test";
import { acaoVencida, resumir, type MissaoLinha } from "../src/lib/indicador-inventario";

const M = (id: string, data: string, status: string, concluida_em: string | null, tipo = "SEMANAL"): MissaoLinha =>
  ({ id, titulo: id, tipo, origem: "Alm_SP_Loja", data_execucao: data, status, concluida_em });

const missoes = [
  M("a", "2026-10-05", "CONCLUIDA", "2026-10-05T15:00:00Z"), // no prazo
  M("b", "2026-10-06", "CONCLUIDA", "2026-10-08T15:00:00Z"), // concluída com atraso
  M("c", "2026-10-07", "PLANEJADA", null),                   // atrasada em aberto
  M("d", "2026-10-30", "PLANEJADA", null),                   // futura: fora do universo
  M("e", "2026-10-10", "CANCELADA", null),                   // cancelada: ignorada
];
const itens = [
  { missao_id: "a", status_item: "OK", observacao: null },
  { missao_id: "a", status_item: "DIVERGENCIA_NEGATIVA", observacao: null },
  { missao_id: "b", status_item: "PENDENTE", observacao: null },
  { missao_id: "b", status_item: "SEPARADO", observacao: null }, // status de separação não entra
];

test("Aderência = missões no prazo ÷ missões vencidas", () => {
  const r = resumir(missoes, itens, "2026-10", "2026-10-29");
  expect([r.universo, r.noPrazo, r.comAtraso, r.atrasadasAbertas.length, r.futuras]).toEqual([3, 1, 1, 1, 1]);
  expect(r.aderencia).toBeCloseTo(1 / 3);
  expect(r.dentroDaMeta).toBe(false);
});

test("Conclusão no fim do dia em São Paulo ainda conta no prazo", () => {
  const r = resumir([M("x", "2026-10-05", "CONCLUIDA", "2026-10-06T02:30:00Z")], [], "2026-10", "2026-10-29");
  expect(r.noPrazo).toBe(1);
});

test("Acuracidade e pendências de encerramento", () => {
  const r = resumir(missoes, itens, "2026-10", "2026-10-29");
  expect(r.acuracidade).toBe(0.5);
  expect(r.divSemJustificativa).toBe(1);
  expect(r.encerradasIncompletas.map((m) => m.id)).toEqual(["b"]);
  expect(r.serie.at(-1)?.acumulada).toBeCloseTo(1 / 3);
});

test("Ação vencida só quando aberta e com prazo passado", () => {
  const base = { id: "1", etapa: "EXECUCAO", titulo: "t", descricao: null, origem: null, missao_id: null, responsavel_nome: null, concluida_em: null, created_at: "" } as const;
  expect(acaoVencida({ ...base, prazo: "2026-10-01", status: "ABERTA" }, "2026-10-29")).toBe(true);
  expect(acaoVencida({ ...base, prazo: "2026-10-01", status: "CONCLUIDA" }, "2026-10-29")).toBe(false);
});
