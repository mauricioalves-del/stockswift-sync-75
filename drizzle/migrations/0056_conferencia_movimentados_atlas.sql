-- Farol de Movimentados conversa com o indicador de Movimentados do Atlas:
-- a conferência registrada no farol vira conciliação no Atlas, no mesmo formato da importação "Movimentação"
-- (planilha de reconciliação sistema × contagem):
--   item OK         -> atlas_movimentacoes_historico (divergência 0, status Historico_Resolvido, origem movimentacao)
--   item divergente -> atlas_divergencias (status Aberta, origem movimentacao) para investigação na tela de Divergências
-- Cada conferência abre um lote em atlas_lotes_importacao (tipo farol_movimentados); regravar a conferência do mesmo dia
-- substitui o histórico do lote anterior e as divergências dele que ainda estão Abertas (as já tratadas são preservadas).
-- Itens já conciliados por outra fonte (ja_conciliado = true) não são regravados no Atlas.
-- Idempotente.
ALTER TABLE public.conferencias_movimentados ADD COLUMN IF NOT EXISTS lote_importacao_id integer;

CREATE OR REPLACE FUNCTION public.registrar_conferencia_movimentados(p_almox text, p_data date, p_itens jsonb, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); _nome text; _id uuid; _mov int; _conf int; _div int; _atlas text; _lote_ant int; _lote int;
        _hist int := 0; _divs int := 0; x jsonb; _sku text; _sis numeric; _fis numeric; _cat text; _custo numeric;
BEGIN
  IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) THEN RAISE EXCEPTION 'Usuário sem acesso' USING errcode = '42501'; END IF;
  _atlas := CASE p_almox WHEN 'FABRICA' THEN 'Almox_SP_Fabrica' WHEN 'PROCESSO' THEN 'Almox_SP_Processo'
                         WHEN 'QUALIDADE' THEN 'Almox_SP_Qualidade' WHEN 'PARA' THEN 'Almox_PA_Para' END;
  IF _atlas IS NULL THEN RAISE EXCEPTION 'Almoxarifado inválido'; END IF;
  IF p_data IS NULL OR p_data > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data de movimento inválida'; END IF;
  IF jsonb_typeof(p_itens) <> 'array' THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
  SELECT count(*), count(*) FILTER (WHERE x2->>'status' IN ('OK','DIVERGENTE')), count(*) FILTER (WHERE x2->>'status' = 'DIVERGENTE')
    INTO _mov, _conf, _div FROM jsonb_array_elements(p_itens) x2;
  IF _conf = 0 THEN RAISE EXCEPTION 'Marque ao menos um item como conferido'; END IF;
  SELECT coalesce(nome, email) INTO _nome FROM public.profiles WHERE id = uid;
  PERFORM pg_advisory_xact_lock(hashtext('farol-mov-' || p_almox || p_data));

  -- Substitui a conciliação gravada pela conferência anterior do mesmo dia (preservando divergências já tratadas).
  SELECT lote_importacao_id INTO _lote_ant FROM public.conferencias_movimentados WHERE almox = p_almox AND data_movimento = p_data;
  IF _lote_ant IS NOT NULL THEN
    DELETE FROM public.atlas_movimentacoes_historico WHERE lote_importacao_id = _lote_ant;
    DELETE FROM public.atlas_divergencias WHERE lote_importacao_id = _lote_ant AND status = 'Aberta';
  END IF;

  INSERT INTO public.atlas_lotes_importacao (tipo, arquivo_origem, almoxarifado, usuario, criado_em)
  VALUES ('farol_movimentados', 'Farol de Movimentados · ' || _atlas || ' · ' || to_char(p_data, 'DD/MM/YYYY'), _atlas, _nome, now() AT TIME ZONE 'America/Sao_Paulo')
  RETURNING id INTO _lote;

  FOR x IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    CONTINUE WHEN x->>'status' NOT IN ('OK','DIVERGENTE') OR coalesce((x->>'ja_conciliado')::boolean, false);
    _sku := regexp_replace(trim(x->>'sku'), '^0+', '');
    _sis := coalesce(nullif(x->>'saldo_sistema', '')::numeric, 0);
    _fis := CASE WHEN x->>'status' = 'OK' THEN _sis ELSE coalesce(nullif(x->>'qtd_contada', '')::numeric, _sis) END;
    SELECT categoria_produto, custo_unitario INTO _cat, _custo FROM public.atlas_produtos WHERE regexp_replace(sku, '^0+', '') = _sku LIMIT 1;
    IF x->>'status' = 'OK' OR _fis = _sis THEN
      INSERT INTO public.atlas_movimentacoes_historico (sku, almoxarifado, categoria_produto, data_movimento, entrada, saida, saldo_sistema, saldo_fisico,
        divergencia, valor_divergencia, observacao_original, prejuizo_confirmado, status, origem, lote_importacao_id)
      VALUES (_sku, _atlas, coalesce(_cat, 'Desconhecido'), p_data, 0, coalesce(nullif(x->>'qtd', '')::numeric, 0), _sis, _fis,
        0, 0, 'Conferência registrada no Farol de Movimentados por ' || coalesce(_nome, '—'), false, 'Historico_Resolvido', 'movimentacao', _lote);
      _hist := _hist + 1;
    ELSE
      INSERT INTO public.atlas_divergencias (sku, almoxarifado, categoria_produto, data_deteccao, saldo_sistema, saldo_fisico, divergencia_qtd, valor_estimado,
        status, origem, observacao_origem, lote_importacao_id, criado_em, evidencias, casos_similares, distribuicao_probabilidades)
      VALUES (_sku, _atlas, coalesce(_cat, 'Desconhecido'), p_data, _sis, _fis, round((_fis - _sis)::numeric, 4),
        CASE WHEN _custo IS NULL THEN 0 ELSE round(abs(_fis - _sis) * _custo, 2) END,
        'Aberta', 'movimentacao', nullif(left(trim(coalesce(x->>'obs', '') || ' · Farol de Movimentados (' || coalesce(_nome, '—') || ')'), 500), ''), _lote,
        now() AT TIME ZONE 'America/Sao_Paulo',
        '[{"hipotese":"Falha_Inventario","verificacao":"investigacao_pendente: a investigação automática roda na tela de Divergências (Reinvestigar)","encontrado":false,"peso_aplicado":0}]'::json,
        '[]'::json, '[]'::json);
      _divs := _divs + 1;
    END IF;
  END LOOP;
  UPDATE public.atlas_lotes_importacao SET linhas_processadas = _hist + _divs, divergencias_criadas = _divs, historico_criado = _hist WHERE id = _lote;

  INSERT INTO public.conferencias_movimentados (almox, data_movimento, conferido_em, conferente_id, conferente_nome, itens_movimentados, itens_conferidos, divergentes, observacao, itens, lote_importacao_id)
  VALUES (p_almox, p_data, now(), uid, _nome, _mov, _conf, _div, nullif(left(trim(coalesce(p_observacao, '')), 1000), ''), p_itens, _lote)
  ON CONFLICT (almox, data_movimento) DO UPDATE SET conferido_em = now(), conferente_id = uid, conferente_nome = _nome,
    itens_movimentados = _mov, itens_conferidos = _conf, divergentes = _div, observacao = excluded.observacao, itens = excluded.itens, lote_importacao_id = _lote
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'itens_conferidos', _conf, 'divergentes', _div, 'atlas_historico', _hist, 'atlas_divergencias', _divs, 'lote', _lote);
END $$;
REVOKE ALL ON FUNCTION public.registrar_conferencia_movimentados(text, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_movimentados(text, date, jsonb, text) TO authenticated;
