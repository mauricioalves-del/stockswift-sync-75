import { supabase } from "@/integrations/supabase/client";

export type RecontagemRow = {
  id: string;
  inventario_id: string | null;
  item_missao_id: string | null;
  missao_id: string | null;
  codigo_produto: string;
  lote: string | null;
  descricao: string | null;
  id_local: string | null;
  origem: string | null;
  saldo_sistema: number | null;
  contagem: number | null;
  acuracidade: number | null;
  status: string | null;
};

/**
 * Ajusta o estoque sistêmico para refletir a contagem física aprovada.
 * Retorna a quantidade anterior (para auditoria) ou null se não havia registro.
 */
export async function ajustarEstoqueSistemico(params: {
  codigo_produto: string;
  lote: string | null;
  origem: string | null;
  nova_quantidade: number;
}): Promise<number | null> {
  const { codigo_produto, lote, origem, nova_quantidade } = params;
  let q: any = (supabase as any).from("estoque_sistemico")
    .select("id, quantidade").eq("id_produto", codigo_produto);
  if (lote) q = q.eq("lote", lote);
  if (origem) q = q.eq("origem", origem);
  const { data: existing } = await q.maybeSingle();
  const antes = existing ? Number(existing.quantidade ?? 0) : null;
  if (existing) {
    await (supabase as any).from("estoque_sistemico")
      .update({ quantidade: nova_quantidade }).eq("id", existing.id);
  }
  return antes;
}

/**
 * Aprova um item da fila de recontagem: registra aprovação, ajusta o estoque
 * sistêmico para a contagem final, marca o item da missão como OK e grava auditoria.
 */
export async function aprovarRecontagem(r: RecontagemRow): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const now = new Date().toISOString();
  const contadaFinal = Number(r.contagem ?? 0);
  const sistemicoAntes = Number(r.saldo_sistema ?? 0);

  // Ajusta o estoque sistêmico (verdade = contagem física)
  const qtdBanco = await ajustarEstoqueSistemico({
    codigo_produto: r.codigo_produto,
    lote: r.lote,
    origem: r.origem,
    nova_quantidade: contadaFinal,
  });

  // Se houver inventário vinculado, marca como aprovado
  if (r.inventario_id) {
    await supabase.from("inventario").update({
      status: "APROVADO",
      aprovado_por: userId,
      aprovado_em: now,
      saldo_sistemico: contadaFinal,
    }).eq("id", r.inventario_id);
  }

  // Se houver item de missão vinculado, marca como OK/finalizado
  if (r.item_missao_id) {
    await (supabase as any).from("missoes_itens")
      .update({ status_item: "OK", quantidade_contada: contadaFinal })
      .eq("id", r.item_missao_id);
  }

  // Atualiza a linha de recontagem
  const { error } = await supabase.from("recontagem").update({
    status: "APROVADO",
    aprovado_por: userId,
    aprovado_em: now,
    contagem: contadaFinal,
  }).eq("id", r.id);
  if (error) throw error;

  // Auditoria detalhada
  await (supabase as any).from("auditoria").insert({
    entidade: "recontagem",
    entidade_id: r.id,
    acao: "APROVAR_RECONTAGEM",
    usuario: userId,
    dados_antes: {
      saldo_sistemico_anterior: qtdBanco ?? sistemicoAntes,
      status: r.status,
    },
    dados_depois: {
      quantidade_contada_final: contadaFinal,
      saldo_sistemico_novo: contadaFinal,
      diferenca: contadaFinal - (qtdBanco ?? sistemicoAntes),
      codigo_produto: r.codigo_produto,
      lote: r.lote,
      id_local: r.id_local,
      origem: r.origem,
    },
    observacao: `Recontagem aprovada; sistêmico ajustado de ${qtdBanco ?? sistemicoAntes} para ${contadaFinal}.`,
  });
}

/**
 * Cria uma nova missão de recontagem (extraordinária) contendo apenas o item pendente,
 * reutilizando a tela padrão de execução de missões. Retorna o id da missão criada.
 */
export async function gerarMissaoRecontagem(r: RecontagemRow): Promise<string> {
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;

  const titulo = `Recontagem — ${r.codigo_produto}${r.lote ? ` / lote ${r.lote}` : ""}`;
  const { data: m, error } = await (supabase as any).from("missoes").insert({
    titulo,
    descricao: `Nova contagem solicitada pelo supervisor para o item ${r.codigo_produto}.`,
    tipo: "EXTRAORDINARIA",
    origem: r.origem || null,
    id_local: r.id_local || null,
    data_execucao: new Date().toISOString().slice(0, 10),
    status: "PLANEJADA",
    criado_por: userId,
  }).select().single();
  if (error) throw error;

  const { error: e2 } = await (supabase as any).from("missoes_itens").insert({
    missao_id: m.id,
    codigo_produto: r.codigo_produto,
    descricao: r.descricao ?? "",
    lote: r.lote ?? null,
    quantidade_prevista: Number(r.saldo_sistema ?? 0),
    status_item: "PENDENTE",
    recontagem_origem_id: r.id,
  });
  if (e2) throw e2;

  // Marca a fila como aguardando nova contagem
  await supabase.from("recontagem")
    .update({ status: "RECONTAGEM_OBRIGATORIA" })
    .eq("id", r.id);

  await (supabase as any).from("audit_logs").insert({
    usuario: userId,
    acao: "SOLICITAR_RECONTAGEM",
    entidade: "recontagem",
    entidade_id: r.id,
    payload: { missao_id: m.id, codigo_produto: r.codigo_produto, lote: r.lote },
  });

  return m.id as string;
}
