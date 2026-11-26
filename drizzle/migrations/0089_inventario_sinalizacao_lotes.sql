CREATE OR REPLACE FUNCTION public.inv_sinalizacao_lotes(p_inv uuid, p_fase text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.equipe_aprovada_para_leitura(auth.uid()) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
 IF p_fase NOT IN ('contagem','recontagem') OR p_fase IS NULL THEN RAISE EXCEPTION 'fase invalida'; END IF;
 RETURN (
 WITH tarefas AS (
 SELECT i.id, i.codigo_produto, i.qtd_sistema,
 CASE WHEN p_fase='recontagem' THEN i.qtd_recontagem ELSE i.qtd_contagem END AS qtd
 FROM public.inv_itens i
 WHERE i.inventario_id=p_inv AND (p_fase<>'recontagem' OR i.divergente IS TRUE)
 AND (public.has_role(auth.uid(),'ADMINISTRADOR'::public.app_role)
 OR CASE WHEN p_fase='recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END IN (SELECT public.inv_minhas_duplas(p_inv)))
 ), concluidos AS (SELECT codigo_produto FROM tarefas GROUP BY codigo_produto HAVING bool_and(qtd IS NOT NULL))
 SELECT coalesce(jsonb_object_agg(t.id::text, CASE WHEN t.qtd<t.qtd_sistema THEN 'NEG' WHEN t.qtd>t.qtd_sistema THEN 'POS' ELSE 'OK' END),'{}'::jsonb)
 FROM tarefas t JOIN concluidos c USING(codigo_produto) WHERE t.qtd_sistema IS NOT NULL
 );
END $function$;
REVOKE ALL ON FUNCTION public.inv_sinalizacao_lotes(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_sinalizacao_lotes(uuid,text) TO authenticated, service_role;