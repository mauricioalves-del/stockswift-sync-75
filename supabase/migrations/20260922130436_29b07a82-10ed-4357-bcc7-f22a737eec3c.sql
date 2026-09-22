DROP POLICY IF EXISTS "ped_select_auth" ON public.produtos_excluidos_dispersao;
CREATE POLICY "ped_select_gestor"
ON public.produtos_excluidos_dispersao
FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "leitura_autenticados_materiais_bloqueados" ON public.materiais_bloqueados_ficha_tecnica;
CREATE POLICY "leitura_gestores_materiais_bloqueados"
ON public.materiais_bloqueados_ficha_tecnica
FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "checklist_exec_read" ON public.checklist_execucao;
CREATE POLICY "checklist_exec_read_responsavel_gestor"
ON public.checklist_execucao
FOR SELECT
TO authenticated
USING (
  public.is_gestor(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.tarefas_operacionais t
    WHERE t.id = checklist_execucao.tarefa_id
      AND t.responsavel_id = auth.uid()
  )
);