import { describe, it, expect } from "vitest";
import { podeConfirmarPendencia } from "../src/lib/missao-pendencia";

describe("confirmar pendência de contagem após 1 dia", () => {
  it("não permite no próprio dia da execução", () => {
    expect(podeConfirmarPendencia({ status: "PLANEJADA", data_execucao: "2026-11-16" }, "2026-11-16")).toBe(false);
  });
  it("permite a partir do dia seguinte", () => {
    expect(podeConfirmarPendencia({ status: "PLANEJADA", data_execucao: "2026-11-16" }, "2026-11-17")).toBe(true);
  });
  it("permite em andamento atrasada, inclusive na virada de mês", () => {
    expect(podeConfirmarPendencia({ status: "EM_ANDAMENTO", data_execucao: "2026-10-31" }, "2026-11-01")).toBe(true);
  });
  it("não permite missão concluída ou cancelada", () => {
    expect(podeConfirmarPendencia({ status: "CONCLUIDA", data_execucao: "2026-11-10" }, "2026-11-16")).toBe(false);
    expect(podeConfirmarPendencia({ status: "CANCELADA", data_execucao: "2026-11-10" }, "2026-11-16")).toBe(false);
  });
  it("não permite sem data de execução", () => {
    expect(podeConfirmarPendencia({ status: "PLANEJADA", data_execucao: null }, "2026-11-16")).toBe(false);
  });
});
