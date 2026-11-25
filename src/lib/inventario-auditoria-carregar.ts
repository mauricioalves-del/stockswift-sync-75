import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "./fetch-all";
import { comparativo, type DadosInv, type FiltroInv } from "./atlas-inventario";
import type { PacoteAuditoria, InventarioAudit } from "./inventario-auditoria-excel";

// Todas as leituras usam a sessão do navegador e as permissões existentes.
const sb = supabase as any;
async function porIds<T>(tabela: string, coluna: string, ids: (string | number)[]): Promise<T[]> {
  const linhas: T[] = [];
  for (let n = 0; n < ids.length; n += 100) linhas.push(...await fetchAll<T>((a, z) => sb.from(tabela).select("*").in(coluna, ids.slice(n, n + 100)).order("id").range(a, z)));
  return linhas;
}
export async function carregarAuditoriaExcel(dados: DadosInv, filtro: FiltroInv): Promise<PacoteAuditoria> {
  const ids = dados.fechamentos.filter((f) => (!filtro.almox || f.almoxarifado === filtro.almox) && (!filtro.mes || f.mes === filtro.mes)).map((f) => f.id);
  const [fechamentos, todosInv, assinaturas] = await Promise.all([
    porIds<Record<string, unknown>>("atlas_fechamentos_inventario", "id", ids),
    fetchAll<InventarioAudit>((a, z) => sb.from("inv_inventarios").select("*").order("id").range(a, z)),
    porIds<PacoteAuditoria["assinaturas"][number]>("atlas_conciliacoes_ciencia", "fechamento_id", ids),
  ]);
  const inventarios = todosInv.filter((i) => ids.includes(Number(i.fechamento_id)) || fechamentos.some((f) => String(f["arquivo_origem"] ?? "").startsWith(`Contagem de Inventário #${i.numero} ·`)));
  const invIds = inventarios.map((i) => i.id);
  const [itens, duplas, histInv] = await Promise.all([
    porIds<PacoteAuditoria["itens"][number]>("inv_itens", "inventario_id", invIds),
    porIds<PacoteAuditoria["duplas"][number]>("inv_duplas", "inventario_id", invIds),
    porIds<PacoteAuditoria["historico"][number]>("auditoria", "entidade_id", invIds),
  ]);
  const histItens = await porIds<PacoteAuditoria["historico"][number]>("auditoria", "entidade_id", itens.map((i) => i.id));
  const historico = [...histInv, ...histItens].filter((h) => h.entidade === "inv_inventarios" || h.entidade === "inv_itens").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const usuariosIds = [...new Set([...itens.flatMap((i) => [i.contado_por, i.recontado_por]), ...duplas.flatMap((d) => [d.membro1, d.membro2]), ...inventarios.map((i) => i.finalizado_por), ...historico.map((h) => h.usuario)].filter((id): id is string => !!id))];
  const usuarios = await porIds<PacoteAuditoria["usuarios"][number]>("profiles", "id", usuariosIds);
  const validades = new Map<string, Map<string, string | null>>();
  for (const inv of inventarios) {
    const seusItens = itens.filter((i) => i.inventario_id === inv.id);
    const faturados = new Set(seusItens.filter((i) => i.qtd_faturada > 0).map((i) => i.codigo_produto));
    const lotes = [...new Set(seusItens.filter((i) => faturados.has(i.codigo_produto)).map((i) => i.lote.trim()).filter(Boolean))];
    const v = new Map<string, string | null>();
    for (let n = 0; n < lotes.length; n += 100) {
      const estoque = await fetchAll<{ lote: string; data_validade: string | null }>((a, z) => sb.from("estoque_sistemico").select("lote,data_validade").in("lote", lotes.slice(n, n + 100)).order("id").range(a, z));
      for (const l of estoque) { const ant = v.get(l.lote.trim()); if (l.data_validade && (!ant || l.data_validade < ant)) v.set(l.lote.trim(), l.data_validade); }
    }
    validades.set(inv.id, v);
  }
  const c = comparativo(dados, filtro);
  return { dados, filtro, inventarios, itens, duplas, usuarios, historico, assinaturas, fechamentos, validades, geradoEm: new Date().toISOString(), indicadores: { "Acurácia item a item (%)": c.item, "IAQ (%)": c.iaq, "IAP (%)": c.iap, "Valor divergente (R$)": c.divergenteTotal, "Valor ponderado do inventário (R$)": c.portfolio, "Cobertura de custo (%)": c.cobertura } };
}