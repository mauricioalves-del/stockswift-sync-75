import { expect, test } from "bun:test";

test("Revenda, embalagens e matérias-primas seguem para separação sem ultrapassar estoque", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "null");
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session || !base || !key) throw new Error("Sessão de teste indisponível");
  const response = await fetch(`${base}/rest/v1/rpc/abast_testar_insumos_pedido`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Falha no teste transacional");
  expect(result.grupos.map((g: { grupo: string }) => g.grupo)).toEqual(["Mercadoria de Revenda", "Embalagem", "Materia Prima"]);
  for (const grupo of result.grupos) {
    expect(grupo.status).toBe("ABERTO");
    expect(grupo.qtd_item).toBe(1);
    expect(grupo.qtd_requisicao).toBe(1);
    expect(grupo.limite_bloqueado).toBe(true);
  }
  expect(result.sem_persistencia).toBe(true);
});