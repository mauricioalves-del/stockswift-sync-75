ALTER POLICY params_select_auth ON public.parametros_abastecimento USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY pdc_select ON public.parametros_desconto_colaborador USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY "Authenticated users can view notas_transferencia_recebimento" ON public.notas_transferencia_recebimento USING (public.usuario_aprovado(auth.uid()));
ALTER POLICY "Authenticated users can insert notas_transferencia_recebimento" ON public.notas_transferencia_recebimento WITH CHECK (public.usuario_aprovado(auth.uid()));
ALTER POLICY "Authenticated users can update notas_transferencia_recebimento" ON public.notas_transferencia_recebimento USING (public.usuario_aprovado(auth.uid())) WITH CHECK (public.usuario_aprovado(auth.uid()));