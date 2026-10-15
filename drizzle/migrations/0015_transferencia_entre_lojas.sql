ALTER TABLE public.abast_pedidos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'CD';
ALTER TABLE public.abast_pedidos ADD COLUMN IF NOT EXISTS loja_origem text;

CREATE OR REPLACE FUNCTION public.abast_criar_transferencia(p_loja text, p_loja_origem text, p_base text, p_obs text, p_itens jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _uid uuid := auth.uid(); _id uuid; _num bigint; _n int; _alm text; _almo text; _req uuid; _reqnum text; _tot numeric;
begin
  if not public.is_gestor(_uid) then raise exception 'acesso negado: somente gestor'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'transferencia sem itens'; end if;
  if p_loja = p_loja_origem then raise exception 'loja de origem igual ao destino'; end if;
  select almoxarifado into _alm from public.abast_lojas where codigo = p_loja and ativo;
  select almoxarifado into _almo from public.abast_lojas where codigo = p_loja_origem and ativo;
  if _alm is null or _almo is null then raise exception 'loja invalida'; end if;
  insert into public.abast_pedidos (loja, base_demanda, observacao, criado_por, atualizado_por, tipo, loja_origem)
    values (p_loja, p_base, coalesce(nullif(p_obs,''), 'Transferência entre lojas: ' || p_loja_origem || ' → ' || p_loja), _uid, _uid, 'TRANSFERENCIA', p_loja_origem)
    returning id, numero into _id, _num;
  insert into public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem)
    select _id, x.id_produto, x.descricao, x.qtd_sugerida, x.qtd_pedida, x.caixa, 'TRANSFERENCIA'
    from jsonb_to_recordset(p_itens) as x(id_produto text, descricao text, qtd_sugerida numeric, qtd_pedida numeric, caixa numeric)
    where coalesce(x.qtd_pedida,0) > 0;
  get diagnostics _n = row_count;
  if _n = 0 then raise exception 'transferencia sem itens'; end if;
  _reqnum := 'TRF-' || right((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 8);
  insert into public.requisicoes (numero, origem_solicitante, origem_fornecedora, solicitante, tipo, status, origem_geracao, observacao)
    values (_reqnum, _alm, _almo, _uid, 'NORMAL', 'ENVIADA', 'Abastecimento',
            'Transferência entre lojas nº ' || _num || ' (' || p_loja_origem || ' → ' || p_loja || ')')
    returning id into _req;
  insert into public.requisicao_itens (requisicao_id, id_produto, descricao, unidade, quantidade_solicitada, custo_unitario)
    select _req, i.id_produto, coalesce(nullif(i.descricao, ''), e.descricao, i.id_produto), coalesce(e.unidade, 'UN'), i.qtd_pedida, coalesce(e.custo_unitario, 0)
    from public.abast_pedido_itens i
    left join lateral (select es.descricao, es.unidade, es.custo_unitario from public.estoque_sistemico es
                       where es.origem = _almo and es.id_produto = i.id_produto order by es.quantidade desc nulls last limit 1) e on true
    where i.pedido_id = _id;
  select coalesce(sum(valor_total), 0) into _tot from public.requisicao_itens where requisicao_id = _req;
  update public.requisicoes set valor_total = _tot where id = _req;
  update public.abast_pedidos set requisicao_id = _req, requisicao_numero = _reqnum where id = _id;
  return jsonb_build_object('id', _id, 'numero', _num, 'itens', _n, 'requisicao_id', _req, 'requisicao_numero', _reqnum);
end $function$;
REVOKE ALL ON FUNCTION public.abast_criar_transferencia(text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_criar_transferencia(text,text,text,text,jsonb) TO authenticated;