CREATE OR REPLACE FUNCTION public.processar_fefo(_data date DEFAULT NULL::date)
 RETURNS TABLE(dia date, processados integer, quebras integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d date;
BEGIN
  d := COALESCE(_data, (
    SELECT max((m.data AT TIME ZONE 'America/Sao_Paulo')::date)
    FROM public.movimentacoes_diarias m
  ));
  IF d IS NULL THEN
    RETURN QUERY SELECT NULL::date, 0, 0; RETURN;
  END IF;

  DELETE FROM public.checagens_fefo c WHERE c.data = d;

  INSERT INTO public.checagens_fefo (
    data, id_produto, descricao, desc_movimento, desc_almox, destino, doc,
    lote_movimentado, qtd_movimentado, validade_movimentado,
    quebra, status, lote_mais_antigo, qtd_lote_mais_antigo, validade_mais_antiga)
  SELECT
    d, x.id_produto, x.descricao, x.desc_movimento, x.desc_almox, x.dest_txt, x.doc,
    x.id_lote, x.qtd, x.val_mov,
    x.status_final = '⚠️ QUEBRA DE FEFO',
    x.status_final,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_lote END,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_qtd END,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_val END
  FROM (
    SELECT f.*,
      CASE
        WHEN NOT f.eh_origem AND f.cod_linha IS NULL AND f.eh_fab THEN 'Almox não mapeado'
        WHEN NOT f.eh_origem THEN 'Destino (não auditado)'
        WHEN f.val_mov IS NULL THEN 'Sem validade (lote não encontrado)'
        WHEN f.n_cand = 0 AND f.n_semval = 0 THEN 'OK (almox vazio para este produto)'
        WHEN f.n_cand = 0 THEN 'Inconclusivo (lotes sem validade cadastrada no almox)'
        WHEN f.c_lote IS NULL THEN 'OK'
        WHEN EXISTS (SELECT 1 FROM public.excecoes_fefo e
                     WHERE public.fefo_norm_sku(e.id_produto) = f.sku
                       AND upper(btrim(e.lote_mais_antigo)) = upper(btrim(f.c_lote))) THEN 'OK (exceção validada)'
        ELSE '⚠️ QUEBRA DE FEFO'
      END AS status_final
    FROM (
      SELECT b.*,
        COALESCE(
          (SELECT min(e.data_validade) FROM public.estoque_sistemico e
            WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL
              AND public.fefo_norm_sku(e.id_produto) = b.sku),
          (SELECT min(e.data_validade) FROM public.estoque_sistemico e
            WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL)
        ) AS val_mov,
        (SELECT count(*) FROM public.estoque_sistemico e
          WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
            AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
            AND e.data_validade IS NOT NULL) AS n_cand,
        (SELECT count(*) FROM public.estoque_sistemico e
          WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
            AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
            AND e.data_validade IS NULL) AS n_semval,
        cand.lote AS c_lote, cand.quantidade AS c_qtd, cand.data_validade AS c_val
      FROM (
        SELECT m.id_produto, public.fefo_norm_sku(m.id_produto) AS sku, m.descricao, m.doc,
               m.desc_movimento, m.desc_almox, m.qtd, m.id_lote,
               btrim(split_part(m.desc_movimento,'->',2)) AS dest_txt,
               (lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fabrica%'
                 OR lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fábrica%') AS eh_fab,
               (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                 WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1) AS cod_linha,
               ((lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fabrica%'
                 OR lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fábrica%')
                AND (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1) IS NOT NULL
                AND (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1)
                    = (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(split_part(m.desc_movimento,'->',1))) LIMIT 1)
               ) AS eh_origem
        FROM public.movimentacoes_diarias m
        WHERE (m.data AT TIME ZONE 'America/Sao_Paulo')::date = d
          AND m.desc_movimento LIKE '%->%'
      ) b
      LEFT JOIN LATERAL (
        SELECT e.lote, e.quantidade, e.data_validade
        FROM public.estoque_sistemico e
        WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
          AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
          AND e.data_validade IS NOT NULL
          AND e.data_validade < COALESCE(
            (SELECT min(e2.data_validade) FROM public.estoque_sistemico e2
              WHERE upper(btrim(e2.lote)) = upper(btrim(b.id_lote)) AND e2.data_validade IS NOT NULL
                AND public.fefo_norm_sku(e2.id_produto) = b.sku),
            (SELECT min(e2.data_validade) FROM public.estoque_sistemico e2
              WHERE upper(btrim(e2.lote)) = upper(btrim(b.id_lote)) AND e2.data_validade IS NOT NULL))
        ORDER BY e.data_validade ASC
        LIMIT 1
      ) cand ON true
    ) f
  ) x;

  RETURN QUERY
    SELECT d, count(*)::int, count(*) FILTER (WHERE c.quebra)::int
    FROM public.checagens_fefo c WHERE c.data = d;
END $function$;