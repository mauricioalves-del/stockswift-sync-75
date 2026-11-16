-- atlas_ajustar_sequencias: lista fixa de tabelas (sem SQL dinâmico), mantém trava de gestor
CREATE OR REPLACE FUNCTION public.atlas_ajustar_sequencias()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Apenas gestor'; END IF;
  PERFORM setval('public.atlas_acoes_pos_inventario_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_acoes_pos_inventario), 0), 1), EXISTS (SELECT 1 FROM public.atlas_acoes_pos_inventario));
  PERFORM setval('public.atlas_ajustes_inventario_oficial_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_ajustes_inventario_oficial), 0), 1), EXISTS (SELECT 1 FROM public.atlas_ajustes_inventario_oficial));
  PERFORM setval('public.atlas_anexos_justificativa_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_anexos_justificativa), 0), 1), EXISTS (SELECT 1 FROM public.atlas_anexos_justificativa));
  PERFORM setval('public.atlas_auditorias_fefo_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_auditorias_fefo), 0), 1), EXISTS (SELECT 1 FROM public.atlas_auditorias_fefo));
  PERFORM setval('public.atlas_baixas_operacionais_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_baixas_operacionais), 0), 1), EXISTS (SELECT 1 FROM public.atlas_baixas_operacionais));
  PERFORM setval('public.atlas_casos_ml_feedback_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_casos_ml_feedback), 0), 1), EXISTS (SELECT 1 FROM public.atlas_casos_ml_feedback));
  PERFORM setval('public.atlas_checagens_fefo_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_checagens_fefo), 0), 1), EXISTS (SELECT 1 FROM public.atlas_checagens_fefo));
  PERFORM setval('public.atlas_checagens_fefo_movimento_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_checagens_fefo_movimento), 0), 1), EXISTS (SELECT 1 FROM public.atlas_checagens_fefo_movimento));
  PERFORM setval('public.atlas_conciliacoes_ciencia_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_conciliacoes_ciencia), 0), 1), EXISTS (SELECT 1 FROM public.atlas_conciliacoes_ciencia));
  PERFORM setval('public.atlas_conferencias_realizadas_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_conferencias_realizadas), 0), 1), EXISTS (SELECT 1 FROM public.atlas_conferencias_realizadas));
  PERFORM setval('public.atlas_consumo_op_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_consumo_op), 0), 1), EXISTS (SELECT 1 FROM public.atlas_consumo_op));
  PERFORM setval('public.atlas_dashboards_externos_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_dashboards_externos), 0), 1), EXISTS (SELECT 1 FROM public.atlas_dashboards_externos));
  PERFORM setval('public.atlas_dias_operacionais_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_dias_operacionais), 0), 1), EXISTS (SELECT 1 FROM public.atlas_dias_operacionais));
  PERFORM setval('public.atlas_divergencias_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_divergencias), 0), 1), EXISTS (SELECT 1 FROM public.atlas_divergencias));
  PERFORM setval('public.atlas_estado_treino_ml_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_estado_treino_ml), 0), 1), EXISTS (SELECT 1 FROM public.atlas_estado_treino_ml));
  PERFORM setval('public.atlas_execucoes_rotina_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_execucoes_rotina), 0), 1), EXISTS (SELECT 1 FROM public.atlas_execucoes_rotina));
  PERFORM setval('public.atlas_faturamento_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_faturamento), 0), 1), EXISTS (SELECT 1 FROM public.atlas_faturamento));
  PERFORM setval('public.atlas_fechamentos_inventario_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_fechamentos_inventario), 0), 1), EXISTS (SELECT 1 FROM public.atlas_fechamentos_inventario));
  PERFORM setval('public.atlas_fechamentos_stock_savvy_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_fechamentos_stock_savvy), 0), 1), EXISTS (SELECT 1 FROM public.atlas_fechamentos_stock_savvy));
  PERFORM setval('public.atlas_ficha_tecnica_bom_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_ficha_tecnica_bom), 0), 1), EXISTS (SELECT 1 FROM public.atlas_ficha_tecnica_bom));
  PERFORM setval('public.atlas_fornecedores_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_fornecedores), 0), 1), EXISTS (SELECT 1 FROM public.atlas_fornecedores));
  PERFORM setval('public.atlas_itens_fechamento_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_itens_fechamento), 0), 1), EXISTS (SELECT 1 FROM public.atlas_itens_fechamento));
  PERFORM setval('public.atlas_justificativas_ajuste_inventario_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_justificativas_ajuste_inventario), 0), 1), EXISTS (SELECT 1 FROM public.atlas_justificativas_ajuste_inventario));
  PERFORM setval('public.atlas_log_auditoria_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_log_auditoria), 0), 1), EXISTS (SELECT 1 FROM public.atlas_log_auditoria));
  PERFORM setval('public.atlas_lotes_ajuste_inventario_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_lotes_ajuste_inventario), 0), 1), EXISTS (SELECT 1 FROM public.atlas_lotes_ajuste_inventario));
  PERFORM setval('public.atlas_lotes_importacao_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_lotes_importacao), 0), 1), EXISTS (SELECT 1 FROM public.atlas_lotes_importacao));
  PERFORM setval('public.atlas_lotes_shelf_life_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_lotes_shelf_life), 0), 1), EXISTS (SELECT 1 FROM public.atlas_lotes_shelf_life));
  PERFORM setval('public.atlas_movimentacoes_brutas_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_movimentacoes_brutas), 0), 1), EXISTS (SELECT 1 FROM public.atlas_movimentacoes_brutas));
  PERFORM setval('public.atlas_movimentacoes_historico_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_movimentacoes_historico), 0), 1), EXISTS (SELECT 1 FROM public.atlas_movimentacoes_historico));
  PERFORM setval('public.atlas_movimentacoes_lote_diaria_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_movimentacoes_lote_diaria), 0), 1), EXISTS (SELECT 1 FROM public.atlas_movimentacoes_lote_diaria));
  PERFORM setval('public.atlas_pedidos_compra_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_pedidos_compra), 0), 1), EXISTS (SELECT 1 FROM public.atlas_pedidos_compra));
  PERFORM setval('public.atlas_perguntas_padrao_personalizadas_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_perguntas_padrao_personalizadas), 0), 1), EXISTS (SELECT 1 FROM public.atlas_perguntas_padrao_personalizadas));
  PERFORM setval('public.atlas_recebimentos_pedido_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_recebimentos_pedido), 0), 1), EXISTS (SELECT 1 FROM public.atlas_recebimentos_pedido));
  PERFORM setval('public.atlas_resumos_movimentacao_mensal_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_resumos_movimentacao_mensal), 0), 1), EXISTS (SELECT 1 FROM public.atlas_resumos_movimentacao_mensal));
  PERFORM setval('public.atlas_resumos_transferencias_mensal_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_resumos_transferencias_mensal), 0), 1), EXISTS (SELECT 1 FROM public.atlas_resumos_transferencias_mensal));
  PERFORM setval('public.atlas_rotinas_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_rotinas), 0), 1), EXISTS (SELECT 1 FROM public.atlas_rotinas));
  PERFORM setval('public.atlas_transferencias_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_transferencias), 0), 1), EXISTS (SELECT 1 FROM public.atlas_transferencias));
  PERFORM setval('public.atlas_usuarios_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.atlas_usuarios), 0), 1), EXISTS (SELECT 1 FROM public.atlas_usuarios));
  RETURN 38;
END $function$;

REVOKE EXECUTE ON FUNCTION public.atlas_ajustar_sequencias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atlas_ajustar_sequencias() TO authenticated, service_role;

-- Bases do ERP: leitura só para equipe aprovada; carga/limpeza só para gestores
DROP POLICY IF EXISTS "erp leitura" ON public.erp_faturamento;
DROP POLICY IF EXISTS "erp carga" ON public.erp_faturamento;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_faturamento;
CREATE POLICY "erp leitura" ON public.erp_faturamento FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_faturamento FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_faturamento FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_faturamento FROM anon;

DROP POLICY IF EXISTS "erp leitura" ON public.erp_faturamento_pendente;
DROP POLICY IF EXISTS "erp carga" ON public.erp_faturamento_pendente;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_faturamento_pendente;
CREATE POLICY "erp leitura" ON public.erp_faturamento_pendente FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_faturamento_pendente FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_faturamento_pendente FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_faturamento_pendente FROM anon;

DROP POLICY IF EXISTS "erp leitura" ON public.erp_saldo_estoque;
DROP POLICY IF EXISTS "erp carga" ON public.erp_saldo_estoque;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_saldo_estoque;
CREATE POLICY "erp leitura" ON public.erp_saldo_estoque FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_saldo_estoque FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_saldo_estoque FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_saldo_estoque FROM anon;

DROP POLICY IF EXISTS "erp leitura" ON public.erp_producao_op;
DROP POLICY IF EXISTS "erp carga" ON public.erp_producao_op;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_producao_op;
CREATE POLICY "erp leitura" ON public.erp_producao_op FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_producao_op FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_producao_op FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_producao_op FROM anon;

DROP POLICY IF EXISTS "erp leitura" ON public.erp_producao_mes;
DROP POLICY IF EXISTS "erp carga" ON public.erp_producao_mes;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_producao_mes;
CREATE POLICY "erp leitura" ON public.erp_producao_mes FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_producao_mes FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_producao_mes FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_producao_mes FROM anon;

DROP POLICY IF EXISTS "erp leitura" ON public.erp_importacoes;
DROP POLICY IF EXISTS "erp carga" ON public.erp_importacoes;
DROP POLICY IF EXISTS "erp limpeza" ON public.erp_importacoes;
CREATE POLICY "erp leitura" ON public.erp_importacoes FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "erp carga" ON public.erp_importacoes FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "erp limpeza" ON public.erp_importacoes FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
REVOKE ALL ON public.erp_importacoes FROM anon;
