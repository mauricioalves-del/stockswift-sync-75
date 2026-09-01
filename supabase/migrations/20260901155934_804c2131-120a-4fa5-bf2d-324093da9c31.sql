CREATE OR REPLACE FUNCTION public.fefo_norm_sku(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN btrim(coalesce(_v,'')) ~ '^[0-9]+$'
    THEN lpad(btrim(_v), 8, '0') ELSE upper(btrim(coalesce(_v,''))) END
$$;