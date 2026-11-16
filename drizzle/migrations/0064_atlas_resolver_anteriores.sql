-- Atlas: quando a divergência mais recente de um SKU num almoxarifado é resolvida, as pendências anteriores do mesmo
-- SKU, almoxarifado e origem que ainda estão em aberto são resolvidas junto (mesma causa confirmada).
CREATE OR REPLACE FUNCTION public.atlas_resolver_anteriores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'Resolvida' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'Resolvida' THEN RETURN NEW; END IF;
  UPDATE public.atlas_divergencias d SET
    status = 'Resolvida',
    hipotese_confirmada = COALESCE(d.hipotese_confirmada, NEW.hipotese_confirmada),
    solucao_aplicada = 'Resolvida junto com a divergência #' || NEW.id || ' (mais recente do mesmo SKU e almoxarifado)' || COALESCE(' · ' || NEW.solucao_aplicada, ''),
    responsavel = 'Atlas (automático)',
    resolvido_em = COALESCE(NEW.resolvido_em, now()),
    tempo_resolucao_minutos = EXTRACT(EPOCH FROM (COALESCE(NEW.resolvido_em, now()) - COALESCE(d.criado_em, d.data_deteccao::timestamp))) / 60
  WHERE d.id <> NEW.id
    AND d.sku = NEW.sku AND d.almoxarifado = NEW.almoxarifado
    AND COALESCE(d.origem, '') = COALESCE(NEW.origem, '')
    AND COALESCE(d.status, '') <> 'Resolvida'
    AND (d.data_deteccao < NEW.data_deteccao OR (d.data_deteccao = NEW.data_deteccao AND d.id < NEW.id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS atlas_resolver_anteriores_trg ON public.atlas_divergencias;
CREATE TRIGGER atlas_resolver_anteriores_trg
AFTER INSERT OR UPDATE OF status ON public.atlas_divergencias
FOR EACH ROW EXECUTE FUNCTION public.atlas_resolver_anteriores();

-- Aplica a regra ao que já está na base: pendências abertas que antecedem uma divergência já resolvida.
WITH ult AS (
  SELECT DISTINCT ON (sku, almoxarifado, COALESCE(origem, '')) id, sku, almoxarifado, origem, data_deteccao, hipotese_confirmada, solucao_aplicada, resolvido_em
  FROM public.atlas_divergencias WHERE status = 'Resolvida'
  ORDER BY sku, almoxarifado, COALESCE(origem, ''), data_deteccao DESC, id DESC
)
UPDATE public.atlas_divergencias d SET
  status = 'Resolvida',
  hipotese_confirmada = COALESCE(d.hipotese_confirmada, u.hipotese_confirmada),
  solucao_aplicada = 'Resolvida junto com a divergência #' || u.id || ' (mais recente do mesmo SKU e almoxarifado)' || COALESCE(' · ' || u.solucao_aplicada, ''),
  responsavel = 'Atlas (automático)',
  resolvido_em = COALESCE(u.resolvido_em, now()),
  tempo_resolucao_minutos = EXTRACT(EPOCH FROM (COALESCE(u.resolvido_em, now()) - COALESCE(d.criado_em, d.data_deteccao::timestamp))) / 60
FROM ult u
WHERE d.sku = u.sku AND d.almoxarifado = u.almoxarifado AND COALESCE(d.origem, '') = COALESCE(u.origem, '')
  AND d.id <> u.id AND COALESCE(d.status, '') <> 'Resolvida'
  AND (d.data_deteccao < u.data_deteccao OR (d.data_deteccao = u.data_deteccao AND d.id < u.id));
