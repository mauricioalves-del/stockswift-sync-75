CREATE OR REPLACE FUNCTION public.validar_vinculo_baixa_campanha()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b RECORD;
BEGIN
  IF NEW.baixa_operacional_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.baixa_operacional_id IS NOT DISTINCT FROM NEW.baixa_operacional_id THEN
    RETURN NEW;
  END IF;

  SELECT codigo_produto, lote
    INTO b
    FROM public.baixa_operacional
   WHERE id = NEW.baixa_operacional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU e o lote.';
  END IF;

  IF upper(btrim(coalesce(b.codigo_produto,''))) <> upper(btrim(coalesce(NEW.sku,''))) THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU e o lote.';
  END IF;

  IF upper(btrim(coalesce(b.lote,''))) <> upper(btrim(coalesce(NEW.lote,''))) THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU e o lote.';
  END IF;

  RETURN NEW;
END;
$function$;