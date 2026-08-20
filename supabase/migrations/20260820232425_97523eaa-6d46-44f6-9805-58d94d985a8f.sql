CREATE POLICY "profiles_select_gestor" ON public.profiles FOR SELECT TO authenticated
USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'::app_role));