ALTER TABLE public.abast_pedidos DROP CONSTRAINT abast_pedidos_status_check;
ALTER TABLE public.abast_pedidos ADD CONSTRAINT abast_pedidos_status_check CHECK (status = ANY (ARRAY['AGUARD_COMERCIAL','AGUARD_DIRETOR','ABERTO','EM_SEPARACAO','SEPARADO','ENVIADO','RECEBIDO','CANCELADO']));
ALTER TABLE public.abast_pedido_itens DROP CONSTRAINT abast_pedido_itens_origem_check;
ALTER TABLE public.abast_pedido_itens ADD CONSTRAINT abast_pedido_itens_origem_check CHECK (origem = ANY (ARRAY['SUGESTAO','MANUAL','TRANSFERENCIA','SUGESTAO_COMERCIAL']));
ALTER TABLE public.abast_pedido_itens ADD COLUMN IF NOT EXISTS aceito boolean;
ALTER TABLE public.abast_pedidos
  ADD COLUMN IF NOT EXISTS aprov_comercial_por uuid,
  ADD COLUMN IF NOT EXISTS aprov_comercial_nome text,
  ADD COLUMN IF NOT EXISTS aprov_comercial_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprov_comercial_obs text,
  ADD COLUMN IF NOT EXISTS aprov_comercial_resultado text,
  ADD COLUMN IF NOT EXISTS aprov_diretor_por uuid,
  ADD COLUMN IF NOT EXISTS aprov_diretor_nome text,
  ADD COLUMN IF NOT EXISTS aprov_diretor_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprov_diretor_obs text,
  ADD COLUMN IF NOT EXISTS aprov_diretor_decisao text;

