CREATE OR REPLACE FUNCTION public.abast_validar_portfolio(p_competencia text, p_loja text, p_skus text[], p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); _v int; _id uuid; _itens jsonb; _tot jsonb; _diff jsonb; _ant jsonb; _orig jsonb; _nome text; _ref date; _sel text[];
BEGIN
 IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) OR NOT public.is_gestor(uid) THEN RAISE EXCEPTION 'Somente gestor (Administrador ou Gerente) pode validar o portfólio' USING ERRCODE='42501'; END IF;
 IF p_competencia !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION 'Competência inválida (use AAAA-MM)'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.abast_lojas WHERE codigo = p_loja AND ativo) THEN RAISE EXCEPTION 'Loja inválida'; END IF;
 IF coalesce(array_length(p_skus,1),0) = 0 THEN RAISE EXCEPTION 'Selecione ao menos um SKU'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('abast-validacao-' || p_competencia || p_loja));
 _ref := greatest((p_competencia || '-01')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
 SELECT array_agg(regexp_replace(trim(s), '^0+', '')) INTO _sel FROM unnest(p_skus) s;
 WITH cls AS (
   SELECT DISTINCT ON (sku) sku, descricao, classe, inicio_inovacao FROM public.abast_classificacoes_portfolio
   WHERE vigencia <= _ref ORDER BY sku, vigencia DESC, registrado_em DESC
 )
 SELECT jsonb_agg(jsonb_build_object('sku', c.sku, 'descricao', c.descricao, 'categoria', g.grupo, 'ativo', c.sku = ANY(_sel), 'classe', c.classe, 'sem_classe', false,
          'elegivel', c.sku = ANY(_sel) AND (c.classe = 'LINHA' OR (c.classe = 'INOVACAO' AND c.inicio_inovacao IS NOT NULL AND (c.inicio_inovacao + interval '3 months')::date <= _ref))) ORDER BY c.sku)
 INTO _itens FROM cls c LEFT JOIN LATERAL (SELECT max(grupo) grupo FROM public.grupo_produtos gp WHERE regexp_replace(gp.codigo_produto,'^0+','') = c.sku) g ON true;
 IF _itens IS NULL THEN RAISE EXCEPTION 'Nenhuma classificação vigente: importe a lista em Portfólio e Classificação'; END IF;
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
 VALUES (p_competencia, p_loja, _v, uid, _nome, nullif(left(trim(coalesce(p_observacao,'')), 1000), ''), _itens, _tot, _diff, _orig) RETURNING id INTO _id;
 RETURN jsonb_build_object('id', _id, 'versao', _v);
END $$;

ALTER POLICY "Autenticados podem ler produtos_reposicao" ON public.produtos_reposicao USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "parametros_inv_read" ON public.parametros_inventario USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "Authenticated users can view confirmacoes_recebimento_itens" ON public.confirmacoes_recebimento_itens USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "Authenticated users can insert confirmacoes_recebimento_itens" ON public.confirmacoes_recebimento_itens WITH CHECK (public.equipe_aprovada_para_leitura(auth.uid()));