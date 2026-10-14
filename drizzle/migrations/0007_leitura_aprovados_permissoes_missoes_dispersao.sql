ALTER POLICY "read_permissoes" ON public.permissoes USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY "missoes_itens read" ON public.missoes_itens USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY "pd_select_authenticated" ON public.parametros_dispersao USING (public.usuario_aprovado(auth.uid()));