ALTER VIEW public.v_risco_obsoletos SET (security_invoker = true);
ALTER VIEW public.v_teste_industrial_consumo SET (security_invoker = true);
ALTER VIEW public.v_transferencias_fabrica_loja SET (security_invoker = true);
ALTER VIEW public.v_impacto_consumo SET (security_invoker = true);

ALTER FUNCTION public.bloquear_material_teste_ficha_tecnica() SET search_path = public;
ALTER FUNCTION public.congelar_producao_consumo() SET search_path = public;
ALTER FUNCTION public.preservar_empresa_producao_consumo() SET search_path = public;

CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

REVOKE EXECUTE ON FUNCTION public.recalcular_classificacao_abc(integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_classificacao_abc(integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.notificar_atlas_baixa_operacional() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validar_vinculo_baixa_campanha() FROM authenticated, anon, PUBLIC;