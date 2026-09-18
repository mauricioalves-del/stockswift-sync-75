ALTER TABLE public.produtos_excluidos_dispersao ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.produtos_excluidos_dispersao TO authenticated;
GRANT ALL ON public.produtos_excluidos_dispersao TO service_role;
CREATE POLICY "ped_select_auth" ON public.produtos_excluidos_dispersao FOR SELECT TO authenticated USING (true);
CREATE POLICY "ped_write_gestor" ON public.produtos_excluidos_dispersao FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));