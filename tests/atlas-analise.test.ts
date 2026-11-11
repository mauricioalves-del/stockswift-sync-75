import { expect, test, mock } from "bun:test";
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { analisarIA, compatibilidade, chaveSemelhanca } = await import("../src/lib/atlas-analise");

test("Compatibilidade de quantidade", () => {
  expect(compatibilidade(7, -7)).toBe("exata");
  expect(compatibilidade(8, -7)).toBe("compativel");
  expect(compatibilidade(3, -7)).toBe("parcial");
  expect(compatibilidade(1, -70)).toBe("presenca");
  expect(chaveSemelhanca("Envelope plastico transparente 50g")).toEqual(["envelope", "plastico", "transparente"]);
});

test("Sinal com quantidade exata supera o prior do motor", () => {
  const r = analisarIA(
    [{ hipotese: "Transferencia_Pendente", confianca: 44.5 }, { hipotese: "Avaria_Perda", confianca: 38.6 }],
    [{ fonte: "Baixas", titulo: "Baixa pendente", detalhe: "", hipotese: "Avaria_Perda", compat: "exata", qtd: 7 }],
    [{ hipotese: "Avaria_Perda", almoxarifado: "Almox_SP_Processo" }, { hipotese: "Transferencia_Pendente" }],
    { almoxarifado: "Almox_SP_Processo", categoria_produto: "Embalagem" },
  );
  expect(r.ranking[0].hipotese).toBe("Avaria_Perda");
  expect(r.ranking[0].prob).toBeGreaterThan(0.6);
  expect(r.confiabilidade).toBe("media");
  expect(r.ranking.reduce((s, x) => s + x.prob, 0)).toBeCloseTo(1);
});
