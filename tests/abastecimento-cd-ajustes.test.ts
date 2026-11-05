import { expect, test } from "bun:test";
import { aplicarAjustesCD, situacaoCD, type AjusteCD, type ItemValidacao, type Validacao } from "../src/lib/abastecimento-validacao";

const item = (sku: string, classe: ItemValidacao["classe"] = "LINHA"): ItemValidacao =>
  ({ sku, descricao: `Produto ${sku}`, categoria: null, ativo: true, classe, sem_classe: false, elegivel: classe === "LINHA" });
const aj = (sku: string, acao: AjusteCD["acao"], classe: AjusteCD["classe"] = null): AjusteCD =>
  ({ id: `a-${sku}`, sku, acao, descricao: `Produção ${sku}`, categoria: null, classe, motivo: "motivo teste", ativo: true, criado_nome: "Diretor", criado_em: "2026-11-05T12:00:00Z" });

test("Inativa item das lojas e inclui item fora da lista comercial", () => {
  const r = aplicarAjustesCD([{ ...item("5004001"), lojas: ["J"] }, { ...item("5004002"), lojas: ["J"] }],
    [aj("5004002", "INATIVAR"), aj("9990001", "INCLUIR", "MTO"), aj("5004001", "INCLUIR", "MTO")]);
  expect(r.map((i) => [i.sku, i.ativo, i.ajuste_diretor ?? null])).toEqual([
    ["5004001", true, null],            // inclusão de item que já está na lista é ignorada
    ["5004002", false, "INATIVADO"],
    ["9990001", true, "INCLUIDO"],
  ]);
  expect(r.find((i) => i.sku === "9990001")?.classe).toBe("MTO");
  expect(r.find((i) => i.sku === "9990001")?.elegivel).toBe(false);
});

test("Ciência que já contém os ajustes não fica desatualizada", () => {
  const loja: Validacao = { id: "l", competencia: "2026-11", loja: "J", versao: 1, status: "VALIDADA", aprovador_id: "x", aprovador_nome: "G", aprovado_em: "2026-11-01T10:00:00Z",
    observacao: null, itens: [item("5004001"), item("5004002")], totais: {}, diff: {}, origem_upload: [], desfeita_em: null, motivo_desfazer: null };
  const cd: Validacao = { ...loja, id: "c", loja: "CD", aprovado_em: "2026-11-02T10:00:00Z", itens: [item("5004001"), { ...item("5004002"), ativo: false }, item("9990001", "MTO")] };
  const ajustes = [aj("5004002", "INATIVAR"), aj("9990001", "INCLUIR", "MTO")];
  expect(situacaoCD([loja, cd], ["J"], "2026-11", ajustes).desatualizada).toBe(false);
  expect(situacaoCD([loja, cd], ["J"], "2026-11", []).desatualizada).toBe(true);
});
