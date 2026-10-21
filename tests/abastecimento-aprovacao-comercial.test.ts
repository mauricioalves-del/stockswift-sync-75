import { expect, test } from "bun:test";

test("Comercial aprova extras fracionados e cria requisição sem Diretor; teste não persiste dados", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "null");
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session || !base || !key) throw new Error("Sessão de teste indisponível");
  const response = await fetch(`${base}/rest/v1/rpc/abast_testar_aprovacao_comercial`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Falha no teste transacional");
  expect(result.status).toBe("ABERTO");
  expect(result.extra_aceito).toBe(true);
  expect(result.extra_qtd).toBe(7);
  expect(result.requisicao_criada).toBe(true);
  expect(result.qtd_requisicao).toBe(8);
  expect(result.retorno).toBe("AGUARD_COMERCIAL");
  expect(result.legado_status).toBe("ABERTO");
  expect(result.sem_persistencia).toBe(true);
});