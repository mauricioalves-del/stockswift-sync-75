-- Contagem de Inventário: (1) resultado final = contagem mais próxima do saldo do sistema (1ª ou recontagem);
-- (2) 3ª contagem do Administrador para itens em que 1ª e 2ª ficaram inconsistentes — quando lançada, ela é o final.
-- Unidades conciliadas com faturamento (qtd_faturada) continuam somadas ao final.
ALTER TABLE public.inv_itens ADD COLUMN IF NOT EXISTS qtd_terceira numeric, ADD COLUMN IF NOT EXISTS terceira_por uuid,
  ADD COLUMN IF NOT EXISTS terceira_em timestamptz, ADD COLUMN IF NOT EXISTS terceira_obs text;

CREATE OR REPLACE FUNCTION public.inv_final_proximo(p_sis numeric, p_c1 numeric, p_c2 numeric, p_fat numeric DEFAULT 0) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_c2 IS NULL THEN p_c1 + COALESCE(p_fat, 0)
              WHEN p_c1 IS NULL THEN p_c2 + COALESCE(p_fat, 0)
              WHEN abs(p_c1 + COALESCE(p_fat, 0) - p_sis) < abs(p_c2 + COALESCE(p_fat, 0) - p_sis) THEN p_c1 + COALESCE(p_fat, 0)
              ELSE p_c2 + COALESCE(p_fat, 0) END   -- empate: vale a recontagem
$$;
GRANT EXECUTE ON FUNCTION public.inv_final_proximo(numeric, numeric, numeric, numeric) TO authenticated;

-- Final do item: 3ª contagem (se houver) ou a mais próxima do sistema entre 1ª e 2ª
CREATE OR REPLACE FUNCTION public.inv_final_item(p_sis numeric, p_c1 numeric, p_c2 numeric, p_c3 numeric, p_fat numeric DEFAULT 0) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_c3 IS NOT NULL THEN p_c3 + COALESCE(p_fat, 0) ELSE public.inv_final_proximo(p_sis, p_c1, p_c2, p_fat) END
$$;
GRANT EXECUTE ON FUNCTION public.inv_final_item(numeric, numeric, numeric, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.inv_registrar(p_item uuid, p_fase text, p_qtd numeric, p_identificado boolean DEFAULT NULL, p_obs text DEFAULT NULL) RETURNS text
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
    UPDATE inv_itens SET qtd_recontagem = p_qtd, identificado_recontagem = p_identificado, recontado_por = auth.uid(), recontado_em = now(),
      qtd_final = public.inv_final_item(i.qtd_sistema, i.qtd_contagem, p_qtd, i.qtd_terceira, i.qtd_faturada),
      observacao = COALESCE(nullif(btrim(p_obs), ''), observacao) WHERE id = p_item;
  ELSE
    IF v.status NOT IN ('lista_gerada','em_contagem') THEN RAISE EXCEPTION 'A contagem não está aberta'; END IF;
    UPDATE inv_itens SET qtd_contagem = p_qtd, contado_por = auth.uid(), contado_em = now(), observacao = COALESCE(nullif(btrim(p_obs), ''), observacao) WHERE id = p_item;
    IF v.status = 'lista_gerada' THEN UPDATE inv_inventarios SET status = 'em_contagem' WHERE id = v.id; END IF;
  END IF;
  RETURN public.inv_status_sku(i.inventario_id, i.codigo_produto, p_fase);
END $$;

-- 3ª contagem: só Administrador, com a recontagem aberta; NULL na quantidade desfaz a 3ª (volta à regra da mais próxima)
CREATE OR REPLACE FUNCTION public.inv_registrar_terceira(p_item uuid, p_qtd numeric, p_obs text DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v record; fim numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role) THEN RAISE EXCEPTION 'Somente o Administrador lança a 3ª contagem'; END IF;
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = i.inventario_id;
  IF v.status <> 'em_recontagem' THEN RAISE EXCEPTION 'A 3ª contagem só pode ser lançada com o inventário em recontagem'; END IF;
  IF p_qtd IS NOT NULL AND p_qtd < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  fim := public.inv_final_item(i.qtd_sistema, i.qtd_contagem, i.qtd_recontagem, p_qtd, i.qtd_faturada);
  UPDATE inv_itens SET qtd_terceira = p_qtd, terceira_por = CASE WHEN p_qtd IS NULL THEN NULL ELSE auth.uid() END,
    terceira_em = CASE WHEN p_qtd IS NULL THEN NULL ELSE now() END, terceira_obs = nullif(btrim(p_obs), ''),
    qtd_final = CASE WHEN p_qtd IS NULL AND i.qtd_recontagem IS NULL THEN NULL ELSE fim END
  WHERE id = p_item;
  RETURN fim;
END $$;
REVOKE ALL ON FUNCTION public.inv_registrar_terceira(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_registrar_terceira(uuid, numeric, text) TO authenticated;

-- Inventários abertos: recalcula o final dos itens já recontados pela nova regra
UPDATE public.inv_itens i SET qtd_final = public.inv_final_item(i.qtd_sistema, i.qtd_contagem, i.qtd_recontagem, i.qtd_terceira, i.qtd_faturada)
FROM public.inv_inventarios v WHERE v.id = i.inventario_id AND v.status = 'em_recontagem' AND i.qtd_recontagem IS NOT NULL;
