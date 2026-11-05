-- Almox SP (CD): ajustes do Diretor Operacional sobre a lista montada a partir das lojas.
--   INATIVAR — retira um item aprovado nas lojas da lista que o CD deve manter (ex.: CD não deve estocar).
--   INCLUIR  — inclui um item fora da lista comercial (ex.: produção específica do CD).
-- Ajustes valem até serem desfeitos (passam de uma competência para a outra). Motivo é obrigatório.
-- A ciência (abast_validar_cd) aplica os ajustes ativos e registra no item quem/por que ajustou.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.abast_cd_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,                                   -- sem zeros à esquerda
  acao text NOT NULL CHECK (acao IN ('INATIVAR','INCLUIR')),
  descricao text,
  categoria text,
  classe text CHECK (classe IS NULL OR classe IN ('LINHA','MTO','INOVACAO','DECOMPLEX')),
  motivo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid DEFAULT auth.uid(),
  criado_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  desfeito_por uuid,
  desfeito_nome text,
  desfeito_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_abast_cd_ajustes_sku_ativo ON public.abast_cd_ajustes (sku) WHERE ativo;
GRANT SELECT ON public.abast_cd_ajustes TO authenticated;
GRANT ALL ON public.abast_cd_ajustes TO service_role;
ALTER TABLE public.abast_cd_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cd_ajustes leitura" ON public.abast_cd_ajustes;
CREATE POLICY "cd_ajustes leitura" ON public.abast_cd_ajustes FOR SELECT TO authenticated
  USING (public.equipe_aprovada_para_leitura(auth.uid()));

-- Registrar um ajuste (somente o Diretor Operacional signatário).
CREATE OR REPLACE FUNCTION public.abast_cd_ajustar(p_sku text, p_acao text, p_motivo text, p_classe text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); k text; _nome text; _desc text; _cat text; _id uuid;
BEGIN
  IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) OR NOT public.abast_eh_signatario(uid, 'DIRETOR_OPERACIONAL') THEN
    RAISE EXCEPTION 'Somente o Diretor Operacional (signatário designado) pode ajustar a lista do Almox SP' USING errcode = '42501';
  END IF;
  k := regexp_replace(trim(coalesce(p_sku, '')), '^0+', '');
  IF k = '' OR k !~ '^[0-9]+$' THEN RAISE EXCEPTION 'SKU inválido'; END IF;
  IF p_acao NOT IN ('INATIVAR','INCLUIR') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo (mínimo 5 caracteres)'; END IF;
  SELECT descricao INTO _desc FROM public.abast_produto WHERE regexp_replace(id_produto, '^0+', '') = k LIMIT 1;
  IF _desc IS NULL THEN SELECT descricao INTO _desc FROM public.estoque_sistemico WHERE regexp_replace(id_produto, '^0+', '') = k AND descricao IS NOT NULL LIMIT 1; END IF;
  IF p_acao = 'INCLUIR' THEN
    IF _desc IS NULL THEN RAISE EXCEPTION 'SKU % não encontrado no cadastro de produtos', k; END IF;
    IF p_classe IS NULL OR p_classe NOT IN ('LINHA','MTO','INOVACAO','DECOMPLEX') THEN RAISE EXCEPTION 'Informe a classe do item incluído'; END IF;
  END IF;
  SELECT grupo INTO _cat FROM public.grupo_produtos WHERE regexp_replace(codigo_produto, '^0+', '') = k LIMIT 1;
  SELECT coalesce(nome, email) INTO _nome FROM public.profiles WHERE id = uid;
  PERFORM pg_advisory_xact_lock(hashtext('abast-cd-ajuste-' || k));
  UPDATE public.abast_cd_ajustes SET ativo = false, desfeito_por = uid, desfeito_nome = _nome, desfeito_em = now() WHERE sku = k AND ativo;
  INSERT INTO public.abast_cd_ajustes (sku, acao, descricao, categoria, classe, motivo, criado_por, criado_nome)
  VALUES (k, p_acao, _desc, _cat, CASE WHEN p_acao = 'INCLUIR' THEN p_classe END, left(trim(p_motivo), 500), uid, _nome)
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'sku', k, 'acao', p_acao);
END $$;
REVOKE ALL ON FUNCTION public.abast_cd_ajustar(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_cd_ajustar(text, text, text, text) TO authenticated;

-- Desfazer um ajuste (reativar item inativado ou retirar item incluído).
CREATE OR REPLACE FUNCTION public.abast_cd_desfazer_ajuste(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); _nome text;
BEGIN
  IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) OR NOT public.abast_eh_signatario(uid, 'DIRETOR_OPERACIONAL') THEN
    RAISE EXCEPTION 'Somente o Diretor Operacional (signatário designado) pode ajustar a lista do Almox SP' USING errcode = '42501';
  END IF;
  SELECT coalesce(nome, email) INTO _nome FROM public.profiles WHERE id = uid;
  UPDATE public.abast_cd_ajustes SET ativo = false, desfeito_por = uid, desfeito_nome = _nome, desfeito_em = now() WHERE id = p_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ajuste não encontrado ou já desfeito'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.abast_cd_desfazer_ajuste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_cd_desfazer_ajuste(uuid) TO authenticated;

