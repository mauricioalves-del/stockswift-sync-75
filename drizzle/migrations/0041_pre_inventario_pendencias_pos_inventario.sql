CREATE OR REPLACE FUNCTION public.pre_inventario_pendencias(p_almox text)
 RETURNS TABLE(tipo text, rotulo text, quantidade bigint, valor numeric, rota text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  RETURN QUERY
  SELECT 'BAIXAS'::text, 'Baixas operacionais não executadas'::text, count(*), COALESCE(sum(b.valor_total), 0)::numeric, '/baixas'::text
    FROM public.baixa_operacional b
   WHERE b.origem = p_almox AND b.status_fluxo IN ('PENDENTE','ANALISE','APROVADA','AJUSTE_SOLICITADO');

  RETURN QUERY
  SELECT 'REQUISICOES'::text, 'Requisições em aberto (enviadas, aprovadas ou em separação)'::text, count(*), COALESCE(sum(r.valor_total), 0)::numeric, '/suprimentos/requisicoes'::text
    FROM public.requisicoes r
   WHERE p_almox IN (r.origem_fornecedora, r.origem_solicitante) AND r.status IN ('ENVIADA','APROVADA','EM_SEPARACAO');

  RETURN QUERY
  SELECT 'RECONTAGEM'::text, 'Recontagens pendentes'::text, count(*), 0::numeric, '/recontagem'::text
    FROM public.recontagem rc
   WHERE rc.origem = p_almox AND rc.status = 'PENDENTE_RECONTAGEM';

  RETURN QUERY
  SELECT 'DIVERGENCIAS'::text, 'Divergências do Atlas não resolvidas'::text, count(*), COALESCE(sum(abs(d.valor_estimado)), 0)::numeric, '/atlas/divergencias'::text
    FROM public.atlas_divergencias d
   WHERE (d.almoxarifado = p_almox OR d.almoxarifado IN (SELECT a.codigo FROM public.atlas_almoxarifados a WHERE a.codigo_origem = p_almox))
     AND d.status IN ('Aberta','Em_Investigacao') AND COALESCE(d.origem,'') <> 'fechamento_inventario';

  RETURN QUERY
  SELECT 'ACOES_POS_INVENTARIO'::text, 'Ações pós-inventário pendentes'::text, count(*), 0::numeric, '/atlas/pos-inventario'::text
    FROM public.atlas_acoes_pos_inventario ap
   WHERE (ap.almoxarifado = p_almox OR ap.almoxarifado IN (SELECT a.codigo FROM public.atlas_almoxarifados a WHERE a.codigo_origem = p_almox))
     AND ap.status IN ('Pendente','Em_Andamento');
END $function$;
GRANT EXECUTE ON FUNCTION public.pre_inventario_pendencias(text) TO authenticated;