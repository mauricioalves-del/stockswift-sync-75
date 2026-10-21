CREATE OR REPLACE FUNCTION public.abast_aprovar_comercial(p_id uuid, p_aprovado boolean, p_obs text, p_itens_sugeridos jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); p public.abast_pedidos%rowtype; _nome text; _port jsonb; x record; _alm text; _est numeric; _res numeric; _ja numeric; _cx numeric; _n int:=0;
BEGIN
 IF _uid IS NULL OR NOT (coalesce(public.abast_eh_signatario(_uid,'GERENTE_COMERCIAL'),false) OR coalesce(public.has_role(_uid,'ADMINISTRADOR'),false)) THEN RAISE EXCEPTION 'acesso negado: somente o gerente comercial' USING ERRCODE='42501'; END IF;
 -- Serialize approval and extra-stock validation across orders.
 PERFORM pg_advisory_xact_lock(hashtext('abast-aprovacao-comercial'));
 SELECT * INTO p FROM public.abast_pedidos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pedido nao encontrado'; END IF;
 IF p.status NOT IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN RAISE EXCEPTION 'pedido nao esta aguardando aprovacao comercial'; END IF;
 IF p_aprovado IS NULL THEN RAISE EXCEPTION 'aprovacao invalida'; END IF;
 IF NOT p_aprovado AND coalesce(btrim(p_obs),'')='' THEN RAISE EXCEPTION 'informe as ressalvas na observacao'; END IF;
 IF p_itens_sugeridos IS NOT NULL AND jsonb_typeof(p_itens_sugeridos)<>'array' THEN RAISE EXCEPTION 'lista de produtos extras invalida'; END IF;
 SELECT coalesce(nullif(nome,''),email) INTO _nome FROM public.profiles WHERE id=_uid;
 _alm:=public.abast__almox_origem(p.tipo,p.loja_origem);
 IF jsonb_array_length(coalesce(p_itens_sugeridos,'[]'::jsonb))>0 OR EXISTS(SELECT 1 FROM public.abast_pedido_itens WHERE pedido_id=p_id AND origem='SUGESTAO_COMERCIAL' AND aceito IS NULL) THEN
  SELECT itens INTO _port FROM public.abast_validacoes_portfolio WHERE loja=p.loja AND status='VALIDADA' ORDER BY competencia DESC,aprovado_em DESC LIMIT 1;
  IF _port IS NULL THEN RAISE EXCEPTION 'loja sem portfolio aprovado'; END IF;
 END IF;
 FOR x IN SELECT * FROM jsonb_to_recordset(coalesce(p_itens_sugeridos,'[]'::jsonb)) AS r(id_produto text,descricao text,qtd numeric,fracionar boolean) LOOP
  IF x.id_produto IS NULL OR x.qtd IS NULL OR x.qtd<=0 OR x.qtd::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'produto ou quantidade invalida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_port) e WHERE ltrim(e->>'sku','0')=ltrim(x.id_produto,'0') AND coalesce((e->>'ativo')::boolean,true)) THEN RAISE EXCEPTION 'SKU % fora do catalogo aprovado da loja',x.id_produto; END IF;
  SELECT s.estoque,s.reservado INTO _est,_res FROM public.abast__saldo_origem(_alm,public.abast__sku_saldo(x.id_produto),p_id) s;
  SELECT coalesce(sum(qtd_pedida),0) INTO _ja FROM public.abast_pedido_itens WHERE pedido_id=p_id AND aceito IS DISTINCT FROM false AND public.abast__sku_saldo(id_produto)=public.abast__sku_saldo(x.id_produto);
  IF x.qtd>greatest(_est-_res-_ja,0) THEN RAISE EXCEPTION 'estoque insuficiente para SKU %: disponivel % un',x.id_produto,greatest(_est-_res-_ja,0); END IF;
  SELECT greatest(1,ceil(coalesce(max(full_case),1))) INTO _cx FROM public.abast_produto WHERE ltrim(id_produto,'0')=ltrim(x.id_produto,'0');
  IF EXISTS(SELECT 1 FROM public.familias WHERE ltrim(codigo_produto,'0')=ltrim(x.id_produto,'0') AND lower(trim(familia))='graneis') THEN _cx:=1; END IF;
  IF NOT coalesce(x.fracionar,false) AND _cx>1 AND mod(x.qtd,_cx)<>0 AND NOT (_est-_res-_ja<_cx) THEN RAISE EXCEPTION 'quantidade deve ser multiplo da caixa (% un) ou marcar Fracionar',_cx; END IF;
  INSERT INTO public.abast_pedido_itens(pedido_id,id_produto,descricao,qtd_sugerida,qtd_pedida,caixa,origem,aceito) VALUES(p_id,x.id_produto,x.descricao,NULL,x.qtd,_cx,'SUGESTAO_COMERCIAL',true);
  _n:=_n+1;
 END LOOP;
 -- Legacy pending suggestions are approved by the commercial approver, never by the retired director endpoint.
 FOR x IN SELECT id_produto FROM public.abast_pedido_itens WHERE pedido_id=p_id AND origem='SUGESTAO_COMERCIAL' AND aceito IS NULL LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_port) e WHERE ltrim(e->>'sku','0')=ltrim(x.id_produto,'0') AND coalesce((e->>'ativo')::boolean,true)) THEN RAISE EXCEPTION 'SKU % fora do catalogo aprovado da loja',x.id_produto; END IF;
  SELECT s.estoque,s.reservado INTO _est,_res FROM public.abast__saldo_origem(_alm,public.abast__sku_saldo(x.id_produto),p_id) s;
  SELECT coalesce(sum(qtd_pedida),0) INTO _ja FROM public.abast_pedido_itens WHERE pedido_id=p_id AND aceito IS DISTINCT FROM false AND public.abast__sku_saldo(id_produto)=public.abast__sku_saldo(x.id_produto);
  IF _ja>greatest(_est-_res,0) THEN RAISE EXCEPTION 'estoque insuficiente para SKU %',x.id_produto; END IF;
 END LOOP;
 UPDATE public.abast_pedido_itens SET aceito=true WHERE pedido_id=p_id AND origem='SUGESTAO_COMERCIAL' AND aceito IS NULL;
 UPDATE public.abast_pedidos SET status='ABERTO',aprov_comercial_por=_uid,aprov_comercial_nome=_nome,aprov_comercial_em=now(),aprov_comercial_obs=coalesce(nullif(btrim(p_obs),''),p.aprov_comercial_obs),aprov_comercial_resultado=CASE WHEN NOT p_aprovado OR _n>0 OR p.status='AGUARD_DIRETOR' THEN 'RESSALVAS' ELSE 'APROVADO' END,atualizado_em=now(),atualizado_por=_uid WHERE id=p_id;
 PERFORM public.abast__gerar_requisicao(_uid,p_id);
 RETURN jsonb_build_object('id',p_id,'status','ABERTO','sugeridos',_n);
