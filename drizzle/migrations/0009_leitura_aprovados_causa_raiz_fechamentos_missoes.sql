ALTER POLICY dcr_select_authenticated ON public.dispersao_causa_raiz USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY fechamentos_select ON public.fechamentos_mensais USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY "missoes read" ON public.missoes USING (public.usuario_aprovado(auth.uid()));