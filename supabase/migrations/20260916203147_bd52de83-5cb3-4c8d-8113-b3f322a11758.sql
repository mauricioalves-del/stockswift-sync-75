ALTER VIEW public.v_risco_obsoletos SET (security_invoker = on);
ALTER VIEW public.v_impacto_consumo SET (security_invoker = on);

ALTER TABLE public.materiais_bloqueados_ficha_tecnica ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.materiais_bloqueados_ficha_tecnica TO authenticated;
GRANT ALL ON public.materiais_bloqueados_ficha_tecnica TO service_role;
CREATE POLICY "leitura_autenticados_materiais_bloqueados" ON public.materiais_bloqueados_ficha_tecnica FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestores_gerenciam_materiais_bloqueados" ON public.materiais_bloqueados_ficha_tecnica FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

ALTER TABLE public.ops_excluidas_dispersao ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ops_excluidas_dispersao TO authenticated;
GRANT ALL ON public.ops_excluidas_dispersao TO service_role;
CREATE POLICY "leitura_autenticados_ops_excluidas" ON public.ops_excluidas_dispersao FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestores_gerenciam_ops_excluidas" ON public.ops_excluidas_dispersao FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));