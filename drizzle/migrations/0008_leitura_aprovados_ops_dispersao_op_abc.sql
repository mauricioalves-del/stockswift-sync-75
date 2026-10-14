DROP POLICY IF EXISTS "leitura_autenticados_ops_excluidas" ON public.ops_excluidas_dispersao;
CREATE POLICY "leitura_autenticados_ops_excluidas" ON public.ops_excluidas_dispersao FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "ordens_producao_read_auth" ON public.ordens_producao;
CREATE POLICY "ordens_producao_read_auth" ON public.ordens_producao FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "abc read" ON public.classificacao_abc;
CREATE POLICY "abc read" ON public.classificacao_abc FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));