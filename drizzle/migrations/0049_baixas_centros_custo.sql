ALTER TABLE public.contexto_baixa_opcoes ADD COLUMN centro_custo text;
ALTER TABLE public.origens ADD COLUMN centro_custo text;
ALTER TABLE public.baixa_operacional ADD COLUMN centro_custo text;
COMMENT ON COLUMN public.baixa_operacional.centro_custo IS 'Centro de custo apurado na criação ou alteração da referência da baixa; preservado nas mudanças de status e nas alterações dos cadastros.';
CREATE OR REPLACE FUNCTION public.baixa_resolver_centro_custo(motivo text, centro_contexto text, centro_almox text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
SELECT CASE
 WHEN lower(btrim(motivo)) IN ('descarte/descontinuado','sensorial/inovações') THEN 'P10008 - PRODUTO'
 WHEN lower(btrim(motivo)) IN ('cortesia','degustação') THEN nullif(btrim(centro_contexto),'')
 ELSE nullif(btrim(centro_almox),'') END;
$$;
REVOKE ALL ON FUNCTION public.baixa_resolver_centro_custo(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixa_resolver_centro_custo(text,text,text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.baixa_atribuir_centro_custo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m text; cc_contexto text; cc_almox text;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.motivo_baixa_id IS NOT DISTINCT FROM OLD.motivo_baixa_id AND NEW.id_local IS NOT DISTINCT FROM OLD.id_local AND NEW.contexto_baixa IS NOT DISTINCT FROM OLD.contexto_baixa THEN
   NEW.centro_custo := OLD.centro_custo; RETURN NEW;
  END IF;
 END IF;
 SELECT descricao INTO m FROM public.motivo_baixa WHERE id=NEW.motivo_baixa_id;
 SELECT centro_custo INTO cc_contexto FROM public.contexto_baixa_opcoes
 WHERE lower(btrim(descricao))=lower(btrim(NEW.contexto_baixa)) AND tipo=CASE WHEN lower(btrim(m))='cortesia' THEN 'CORTESIA' WHEN lower(btrim(m))='degustação' THEN 'DEGUSTACAO' ELSE '' END
 ORDER BY created_at,id LIMIT 1;
 SELECT centro_custo INTO cc_almox FROM public.origens WHERE lower(btrim(codigo_origem))=lower(btrim(NEW.id_local)) ORDER BY created_at,id LIMIT 1;
 NEW.centro_custo := public.baixa_resolver_centro_custo(m,cc_contexto,cc_almox);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.baixa_atribuir_centro_custo() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER baixa_centro_custo BEFORE INSERT OR UPDATE ON public.baixa_operacional FOR EACH ROW EXECUTE FUNCTION public.baixa_atribuir_centro_custo();