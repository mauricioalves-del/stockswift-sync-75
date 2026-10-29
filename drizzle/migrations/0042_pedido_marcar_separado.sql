-- Permite marcar o pedido como SEPARADO direto da tela de pedidos,
-- sem gerar a ficha de separação: preenche as quantidades separadas
-- e atende a requisição vinculada (quando houver).
CREATE OR REPLACE FUNCTION public.abast__atualizar_pedido(p_uid uuid, p_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _atual text; _req uuid; _reqnum text;
begin
  select status, requisicao_id, requisicao_numero into _atual, _req, _reqnum from public.abast_pedidos where id = p_id for update;
  if _atual is null then raise exception 'pedido nao encontrado'; end if;
  if _atual in ('EM_SEPARACAO', 'SEPARADO') and p_status = 'CANCELADO' then
    raise exception 'ha separacao registrada na requisicao %: cancele ou estorne por la', coalesce(_reqnum, '');
  end if;
  if not ((_atual in ('ABERTO','AGUARD_COMERCIAL','AGUARD_DIRETOR') and p_status = 'CANCELADO')
       or (_atual = 'ABERTO' and p_status = 'ENVIADO')
       or (_atual in ('ABERTO', 'EM_SEPARACAO') and p_status = 'SEPARADO')
       or (_atual in ('EM_SEPARACAO', 'SEPARADO') and p_status = 'ENVIADO')
       or (_atual = 'ENVIADO' and p_status in ('RECEBIDO', 'CANCELADO'))) then
    raise exception 'transicao invalida: % para %', _atual, p_status;
  end if;
  if p_status = 'CANCELADO' and _atual = 'ABERTO' and _req is not null then
    update public.requisicoes set status = 'CANCELADA' where id = _req and status in ('ENVIADA', 'APROVADA', 'RASCUNHO');
  end if;
  if p_status = 'SEPARADO' then
    if _req is not null then
      -- completa a separação dos itens (o trigger sincroniza os itens do pedido)
      update public.requisicao_itens
         set quantidade_separada = greatest(coalesce(quantidade_separada, 0), coalesce(quantidade_aprovada, quantidade_solicitada, 0)),
             separado_por = coalesce(separado_por, p_uid),
             separado_em = coalesce(separado_em, now())
       where requisicao_id = _req;
      -- atende a requisição (o trigger sincroniza o pedido para SEPARADO)
      update public.requisicoes set status = 'ATENDIDA' where id = _req and status in ('ENVIADA', 'APROVADA', 'RASCUNHO', 'EM_SEPARACAO');
    else
      -- pedido sem requisição: marca os itens válidos como separados
      update public.abast_pedido_itens
         set qtd_separada = qtd_pedida
       where pedido_id = p_id and coalesce(qtd_separada, 0) = 0
         and aceito is not false and not (origem = 'SUGESTAO_COMERCIAL' and aceito is null);
    end if;
  end if;
  update public.abast_pedidos set status = p_status, atualizado_em = now(), atualizado_por = p_uid where id = p_id;
  return jsonb_build_object('id', p_id, 'de', _atual, 'para', p_status);
end $function$;
