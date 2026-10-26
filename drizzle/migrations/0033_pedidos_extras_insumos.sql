DO $migration$
DECLARE def text; antigo text; novo text;
BEGIN
 SELECT pg_get_functiondef('public.abast_aprovar_comercial(uuid,boolean,text,jsonb)'::regprocedure) INTO def;
 antigo := 'IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_port) e WHERE ltrim(e->>''sku'',''0'')=ltrim(x.id_produto,''0'') AND coalesce((e->>''ativo'')::boolean,true)) THEN';
 novo := 'IF NOT (EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(_port,''[]''::jsonb)) e WHERE ltrim(e->>''sku'',''0'')=ltrim(x.id_produto,''0'') AND coalesce((e->>''ativo'')::boolean,true)) OR EXISTS(SELECT 1 FROM public.grupo_produtos g WHERE ltrim(g.codigo_produto,''0'')=ltrim(x.id_produto,''0'') AND lower(btrim(translate(g.grupo,''ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç'',''AAAAEEIOOOUCaaaaeeiooouc''))) IN (''mercadoria de revenda'',''embalagem'',''materia prima''))) THEN';
 IF (length(def)-length(replace(def,antigo,'')))/length(antigo) <> 2 THEN RAISE EXCEPTION 'Validacao comercial divergente: migration nao aplicada'; END IF;
 IF position('IF _port IS NULL THEN RAISE EXCEPTION ''loja sem portfolio aprovado''; END IF;' in def)=0 THEN RAISE EXCEPTION 'Validacao de portfolio divergente'; END IF;
 def := replace(def,antigo,novo);
 def := replace(def,'IF _port IS NULL THEN RAISE EXCEPTION ''loja sem portfolio aprovado''; END IF;','_port := coalesce(_port,''[]''::jsonb);');
 EXECUTE def;
END $migration$;
COMMENT ON FUNCTION public.abast_aprovar_comercial(uuid,boolean,text,jsonb) IS 'Commercial approval accepts approved portfolio SKUs or registered resale, packaging and raw-material supplies, preserving stock, fractioning, authorization and atomic requisition creation.';