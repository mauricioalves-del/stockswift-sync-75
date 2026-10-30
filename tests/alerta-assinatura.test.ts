import { expect, test } from "bun:test";
import { assunto, html, montarEnvios, type Pendencia } from "../supabase/functions/alerta-assinatura-inventario/logica";

const P = (fid: number, papel: string, user: string | null, email: string | null, dias = 1): Pendencia => ({
  fechamento_id: fid, data_fechamento: "2026-10-27", almoxarifado: "Almox_SP_Loja", arquivo: null, total_itens: 100, total_divergentes: 5,
  valor_divergente: "285.30", dias_aberto: dias, papel, papel_nome: papel, origem_responsavel: user ? "Almoxarifado" : null, user_id: user, nome: user ? "Ana Souza" : null, email,
});

test("Um e-mail por responsável; sem responsável vai aos administradores", () => {
  const envios = montarEnvios(
    [P(122, "Responsavel_Departamento", "u1", "ana@x.com", 3), P(123, "Responsavel_Departamento", "u1", "ANA@x.com", 1), P(122, "Diretor_Operacoes", null, null, 3)],
    [{ user_id: "a1", email: "admin@x.com", nome: "Admin" }],
  );
  expect(envios.map((e) => [e.tipo, e.email, e.itens.map((i) => i.fechamento_id)])).toEqual([
    ["RESPONSAVEL", "ana@x.com", [122, 123]],
    ["SEM_RESPONSAVEL", "admin@x.com", [122]],
  ]);
  expect(assunto(envios[0])).toContain("2 fechamento(s) — 3 dia(s)");
  const h = html(envios[0], "https://app", "hoje");
  expect(h).toContain("/atlas/assinatura-fechamento/122?papel=Responsavel_Departamento");
  expect(h).toContain("Olá, Ana");
});

test("Sem pendência sem responsável, administradores não recebem", () => {
  expect(montarEnvios([P(1, "X", "u1", "a@x.com")], [{ user_id: "a1", email: "admin@x.com", nome: null }]).length).toBe(1);
});
