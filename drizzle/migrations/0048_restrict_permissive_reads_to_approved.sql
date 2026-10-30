DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
      AND (tablename LIKE 'atlas\_%' OR tablename IN ('familias','locais','contexto_baixa_opcoes','grupo_produtos','inventarios_agendados','mapa_almoxarifados','modelos_checklist_itens','modelos_checklist','pre_inventario_itens','processo_inventario_acoes','modulos_sistema','tipos_acao_shelf_life','tipos_tarefa'))
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() IS NOT NULL AND public.usuario_aprovado(auth.uid()))', r.policyname, r.tablename);
  END LOOP;
END $$;