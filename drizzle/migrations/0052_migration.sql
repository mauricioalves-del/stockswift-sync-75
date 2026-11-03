CREATE POLICY abast_produto_gerente ON public.abast_produto FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'GERENTE'::app_role)) WITH CHECK (has_role(auth.uid(), 'GERENTE'::app_role));
CREATE POLICY abast_produto_loja_gerente ON public.abast_produto_loja FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'GERENTE'::app_role)) WITH CHECK (has_role(auth.uid(), 'GERENTE'::app_role));
CREATE POLICY abast_config_gerente_expo ON public.abast_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'GERENTE'::app_role) AND chave LIKE 'expo\_padrao\_%')
  WITH CHECK (has_role(auth.uid(), 'GERENTE'::app_role) AND chave LIKE 'expo\_padrao\_%');