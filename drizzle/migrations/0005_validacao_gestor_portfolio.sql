CREATE TABLE public.abast_validacoes_portfolio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competencia text NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
 loja text NOT NULL,
 versao integer NOT NULL,
 status text NOT NULL DEFAULT 'VALIDADA' CHECK (status IN ('VALIDADA','DESFEITA')),
 aprovador_id uuid NOT NULL,
 aprovador_nome text,
 aprovado_em timestamptz NOT NULL DEFAULT now(),
 observacao text,
 itens jsonb NOT NULL,
 totais jsonb NOT NULL,
 diff jsonb NOT NULL DEFAULT '{}'::jsonb,
 origem_upload jsonb NOT NULL DEFAULT '[]'::jsonb,
 desfeita_por uuid,
 desfeita_em timestamptz,
 motivo_desfazer text,
 UNIQUE (competencia, loja, versao)
);
GRANT SELECT ON public.abast_validacoes_portfolio TO authenticated;
GRANT ALL ON public.abast_validacoes_portfolio TO service_role;
ALTER TABLE public.abast_validacoes_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe aprovada consulta validacoes" ON public.abast_validacoes_portfolio FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));

CREATE OR REPLACE FUNCTION public.abast_validar_portfolio(p_competencia text, p_loja text, p_skus text[], p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); _v int; _id uuid; _itens jsonb; _tot jsonb; _diff jsonb; _ant jsonb; _orig jsonb; _nome text; _ref date;
BEGIN
 IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) OR NOT public.is_gestor(uid) THEN RAISE EXCEPTION 'Somente gestor (Administrador ou Gerente) pode validar o portfólio' USING ERRCODE='42501'; END IF;
 IF p_competencia !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION 'Competência inválida (use AAAA-MM)'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.abast_lojas WHERE codigo = p_loja AND ativo) THEN RAISE EXCEPTION 'Loja inválida'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.abast_produto_loja WHERE loja = p_loja) THEN RAISE EXCEPTION 'Loja sem sortimento carregado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('abast-validacao-' || p_competencia || p_loja));
 _ref := greatest((p_competencia || '-01')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
 -- atualiza a lista de itens ativos da loja (base do planejamento e da disponibilidade)
 UPDATE public.abast_produto_loja SET ativo_sortimento = (id_produto = ANY(coalesce(p_skus,'{}'))), atualizado_em = now() WHERE loja = p_loja;
 WITH cls AS (
   SELECT DISTINCT ON (sku) sku, classe, inicio_inovacao, autor_id, arquivo, registrado_em FROM public.abast_classificacoes_portfolio
   WHERE vigencia <= _ref ORDER BY sku, vigencia DESC, registrado_em DESC
 ), base AS (
   SELECT pl.id_produto AS sku, coalesce(p.descricao, pl.id_produto) AS descricao, pl.categoria, pl.ativo_sortimento AS ativo,
          coalesce(c.classe, 'LINHA') AS classe, c.classe IS NULL AS sem_classe, c.inicio_inovacao
   FROM public.abast_produto_loja pl LEFT JOIN public.abast_produto p ON p.id_produto = pl.id_produto
   LEFT JOIN cls c ON c.sku = regexp_replace(pl.id_produto, '^0+', '') WHERE pl.loja = p_loja
 )
 SELECT jsonb_agg(jsonb_build_object('sku', sku, 'descricao', descricao, 'categoria', categoria, 'ativo', ativo, 'classe', classe, 'sem_classe', sem_classe,
          'elegivel', ativo AND (classe = 'LINHA' OR (classe = 'INOVACAO' AND inicio_inovacao IS NOT NULL AND (inicio_inovacao + interval '3 months')::date <= _ref))) ORDER BY sku)
 INTO _itens FROM base;
 SELECT jsonb_build_object('total', count(*), 'ativos', count(*) FILTER (WHERE (x->>'ativo')::boolean), 'inativos', count(*) FILTER (WHERE NOT (x->>'ativo')::boolean),
   'elegiveis', count(*) FILTER (WHERE (x->>'elegivel')::boolean),
   'LINHA', count(*) FILTER (WHERE (x->>'ativo')::boolean AND x->>'classe'='LINHA'), 'MTO', count(*) FILTER (WHERE (x->>'ativo')::boolean AND x->>'classe'='MTO'),
   'INOVACAO', count(*) FILTER (WHERE (x->>'ativo')::boolean AND x->>'classe'='INOVACAO'), 'DECOMPLEX', count(*) FILTER (WHERE (x->>'ativo')::boolean AND x->>'classe'='DECOMPLEX'))
 INTO _tot FROM jsonb_array_elements(_itens) x;
 SELECT itens INTO _ant FROM public.abast_validacoes_portfolio WHERE loja = p_loja AND status = 'VALIDADA' ORDER BY aprovado_em DESC LIMIT 1;
 SELECT jsonb_build_object(
   'incluidos', coalesce((SELECT jsonb_agg(n->>'sku') FROM jsonb_array_elements(_itens) n WHERE (n->>'ativo')::boolean AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_ant,'[]')) o WHERE o->>'sku' = n->>'sku' AND (o->>'ativo')::boolean)), '[]'),
   'retirados', coalesce((SELECT jsonb_agg(o->>'sku') FROM jsonb_array_elements(coalesce(_ant,'[]')) o WHERE (o->>'ativo')::boolean AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_itens) n WHERE n->>'sku' = o->>'sku' AND (n->>'ativo')::boolean)), '[]'),
   'reclassificados', coalesce((SELECT jsonb_agg(jsonb_build_object('sku', n->>'sku', 'de', o->>'classe', 'para', n->>'classe')) FROM jsonb_array_elements(_itens) n JOIN jsonb_array_elements(coalesce(_ant,'[]')) o ON o->>'sku' = n->>'sku' WHERE o->>'classe' IS DISTINCT FROM n->>'classe'), '[]'),
   'primeira_validacao', _ant IS NULL)
 INTO _diff;
 SELECT coalesce(jsonb_agg(jsonb_build_object('arquivo', u.arquivo, 'autor_id', u.autor_id, 'autor_nome', pr.nome, 'autor_email', pr.email, 'registrado_em', u.em, 'skus', u.n) ORDER BY u.em DESC), '[]')
 INTO _orig FROM (SELECT importacao_id, max(arquivo) arquivo, max(autor_id::text)::uuid autor_id, max(registrado_em) em, count(*) n FROM public.abast_classificacoes_portfolio WHERE vigencia <= _ref GROUP BY importacao_id ORDER BY max(registrado_em) DESC LIMIT 5) u
 LEFT JOIN public.profiles pr ON pr.id = u.autor_id;
 SELECT coalesce(nome, email) INTO _nome FROM public.profiles WHERE id = uid;
 SELECT coalesce(max(versao), 0) + 1 INTO _v FROM public.abast_validacoes_portfolio WHERE competencia = p_competencia AND loja = p_loja;
 INSERT INTO public.abast_validacoes_portfolio (competencia, loja, versao, aprovador_id, aprovador_nome, observacao, itens, totais, diff, origem_upload)
 VALUES (p_competencia, p_loja, _v, uid, _nome, nullif(left(trim(coalesce(p_observacao,'')), 1000), ''), coalesce(_itens,'[]'), _tot, _diff, _orig) RETURNING id INTO _id;
 RETURN jsonb_build_object('id', _id, 'versao', _v);
END $$;

CREATE OR REPLACE FUNCTION public.abast_desfazer_validacao(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente gestor' USING ERRCODE='42501'; END IF;
 IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
 UPDATE public.abast_validacoes_portfolio SET status = 'DESFEITA', desfeita_por = auth.uid(), desfeita_em = now(), motivo_desfazer = left(trim(p_motivo), 500) WHERE id = p_id AND status = 'VALIDADA';
 IF NOT FOUND THEN RAISE EXCEPTION 'Validação não encontrada ou já desfeita'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.abast_validar_portfolio(text,text,text[],text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abast_desfazer_validacao(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_validar_portfolio(text,text,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abast_desfazer_validacao(uuid,text) TO authenticated;

ALTER POLICY "Autenticados podem ver quebras de fefo" ON public.quebras_fefo USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "pab_select_auth" ON public.parametros_alerta_baixas USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "imp_select_auth" ON public.importacoes_estoque USING (public.equipe_aprovada_para_leitura(auth.uid()));