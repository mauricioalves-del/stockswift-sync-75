-- 1. historico_consumo: soma duplicados por (origem, sku, data_movimento)
WITH agg AS (
  SELECT origem, sku, data_movimento, SUM(quantidade) AS total,
         (ARRAY_AGG(id ORDER BY created_at DESC, id))[1] AS keep_id
  FROM public.historico_consumo
  GROUP BY 1,2,3
  HAVING COUNT(*) > 1
)
UPDATE public.historico_consumo h
   SET quantidade = agg.total
  FROM agg
 WHERE h.id = agg.keep_id;

DELETE FROM public.historico_consumo h
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY origem, sku, data_movimento ORDER BY created_at DESC, id) AS rn
  FROM public.historico_consumo
) d
WHERE h.id = d.id AND d.rn > 1;

ALTER TABLE public.historico_consumo
  ADD CONSTRAINT historico_consumo_origem_sku_data_key UNIQUE (origem, sku, data_movimento);

-- 2. ficha_tecnica_bom: normaliza id_subconjunto e remove duplicados (mantém mais recente)
UPDATE public.ficha_tecnica_bom
   SET id_subconjunto = ''
 WHERE id_subconjunto IS NULL;

ALTER TABLE public.ficha_tecnica_bom
  ALTER COLUMN id_subconjunto SET DEFAULT '',
  ALTER COLUMN id_subconjunto SET NOT NULL;

DELETE FROM public.ficha_tecnica_bom b
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY id_produto, id_subconjunto, id_item ORDER BY created_at DESC, id) AS rn
  FROM public.ficha_tecnica_bom
) d
WHERE b.id = d.id AND d.rn > 1;

ALTER TABLE public.ficha_tecnica_bom
  ADD CONSTRAINT ficha_tecnica_bom_produto_sub_item_key UNIQUE (id_produto, id_subconjunto, id_item);