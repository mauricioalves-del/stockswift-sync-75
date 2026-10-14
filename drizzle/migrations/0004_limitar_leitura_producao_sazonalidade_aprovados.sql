ALTER POLICY "bom_select_authenticated" ON public.ficha_tecnica_bom TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "periodos_sazonais_select_auth" ON public.periodos_sazonais TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "nec_mat_read_auth" ON public.necessidade_materiais_op TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.ficha_tecnica_bom AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.periodos_sazonais AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.necessidade_materiais_op AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));