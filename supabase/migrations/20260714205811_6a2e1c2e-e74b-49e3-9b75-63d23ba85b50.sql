
-- Fix 1: Restrict auditoria SELECT to admins/gestores or the actor
DROP POLICY IF EXISTS "Autenticados leem auditoria" ON public.auditoria;
CREATE POLICY "auditoria_select_gestor_or_owner" ON public.auditoria
  FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR usuario = auth.uid());

-- Fix 2: Add ownership-scoped UPDATE policy for baixas-fotos bucket
CREATE POLICY "baixas-fotos update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'baixas-fotos'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_gestor(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'baixas-fotos'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_gestor(auth.uid()))
  );
