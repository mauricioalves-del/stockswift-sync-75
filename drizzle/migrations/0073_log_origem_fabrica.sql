CREATE OR REPLACE FUNCTION public.log_origem_fabrica() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('nome', valor->>'nome', 'lat', (valor->>'lat')::numeric, 'lng', (valor->>'lng')::numeric)
  FROM public.app_config WHERE chave = 'log_origem'
    AND (public.log_meu_prestador() IS NOT NULL OR public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role))
$$;
REVOKE ALL ON FUNCTION public.log_origem_fabrica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_origem_fabrica() TO authenticated;