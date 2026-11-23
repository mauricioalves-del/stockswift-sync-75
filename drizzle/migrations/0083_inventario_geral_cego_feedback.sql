-- Contagem de Inventário: contagem cega para quem não é Administrador (saldo do sistema só para ADMINISTRADOR)
-- e retorno da classificação do SKU ao registrar (para o sinal sonoro/vibração de certo ou divergente).
CREATE OR REPLACE FUNCTION public.inv_minhas_tarefas(p_inv uuid, p_fase text)
RETURNS TABLE (id uuid, codigo_produto text, descricao text, lote text, grupo text, unidade text, origem_item text, qtd numeric, identificado boolean,
               registrado_em timestamptz, dupla text, sistema numeric, observacao text, criado_por_mim boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.codigo_produto, i.descricao, i.lote, i.grupo, i.unidade, i.origem_item,
         CASE WHEN p_fase = 'recontagem' THEN i.qtd_recontagem ELSE i.qtd_contagem END,
         CASE WHEN p_fase = 'recontagem' THEN i.identificado_recontagem ELSE NULL END,
         CASE WHEN p_fase = 'recontagem' THEN i.recontado_em ELSE i.contado_em END,
         d.nome,
         CASE WHEN public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role) THEN i.qtd_sistema END,
         i.observacao, i.created_by = auth.uid()
  FROM inv_itens i
  JOIN inv_duplas d ON d.id = CASE WHEN p_fase = 'recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END
  WHERE i.inventario_id = p_inv AND d.id IN (SELECT inv_minhas_duplas(p_inv))
    AND (p_fase <> 'recontagem' OR i.divergente IS TRUE)
  ORDER BY i.grupo NULLS LAST, i.codigo_produto, i.lote
$$;

-- Classificação do SKU na etapa: PENDENTE (falta lote), OK (dentro da tolerância) ou DIVERGENTE
CREATE OR REPLACE FUNCTION public.inv_status_sku(p_inv uuid, p_codigo text, p_fase text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN bool_or(q IS NULL) THEN 'PENDENTE'
              WHEN sum(i.qtd_sistema) = 0 THEN CASE WHEN sum(q) = 0 THEN 'OK' ELSE 'DIVERGENTE' END
              WHEN abs(sum(q) - sum(i.qtd_sistema)) / abs(sum(i.qtd_sistema)) * 100 <= max(v.tolerancia_pct) THEN 'OK' ELSE 'DIVERGENTE' END
  FROM inv_itens i JOIN inv_inventarios v ON v.id = i.inventario_id,
       LATERAL (SELECT CASE WHEN p_fase = 'recontagem' THEN i.qtd_recontagem ELSE i.qtd_contagem END AS q) x
  WHERE i.inventario_id = p_inv AND i.codigo_produto = p_codigo
    AND (p_fase <> 'recontagem' OR i.divergente IS TRUE)
$$;

DROP FUNCTION IF EXISTS public.inv_registrar(uuid, text, numeric, boolean, text);
CREATE FUNCTION public.inv_registrar(p_item uuid, p_fase text, p_qtd numeric, p_identificado boolean DEFAULT NULL, p_obs text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v record; minha boolean;
BEGIN
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = i.inventario_id;
  minha := (CASE WHEN p_fase = 'recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END) IN (SELECT inv_minhas_duplas(i.inventario_id));
  IF NOT COALESCE(minha, false) THEN RAISE EXCEPTION 'Item não está na lista da sua dupla'; END IF;
  IF p_qtd IS NULL THEN UPDATE inv_itens SET observacao = nullif(btrim(p_obs), '') WHERE id = p_item; RETURN NULL; END IF;
  IF p_qtd < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF p_fase = 'recontagem' THEN
    IF v.status <> 'em_recontagem' THEN RAISE EXCEPTION 'A recontagem não está aberta'; END IF;
    IF p_identificado IS NULL THEN RAISE EXCEPTION 'Informe se o produto foi identificado na 2ª contagem'; END IF;
    UPDATE inv_itens SET qtd_recontagem = p_qtd, identificado_recontagem = p_identificado, recontado_por = auth.uid(), recontado_em = now(), qtd_final = p_qtd,
      observacao = COALESCE(nullif(btrim(p_obs), ''), observacao) WHERE id = p_item;
  ELSE
    IF v.status NOT IN ('lista_gerada','em_contagem') THEN RAISE EXCEPTION 'A contagem não está aberta'; END IF;
    UPDATE inv_itens SET qtd_contagem = p_qtd, contado_por = auth.uid(), contado_em = now(), observacao = COALESCE(nullif(btrim(p_obs), ''), observacao) WHERE id = p_item;
    IF v.status = 'lista_gerada' THEN UPDATE inv_inventarios SET status = 'em_contagem' WHERE id = v.id; END IF;
  END IF;
  RETURN public.inv_status_sku(i.inventario_id, i.codigo_produto, p_fase);
END $$;

REVOKE ALL ON FUNCTION public.inv_registrar(uuid, text, numeric, boolean, text), public.inv_status_sku(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_registrar(uuid, text, numeric, boolean, text), public.inv_status_sku(uuid, text, text) TO authenticated;
