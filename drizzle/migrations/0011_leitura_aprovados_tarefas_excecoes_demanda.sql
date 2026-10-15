DROP POLICY IF EXISTS tarefas_op_read ON public.tarefas_operacionais;
CREATE POLICY tarefas_op_read ON public.tarefas_operacionais FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS exc_select_auth ON public.excecoes_fefo;
CREATE POLICY exc_select_auth ON public.excecoes_fefo FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS de_select_auth ON public.demanda_extra;
CREATE POLICY de_select_auth ON public.demanda_extra FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));