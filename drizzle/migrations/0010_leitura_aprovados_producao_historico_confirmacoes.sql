DROP POLICY IF EXISTS "pc_select_authenticated" ON public.producao_consumo;
CREATE POLICY "pc_select_authenticated" ON public.producao_consumo FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "hc_select_auth" ON public.historico_consumo;
CREATE POLICY "hc_select_auth" ON public.historico_consumo FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view confirmacoes_recebimento" ON public.confirmacoes_recebimento;
CREATE POLICY "Authenticated users can view confirmacoes_recebimento" ON public.confirmacoes_recebimento FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can insert confirmacoes_recebimento" ON public.confirmacoes_recebimento;
CREATE POLICY "Authenticated users can insert confirmacoes_recebimento" ON public.confirmacoes_recebimento FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()));