END $$;
REVOKE ALL ON FUNCTION public.abast_aprovar_comercial(uuid,boolean,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abast_aprovar_comercial(uuid,boolean,text,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.abast_decidir_diretor(p_id uuid,p_decisao text,p_obs text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Etapa do Diretor removida: utilize a aprovacao comercial'; END $$;
COMMENT ON FUNCTION public.abast_decidir_diretor(uuid,text,text) IS 'DEPRECATED: order approval is exclusively commercial; retained for compatible errors on old clients.';
CREATE OR REPLACE FUNCTION public.abast__pode_editar_pedido(p_uid uuid,p_status text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p_status IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') AND (public.has_role(p_uid,'ADMINISTRADOR') OR public.is_gestor(p_uid) OR public.abast_eh_signatario(p_uid,'GERENTE_COMERCIAL')) $$;
DO $migration$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.abast_retornar_status(uuid,text)'::regprocedure) INTO def;
 def:=replace(def,'IF p.status IS DISTINCT FROM p_status_atual THEN','IF p.status IS DISTINCT FROM p_status_atual AND NOT (p.status=''AGUARD_DIRETOR'' AND p_status_atual=''AGUARD_COMERCIAL'') THEN');
 def:=replace(def,'IF _anterior IS NULL THEN','IF _anterior=''AGUARD_DIRETOR'' THEN _anterior:=''AGUARD_COMERCIAL''; END IF; IF _anterior IS NULL THEN');
 EXECUTE def;
END $migration$;