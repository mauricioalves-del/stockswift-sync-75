CREATE OR REPLACE FUNCTION public.abast__saldo_origem(p_alm text, p_sku text, p_exclui uuid DEFAULT NULL::uuid)
RETURNS TABLE(estoque numeric, reservado numeric, estoque_lido_em timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 WITH lido AS (SELECT max(data_importacao) AS t FROM public.estoque_sistemico)
 SELECT greatest(0, coalesce((SELECT sum(e.quantidade) FROM public.estoque_sistemico e WHERE e.origem=p_alm AND e.quantidade>0 AND public.abast__sku_saldo(e.id_produto)=p_sku),0)
 - coalesce((SELECT sum(b.quantidade) FROM public.baixa_operacional b WHERE b.id_local=p_alm AND public.abast__sku_saldo(b.codigo_produto)=p_sku AND b.status_fluxo IN ('PENDENTE','ANALISE','AJUSTE_SOLICITADO','AGUARDANDO_ADMIN') AND b.data_execucao IS NULL),0)),
 coalesce((SELECT sum(i.qtd_pedida) FROM public.abast_pedidos pd JOIN public.abast_pedido_itens i ON i.pedido_id=pd.id
 WHERE (p_exclui IS NULL OR pd.id<>p_exclui) AND public.abast__almox_origem(pd.tipo,pd.loja_origem)=p_alm
 AND public.abast__sku_saldo(i.id_produto)=p_sku AND i.aceito IS DISTINCT FROM false
 AND NOT (i.origem='SUGESTAO_COMERCIAL' AND i.aceito IS NULL)
 AND (pd.status IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR','ABERTO','EM_SEPARACAO','SEPARADO') OR (pd.status='ENVIADO' AND pd.atualizado_em>(SELECT t FROM lido)))),0),
 (SELECT t FROM lido)
$function$;
CREATE OR REPLACE FUNCTION public.abast_validar_saldo_baixas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid uuid; p record; x record; alm text; est numeric; res numeric;
BEGIN
 IF TG_TABLE_NAME='abast_pedidos' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status<>'ABERTO' OR OLD.status NOT IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN RETURN NEW; END IF;
  pid:=NEW.id;
 ELSE
  pid:=NEW.pedido_id;
 END IF;
 SELECT * INTO p FROM public.abast_pedidos WHERE id=pid;
 IF p.status NOT IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR','ABERTO') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('abast-aprovacao-comercial'));
 alm:=public.abast__almox_origem(p.tipo,p.loja_origem);
 FOR x IN SELECT public.abast__sku_saldo(i.id_produto) AS sku,sum(i.qtd_pedida) AS qtd
 FROM public.abast_pedido_itens i WHERE i.pedido_id=pid AND i.aceito IS DISTINCT FROM false
 AND NOT (i.origem='SUGESTAO_COMERCIAL' AND i.aceito IS NULL) GROUP BY 1 LOOP
  IF EXISTS(SELECT 1 FROM public.baixa_operacional b WHERE b.id_local=alm AND public.abast__sku_saldo(b.codigo_produto)=x.sku AND b.status_fluxo IN ('PENDENTE','ANALISE','AJUSTE_SOLICITADO','AGUARDANDO_ADMIN') AND b.data_execucao IS NULL) THEN
   SELECT s.estoque,s.reservado INTO est,res FROM public.abast__saldo_origem(alm,x.sku,pid) s;
   IF x.qtd>greatest(est-res,0) THEN RAISE EXCEPTION 'Saldo insuficiente para SKU % em % após descontar baixas em aberto: disponível % un. Atualize a reposição ou ajuste o pedido.',x.sku,alm,greatest(est-res,0); END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.abast_validar_saldo_baixas() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER abast_itens_validar_baixas AFTER INSERT OR UPDATE OF qtd_pedida, aceito ON public.abast_pedido_itens FOR EACH ROW EXECUTE FUNCTION public.abast_validar_saldo_baixas();
CREATE TRIGGER abast_aprovacao_validar_baixas BEFORE UPDATE OF status ON public.abast_pedidos FOR EACH ROW EXECUTE FUNCTION public.abast_validar_saldo_baixas();