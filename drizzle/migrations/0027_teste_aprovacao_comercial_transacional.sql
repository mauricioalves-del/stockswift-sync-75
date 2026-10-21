CREATE OR REPLACE FUNCTION public.abast_testar_aprovacao_comercial() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; rid uuid; result jsonb; legacy uuid;
BEGIN
 IF uid IS NULL OR NOT coalesce(public.has_role(uid,'ADMINISTRADOR'),false) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 -- Run real RPCs inside a subtransaction that always rolls back; never change existing orders.
 BEGIN
  INSERT INTO public.abast_pedidos(loja,status,criado_por,observacao) VALUES('ELDORADO','AGUARD_COMERCIAL',uid,'Teste transacional sem persistencia') RETURNING id INTO pid;
  INSERT INTO public.abast_pedido_itens(pedido_id,id_produto,qtd_pedida,origem) VALUES(pid,'05004139',1,'MANUAL');
  PERFORM public.abast_aprovar_comercial(pid,false,'Teste de quantidade fracionada','[{"id_produto":"05004139","descricao":"Língua de Onça Leite Flowpack 11g","qtd":7,"fracionar":true}]'::jsonb);
  SELECT requisicao_id INTO rid FROM public.abast_pedidos WHERE id=pid;
  result:=jsonb_build_object('status',(SELECT status FROM public.abast_pedidos WHERE id=pid),'extra_aceito',(SELECT aceito FROM public.abast_pedido_itens WHERE pedido_id=pid AND origem='SUGESTAO_COMERCIAL'),'extra_qtd',(SELECT qtd_pedida FROM public.abast_pedido_itens WHERE pedido_id=pid AND origem='SUGESTAO_COMERCIAL'),'requisicao_criada',rid IS NOT NULL,'qtd_requisicao',(SELECT sum(quantidade_solicitada) FROM public.requisicao_itens WHERE requisicao_id=rid));
  PERFORM public.abast_retornar_status(pid,'ABERTO');
  result:=result||jsonb_build_object('retorno',(SELECT status FROM public.abast_pedidos WHERE id=pid));
  INSERT INTO public.abast_pedidos(loja,status,criado_por,observacao) VALUES('ELDORADO','AGUARD_DIRETOR',uid,'Teste legado sem persistencia') RETURNING id INTO legacy;
  INSERT INTO public.abast_pedido_itens(pedido_id,id_produto,qtd_pedida,origem) VALUES(legacy,'05004139',1,'MANUAL');
  PERFORM public.abast_aprovar_comercial(legacy,true,NULL,'[]'::jsonb);
  result:=result||jsonb_build_object('legado_status',(SELECT status FROM public.abast_pedidos WHERE id=legacy));
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Rollback de teste';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 RETURN result||jsonb_build_object('sem_persistencia',NOT EXISTS(SELECT 1 FROM public.abast_pedidos WHERE id IN (pid,legacy)));
END $$;
REVOKE ALL ON FUNCTION public.abast_testar_aprovacao_comercial() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abast_testar_aprovacao_comercial() TO authenticated;
COMMENT ON FUNCTION public.abast_testar_aprovacao_comercial() IS 'Admin-only regression test; all test writes rollback in a subtransaction, no existing orders touched.';