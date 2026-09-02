CREATE OR REPLACE FUNCTION public.fefo_norm_sku(_v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN btrim(coalesce(_v,'')) ~ '^[0-9]+$' AND length(btrim(_v)) < 8
      THEN lpad(btrim(_v), 8, '0')
    ELSE upper(btrim(coalesce(_v,'')))
  END
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT data AS d FROM public.checagens_fefo LOOP
    PERFORM public.processar_fefo(r.d);
  END LOOP;
END $$;