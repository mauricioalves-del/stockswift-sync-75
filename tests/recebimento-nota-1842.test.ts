import { expect, test } from "bun:test";

test("nota 1842 regularizada tem saldo pendente zero e preserva histórico", async () => {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (!base || !key || !sessionJson) throw new Error("Sessão de teste autenticada indisponível");
  const session = JSON.parse(sessionJson);
  const response = await fetch(`${base}/rest/v1/notas_transferencia_recebimento?id=eq.bd48c96b-3635-4ebd-b759-160f1e5006a3&select=nr_nf,recebimento,qtd,vt_total_item,dt_recebimento`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
  });
  expect(response.status).toBe(200);
  const rows = await response.json();
  expect(rows).toHaveLength(1);
  expect(rows[0].nr_nf).toBe("1842");
  expect(rows[0].recebimento).toBe("Regularizado");
  expect(rows.filter((r: { recebimento: string }) => r.recebimento === "Pendente")).toHaveLength(0);
  expect(Number(rows[0].qtd)).toBe(550);
  expect(Number(rows[0].vt_total_item)).toBe(2330.19);
  expect(rows[0].dt_recebimento).toBeNull();
});