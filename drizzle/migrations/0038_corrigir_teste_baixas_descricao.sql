CREATE OR REPLACE FUNCTION public.abast_testar_baixas_reposicao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE alm text; sku text; loja text; bruto numeric; liquido numeric; res numeric; pid uuid; bloqueado boolean:=false; aprovado_bloqueado boolean:=false; resultado jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'ADMINISTRADOR'),false) THEN RAISE EXCEPTION 'Somente administrador' USING ERRCODE='42501'; END IF;
 BEGIN
  alm:=public.abast__almox_origem('NORMAL',NULL);
  SELECT e.id_produto,sum(e.quantidade) INTO sku,bruto FROM public.estoque_sistemico e WHERE e.origem=alm AND e.quantidade>0 GROUP BY e.id_produto HAVING sum(e.quantidade)>2 ORDER BY e.id_produto LIMIT 1;
  SELECT codigo INTO loja FROM public.abast_lojas WHERE ativo AND almoxarifado<>alm ORDER BY ordem LIMIT 1;
  IF sku IS NULL OR loja IS NULL THEN RAISE EXCEPTION 'Sem estoque para teste'; END IF;
  INSERT INTO public.baixa_operacional(codigo_produto,descricao,id_local,quantidade,status_fluxo,solicitante_id) VALUES(sku,'Teste transacional sem persistencia',alm,bruto,'PENDENTE',auth.uid());
  SELECT s.estoque,s.reservado INTO liquido,res FROM public.abast__saldo_origem(alm,public.abast__sku_saldo(sku),NULL) s;
  BEGIN
   PERFORM public.abast_criar_pedido(loja,'consenso','Teste transacional',jsonb_build_array(jsonb_build_object('id_produto',sku,'qtd_pedida',greatest(liquido-res,0)+1,'caixa',1)));
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'Saldo insuficiente%' THEN RAISE; END IF;
   bloqueado:=true;
  END;
  INSERT INTO public.abast_pedidos(loja,base_demanda,criado_por,status) VALUES(loja,'consenso',auth.uid(),'ENVIADO') RETURNING id INTO pid;
  INSERT INTO public.abast_pedido_itens(pedido_id,id_produto,qtd_pedida,caixa) VALUES(pid,sku,greatest(liquido-res,0)+1,1);
  UPDATE public.abast_pedidos SET status='AGUARD_COMERCIAL' WHERE id=pid;
  BEGIN
   PERFORM public.abast_aprovar_comercial(pid,true,NULL,NULL);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'Saldo insuficiente%' THEN RAISE; END IF;
   aprovado_bloqueado:=true;
  END;
  resultado:=jsonb_build_object('criacao_bloqueada',bloqueado,'aprovacao_bloqueada',aprovado_bloqueado,'sem_persistencia',true);
  RAISE EXCEPTION 'rollback teste baixas' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN
  IF SQLERRM<>'rollback teste baixas' THEN RAISE; END IF;
 END;
 RETURN resultado;
END $function$;