GRANT SELECT, INSERT, UPDATE, DELETE ON public.abast_pedidos TO authenticated;
GRANT ALL ON public.abast_pedidos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abast_pedido_itens TO authenticated;
GRANT ALL ON public.abast_pedido_itens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abast_validacoes_portfolio TO authenticated;
GRANT ALL ON public.abast_validacoes_portfolio TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abast_signatarios TO authenticated;
GRANT ALL ON public.abast_signatarios TO service_role;