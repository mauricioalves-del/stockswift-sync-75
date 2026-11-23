-- Contagem de Inventário v2: quem reconta cada dupla, tolerância, saldo visível (opcional), observação por linha,
-- remoção de lote incluído manualmente, edição do planejamento com redistribuição dos itens ainda não contados.
ALTER TABLE public.inv_duplas ADD COLUMN IF NOT EXISTS recontada_por uuid REFERENCES public.inv_duplas(id) ON DELETE SET NULL;
ALTER TABLE public.inv_inventarios ADD COLUMN IF NOT EXISTS exibir_sistema boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tolerancia_pct numeric NOT NULL DEFAULT 5;

DROP FUNCTION IF EXISTS public.inv_minhas_tarefas(uuid, text);
CREATE FUNCTION public.inv_minhas_tarefas(p_inv uuid, p_fase text)
RETURNS TABLE (id uuid, codigo_produto text, descricao text, lote text, grupo text, unidade text, origem_item text, qtd numeric, identificado boolean,
               registrado_em timestamptz, dupla text, sistema numeric, observacao text, criado_por_mim boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.codigo_produto, i.descricao, i.lote, i.grupo, i.unidade, i.origem_item,
         CASE WHEN p_fase = 'recontagem' THEN i.qtd_recontagem ELSE i.qtd_contagem END,
         CASE WHEN p_fase = 'recontagem' THEN i.identificado_recontagem ELSE NULL END,
         CASE WHEN p_fase = 'recontagem' THEN i.recontado_em ELSE i.contado_em END,
         d.nome,
         CASE WHEN v.exibir_sistema OR public.is_gestor(auth.uid()) THEN i.qtd_sistema END,  -- sem saldo na contagem cega
         i.observacao, i.created_by = auth.uid()
  FROM inv_itens i JOIN inv_inventarios v ON v.id = i.inventario_id
  JOIN inv_duplas d ON d.id = CASE WHEN p_fase = 'recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END
  WHERE i.inventario_id = p_inv AND d.id IN (SELECT inv_minhas_duplas(p_inv))
    AND (p_fase <> 'recontagem' OR i.divergente IS TRUE)
  ORDER BY i.grupo NULLS LAST, i.codigo_produto, i.lote
$$;

DROP FUNCTION IF EXISTS public.inv_registrar(uuid, text, numeric, boolean);
CREATE FUNCTION public.inv_registrar(p_item uuid, p_fase text, p_qtd numeric, p_identificado boolean DEFAULT NULL, p_obs text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v record; minha boolean;
BEGIN
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = i.inventario_id;
  minha := (CASE WHEN p_fase = 'recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END) IN (SELECT inv_minhas_duplas(i.inventario_id));
  IF NOT COALESCE(minha, false) THEN RAISE EXCEPTION 'Item não está na lista da sua dupla'; END IF;
  IF p_qtd IS NULL THEN -- só observação
    UPDATE inv_itens SET observacao = nullif(btrim(p_obs), '') WHERE id = p_item; RETURN;
  END IF;
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
END $$;

-- Remover lote/produto incluído manualmente pela própria dupla (enquanto a etapa está aberta)
CREATE OR REPLACE FUNCTION public.inv_remover_manual(p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v record;
BEGIN
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = i.inventario_id;
  IF i.origem_item <> 'manual' THEN RAISE EXCEPTION 'Só é possível remover itens incluídos manualmente'; END IF;
  IF NOT public.is_gestor(auth.uid()) AND NOT (COALESCE(i.dupla_id, i.dupla_recontagem_id) IN (SELECT inv_minhas_duplas(i.inventario_id))) THEN RAISE EXCEPTION 'Item de outra dupla'; END IF;
  IF v.status NOT IN ('lista_gerada','em_contagem','em_recontagem') THEN RAISE EXCEPTION 'Inventário fechado'; END IF;
  DELETE FROM inv_itens WHERE id = p_item;
END $$;

-- Após editar o planejamento: itens ainda não contados seguem a nova distribuição de grupos
CREATE OR REPLACE FUNCTION public.inv_redistribuir(p_inv uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente a gestão edita o planejamento'; END IF;
  UPDATE inv_itens i SET dupla_id = COALESCE((SELECT dg.dupla_id FROM inv_dupla_grupos dg WHERE dg.inventario_id = p_inv AND dg.grupo = i.grupo), (SELECT dupla_padrao_id FROM inv_inventarios WHERE id = p_inv))
   WHERE i.inventario_id = p_inv AND i.origem_item = 'lista' AND i.qtd_contagem IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

-- Apuração: por SKU (soma dos lotes) com tolerância; recontagem pela dupla definida no planejamento
CREATE OR REPLACE FUNCTION public.inv_apurar(p_inv uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; rec uuid[]; it record; k integer := 0; esc uuid; n integer := 0;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente a gestão encerra a contagem'; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = p_inv;
  WITH s AS (SELECT codigo_produto, sum(qtd_sistema) sis, sum(COALESCE(qtd_contagem, 0)) cont, bool_or(qtd_contagem IS NULL) falta FROM inv_itens WHERE inventario_id = p_inv GROUP BY codigo_produto)
  UPDATE inv_itens i SET divergente = (s.falta OR CASE WHEN s.sis = 0 THEN s.cont <> 0 ELSE abs(s.cont - s.sis) / abs(s.sis) * 100 > v.tolerancia_pct END)
  FROM s WHERE i.inventario_id = p_inv AND i.codigo_produto = s.codigo_produto;
  UPDATE inv_itens SET qtd_final = qtd_contagem WHERE inventario_id = p_inv AND divergente IS FALSE;
  SELECT array_agg(id ORDER BY nome) INTO rec FROM inv_duplas WHERE inventario_id = p_inv AND reconta;
  IF rec IS NULL THEN RAISE EXCEPTION 'Defina ao menos uma dupla de recontagem'; END IF;
  FOR it IN SELECT i.id, i.dupla_id, d.recontada_por FROM inv_itens i LEFT JOIN inv_duplas d ON d.id = i.dupla_id WHERE i.inventario_id = p_inv AND i.divergente ORDER BY i.grupo, i.codigo_produto LOOP
    esc := it.recontada_por;
    IF esc IS NULL THEN
      FOR j IN 0 .. array_length(rec, 1) - 1 LOOP
        IF rec[((k + j) % array_length(rec, 1)) + 1] IS DISTINCT FROM it.dupla_id THEN esc := rec[((k + j) % array_length(rec, 1)) + 1]; k := k + j + 1; EXIT; END IF;
      END LOOP;
    END IF;
    UPDATE inv_itens SET dupla_recontagem_id = COALESCE(esc, rec[1]) WHERE id = it.id; n := n + 1;
  END LOOP;
  UPDATE inv_inventarios SET status = CASE WHEN n > 0 THEN 'em_recontagem' ELSE 'finalizado' END, apurado_em = now(), finalizado_em = CASE WHEN n > 0 THEN NULL ELSE now() END WHERE id = p_inv;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.inv_minhas_tarefas(uuid, text), public.inv_registrar(uuid, text, numeric, boolean, text), public.inv_remover_manual(uuid), public.inv_redistribuir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_minhas_tarefas(uuid, text), public.inv_registrar(uuid, text, numeric, boolean, text), public.inv_remover_manual(uuid), public.inv_redistribuir(uuid) TO authenticated;
