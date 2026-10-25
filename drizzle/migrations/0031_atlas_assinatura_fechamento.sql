-- Atlas fase 4: a ciência do fechamento de inventário é assinada também pelo Diretor de Operações e pelo
-- Coordenador Financeiro (que não são gestores no Stock Savvy). Libera só a INSERÇÃO da assinatura e do
-- registro correspondente na auditoria do Atlas; leitura e demais alterações seguem as regras da fase 1.
CREATE POLICY "atlas_conciliacoes_ciencia_assinar" ON public.atlas_conciliacoes_ciencia FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'DIRETOR_OPERACOES') OR public.has_role(auth.uid(), 'COORDENADOR_FINANCEIRO'));
CREATE POLICY "atlas_log_auditoria_assinar" ON public.atlas_log_auditoria FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'DIRETOR_OPERACOES') OR public.has_role(auth.uid(), 'COORDENADOR_FINANCEIRO'));