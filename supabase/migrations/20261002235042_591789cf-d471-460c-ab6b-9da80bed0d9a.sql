CREATE OR REPLACE FUNCTION public.executar_plano_contagem_ciclica(_plano_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  p record; _mid uuid; _titulo text; _skus text[]; _itens int;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para executar planos de contagem cíclica';
  END IF;

  SELECT * INTO p FROM planos_contagem_ciclica WHERE id = _plano_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;

  SELECT array_agg(DISTINCT c) INTO _skus FROM (
    SELECT codigo_produto c FROM grupo_produtos WHERE p.grupos IS NOT NULL AND grupo = ANY(p.grupos)
    UNION
    SELECT codigo_produto FROM familias WHERE p.familias IS NOT NULL AND familia = ANY(p.familias)
  ) u;
  IF p.criterio_abc IS NOT NULL THEN
    IF _skus IS NULL AND p.grupos IS NULL AND p.familias IS NULL THEN
      SELECT array_agg(DISTINCT codigo_produto) INTO _skus FROM classificacao_abc WHERE classe = p.criterio_abc;
    ELSE
      SELECT array_agg(DISTINCT codigo_produto) INTO _skus FROM classificacao_abc
        WHERE classe = p.criterio_abc AND codigo_produto = ANY(coalesce(_skus,'{}'));
    END IF;
  END IF;

  SELECT count(*) INTO _itens FROM estoque_sistemico e
  WHERE (p.origem IS NULL OR e.origem = p.origem)
    AND (
      (p.grupos IS NULL AND p.familias IS NULL AND p.criterio_abc IS NULL)
      OR e.id_produto = ANY(coalesce(_skus,'{}'))
    );

  IF _itens = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhum item encontrado para os filtros deste plano');
  END IF;

  _titulo := 'Contagem Cíclica - ' || p.nome || ' - ' || to_char(_hoje,'DD/MM/YYYY');

  INSERT INTO missoes (titulo, descricao, tipo, origem, data_execucao, criado_por, plano_origem_id, familias_alvo, grupos_alvo)
  VALUES (_titulo, 'Gerada manualmente a partir do planejamento cíclico', 'SEMANAL', p.origem, _hoje,
          auth.uid(), p.id, p.familias, p.grupos)
  RETURNING id INTO _mid;

  INSERT INTO missoes_itens (missao_id, codigo_produto, descricao, lote, quantidade_prevista)
  SELECT _mid, e.id_produto, e.descricao, e.lote, e.quantidade FROM estoque_sistemico e
  WHERE (p.origem IS NULL OR e.origem = p.origem)
    AND (
      (p.grupos IS NULL AND p.familias IS NULL AND p.criterio_abc IS NULL)
      OR e.id_produto = ANY(coalesce(_skus,'{}'))
    );

  UPDATE planos_contagem_ciclica SET ultima_execucao = _hoje WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'missao_id', _mid, 'titulo', _titulo, 'itens', _itens);
END $$;
REVOKE ALL ON FUNCTION public.executar_plano_contagem_ciclica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.executar_plano_contagem_ciclica(uuid) TO authenticated;