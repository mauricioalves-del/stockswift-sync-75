CREATE OR REPLACE FUNCTION public.abast__registrar_disponibilidade(p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _cd text; _n int; _r int;
begin
  _cd := coalesce((select valor from public.abast_config where chave = 'cd_almoxarifado'), 'Alm_SP_Fabrica');
  delete from public.abast_disponibilidade_diaria where data = p_data;
  insert into public.abast_disponibilidade_diaria
    (data, loja, id_produto, descricao, familia, classe, categoria, elegivel, estoque, exposicao, demanda_dia, vendas_dia, em_ruptura, abaixo_exposicao, saldo_cd, a_caminho, causa, preco, venda_perdida_un, venda_perdida_rs)
  with lojas as (select codigo, almoxarifado from public.abast_lojas where ativo),
  aprov as (
    select v.loja, regexp_replace(x->>'sku', '^0+', '') as k, max(x->>'categoria') as cat, bool_or(coalesce((x->>'elegivel')::boolean, true)) as elegivel
    from (select distinct on (loja) loja, itens from public.abast_validacoes_portfolio where status = 'VALIDADA' order by loja, aprovado_em desc) v
    cross join lateral jsonb_array_elements(v.itens) x where (x->>'ativo')::boolean group by 1, 2),
  universo as (
    select ap.loja, ap.k, null::text as produto, ap.cat, ap.elegivel, true as aprovado from aprov ap join lojas l on l.codigo = ap.loja
    union all
    select a.loja, regexp_replace(a.id_produto, '^0+', ''), null::text, null::text, true, false
    from public.abast_produto_loja a join lojas l on l.codigo = a.loja
    where a.ativo_sortimento and not exists (select 1 from aprov ap where ap.loja = a.loja) group by a.loja, regexp_replace(a.id_produto, '^0+', '')),
  grupo as (select regexp_replace(codigo_produto, '^0+', '') as k, max(grupo) as grupo from public.grupo_produtos group by 1),
  fam as (select regexp_replace(codigo_produto, '^0+', '') as k, max(familia) as familia from public.familias group by 1),
  abc as (select regexp_replace(codigo_produto, '^0+', '') as k, max(classe) as classe from public.classificacao_abc group by 1),
  -- DE-PARA: saldo do 05104132 conta como saldo oficial do 05304043 (no CD, vem do almox Processo)
  es0 as (select case when regexp_replace(id_produto, '^0+', '') = '5104132' then '5304043' else regexp_replace(id_produto, '^0+', '') end as k,
                 regexp_replace(id_produto, '^0+', '') = '5104132' as dp, case when regexp_replace(id_produto, '^0+', '') = '5104132' then '05304043' else id_produto end as idp,
                 origem, descricao, quantidade from public.estoque_sistemico),
  est as (select k, origem, (array_agg(idp order by length(idp) desc))[1] as id_canon, max(descricao) filter (where not dp) as descricao, sum(quantidade) as qtd
          from es0 group by 1, origem),
  estcd as (select k, sum(quantidade) as qtd from es0
            where (not dp and origem = _cd) or (dp and origem = 'Alm_SP_Processo') group by 1),
  expo as (select loja, regexp_replace(id_produto, '^0+', '') as k, max(exposicao) as exposicao from public.abast_produto_loja group by 1, 2),
  inicio as (select origem, min(data_movimento) as ini from public.historico_consumo group by origem),
  hd as (select origem, regexp_replace(sku, '^0+', '') as k, data_movimento, max(quantidade) as q
         from public.historico_consumo where data_movimento > p_data - 90 and data_movimento <= p_data group by 1, 2, 3),
  dem as (
    select h.origem, h.k,
      sum(case when h.data_movimento > p_data - 7 then h.q else 0 end) / greatest(1, least(7, p_data - i.ini + 1)) as c7,
      sum(case when h.data_movimento > p_data - 30 then h.q else 0 end) / greatest(1, least(30, p_data - i.ini + 1)) as c30,
      sum(h.q) / greatest(1, least(90, p_data - i.ini + 1)) as c90,
      sum(case when h.data_movimento = p_data then h.q else 0 end) as vendas_dia
    from hd h join inicio i on i.origem = h.origem group by h.origem, h.k, i.ini),
  ped as (select p.loja, regexp_replace(i.id_produto, '^0+', '') as k, sum(i.qtd_pedida) as q
          from public.abast_pedidos p join public.abast_pedido_itens i on i.pedido_id = p.id
          where p.status in ('ABERTO', 'EM_SEPARACAO', 'SEPARADO', 'ENVIADO') group by 1, 2),
  notas as (select l.codigo as loja, regexp_replace(n.cod_prod::text, '^0+', '') as k, sum(n.qtd) as q
            from public.notas_transferencia_recebimento n join lojas l on (
              (l.codigo = 'ELDORADO' and n.almox ilike '%eldorado%') or
              (l.codigo = 'PATIO' and (n.almox ilike '%patio%' or n.almox ilike '%paulista%')) or
              (l.codigo = 'JESUINO' and (n.almox ilike '%itaim%' or n.almox ilike '%sp_loja%')))
            where n.recebimento = 'Pendente' group by 1, 2),
  pr as (select regexp_replace(sku, '^0+', '') as k, max(pr_venda) as pr_venda from public.precos_venda where pr_venda > 0 group by 1)
  select p_data, u.loja,
    coalesce(e.id_canon, case when length(u.k) < 8 then lpad(u.k, 8, '0') when length(u.k) = 9 then lpad(u.k, 10, '0') else u.k end),
    coalesce(e.descricao, u.produto), f.familia, a.classe, coalesce(g.grupo, u.cat), u.elegivel,
    coalesce(e.qtd, 0), x.exposicao,
    round(coalesce(0.5 * d.c7 + 0.3 * d.c30 + 0.2 * d.c90, 0)::numeric, 4), coalesce(d.vendas_dia, 0),
    coalesce(e.qtd, 0) <= 0, coalesce(e.qtd, 0) < coalesce(x.exposicao, 0),
    coalesce(cd.qtd, 0), coalesce(p.q, 0) + coalesce(n.q, 0),
    case when coalesce(e.qtd, 0) > 0 then null
         when coalesce(p.q, 0) + coalesce(n.q, 0) > 0 then 'A caminho (aguardando entrega)'
         when coalesce(cd.qtd, 0) <= 0 then 'CD sem saldo'
         else 'Sem pedido (ciclo/politica)' end,
    pr.pr_venda,
    case when coalesce(e.qtd, 0) <= 0 then round(coalesce(0.5 * d.c7 + 0.3 * d.c30 + 0.2 * d.c90, 0)::numeric, 4) else 0 end,
    case when coalesce(e.qtd, 0) <= 0 then round(coalesce(0.5 * d.c7 + 0.3 * d.c30 + 0.2 * d.c90, 0)::numeric * coalesce(pr.pr_venda, 0), 2) else 0 end
  from universo u
  join lojas l on l.codigo = u.loja
  left join grupo g on g.k = u.k
  left join fam f on f.k = u.k
  left join abc a on a.k = u.k
  left join est e on e.k = u.k and e.origem = l.almoxarifado
  left join estcd cd on cd.k = u.k
  left join expo x on x.loja = u.loja and x.k = u.k
  left join dem d on d.origem = l.almoxarifado and d.k = u.k
  left join ped p on p.loja = u.loja and p.k = u.k
  left join notas n on n.loja = u.loja and n.k = u.k
  left join pr on pr.k = u.k
  where u.aprovado or g.grupo in ('Produto Acabado', 'Mercadoria de Revenda')
  on conflict (data, loja, id_produto) do update set
    descricao = excluded.descricao, familia = excluded.familia, classe = excluded.classe, categoria = excluded.categoria, elegivel = excluded.elegivel, estoque = excluded.estoque, exposicao = excluded.exposicao,
    demanda_dia = excluded.demanda_dia, vendas_dia = excluded.vendas_dia, em_ruptura = excluded.em_ruptura, abaixo_exposicao = excluded.abaixo_exposicao,
    saldo_cd = excluded.saldo_cd, a_caminho = excluded.a_caminho, causa = excluded.causa, preco = excluded.preco,
    venda_perdida_un = excluded.venda_perdida_un, venda_perdida_rs = excluded.venda_perdida_rs, registrado_em = now();
  get diagnostics _n = row_count;
  insert into public.abast_disponibilidade_diaria
    (data, loja, id_produto, descricao, familia, classe, categoria, elegivel, estoque, exposicao, demanda_dia, vendas_dia, em_ruptura, abaixo_exposicao, saldo_cd, a_caminho, causa, preco, venda_perdida_un, venda_perdida_rs)
  select p_data, 'CD', d.id_produto, max(d.descricao), max(d.familia), max(d.classe), max(d.categoria), bool_or(d.elegivel), max(d.saldo_cd), 0, sum(d.demanda_dia), sum(d.vendas_dia), max(d.saldo_cd) <= 0, false, max(d.saldo_cd), 0, null, max(d.preco), 0, 0
  from public.abast_disponibilidade_diaria d where d.data = p_data and d.loja <> 'CD' group by d.id_produto;
  select count(*) into _r from public.abast_disponibilidade_diaria where data = p_data and em_ruptura and loja <> 'CD';
  return jsonb_build_object('data', p_data, 'linhas', _n, 'rupturas', _r);
end $function$;

select public.abast__registrar_disponibilidade(date '2026-10-16');