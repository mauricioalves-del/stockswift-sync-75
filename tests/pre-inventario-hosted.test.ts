import { expect, test } from "bun:test";

test("Pendências autenticadas preservam três blocos e aplicam os filtros de divergências e pós-inventário", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "null");
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session || !base || !key) throw new Error("Sessão de teste indisponível");
  const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  const read = async (table: string, params: Record<string, string>) => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const query = new URLSearchParams({ ...params, limit: "1000", offset: String(offset) });
      const response = await fetch(`${base}/rest/v1/${table}?${query}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Falha ao consultar pendências");
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  };
  const invs = await read("inventarios_agendados", { select: "almoxarifado", status: "eq.AGENDADO", order: "id" });
  const almox = invs[0]?.almoxarifado;
  if (!almox) throw new Error("Não há inventário agendado para verificar");
  const mappings = await read("atlas_almoxarifados", { select: "codigo", codigo_origem: `eq.${almox}` });
  const warehouses = new Set([almox, ...mappings.map((a) => a.codigo)]);
  const [baixas, reqs, recontagens, divergencias, acoes] = await Promise.all([
    read("baixa_operacional", { select: "valor_total", origem: `eq.${almox}`, status_fluxo: "in.(PENDENTE,ANALISE,APROVADA,AJUSTE_SOLICITADO)", order: "id" }),
    read("requisicoes", { select: "valor_total", or: `(origem_fornecedora.eq.${almox},origem_solicitante.eq.${almox})`, status: "in.(ENVIADA,APROVADA,EM_SEPARACAO)", order: "id" }),
    read("recontagem", { select: "id", origem: `eq.${almox}`, status: "eq.PENDENTE_RECONTAGEM", order: "id" }),
    read("atlas_divergencias", { select: "almoxarifado,status,origem,valor_estimado", order: "id" }),
    read("atlas_acoes_pos_inventario", { select: "almoxarifado,status", order: "id" }),
  ]);
  const response = await fetch(`${base}/rest/v1/rpc/pre_inventario_pendencias`, { method: "POST", headers, body: JSON.stringify({ p_almox: almox }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Falha na consulta de pendências");
  expect(result).toHaveLength(5);
  const row = (tipo: string) => result.find((p: any) => p.tipo === tipo);
  for (const [tipo, rows] of [["BAIXAS", baixas], ["REQUISICOES", reqs], ["RECONTAGEM", recontagens]] as const) {
    expect(Number(row(tipo)?.quantidade)).toBe(rows.length);
    expect(Number(row(tipo)?.valor)).toBeCloseTo(rows.reduce((sum, r) => sum + Number(r.valor_total ?? 0), 0), 2);
  }
  const div = divergencias.filter((d) => warehouses.has(d.almoxarifado) && ["Aberta", "Em_Investigacao"].includes(d.status) && (d.origem ?? "") !== "fechamento_inventario");
  expect(Number(row("DIVERGENCIAS")?.quantidade)).toBe(div.length);
  expect(Number(row("DIVERGENCIAS")?.valor)).toBeCloseTo(div.reduce((sum, d) => sum + Math.abs(Number(d.valor_estimado ?? 0)), 0), 2);
  const ap = acoes.filter((a) => warehouses.has(a.almoxarifado) && ["Pendente", "Em_Andamento"].includes(a.status));
  expect(Number(row("ACOES_POS_INVENTARIO")?.quantidade)).toBe(ap.length);
  expect(Number(row("ACOES_POS_INVENTARIO")?.valor)).toBe(0);
  expect(row("ACOES_POS_INVENTARIO")?.rota).toBe("/atlas/pos-inventario");
});