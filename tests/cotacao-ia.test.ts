import { describe, expect, test } from "bun:test";
import { erroIA, normalizarOpcoesIA, prestadorDaPlataforma } from "../src/lib/cotacao-ia";

describe("estimativa de mercado por IA", () => {
  test("fica com no máximo 3 plataformas diferentes", () => {
    const r = normalizarOpcoesIA({ opcoes: [
      { plataforma: "Lalamove", modal: "aplicativo", valor_min: 40, valor_max: 60, valor_estimado: 50, prazo_dias: 0, observacao: "" },
      { plataforma: "LALAMOVE", modal: "aplicativo", valor_min: 30, valor_max: 50, valor_estimado: 40, prazo_dias: 0, observacao: "" },
      { plataforma: "Loggi", modal: "aplicativo", valor_min: 35, valor_max: 55, valor_estimado: 45, prazo_dias: 1, observacao: "" },
      { plataforma: "Correios SEDEX", modal: "correios", valor_min: 30, valor_max: 45, valor_estimado: 38, prazo_dias: 1, observacao: "" },
      { plataforma: "Uber Flash", modal: "aplicativo", valor_min: 30, valor_max: 45, valor_estimado: 38, prazo_dias: 0, observacao: "" },
    ] });
    expect(r.map((o) => o.plataforma)).toEqual(["Lalamove", "Loggi", "Correios SEDEX"]);
  });
  test("valor estimado fica dentro da faixa mínima e máxima", () => {
    const [o] = normalizarOpcoesIA({ opcoes: [{ plataforma: "Jadlog", modal: "rodoviario", valor_min: 120, valor_max: 80, valor_estimado: 300, prazo_dias: 3, observacao: "" }] });
    expect(o.valor_min).toBe(80); expect(o.valor_max).toBe(300); expect(o.valor_estimado).toBe(300);
    const [b] = normalizarOpcoesIA({ opcoes: [{ plataforma: "Braspress", modal: "rodoviario", valor_min: 100, valor_max: 200, valor_estimado: 0, prazo_dias: null, observacao: "" }] });
    expect(b.valor_estimado).toBe(150); expect(b.prazo_dias).toBeNull();
  });
  test("descarta opção sem preço e modal desconhecido vira rodoviário", () => {
    const r = normalizarOpcoesIA({ opcoes: [{ plataforma: "X", modal: "foguete", valor_min: 0, valor_max: 0, valor_estimado: 0 }, { plataforma: "Total Express", modal: "foguete", valor_min: 50, valor_max: 70, valor_estimado: 60 }] });
    expect(r).toHaveLength(1); expect(r[0].modal).toBe("rodoviario");
  });
  test("acha o prestador cadastrado com o nome da plataforma", () => {
    const pres = [{ id: "1", nome: "Nelson", ativo: true }, { id: "2", nome: "Lalamove", ativo: true }, { id: "3", nome: "Correios", ativo: false }];
    expect(prestadorDaPlataforma("Lalamove (moto)", pres)).toBe("2");
    expect(prestadorDaPlataforma("Correios SEDEX", pres)).toBeNull();
    expect(prestadorDaPlataforma("Loggi", pres)).toBeNull();
  });
  test("falta de créditos e limite de uso viram mensagens claras", () => {
    expect(erroIA(402)).toContain("créditos");
    expect(erroIA(429)).toContain("Aguarde");
  });
});
