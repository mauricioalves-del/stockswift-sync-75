-- Materiais de uso e consumo incluídos dentro de um pedido que aguarda aprovação (botão no próprio pedido).
-- Quantidade livre (sem caixaria), só itens do catálogo de uso e consumo; não aprova o pedido. Idempotente.
CREATE OR REPLACE FUNCTION public.abast_adicionar_materiais_pedido(p_id uuid, p_obs text, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); p public.abast_pedidos%rowtype; _nome text; _cat jsonb; _c jsonb; x record; _n int := 0; _log jsonb := '[]'::jsonb; _obs text := nullif(btrim(coalesce(p_obs,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.abast_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido nao encontrado'; END IF;
  IF p.status NOT IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN RAISE EXCEPTION 'so e possivel adicionar materiais a pedido aguardando aprovacao'; END IF;
  IF NOT (coalesce(public.abast__pode_editar_pedido(_uid, p.status),false) OR coalesce(public.abast_eh_signatario(_uid,'GERENTE_COMERCIAL'),false)) THEN RAISE EXCEPTION 'acesso negado: sem permissao para editar este pedido' USING ERRCODE='42501'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'informe ao menos um material'; END IF;
  SELECT coalesce(nullif(nome,''),email) INTO _nome FROM public.profiles WHERE id = _uid;
  _cat := public.abast_catalogo_materiais();
  FOR x IN SELECT * FROM jsonb_to_recordset(p_itens) AS r(id_produto text, qtd numeric) LOOP
    IF x.id_produto IS NULL OR x.qtd IS NULL OR x.qtd <= 0 OR x.qtd::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'material ou quantidade invalida'; END IF;
    SELECT e INTO _c FROM jsonb_array_elements(_cat) e WHERE ltrim(e->>'id_produto','0') = ltrim(x.id_produto,'0') LIMIT 1;
    IF _c IS NULL THEN RAISE EXCEPTION 'material % fora da lista de uso e consumo', x.id_produto; END IF;
    INSERT INTO public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem, aceito)
      VALUES (p_id, _c->>'id_produto', _c->>'descricao', NULL, x.qtd, 1, 'MATERIAL_CONSUMO', true);
    _log := _log || jsonb_build_array(jsonb_build_object('em', now(), 'por', _uid, 'nome', _nome, 'acao', 'ADICIONAR', 'id_produto', _c->>'id_produto', 'descricao', _c->>'descricao', 'qtd_antes', 0, 'qtd_depois', x.qtd, 'motivo', coalesce(_obs, 'material de uso e consumo')));
    _n := _n + 1;
  END LOOP;
  UPDATE public.abast_pedidos SET atualizado_em = now(), atualizado_por = _uid, edicoes = coalesce(edicoes,'[]'::jsonb) || _log WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', p.status, 'adicionados', _n);
END $$;
REVOKE ALL ON FUNCTION public.abast_adicionar_materiais_pedido(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_adicionar_materiais_pedido(uuid,text,jsonb) TO authenticated, service_role;
