WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY baixa_operacional_id ORDER BY created_at, id) AS rn
    FROM public.campanhas_lote
   WHERE baixa_operacional_id IS NOT NULL
)
UPDATE public.campanhas_lote c
   SET baixa_operacional_id = NULL
  FROM ranked r
 WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS campanhas_lote_baixa_unica
  ON public.campanhas_lote (baixa_operacional_id)
  WHERE baixa_operacional_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_vinculo_baixa_campanha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  d_baixa date;
BEGIN
  IF NEW.baixa_operacional_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.baixa_operacional_id IS NOT DISTINCT FROM NEW.baixa_operacional_id THEN
    RETURN NEW;
  END IF;

  SELECT codigo_produto, lote, data_ocorrencia, data_solicitacao
    INTO b
    FROM public.baixa_operacional
   WHERE id = NEW.baixa_operacional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU, lote e período permitido de vinculação.';
  END IF;

  IF upper(btrim(coalesce(b.codigo_produto,''))) <> upper(btrim(coalesce(NEW.sku,''))) THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU, lote e período permitido de vinculação.';
  END IF;

  IF upper(btrim(coalesce(b.lote,''))) <> upper(btrim(coalesce(NEW.lote,''))) THEN
    RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU, lote e período permitido de vinculação.';
  END IF;

  IF NEW.data_validade IS NOT NULL THEN
    d_baixa := coalesce(b.data_ocorrencia, b.data_solicitacao::date);
    IF d_baixa IS NULL
       OR d_baixa < NEW.data_validade
       OR d_baixa > (NEW.data_validade + 7) THEN
      RAISE EXCEPTION 'Esta baixa não pode ser vinculada a esta ação. Verifique o SKU, lote e período permitido de vinculação.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_vinculo_baixa ON public.campanhas_lote;
CREATE TRIGGER trg_validar_vinculo_baixa
  BEFORE INSERT OR UPDATE OF baixa_operacional_id ON public.campanhas_lote
  FOR EACH ROW EXECUTE FUNCTION public.validar_vinculo_baixa_campanha();