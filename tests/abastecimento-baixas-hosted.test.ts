import { expect, test } from "bun:test";
test("Criação e aprovação impedem usar saldo comprometido por baixas, sem persistir teste", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "null");
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session || !base || !key) throw new Error("Sessão de teste indisponível");
  const response = await fetch(`${base}/rest/v1/rpc/abast_testar_baixas_reposicao`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: "{}" });
  const r = await response.json();
  if (!response.ok) throw new Error(r.message ?? "Falha no teste transacional");
  expect(r.criacao_bloqueada).toBe(true);
  expect(r.aprovacao_bloqueada).toBe(true);
  expect(r.sem_persistencia).toBe(true);
});