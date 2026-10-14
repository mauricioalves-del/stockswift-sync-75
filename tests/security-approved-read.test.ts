import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

test("Apenas perfis explicitamente aprovados podem consultar os três módulos", async () => {
  const minted = JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8"));
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error("Configuração de teste indisponível");
  const headers = { apikey: key, Authorization: `Bearer ${minted.session.access_token}`, "Content-Type": "application/json" };
  const allowed = async (uid: string | null) => {
    const response = await fetch(`${base}/rest/v1/rpc/equipe_aprovada_para_leitura`, {
      method: "POST", headers, body: JSON.stringify({ _uid: uid }),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  expect(await allowed(null)).toBe(false);
  expect(await allowed("00000000-0000-0000-0000-000000000000")).toBe(false);
  expect(await allowed(minted.session.user.id)).toBe(true);
  for (const table of ["motivo_baixa", "checagens_fefo", "dispersao_acao_comentarios", "ficha_tecnica_bom", "periodos_sazonais", "necessidade_materiais_op"]) {
    const response = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, { headers });
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  }
});