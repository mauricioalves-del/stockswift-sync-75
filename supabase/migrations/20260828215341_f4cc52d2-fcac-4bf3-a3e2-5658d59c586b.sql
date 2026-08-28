-- Consolida duplicados existentes por (id_op, material, data_producao)
WITH agg AS (
  SELECT id_op, material, data_producao,
         SUM(COALESCE(qtd_consumo,0)) AS s_consumo,
         SUM(COALESCE(qtd_previsto,0)) AS s_previsto,
         SUM(COALESCE(qtd_produzida,0)) AS s_produzida,
         COUNT(*) FILTER (WHERE qtd_produzida IS NOT NULL) AS n_produzida,
         (MAX(id::text))::uuid AS keep_id
  FROM public.producao_consumo
  WHERE data_producao IS NOT NULL
  GROUP BY id_op, material, data_producao
  HAVING COUNT(*) > 1
)
UPDATE public.producao_consumo p
SET qtd_consumo = a.s_consumo,
    qtd_previsto = a.s_previsto,
    qtd_produzida = CASE WHEN a.n_produzida = 0 THEN NULL ELSE a.s_produzida END
FROM agg a
WHERE p.id = a.keep_id;

DELETE FROM public.producao_consumo p
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY id_op, material, data_producao ORDER BY id DESC) AS rn
  FROM public.producao_consumo
  WHERE data_producao IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS producao_consumo_op_material_data_uidx
  ON public.producao_consumo (id_op, material, data_producao);