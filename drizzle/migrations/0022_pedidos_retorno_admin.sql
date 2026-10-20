ALTER TABLE public.abast_pedidos ADD COLUMN IF NOT EXISTS historico_status jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.abast_registrar_status_anterior() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND coalesce(current_setting('app.abast_retorno', true),'') <> OLD.id::text THEN
  NEW.historico_status := coalesce(OLD.historico_status,'[]'::jsonb) || jsonb_build_array(OLD.status);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_abast_status_anterior BEFORE UPDATE OF status ON public.abast_pedidos FOR EACH ROW EXECUTE FUNCTION public.abast_registrar_status_anterior();
CREATE OR REPLACE FUNCTION public.abast_retornar_status(p_id uuid, p_status_atual text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); p public.abast_pedidos%rowtype; _anterior text; _n integer; _req_status text;
BEGIN
 IF _uid IS NULL OR NOT coalesce(public.has_role(_uid, 'ADMINISTRADOR'),false) THEN RAISE EXCEPTION 'Acesso negado: somente o administrador pode retornar o status' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.abast_pedidos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
 IF p.status IS DISTINCT FROM p_status_atual THEN RAISE EXCEPTION 'O status foi alterado. Atualize a lista antes de retornar.'; END IF;
 _n := jsonb_array_length(p.historico_status);
 IF _n > 0 THEN _anterior := p.historico_status->>(_n-1);
 ELSE
 _anterior := CASE p.status WHEN 'AGUARD_DIRETOR' THEN 'AGUARD_COMERCIAL' WHEN 'ABERTO' THEN CASE WHEN p.aprov_diretor_em IS NOT NULL THEN 'AGUARD_DIRETOR' WHEN p.aprov_comercial_em IS NOT NULL THEN 'AGUARD_COMERCIAL' ELSE NULL END WHEN 'EM_SEPARACAO' THEN 'ABERTO' WHEN 'SEPARADO' THEN 'EM_SEPARACAO' WHEN 'ENVIADO' THEN CASE WHEN EXISTS(SELECT 1 FROM public.abast_pedido_itens WHERE pedido_id=p_id AND coalesce(qtd_separada,0)>0) THEN 'SEPARADO' ELSE 'ABERTO' END WHEN 'RECEBIDO' THEN 'ENVIADO' ELSE NULL END;
 END IF;
 IF _anterior IS NULL THEN RAISE EXCEPTION 'Não há status anterior registrado para este pedido'; END IF;
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
 atualizado_em=now(),atualizado_por=_uid WHERE id=p_id;
 PERFORM set_config('app.abast_retorno','',true);
 RETURN jsonb_build_object('id',p_id,'de',p.status,'para',_anterior);
END $$;
REVOKE ALL ON FUNCTION public.abast_retornar_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abast_retornar_status(uuid,text) TO authenticated,service_role;