-- Gera a requisição de separação de um pedido aprovado (só itens aceitos)
CREATE OR REPLACE FUNCTION public.abast__gerar_requisicao(p_uid uuid, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare p record; _alm text; _forn text; _req uuid; _reqnum text; _tot numeric; _obs text;
begin
  select * into p from public.abast_pedidos where id = p_id;
  if p.requisicao_id is not null then return; end if;
  select almoxarifado into _alm from public.abast_lojas where codigo = p.loja;
  if p.tipo = 'TRANSFERENCIA' then
    select almoxarifado into _forn from public.abast_lojas where codigo = p.loja_origem;
    _forn := coalesce(_forn, p.loja_origem);
    _reqnum := 'TRF-' || right((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 8);
    _obs := 'Transferência nº ' || p.numero || ' (' || p.loja_origem || ' → ' || p.loja || ')';
  else
    _forn := coalesce((select valor from public.abast_config where chave = 'cd_almoxarifado'), 'Alm_SP_Fabrica');
    _reqnum := 'REQ-' || right((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 8);
    _obs := 'Pedido de abastecimento nº ' || p.numero || ' (' || p.loja || ')' || coalesce(' - ' || nullif(p.observacao, ''), '');
  end if;
  insert into public.requisicoes (numero, origem_solicitante, origem_fornecedora, solicitante, tipo, status, origem_geracao, observacao)
    values (_reqnum, _alm, _forn, coalesce(p.criado_por, p_uid), 'NORMAL', 'ENVIADA', 'Abastecimento', _obs) returning id into _req;
  insert into public.requisicao_itens (requisicao_id, id_produto, descricao, unidade, quantidade_solicitada, custo_unitario)
    select _req, i.id_produto, coalesce(nullif(i.descricao, ''), e.descricao, i.id_produto), coalesce(e.unidade, 'UN'), i.qtd_pedida, coalesce(e.custo_unitario, 0)
    from public.abast_pedido_itens i
    left join lateral (select es.descricao, es.unidade, es.custo_unitario from public.estoque_sistemico es
                       where es.origem = _forn and es.id_produto = i.id_produto order by es.quantidade desc nulls last limit 1) e on true
    where i.pedido_id = p_id and coalesce(i.aceito, true);
  select coalesce(sum(valor_total), 0) into _tot from public.requisicao_itens where requisicao_id = _req;
  update public.requisicoes set valor_total = _tot where id = _req;
  update public.abast_pedidos set requisicao_id = _req, requisicao_numero = _reqnum where id = p_id;
end $$;
REVOKE EXECUTE ON FUNCTION public.abast__gerar_requisicao(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.abast__criar_pedido(p_uid uuid, p_loja text, p_base text, p_obs text, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _id uuid; _num bigint; _n int; _alm text;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'pedido sem itens'; end if;
  select almoxarifado into _alm from public.abast_lojas where codigo = p_loja and ativo;
  if _alm is null then raise exception 'loja invalida'; end if;
  insert into public.abast_pedidos (loja, base_demanda, observacao, criado_por, atualizado_por, status)
    values (p_loja, p_base, p_obs, p_uid, p_uid, 'AGUARD_COMERCIAL') returning id, numero into _id, _num;
  insert into public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem)
    select _id, x.id_produto, x.descricao, x.qtd_sugerida, x.qtd_pedida, x.caixa, coalesce(nullif(x.origem, ''), 'SUGESTAO')
    from jsonb_to_recordset(p_itens) as x(id_produto text, descricao text, qtd_sugerida numeric, qtd_pedida numeric, caixa numeric, origem text);
  get diagnostics _n = row_count;
  return jsonb_build_object('id', _id, 'numero', _num, 'itens', _n, 'status', 'AGUARD_COMERCIAL');
end $$;

CREATE OR REPLACE FUNCTION public.abast_criar_transferencia(p_loja text, p_loja_origem text, p_base text, p_obs text, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _uid uuid := auth.uid(); _id uuid; _num bigint; _n int; _alm text; _almo text;
begin
  if not public.is_gestor(_uid) then raise exception 'acesso negado: somente gestor'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'transferencia sem itens'; end if;
  if p_loja = p_loja_origem then raise exception 'origem igual ao destino'; end if;
  select almoxarifado into _alm from public.abast_lojas where codigo = p_loja and ativo;
  select almoxarifado into _almo from public.abast_lojas where codigo = p_loja_origem and ativo;
  if _almo is null and exists (select 1 from public.estoque_sistemico where origem = p_loja_origem limit 1) then _almo := p_loja_origem; end if;
  if _alm is null or _almo is null then raise exception 'almoxarifado invalido'; end if;
  if _alm = _almo then raise exception 'origem igual ao destino'; end if;
  insert into public.abast_pedidos (loja, base_demanda, observacao, criado_por, atualizado_por, tipo, loja_origem, status)
    values (p_loja, p_base, coalesce(nullif(p_obs,''), 'Transferência: ' || p_loja_origem || ' → ' || p_loja), _uid, _uid, 'TRANSFERENCIA', p_loja_origem, 'AGUARD_COMERCIAL')
    returning id, numero into _id, _num;
  insert into public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem)
    select _id, x.id_produto, x.descricao, x.qtd_sugerida, x.qtd_pedida, x.caixa, 'TRANSFERENCIA'
    from jsonb_to_recordset(p_itens) as x(id_produto text, descricao text, qtd_sugerida numeric, qtd_pedida numeric, caixa numeric)
    where coalesce(x.qtd_pedida,0) > 0;
  get diagnostics _n = row_count;
  if _n = 0 then raise exception 'transferencia sem itens'; end if;
  return jsonb_build_object('id', _id, 'numero', _num, 'itens', _n, 'status', 'AGUARD_COMERCIAL');
end $$;

CREATE OR REPLACE FUNCTION public.abast_aprovar_comercial(p_id uuid, p_aprovado boolean, p_obs text, p_itens_sugeridos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _uid uuid := auth.uid(); _st text; _loja text; _nome text; _port jsonb; _ruim text; _n int := 0;
begin
  if not (public.abast_eh_signatario(_uid, 'GERENTE_COMERCIAL') or public.has_role(_uid, 'ADMINISTRADOR')) then
    raise exception 'acesso negado: somente o gerente comercial'; end if;
  select status, loja into _st, _loja from public.abast_pedidos where id = p_id for update;
  if _st is null then raise exception 'pedido nao encontrado'; end if;
  if _st <> 'AGUARD_COMERCIAL' then raise exception 'pedido nao esta aguardando aprovacao comercial'; end if;
  select coalesce(nullif(nome,''), email) into _nome from public.profiles where id = _uid;
  if p_aprovado then
    update public.abast_pedidos set status = 'ABERTO', aprov_comercial_por = _uid, aprov_comercial_nome = _nome, aprov_comercial_em = now(),
      aprov_comercial_obs = nullif(p_obs,''), aprov_comercial_resultado = 'APROVADO', atualizado_em = now(), atualizado_por = _uid where id = p_id;
    perform public.abast__gerar_requisicao(_uid, p_id);
    return jsonb_build_object('id', p_id, 'status', 'ABERTO');
  end if;
  if coalesce(btrim(p_obs), '') = '' then raise exception 'informe as ressalvas na observacao'; end if;
  if p_itens_sugeridos is not null and jsonb_typeof(p_itens_sugeridos) = 'array' and jsonb_array_length(p_itens_sugeridos) > 0 then
    select v.itens into _port from public.abast_validacoes_portfolio v
      where v.loja = _loja and v.status = 'VALIDADA' order by v.competencia desc, v.aprovado_em desc limit 1;
    if _port is null then raise exception 'loja sem portfolio aprovado: nao e possivel sugerir itens'; end if;
    select x.id_produto into _ruim from jsonb_to_recordset(p_itens_sugeridos) as x(id_produto text, qtd numeric)
      where not exists (select 1 from jsonb_array_elements(_port) e
        where ltrim(e->>'sku','0') = ltrim(x.id_produto,'0') and coalesce((e->>'ativo')::boolean, true))
      limit 1;
    if _ruim is not null then raise exception 'SKU % fora do catalogo aprovado da loja', _ruim; end if;
    insert into public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, origem, aceito)
      select p_id, x.id_produto, x.descricao, null, x.qtd, 'SUGESTAO_COMERCIAL', null
      from jsonb_to_recordset(p_itens_sugeridos) as x(id_produto text, descricao text, qtd numeric) where coalesce(x.qtd,0) > 0;
    get diagnostics _n = row_count;
  end if;
  update public.abast_pedidos set status = 'AGUARD_DIRETOR', aprov_comercial_por = _uid, aprov_comercial_nome = _nome, aprov_comercial_em = now(),
    aprov_comercial_obs = p_obs, aprov_comercial_resultado = 'RESSALVAS', atualizado_em = now(), atualizado_por = _uid where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'AGUARD_DIRETOR', 'sugeridos', _n);
end $$;

CREATE OR REPLACE FUNCTION public.abast_decidir_diretor(p_id uuid, p_decisao text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _uid uuid := auth.uid(); _st text; _nome text;
begin
  if not (public.has_role(_uid, 'DIRETOR_OPERACOES') or public.abast_eh_signatario(_uid, 'DIRETOR_OPERACIONAL') or public.has_role(_uid, 'ADMINISTRADOR')) then
    raise exception 'acesso negado: somente o Diretor de Operacoes'; end if;
  if p_decisao not in ('COM_SUGESTOES','SEM_SUGESTOES','CANCELAR') then raise exception 'decisao invalida'; end if;
  select status into _st from public.abast_pedidos where id = p_id for update;
  if _st is null then raise exception 'pedido nao encontrado'; end if;
  if _st <> 'AGUARD_DIRETOR' then raise exception 'pedido nao esta aguardando o diretor'; end if;
  select coalesce(nullif(nome,''), email) into _nome from public.profiles where id = _uid;
  update public.abast_pedido_itens set aceito = (p_decisao = 'COM_SUGESTOES') where pedido_id = p_id and origem = 'SUGESTAO_COMERCIAL';
  update public.abast_pedidos set status = case when p_decisao = 'CANCELAR' then 'CANCELADO' else 'ABERTO' end,
    aprov_diretor_por = _uid, aprov_diretor_nome = _nome, aprov_diretor_em = now(), aprov_diretor_obs = nullif(p_obs,''),
    aprov_diretor_decisao = p_decisao, atualizado_em = now(), atualizado_por = _uid where id = p_id;
  if p_decisao <> 'CANCELAR' then perform public.abast__gerar_requisicao(_uid, p_id); end if;
  return jsonb_build_object('id', p_id, 'decisao', p_decisao);
end $$;
REVOKE EXECUTE ON FUNCTION public.abast_aprovar_comercial(uuid, boolean, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.abast_decidir_diretor(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_aprovar_comercial(uuid, boolean, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abast_decidir_diretor(uuid, text, text) TO authenticated;

-- Cancelar pedido aguardando aprovação também é permitido ao gestor
CREATE OR REPLACE FUNCTION public.abast__atualizar_pedido(p_uid uuid, p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _atual text; _req uuid; _reqnum text;
begin
  select status, requisicao_id, requisicao_numero into _atual, _req, _reqnum from public.abast_pedidos where id = p_id for update;
  if _atual is null then raise exception 'pedido nao encontrado'; end if;
  if _atual in ('EM_SEPARACAO', 'SEPARADO') and p_status = 'CANCELADO' then
    raise exception 'ha separacao registrada na requisicao %: cancele ou estorne por la', coalesce(_reqnum, '');
  end if;
  if not ((_atual in ('ABERTO','AGUARD_COMERCIAL','AGUARD_DIRETOR') and p_status = 'CANCELADO')
       or (_atual = 'ABERTO' and p_status = 'ENVIADO')
       or (_atual in ('EM_SEPARACAO', 'SEPARADO') and p_status = 'ENVIADO')
       or (_atual = 'ENVIADO' and p_status in ('RECEBIDO', 'CANCELADO'))) then
    raise exception 'transicao invalida: % para %', _atual, p_status;
  end if;
  if p_status = 'CANCELADO' and _atual = 'ABERTO' and _req is not null then
    update public.requisicoes set status = 'CANCELADA' where id = _req and status in ('ENVIADA', 'APROVADA', 'RASCUNHO');
  end if;
  update public.abast_pedidos set status = p_status, atualizado_em = now(), atualizado_por = p_uid where id = p_id;
  return jsonb_build_object('id', p_id, 'de', _atual, 'para', p_status);
end $$;