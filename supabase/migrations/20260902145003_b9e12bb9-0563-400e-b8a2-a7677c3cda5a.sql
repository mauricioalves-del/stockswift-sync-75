CREATE TABLE public.checagens_fefo_lotes_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checagem_id uuid NOT NULL REFERENCES public.checagens_fefo(id) ON DELETE CASCADE,
  estoque_sistemico_id uuid,
  id_produto text NOT NULL,
  origem text NOT NULL,
  lote text NOT NULL,
  quantidade numeric NOT NULL,
  data_validade date,
  data_importacao timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.checagens_fefo_lotes_snapshot TO authenticated;
GRANT ALL ON public.checagens_fefo_lotes_snapshot TO service_role;

ALTER TABLE public.checagens_fefo_lotes_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Snapshots FEFO disponíveis para usuários autenticados"
ON public.checagens_fefo_lotes_snapshot
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_checagens_fefo_snapshot_checagem
  ON public.checagens_fefo_lotes_snapshot (checagem_id);
CREATE INDEX idx_checagens_fefo_snapshot_produto_origem
  ON public.checagens_fefo_lotes_snapshot (id_produto, origem);

CREATE OR REPLACE FUNCTION public.processar_fefo(_data date DEFAULT NULL::date)
RETURNS TABLE(dia date, processados integer, quebras integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d date;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  d := COALESCE(_data, (
    SELECT max((m.data AT TIME ZONE 'America/Sao_Paulo')::date)
    FROM public.movimentacoes_diarias m
  ));

  IF d IS NULL THEN
    RETURN QUERY SELECT NULL::date, 0, 0;
    RETURN;
  END IF;

  IF d < hoje THEN
    RAISE EXCEPTION 'Dias anteriores estão encerrados e não podem ser reprocessados.';
  END IF;

  DELETE FROM public.checagens_fefo c WHERE c.data = d;

  INSERT INTO public.checagens_fefo (
    data, id_produto, descricao, desc_movimento, desc_almox, destino, doc,
    lote_movimentado, qtd_movimentado, validade_movimentado,
    quebra, status, lote_mais_antigo, qtd_lote_mais_antigo, validade_mais_antiga
  )
  SELECT
    d,
    f.id_produto,
    f.descricao,
    f.desc_movimento,
    f.desc_almox,
    f.dest_txt,
    f.doc,
    f.id_lote,
    f.qtd,
    f.val_mov,
    f.status_final = '⚠️ QUEBRA DE FEFO',
    f.status_final,
    f.lote_mais_antigo,
    f.qtd_lote_mais_antigo,
    f.validade_mais_antiga
  FROM (
    SELECT base.*,
      CASE
        WHEN NOT base.eh_origem AND base.cod_linha IS NULL AND base.eh_fab THEN 'Almox não mapeado'
        WHEN NOT base.eh_origem THEN 'Destino (não auditado)'
        WHEN base.val_mov IS NULL THEN 'Sem validade (lote não encontrado)'
        WHEN base.total_com_saldo = 0 THEN 'OK (almox vazio para este produto)'
        WHEN base.total_com_validade = 0 THEN 'Inconclusivo (lotes sem validade cadastrada no almox)'
        WHEN base.validade_mais_antiga IS NULL THEN 'Inconclusivo (lotes sem validade cadastrada no almox)'
        WHEN upper(btrim(base.lote_mais_antigo)) = upper(btrim(base.id_lote)) THEN 'OK'
        WHEN base.validade_mais_antiga >= base.val_mov THEN 'OK'
        WHEN EXISTS (
          SELECT 1
          FROM public.excecoes_fefo ex
          WHERE upper(btrim(ex.id_produto)) = upper(btrim(base.id_produto))
            AND upper(btrim(ex.lote_mais_antigo)) = upper(btrim(base.lote_mais_antigo))
        ) THEN 'OK (exceção validada)'
        ELSE '⚠️ QUEBRA DE FEFO'
      END AS status_final
    FROM (
      SELECT
        m.id_produto,
        m.descricao,
        m.doc,
        m.desc_movimento,
        m.desc_almox,
        m.qtd,
        m.id_lote,
        btrim(split_part(m.desc_movimento, '->', 2)) AS dest_txt,
        (lower(btrim(split_part(m.desc_movimento, '->', 1))) LIKE '%fabrica%'
          OR lower(btrim(split_part(m.desc_movimento, '->', 1))) LIKE '%fábrica%') AS eh_fab,
        origem.codigo AS cod_linha,
        ((lower(btrim(split_part(m.desc_movimento, '->', 1))) LIKE '%fabrica%'
          OR lower(btrim(split_part(m.desc_movimento, '->', 1))) LIKE '%fábrica%')
          AND origem.codigo IS NOT NULL
          AND origem.codigo = origem_mov.codigo) AS eh_origem,
        mov.validade AS val_mov,
        COALESCE(saldos.total_com_saldo, 0) AS total_com_saldo,
        COALESCE(saldos.total_com_validade, 0) AS total_com_validade,
        antigo.lote AS lote_mais_antigo,
        antigo.quantidade AS qtd_lote_mais_antigo,
        antigo.data_validade AS validade_mais_antiga
      FROM public.movimentacoes_diarias m
      LEFT JOIN LATERAL (
        SELECT ma.codigo
        FROM public.mapa_almoxarifados ma
        WHERE ma.ativo
          AND lower(btrim(ma.nome)) = lower(btrim(m.desc_almox))
        LIMIT 1
      ) origem ON true
      LEFT JOIN LATERAL (
        SELECT ma.codigo
        FROM public.mapa_almoxarifados ma
        WHERE ma.ativo
          AND lower(btrim(ma.nome)) = lower(btrim(split_part(m.desc_movimento, '->', 1)))
        LIMIT 1
      ) origem_mov ON true
      LEFT JOIN LATERAL (
        SELECT min(e.data_validade) AS validade
        FROM public.estoque_sistemico e
        WHERE upper(btrim(e.id_produto)) = upper(btrim(m.id_produto))
          AND upper(btrim(e.lote)) = upper(btrim(m.id_lote))
          AND e.data_validade IS NOT NULL
      ) mov ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE e.quantidade > 0) AS total_com_saldo,
          count(*) FILTER (WHERE e.quantidade > 0 AND e.data_validade IS NOT NULL) AS total_com_validade
        FROM public.estoque_sistemico e
        WHERE upper(btrim(e.id_produto)) = upper(btrim(m.id_produto))
          AND e.origem = origem.codigo
      ) saldos ON true
      LEFT JOIN LATERAL (
        SELECT e.lote, e.quantidade, e.data_validade
        FROM public.estoque_sistemico e
        WHERE upper(btrim(e.id_produto)) = upper(btrim(m.id_produto))
          AND e.origem = origem.codigo
          AND e.quantidade > 0
          AND e.data_validade IS NOT NULL
        ORDER BY e.data_validade ASC, upper(btrim(e.lote)) ASC, e.id ASC
        LIMIT 1
      ) antigo ON true
      WHERE (m.data AT TIME ZONE 'America/Sao_Paulo')::date = d
        AND m.desc_movimento LIKE '%->%'
    ) base
  ) f;

  INSERT INTO public.checagens_fefo_lotes_snapshot (
    checagem_id, estoque_sistemico_id, id_produto, origem, lote,
    quantidade, data_validade, data_importacao
  )
  SELECT
    c.id,
    e.id,
    e.id_produto,
    e.origem,
    e.lote,
    e.quantidade,
    e.data_validade,
    e.data_importacao
  FROM public.checagens_fefo c
  JOIN public.mapa_almoxarifados ma
    ON ma.ativo
   AND lower(btrim(ma.nome)) = lower(btrim(c.desc_almox))
  JOIN public.estoque_sistemico e
    ON upper(btrim(e.id_produto)) = upper(btrim(c.id_produto))
   AND e.origem = ma.codigo
   AND e.quantidade > 0
  WHERE c.data = d;

  RETURN QUERY
    SELECT d, count(*)::int, count(*) FILTER (WHERE c.quebra)::int
    FROM public.checagens_fefo c
    WHERE c.data = d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_fefo_apos_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.movimentacoes_diarias m
    WHERE (m.data AT TIME ZONE 'America/Sao_Paulo')::date = hoje
  ) THEN
    PERFORM public.processar_fefo(hoje);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reprocessar_fefo_dias_afetados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.movimentacoes_diarias m
    WHERE (m.data AT TIME ZONE 'America/Sao_Paulo')::date = hoje
  ) THEN
    PERFORM public.processar_fefo(hoje);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.processar_fefo(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_fefo(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_fefo(date) TO service_role;