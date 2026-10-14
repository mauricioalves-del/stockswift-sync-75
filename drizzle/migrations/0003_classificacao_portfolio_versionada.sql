CREATE TABLE public.abast_classificacoes_portfolio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sku text NOT NULL,
 descricao text NOT NULL,
 classe text NOT NULL CHECK (classe IN ('LINHA','MTO','INOVACAO','DECOMPLEX')),
 vigencia date NOT NULL,
 inicio_inovacao date,
 classe_anterior text,
 autor_id uuid NOT NULL,
 registrado_em timestamptz NOT NULL DEFAULT now(),
 arquivo text,
 importacao_id uuid NOT NULL,
 CHECK (classe <> 'INOVACAO' OR inicio_inovacao IS NOT NULL)
);
GRANT SELECT ON public.abast_classificacoes_portfolio TO authenticated;
GRANT ALL ON public.abast_classificacoes_portfolio TO service_role;
ALTER TABLE public.abast_classificacoes_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe aprovada consulta classificacoes" ON public.abast_classificacoes_portfolio FOR SELECT TO authenticated USING(public.equipe_aprovada_para_leitura(auth.uid()));
CREATE INDEX abast_classificacoes_sku_vigencia ON public.abast_classificacoes_portfolio(sku,vigencia DESC,registrado_em DESC);
CREATE OR REPLACE FUNCTION public.abast_importar_classificacoes(p_arquivo text,p_itens jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE r jsonb; k text; d date; ini date; c text; ant record; lote uuid := gen_random_uuid(); n integer := 0; uid uuid := auth.uid(); atual date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) OR NOT public.has_role(uid,'ADMINISTRADOR'::public.app_role) THEN RAISE EXCEPTION 'Somente Administrador pode alterar classificações' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de classificações inválida'; END IF;
 IF jsonb_array_length(p_itens)=0 OR jsonb_array_length(p_itens)>5000 THEN RAISE EXCEPTION 'Importação deve conter entre 1 e 5000 linhas'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_itens) x GROUP BY regexp_replace(trim(x->>'sku'),'^0+','') HAVING count(*)>1) THEN RAISE EXCEPTION 'SKU duplicado na importação'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('abast-classificacoes-portfolio'));
 FOR r IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  k := regexp_replace(trim(r->>'sku'),'^0+',''); c := r->>'classe';
  IF k IS NULL OR k='' OR k !~ '^[0-9]+$' THEN RAISE EXCEPTION 'SKU inválido'; END IF;
  IF c IS NULL OR c NOT IN ('LINHA','MTO','INOVACAO','DECOMPLEX') THEN RAISE EXCEPTION 'Classificação inválida para SKU %',k; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.estoque_sistemico WHERE regexp_replace(id_produto,'^0+','')=k) AND NOT EXISTS(SELECT 1 FROM public.abast_produto WHERE regexp_replace(id_produto,'^0+','')=k) AND NOT EXISTS(SELECT 1 FROM public.abast_produto_loja WHERE regexp_replace(id_produto,'^0+','')=k) AND NOT EXISTS(SELECT 1 FROM public.grupo_produtos WHERE regexp_replace(codigo_produto,'^0+','')=k) THEN RAISE EXCEPTION 'SKU % não encontrado no cadastro',k; END IF;
  IF coalesce(trim(r->>'descricao'),'')='' THEN RAISE EXCEPTION 'Descrição obrigatória para SKU %',k; END IF;
  IF coalesce(r->>'vigencia','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Vigência obrigatória para SKU %',k; END IF;
  d := (r->>'vigencia')::date;
  IF d < atual THEN RAISE EXCEPTION 'Vigência não pode alterar o passado para SKU %',k; END IF;
  ini := NULL;
  IF c='INOVACAO' THEN
   IF coalesce(r->>'inicio_inovacao','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Data de início da Inovação obrigatória para SKU %',k; END IF;
   ini := (r->>'inicio_inovacao')::date;
   IF ini>d THEN RAISE EXCEPTION 'Início da Inovação deve ser anterior ou igual à vigência'; END IF;
  END IF;
  SELECT classe,id::text AS versao INTO ant FROM public.abast_classificacoes_portfolio WHERE sku=k ORDER BY vigencia DESC,registrado_em DESC LIMIT 1;
  IF coalesce(ant.versao,'') IS DISTINCT FROM coalesce(r->>'versao_anterior','') THEN RAISE EXCEPTION 'Classificação de SKU % mudou desde a prévia; carregue a planilha novamente',k; END IF;
  INSERT INTO public.abast_classificacoes_portfolio(sku,descricao,classe,vigencia,inicio_inovacao,classe_anterior,autor_id,arquivo,importacao_id)
   VALUES(k,trim(r->>'descricao'),c,d,ini,ant.classe,uid,left(coalesce(p_arquivo,'Edição manual'),255),lote);
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('quantidade',n,'importacao_id',lote);
END; $$;
REVOKE ALL ON FUNCTION public.abast_importar_classificacoes(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abast_importar_classificacoes(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.abast_bloquear_edicao_classificacoes() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Histórico de classificação imutável; registre nova classificação'; END; $$;
CREATE TRIGGER abast_classificacoes_imutaveis BEFORE UPDATE OR DELETE ON public.abast_classificacoes_portfolio FOR EACH ROW EXECUTE FUNCTION public.abast_bloquear_edicao_classificacoes();