-- Ciência do CD: união das lojas + ajustes do diretor.
CREATE OR REPLACE FUNCTION public.abast_validar_cd(p_competencia text, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare uid uuid := auth.uid(); _v int; _id uuid; _ult jsonb; _itens jsonb; _tot jsonb; _diff jsonb; _ant jsonb; _orig jsonb; _nome text;
begin
  if uid is null or not public.equipe_aprovada_para_leitura(uid) or not public.abast_eh_signatario(uid, 'DIRETOR_OPERACIONAL') then
    raise exception 'Somente o Diretor Operacional (signatário designado) pode dar ciência do Almox SP' using errcode = '42501';
  end if;
  if p_competencia !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'Competência inválida (use AAAA-MM)'; end if;
  perform pg_advisory_xact_lock(hashtext('abast-validacao-' || p_competencia || 'CD'));
  select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into _ult from (
    select distinct on (v.loja) v.loja, v.versao, v.competencia, v.aprovado_em, v.aprovador_nome, v.itens
    from public.abast_validacoes_portfolio v
    where v.status = 'VALIDADA' and v.loja in (select codigo from public.abast_lojas where ativo)
    order by v.loja, v.aprovado_em desc) u;
  with it as (
    select u->>'loja' as loja, x as item from jsonb_array_elements(_ult) u cross join lateral jsonb_array_elements(u->'itens') x where (x->>'ativo')::boolean),
  uni as (
    select regexp_replace(item->>'sku', '^0+', '') as sku, (array_agg(item order by loja))[1] as item, jsonb_agg(loja order by loja) as lojas from it group by 1),
  aj as (select * from public.abast_cd_ajustes where ativo),
  base as (
    select uni.sku,
           case when aj.acao = 'INATIVAR'
                then uni.item || jsonb_build_object('lojas', uni.lojas, 'ativo', false, 'ajuste_diretor', 'INATIVADO', 'motivo_ajuste', aj.motivo, 'ajustado_por', aj.criado_nome, 'ajustado_em', aj.criado_em)
                else uni.item || jsonb_build_object('lojas', uni.lojas, 'ativo', true) end as item
    from uni left join aj on aj.sku = uni.sku),
  inc as (
    select aj.sku, jsonb_build_object('sku', aj.sku, 'descricao', aj.descricao, 'categoria', aj.categoria, 'ativo', true, 'classe', aj.classe,
             'sem_classe', false, 'elegivel', aj.classe = 'LINHA', 'lojas', '[]'::jsonb, 'ajuste_diretor', 'INCLUIDO',
             'motivo_ajuste', aj.motivo, 'ajustado_por', aj.criado_nome, 'ajustado_em', aj.criado_em) as item
    from aj where aj.acao = 'INCLUIR' and not exists (select 1 from uni where uni.sku = aj.sku))
  select jsonb_agg(item order by sku) into _itens from (select * from base union all select * from inc) t;
  if _itens is null then raise exception 'Nenhuma loja tem portfólio validado pelo Gerente Comercial'; end if;
  select jsonb_build_object('total', count(*), 'ativos', count(*) filter (where (x->>'ativo')::boolean),
           'inativos', count(*) filter (where not (x->>'ativo')::boolean),
           'elegiveis', count(*) filter (where (x->>'ativo')::boolean and (x->>'elegivel')::boolean),
           'incluidos_diretor', count(*) filter (where x->>'ajuste_diretor' = 'INCLUIDO'),
           'inativados_diretor', count(*) filter (where x->>'ajuste_diretor' = 'INATIVADO'),
           'LINHA', count(*) filter (where (x->>'ativo')::boolean and x->>'classe' = 'LINHA'),
           'MTO', count(*) filter (where (x->>'ativo')::boolean and x->>'classe' = 'MTO'),
           'INOVACAO', count(*) filter (where (x->>'ativo')::boolean and x->>'classe' = 'INOVACAO'),
           'DECOMPLEX', count(*) filter (where (x->>'ativo')::boolean and x->>'classe' = 'DECOMPLEX'))
    into _tot from jsonb_array_elements(_itens) x;
  select itens into _ant from public.abast_validacoes_portfolio where loja = 'CD' and status = 'VALIDADA' order by aprovado_em desc limit 1;
  select jsonb_build_object(
    'incluidos', coalesce((select jsonb_agg(n->>'sku') from jsonb_array_elements(_itens) n where (n->>'ativo')::boolean and not exists (select 1 from jsonb_array_elements(coalesce(_ant, '[]'::jsonb)) a where regexp_replace(a->>'sku', '^0+', '') = regexp_replace(n->>'sku', '^0+', '') and (a->>'ativo')::boolean)), '[]'::jsonb),
    'retirados', coalesce((select jsonb_agg(a->>'sku') from jsonb_array_elements(coalesce(_ant, '[]'::jsonb)) a where (a->>'ativo')::boolean and not exists (select 1 from jsonb_array_elements(_itens) n where (n->>'ativo')::boolean and regexp_replace(n->>'sku', '^0+', '') = regexp_replace(a->>'sku', '^0+', ''))), '[]'::jsonb),
    'reclassificados', '[]'::jsonb, 'primeira_validacao', _ant is null) into _diff;
  select coalesce(jsonb_agg(jsonb_build_object('arquivo', 'Validação ' || (u->>'loja') || ' v' || (u->>'versao') || ' (' || (u->>'competencia') || ')', 'autor_nome', u->>'aprovador_nome', 'autor_email', null,
    'registrado_em', u->>'aprovado_em', 'skus', (select count(*) from jsonb_array_elements(u->'itens') i where (i->>'ativo')::boolean)) order by u->>'loja'), '[]'::jsonb) into _orig from jsonb_array_elements(_ult) u;
  select coalesce(max(versao), 0) + 1 into _v from public.abast_validacoes_portfolio where competencia = p_competencia and loja = 'CD';
  select coalesce(nome, email) into _nome from public.profiles where id = uid;
  insert into public.abast_validacoes_portfolio (competencia, loja, versao, aprovador_id, aprovador_nome, observacao, itens, totais, diff, origem_upload)
  values (p_competencia, 'CD', _v, uid, _nome, nullif(left(trim(coalesce(p_observacao, '')), 1000), ''), _itens, _tot, _diff, _orig) returning id into _id;
  return jsonb_build_object('id', _id, 'versao', _v, 'itens', (_tot->>'ativos')::int);
end $function$;
