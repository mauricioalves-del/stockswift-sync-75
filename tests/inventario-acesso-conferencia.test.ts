import { expect, test } from "bun:test";
import { acessoConferencia } from "../src/lib/inventario-acesso-conferencia";

test("Administrador vê contagem e recontagem sem participar da dupla", () => {
  expect(acessoConferencia(true, false)).toEqual({ visivel: true, visaoAdministrativa: true, podeLancar: false });
});

test("Usuário não escalado continua sem acesso à conferência", () => {
  expect(acessoConferencia(false, false).visivel).toBe(false);
});

test("Integrante mantém os lançamentos apenas na sua fase", () => {
  expect(acessoConferencia(false, true)).toEqual({ visivel: true, visaoAdministrativa: false, podeLancar: true });
  expect(acessoConferencia(true, true).podeLancar).toBe(true);
});