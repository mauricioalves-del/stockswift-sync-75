import { expect, test } from "bun:test";
import { cotarPorTabelas, embalagemTermica, zonaEnvio, zonaPorCep } from "../src/lib/tms";

const emb = [{ nome: "Gelox M", tipo: "gelox", capacidade_kg: null, custo: 4.68 }, { nome: "Isopor P", tipo: "isopor", capacidade_kg: 3, custo: 19.9 }, { nome: "Isopor M", tipo: "isopor", capacidade_kg: 8, custo: 29.9 }, { nome: "Isopor GG", tipo: "isopor", capacidade_kg: 40, custo: 249.9 }];
test("Zonas por CEP e pelo histórico", () => {
  expect([zonaPorCep("04538-133"), zonaPorCep("09520-000"), zonaPorCep("13010-111"), zonaPorCep("20040-002"), zonaPorCep("66010-000")]).toEqual(["grande_sp", "grande_sp", "interior_sp", "fora_estado", "sp_para"]);
  expect(zonaEnvio({ uf: "SP", fora_sp: true, kg: null, origem_destino: null })).toBe("interior_sp");
  expect(zonaEnvio({ uf: "PA", fora_sp: true, kg: 108.5, origem_destino: "BEL / CGH" })).toBe("para_sp");
  expect(zonaEnvio({ uf: "RJ", fora_sp: true, kg: null, origem_destino: null })).toBe("fora_estado");
});
test("Embalagem térmica e cotação com 3 prestadores", () => {
  expect(embalagemTermica(5, emb)).toEqual({ custo: 29.9 + 3 * 4.68, itens: ["1× Isopor M", "3× Gelox M"] });
  const pres = [{ id: "a", nome: "Lalamove", tipo: "aplicativo", ativo: true }, { id: "b", nome: "Nelson", tipo: "pj", ativo: true }, { id: "c", nome: "Miguel", tipo: "pj", ativo: true }];
  const tab = [
    { id: "1", prestador_id: "a", modal: "aplicativo", zona: "grande_sp" as const, valor_fixo: 8, valor_km: 1.6, valor_kg: 0, minimo: 10, prazo_dias: 0, termico: false, ativo: true },
    { id: "2", prestador_id: "b", modal: "veiculo_proprio", zona: "grande_sp" as const, valor_fixo: 0, valor_km: 2, valor_kg: 0, minimo: 0, prazo_dias: 1, termico: false, ativo: true },
    { id: "3", prestador_id: "c", modal: "veiculo_proprio", zona: "grande_sp" as const, valor_fixo: 380, valor_km: 0, valor_kg: 0, minimo: 380, prazo_dias: 1, termico: false, ativo: true },
  ];
  const r = cotarPorTabelas({ zona: "grande_sp", peso_kg: 2, km_estimado: 12, termico: true, dias_ate_limite: 0 }, tab, pres, emb);
  expect(r.map((o) => o.prestador)).toEqual(["Lalamove", "Nelson", "Miguel"]); // prazo 0 primeiro
  expect(r[0].total).toBe(Math.round((8 + 19.2 + 19.9 + 2 * 4.68) * 100) / 100);
});
