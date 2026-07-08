DROP POLICY IF EXISTS coord_manage_permissoes ON public.permissoes;
CREATE POLICY admin_coord_manage_permissoes ON public.permissoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'));

DROP POLICY IF EXISTS coord_manage_perfis ON public.perfis;
CREATE POLICY admin_coord_manage_perfis ON public.perfis
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'));

DROP POLICY IF EXISTS coord_manage_modulos ON public.modulos_sistema;
CREATE POLICY admin_coord_manage_modulos ON public.modulos_sistema
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (has_role(auth.uid(),'COORDENADOR_CONTROLE') OR has_role(auth.uid(),'ADMINISTRADOR'));