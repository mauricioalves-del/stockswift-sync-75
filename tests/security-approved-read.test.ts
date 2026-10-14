import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const testSession = () => {
  const injected = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  return injected
    ? JSON.parse(injected)
    : JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8")).session;
};

test("Apenas perfis explicitamente aprovados podem consultar os três módulos", async () => {
  const session = testSession();
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error("Configuração de teste indisponível");
  const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  const allowed = async (uid: string | null) => {
    const response = await fetch(`${base}/rest/v1/rpc/equipe_aprovada_para_leitura`, {
      method: "POST", headers, body: JSON.stringify({ _uid: uid }),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  expect(await allowed(null)).toBe(false);
  expect(await allowed("00000000-0000-0000-0000-000000000000")).toBe(false);
  expect(await allowed(session.user.id)).toBe(true);
  for (const table of ["motivo_baixa", "checagens_fefo", "dispersao_acao_comentarios", "ficha_tecnica_bom", "periodos_sazonais", "necessidade_materiais_op"]) {
    const response = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, { headers });
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  }
});

for (const table of ["dispersao_causa_raiz", "fechamentos_mensais", "missoes"]) {
  test(`${table}: leitura preservada para equipe aprovada e ausente para acesso anônimo`, async () => {
    const session = testSession();
    const base = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!base || !key) throw new Error("Configuração de teste indisponível");
    const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
    const check = async (uid: string | null) => {
      const response = await fetch(`${base}/rest/v1/rpc/usuario_aprovado`, {
        method: "POST", headers, body: JSON.stringify({ _uid: uid }),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    expect(await check(session.user.id)).toBe(true);
    const approved = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, { headers });
    expect(approved.status).toBe(200);
    expect(Array.isArray(await approved.json())).toBe(true);
    const anonymous = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, { headers: { apikey: key } });
    if (anonymous.ok) expect(await anonymous.json()).toEqual([]);
    else expect([401, 403]).toContain(anonymous.status);
  });
}