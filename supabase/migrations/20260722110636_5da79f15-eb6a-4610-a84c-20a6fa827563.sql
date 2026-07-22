
CREATE OR REPLACE FUNCTION public.proximo_numero_req_op()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'Req_OP_' || nextval('public.req_op_seq')::text
$$;
REVOKE ALL ON FUNCTION public.proximo_numero_req_op() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_numero_req_op() TO service_role;
