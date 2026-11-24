// Contagem de Inventário → fechamento oficial do Atlas. Monta, a partir da contagem final (recontagem quando houve),
// a mesma estrutura da planilha "Conciliação Contábil x Físico" e usa o importador oficial: custo contábil na data,
// recorrência, divergências com investigação do motor, histórico, ações de pós-inventário e assinaturas.
import { supabase } from "@/integrations/supabase/client";
import { ABA_FECHAMENTO, importarFechamento, type ResultadoFechamento } from "./atlas-fechamento";
import { carregarContexto, type Planilha } from "./atlas-importar";

const sb = supabase as any;
const CAB = ["Grupo", "Produto", "Descrição", "Almoxarifado", "Unid.", "Qtd.", "Contagem 1", "Status", "Resumo", "Obs", "Data"];

export type ItemInvFech = { codigo_produto: string; descricao: string | null; grupo: string | null; unidade: string | null; lote: string; qtd_sistema: number; qtd_contagem: number | null; qtd_final: number | null; divergente: boolean | null; qtd_recontagem: number | null; identificado_recontagem: boolean | null; origem_item: string; observacao: string | null; dupla_recontagem: string | null };

/** Uma linha por SKU (soma dos lotes): sistema × contagem final oficial. */
export function linhasDoInventario(itens: ItemInvFech[], almoxarifado: string, data: Date): unknown[][] {
  const por = new Map<string, ItemInvFech[]>();
  for (const i of itens) por.set(i.codigo_produto, [...(por.get(i.codigo_produto) ?? []), i]);
  const linhas: unknown[][] = [CAB];
  for (const [sku, ls] of por) {
    const sis = Math.round(ls.reduce((s, l) => s + Number(l.qtd_sistema || 0), 0) * 10000) / 10000;
    const cont = Math.round(ls.reduce((s, l) => s + Number(l.qtd_final ?? l.qtd_contagem ?? 0), 0) * 10000) / 10000;
    const recont = ls.filter((l) => l.qtd_recontagem != null);
    const resumo = [
      recont.length ? `Recontado${recont[0].dupla_recontagem ? ` pela ${recont[0].dupla_recontagem}` : ""} · identificado na 2ª contagem: ${recont.some((l) => l.identificado_recontagem) ? "Sim" : "Não"}` : null,
      ls.some((l) => l.origem_item === "manual") ? "Incluído manualmente na contagem" : null,
      ls.length > 1 ? `${ls.length} lotes` : null,
    ].filter(Boolean).join(" · ") || null;
    const obs = [...new Set(ls.map((l) => l.observacao).filter(Boolean))].join(" | ") || null;
    linhas.push([ls[0].grupo, sku, ls[0].descricao, almoxarifado, ls[0].unidade, sis, cont, Math.abs(cont - sis) < 0.0001 ? "Sem divergência" : "Divergência", resumo, obs, data]);
  }
  return linhas;
}

/** Gera o fechamento oficial de um inventário finalizado (uma única vez). */
export async function gerarFechamentoOficial(invId: string, progresso?: (t: string) => void): Promise<ResultadoFechamento> {
  const { data: inv, error } = await sb.from("inv_inventarios").select("*").eq("id", invId).single();
  if (error) throw error;
  if (inv.status !== "finalizado") throw new Error("Finalize o inventário antes de gerar o fechamento oficial.");
  if (inv.fechamento_id) throw new Error(`Este inventário já gerou o fechamento #${inv.fechamento_id}.`);
  progresso?.("lendo a contagem final…");
  const itens: any[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await sb.from("inv_itens").select("codigo_produto, descricao, grupo, unidade, lote, qtd_sistema, qtd_contagem, qtd_final, divergente, qtd_recontagem, identificado_recontagem, origem_item, observacao, dupla_recontagem_id").eq("inventario_id", invId).order("codigo_produto").range(de, de + 999);
    if (r.error) throw r.error; itens.push(...(r.data ?? [])); if (!r.data || r.data.length < 1000) break;
  }
  if (!itens.length) throw new Error("O inventário não tem itens.");
  const { data: duplas } = await sb.from("inv_duplas").select("id, nome").eq("inventario_id", invId);
  const nome = new Map(((duplas ?? []) as any[]).map((d) => [d.id, d.nome]));
  const d = new Date(inv.data_geracao); const dataInv = new Date(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T12:00:00");
  const linhas = linhasDoInventario(itens.map((i) => ({ ...i, dupla_recontagem: nome.get(i.dupla_recontagem_id) ?? null })), inv.almoxarifado, dataInv);
  const planilha: Planilha = { abas: [ABA_FECHAMENTO], ler: () => linhas };
  const ctx = await carregarContexto();
  const res = await importarFechamento(planilha, `Contagem de Inventário #${inv.numero} · ${inv.titulo}`, ABA_FECHAMENTO, ctx, progresso);
  await sb.from("inv_inventarios").update({ fechamento_id: res.fechamentoId, fechamento_gerado_em: new Date().toISOString() }).eq("id", invId);
  return res;
}
