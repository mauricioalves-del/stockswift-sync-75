CREATE TABLE IF NOT EXISTS public.preferencias_usuario (
  usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tema_selecionado text NOT NULL DEFAULT 'atual',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferencias_usuario TO authenticated;
GRANT ALL ON public.preferencias_usuario TO service_role;
ALTER TABLE public.preferencias_usuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own prefs" ON public.preferencias_usuario;
CREATE POLICY "own prefs" ON public.preferencias_usuario FOR ALL TO authenticated
  USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);