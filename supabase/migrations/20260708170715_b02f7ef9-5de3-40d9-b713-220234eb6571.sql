
CREATE TABLE public.usuario_almoxarifados (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo_origem text NOT NULL REFERENCES public.origens(codigo_origem) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, codigo_origem)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuario_almoxarifados TO authenticated;
GRANT ALL ON public.usuario_almoxarifados TO service_role;

ALTER TABLE public.usuario_almoxarifados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_le_proprios_almox"
ON public.usuario_almoxarifados FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'ADMINISTRADOR')
  OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
);

CREATE POLICY "admin_coord_gerencia_almox"
ON public.usuario_almoxarifados FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMINISTRADOR')
  OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
)
WITH CHECK (
  public.has_role(auth.uid(), 'ADMINISTRADOR')
  OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
);

CREATE OR REPLACE FUNCTION public.almoxarifados_permitidos(_uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.usuario_almoxarifados WHERE user_id = _uid)
    THEN (SELECT array_agg(codigo_origem) FROM public.usuario_almoxarifados WHERE user_id = _uid)
    ELSE NULL
  END
$$;
