import { describe, expect, test } from "bun:test";
import { formatarCep, lerRespostaCep } from "../src/lib/cep";

describe("consulta de CEP", () => {
  test("lê resposta do ViaCEP", () => {
    expect(lerRespostaCep({ cep: "02442-110", logradouro: "Rua Francisco Py", bairro: "Lauzane Paulista", localidade: "São Paulo", uf: "SP" }))
      .toEqual({ cep: "02442110", endereco: "Rua Francisco Py", bairro: "Lauzane Paulista", cidade: "São Paulo", uf: "SP" });
  });
  test("lê resposta da BrasilAPI", () => {
    expect(lerRespostaCep({ cep: "02442110", street: "Rua Francisco Py", neighborhood: "Lauzane Paulista", city: "São Paulo", state: "sp" })?.uf).toBe("SP");
  });
  test("CEP inexistente não preenche nada", () => { expect(lerRespostaCep({ erro: true })).toBeNull(); expect(lerRespostaCep({ erro: "true" })).toBeNull(); });
  test("formata com hífen e ignora letras", () => { expect(formatarCep("02442a110")).toBe("02442-110"); expect(formatarCep("024")).toBe("024"); });
});
