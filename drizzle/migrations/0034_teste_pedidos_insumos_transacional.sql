CREATE OR REPLACE FUNCTION public.abast_testar_insumos_pedido() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; rid uuid; g text; sku text; descricao text; est numeric; res numeric; resultados jsonb:='[]'; bloqueado boolean; resultado jsonb;
BEGIN
 IF uid IS NULL OR NOT coalesce(public.has_role(uid,'ADMINISTRADOR'),false) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 BEGIN
  FOREACH g IN ARRAY ARRAY['Mercadoria de Revenda','Embalagem','Materia Prima'] LOOP
   SELECT e.id_produto,max(e.descricao) INTO sku,descricao FROM public.estoque_sistemico e JOIN public.grupo_produtos gp ON ltrim(gp.codigo_produto,'0')=ltrim(e.id_produto,'0') WHERE gp.grupo=g AND e.origem=public.abast__almox_origem('NORMAL',NULL) GROUP BY e.id_produto HAVING sum(e.quantidade)>1 ORDER BY sum(e.quantidade) DESC LIMIT 1;
   IF sku IS NULL THEN RAISE EXCEPTION 'Sem estoque para teste do grupo %',g; END IF;
   INSERT INTO public.abast_pedidos(numero,loja,status,criado_por,observacao) VALUES(-990001,'PATIO','AGUARD_COMERCIAL',uid,'Teste de insumos sem persistencia') RETURNING id INTO pid;
   SELECT s.estoque,s.reservado INTO est,res FROM public.abast__saldo_origem(public.abast__almox_origem('NORMAL',NULL),public.abast__sku_saldo(sku),pid) s;
   bloqueado:=false;
   BEGIN
    PERFORM public.abast_aprovar_comercial(pid,false,'Teste de limite',jsonb_build_array(jsonb_build_object('id_produto',sku,'descricao',descricao,'qtd',greatest(est-res,0)+1,'fracionar',true)));
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'estoque insuficiente%' THEN RAISE; END IF;
    bloqueado:=true;
   END;
   IF NOT bloqueado THEN RAISE EXCEPTION 'Limite de estoque nao bloqueou'; END IF;
   PERFORM public.abast_aprovar_comercial(pid,false,'Teste de insumo',jsonb_build_array(jsonb_build_object('id_produto',sku,'descricao',descricao,'qtd',1,'fracionar',true)));
   SELECT requisicao_id INTO rid FROM public.abast_pedidos WHERE id=pid;
   resultados:=resultados||jsonb_build_array(jsonb_build_object('grupo',g,'status',(SELECT status FROM public.abast_pedidos WHERE id=pid),'qtd_item',(SELECT sum(qtd_pedida) FROM public.abast_pedido_itens WHERE pedido_id=pid),'qtd_requisicao',(SELECT sum(quantidade_solicitada) FROM public.requisicao_itens WHERE requisicao_id=rid),'limite_bloqueado',bloqueado));
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Rollback de teste';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 RETURN jsonb_build_object('grupos',resultados,'sem_persistencia',NOT EXISTS(SELECT 1 FROM public.abast_pedidos WHERE id=pid));
END $$;
REVOKE ALL ON FUNCTION public.abast_testar_insumos_pedido() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abast_testar_insumos_pedido() TO authenticated;
COMMENT ON FUNCTION public.abast_testar_insumos_pedido() IS 'Admin-only regression for three supply groups and stock limits; all test changes roll back and explicit test numbers avoid consuming order sequence.';