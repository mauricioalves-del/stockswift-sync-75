CREATE POLICY "Aprovadores leem pedidos" ON public.abast_pedidos FOR SELECT TO authenticated
  USING (public.abast_eh_signatario(auth.uid(),'GERENTE_COMERCIAL') OR public.abast_eh_signatario(auth.uid(),'DIRETOR_OPERACIONAL') OR public.has_role(auth.uid(),'DIRETOR_OPERACOES'));
CREATE POLICY "Aprovadores leem itens de pedidos" ON public.abast_pedido_itens FOR SELECT TO authenticated
  USING (public.abast_eh_signatario(auth.uid(),'GERENTE_COMERCIAL') OR public.abast_eh_signatario(auth.uid(),'DIRETOR_OPERACIONAL') OR public.has_role(auth.uid(),'DIRETOR_OPERACOES'));