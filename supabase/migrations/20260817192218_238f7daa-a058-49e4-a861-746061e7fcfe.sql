CREATE OR REPLACE VIEW public.item_custo_mestre
WITH (security_invoker = on) AS
WITH bom AS (
  SELECT id_item,
         max(item) AS descricao_item,
         avg(NULLIF(custo, 0)) AS custo_medio,
         min(NULLIF(custo, 0)) AS custo_min,
         max(NULLIF(custo, 0)) AS custo_max,
         count(DISTINCT NULLIF(custo, 0)) AS qtd_custos_distintos
  FROM public.ficha_tecnica_bom
  GROUP BY id_item
),
est AS (
  SELECT id_produto,
         max(descricao) AS descricao_item,
         avg(NULLIF(custo_unitario, 0)) AS custo_medio,
         min(NULLIF(custo_unitario, 0)) AS custo_min,
         max(NULLIF(custo_unitario, 0)) AS custo_max
  FROM public.estoque_sistemico
  GROUP BY id_produto
),
ids AS (
  SELECT id_item FROM bom
  UNION
  SELECT id_produto FROM est
)
SELECT
  i.id_item,
  COALESCE(b.descricao_item, e.descricao_item) AS descricao_item,
  COALESCE(b.custo_medio, e.custo_medio) AS custo_unit_medio,
  COALESCE(b.custo_min, e.custo_min) AS custo_unit_min,
  COALESCE(b.custo_max, e.custo_max) AS custo_unit_max,
  COALESCE(b.qtd_custos_distintos, 0) AS qtd_custos_distintos,
  CASE
    WHEN b.custo_medio IS NOT NULL THEN 'FICHA_TECNICA'
    WHEN e.custo_medio IS NOT NULL THEN 'ESTOQUE'
    ELSE 'SEM_CUSTO'
  END AS fonte_custo
FROM ids i
LEFT JOIN bom b ON b.id_item = i.id_item
LEFT JOIN est e ON e.id_produto = i.id_item;

GRANT SELECT ON public.item_custo_mestre TO authenticated;
GRANT SELECT ON public.item_custo_mestre TO service_role;