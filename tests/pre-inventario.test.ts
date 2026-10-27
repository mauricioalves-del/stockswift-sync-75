import { expect, test } from "bun:test";
import { aberturaPreparacao, bloqueiosLiberacao, CHECKLIST_PADRAO, diasEntre, faseDe, progresso, somaDias } from "../src/lib/pre-inventario";

const inv = (status: any = "AGENDADO") => ({ status, data_inventario: "2026-11-10", antecedencia_dias: 7 });

test("Preparação abre X dias antes do inventário", () => {
  expect(aberturaPreparacao(inv())).toBe("2026-11-03");
  expect(somaDias("2026-12-30", 3)).toBe("2027-01-02");
  expect(diasEntre("2026-10-27", "2026-11-10")).toBe(14);
});

test("Fases do ciclo por data e status", () => {
  expect(faseDe(inv(), "2026-11-02")).toBe("agendado");
  expect(faseDe(inv(), "2026-11-03")).toBe("preparacao");
  expect(faseDe(inv(), "2026-11-09")).toBe("preparacao");
  expect(faseDe(inv(), "2026-11-10")).toBe("atrasado");
  expect(faseDe(inv("APTO"), "2026-11-20")).toBe("apto");
  expect(faseDe(inv("REALIZADO"), "2026-11-01")).toBe("realizado");
  expect(faseDe(inv("CANCELADO"), "2026-11-05")).toBe("cancelado");
});

test("Liberação exige obrigatórios concluídos; opcionais não bloqueiam", () => {
  const itens = [{ obrigatorio: true, concluido: true }, { obrigatorio: true, concluido: false }, { obrigatorio: false, concluido: false }];
  expect(progresso(itens)).toMatchObject({ total: 3, feitos: 1, faltamObrigatorios: 1, pct: 33 });
  expect(bloqueiosLiberacao(itens, [], "")).toHaveLength(1);
  expect(bloqueiosLiberacao([{ obrigatorio: true, concluido: true }, { obrigatorio: false, concluido: false }], [], "")).toEqual([]);
});

test("Pendências em aberto exigem justificativa", () => {
  const ok = [{ obrigatorio: true, concluido: true }];
  expect(bloqueiosLiberacao(ok, [{ quantidade: 2 }, { quantidade: 0 }], "  ")).toEqual(["Há 2 pendência(s) em aberto: justifique para liberar com ressalvas."]);
  expect(bloqueiosLiberacao(ok, [{ quantidade: 2 }], "NF da transferência chega amanhã")).toEqual([]);
});

test("Checklist padrão cobre organização, documentos e contagem", () => {
  expect(new Set(CHECKLIST_PADRAO.map((i) => i.etapa))).toEqual(new Set(["Organização física", "Documentos e sistema", "Contagem"]));
  expect(CHECKLIST_PADRAO.filter((i) => i.obrigatorio).length).toBeGreaterThan(5);
});
