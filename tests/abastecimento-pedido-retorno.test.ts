import { test, expect } from "bun:test";
import { statusAnterior, statusPedido } from "../src/lib/abastecimento-pedido-status";

test("Pedido aguardando diretor retorna à aprovação comercial", () => {
  expect(statusAnterior({ status: "AGUARD_DIRETOR", itens: [] })).toBe("AGUARD_COMERCIAL");
});
test("Retorno usa a etapa realmente anterior inclusive após cancelamento", () => {
  expect(statusAnterior({ status: "CANCELADO", historico_status: ["AGUARD_COMERCIAL", "AGUARD_DIRETOR"], itens: [] })).toBe("AGUARD_COMERCIAL");
});
test("Etapa aposentada fica acessível à aprovação comercial", () => {
  expect(statusPedido("AGUARD_DIRETOR")).toBe("AGUARD_COMERCIAL");
  expect(statusPedido("ABERTO")).toBe("ABERTO");
});
test("Pedido aprovado retorna somente ao comercial mesmo com aprovação antiga do Diretor", () => {
  expect(statusAnterior({ status: "ABERTO", aprov_diretor_em: "2026-10-21", itens: [] })).toBe("AGUARD_COMERCIAL");
});
test("Primeira etapa não permite retorno", () => {
  expect(statusAnterior({ status: "AGUARD_COMERCIAL", itens: [] })).toBeNull();
});
test("Somente administrador autenticado pode retornar um pedido e o resultado persiste", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "null");
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session || !base || !key) throw new Error("Sessão de teste indisponível");
  const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const role = await fetch(`${base}/rest/v1/rpc/has_role`, { method: "POST", headers, body: JSON.stringify({ _user_id: session.user.id, _role: "ADMINISTRADOR" }) });
  expect(await role.json()).toBe(true);
  const inserted = await fetch(`${base}/rest/v1/abast_pedidos`, { method: "POST", headers, body: JSON.stringify({ loja: "ELDORADO", status: "AGUARD_DIRETOR", criado_por: session.user.id, observacao: "Teste automatizado de retorno" }) });
  expect(inserted.status).toBe(201);
  const [order] = await inserted.json();
  try {
    const anonymous = await fetch(`${base}/rest/v1/rpc/abast_retornar_status`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: order.id, p_status_atual: "AGUARD_DIRETOR" }) });
    expect([401, 403]).toContain(anonymous.status);
    const returned = await fetch(`${base}/rest/v1/rpc/abast_retornar_status`, { method: "POST", headers, body: JSON.stringify({ p_id: order.id, p_status_atual: "AGUARD_DIRETOR" }) });
    expect(returned.status).toBe(200);
    expect((await returned.json()).para).toBe("AGUARD_COMERCIAL");
    const read = await fetch(`${base}/rest/v1/abast_pedidos?id=eq.${order.id}&select=status`, { headers });
    expect((await read.json())[0].status).toBe("AGUARD_COMERCIAL");
    const stale = await fetch(`${base}/rest/v1/rpc/abast_retornar_status`, { method: "POST", headers, body: JSON.stringify({ p_id: order.id, p_status_atual: "AGUARD_DIRETOR" }) });
    expect(stale.ok).toBe(false);
  } finally {
    const cleaned = await fetch(`${base}/rest/v1/abast_pedidos?id=eq.${order.id}`, { method: "DELETE", headers });
    expect(cleaned.ok).toBe(true);
  }
});