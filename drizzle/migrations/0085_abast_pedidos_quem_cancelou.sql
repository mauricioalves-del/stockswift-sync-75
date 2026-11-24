alter table public.abast_pedidos
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_nome text,
  add column if not exists cancelado_em timestamptz;

create or replace function public.abast__atualizar_pedido(p_uid uuid, p_id uuid, p_status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      update public.requisicao_itens
         set quantidade_separada = greatest(coalesce(quantidade_separada, 0), coalesce(quantidade_aprovada, quantidade_solicitada, 0)),
             separado_por = coalesce(separado_por, p_uid),
             separado_em = coalesce(separado_em, now())
       where requisicao_id = _req;
      update public.requisicoes set status = 'ATENDIDA' where id = _req and status in ('ENVIADA', 'APROVADA', 'RASCUNHO', 'EM_SEPARACAO');
    else
      update public.abast_pedido_itens
         set qtd_separada = qtd_pedida
       where pedido_id = p_id and coalesce(qtd_separada, 0) = 0
         and aceito is not false and not (origem = 'SUGESTAO_COMERCIAL' and aceito is null);
    end if;
  end if;
  update public.abast_pedidos
     set status = p_status,
         atualizado_em = now(),
         atualizado_por = p_uid,
         cancelado_por = case when p_status = 'CANCELADO' then p_uid else cancelado_por end,
         cancelado_nome = case when p_status = 'CANCELADO' then (select nome from public.profiles where id = p_uid) else cancelado_nome end,
         cancelado_em = case when p_status = 'CANCELADO' then now() else cancelado_em end
   where id = p_id;
  return jsonb_build_object('id', p_id, 'de', _atual, 'para', p_status);
end $function$;

create or replace function public.abast_retornar_status(p_id uuid, p_status_atual text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE _uid uuid := auth.uid(); p public.abast_pedidos%rowtype; _anterior text; _n integer; _req_status text;
BEGIN
 IF _uid IS NULL OR NOT coalesce(public.has_role(_uid, 'ADMINISTRADOR'),false) THEN RAISE EXCEPTION 'Acesso negado: somente o administrador pode retornar o status' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.abast_pedidos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
 IF p.status IS DISTINCT FROM p_status_atual AND NOT (p.status='AGUARD_DIRETOR' AND p_status_atual='AGUARD_COMERCIAL') THEN RAISE EXCEPTION 'O status foi alterado. Atualize a lista antes de retornar.'; END IF;
 _n := jsonb_array_length(p.historico_status);
 IF _n > 0 THEN _anterior := p.historico_status->>(_n-1);
 ELSE
 _anterior := CASE p.status WHEN 'AGUARD_DIRETOR' THEN 'AGUARD_COMERCIAL' WHEN 'ABERTO' THEN CASE WHEN p.aprov_diretor_em IS NOT NULL THEN 'AGUARD_DIRETOR' WHEN p.aprov_comercial_em IS NOT NULL THEN 'AGUARD_COMERCIAL' ELSE NULL END WHEN 'EM_SEPARACAO' THEN 'ABERTO' WHEN 'SEPARADO' THEN 'EM_SEPARACAO' WHEN 'ENVIADO' THEN CASE WHEN EXISTS(SELECT 1 FROM public.abast_pedido_itens WHERE pedido_id=p_id AND coalesce(qtd_separada,0)>0) THEN 'SEPARADO' ELSE 'ABERTO' END WHEN 'RECEBIDO' THEN 'ENVIADO' ELSE NULL END;
 END IF;
 IF _anterior='AGUARD_DIRETOR' THEN _anterior:='AGUARD_COMERCIAL'; END IF; IF _anterior IS NULL THEN RAISE EXCEPTION 'Não há status anterior registrado para este pedido'; END IF;
 PERFORM set_config('app.abast_retorno',p_id::text,true);
 IF p.requisicao_id IS NOT NULL THEN
  SELECT status INTO _req_status FROM public.requisicoes WHERE id=p.requisicao_id FOR UPDATE;
  IF _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN
   IF EXISTS(SELECT 1 FROM public.requisicao_itens WHERE requisicao_id=p.requisicao_id AND (coalesce(quantidade_separada,0)>0 OR coalesce(quantidade_atendida,0)>0 OR jsonb_array_length(coalesce(lotes_separados,'[]'::jsonb))>0)) THEN RAISE EXCEPTION 'Há separação registrada. Estorne pela requisição antes de retornar à aprovação.'; END IF;
   UPDATE public.requisicoes SET status='CANCELADA' WHERE id=p.requisicao_id;
  ELSE
   UPDATE public.requisicoes SET status=CASE _anterior WHEN 'ABERTO' THEN 'ENVIADA' WHEN 'EM_SEPARACAO' THEN 'EM_SEPARACAO' WHEN 'SEPARADO' THEN 'ATENDIDA' ELSE status END WHERE id=p.requisicao_id;
  END IF;
 END IF;
 INSERT INTO public.audit_logs(usuario,acao,entidade,entidade_id,payload) VALUES(_uid,'RETORNAR_STATUS','abast_pedidos',p_id::text,jsonb_build_object('de',p.status,'para',_anterior,'pedido_antes',to_jsonb(p)));
 IF _anterior='AGUARD_COMERCIAL' THEN
  UPDATE public.abast_pedido_itens SET origem='SUGESTAO_COMERCIAL_ANTERIOR',aceito=false WHERE pedido_id=p_id AND origem='SUGESTAO_COMERCIAL';
 END IF;
 IF _anterior='AGUARD_DIRETOR' THEN UPDATE public.abast_pedido_itens SET aceito=NULL WHERE pedido_id=p_id AND origem='SUGESTAO_COMERCIAL'; END IF;
 UPDATE public.abast_pedidos SET status=_anterior, historico_status=CASE WHEN _n>0 THEN p.historico_status-(_n-1) ELSE p.historico_status END,
 requisicao_id=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.requisicao_id END,
 requisicao_numero=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.requisicao_numero END,
 aprov_comercial_por=CASE WHEN _anterior='AGUARD_COMERCIAL' THEN NULL ELSE p.aprov_comercial_por END,
 aprov_comercial_nome=CASE WHEN _anterior='AGUARD_COMERCIAL' THEN NULL ELSE p.aprov_comercial_nome END,
 aprov_comercial_em=CASE WHEN _anterior='AGUARD_COMERCIAL' THEN NULL ELSE p.aprov_comercial_em END,
 aprov_comercial_obs=CASE WHEN _anterior='AGUARD_COMERCIAL' THEN NULL ELSE p.aprov_comercial_obs END,
 aprov_comercial_resultado=CASE WHEN _anterior='AGUARD_COMERCIAL' THEN NULL ELSE p.aprov_comercial_resultado END,
 aprov_diretor_por=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.aprov_diretor_por END,
 aprov_diretor_nome=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.aprov_diretor_nome END,
 aprov_diretor_em=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.aprov_diretor_em END,
 aprov_diretor_obs=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.aprov_diretor_obs END,
 aprov_diretor_decisao=CASE WHEN _anterior IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN NULL ELSE p.aprov_diretor_decisao END,
 cancelado_por=CASE WHEN p.status='CANCELADO' THEN NULL ELSE p.cancelado_por END,
 cancelado_nome=CASE WHEN p.status='CANCELADO' THEN NULL ELSE p.cancelado_nome END,
 cancelado_em=CASE WHEN p.status='CANCELADO' THEN NULL ELSE p.cancelado_em END,
 atualizado_em=now(),atualizado_por=_uid WHERE id=p_id;
 PERFORM set_config('app.abast_retorno','',true);
 RETURN jsonb_build_object('id',p_id,'de',p.status,'para',_anterior);
END $function$;