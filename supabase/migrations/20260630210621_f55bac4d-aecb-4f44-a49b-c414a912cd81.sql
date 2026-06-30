
-- Remove duplicates keeping the most recent
DELETE FROM public.estoque_sistemico a USING public.estoque_sistemico b
WHERE a.id < b.id AND a.id_produto = b.id_produto AND COALESCE(a.lote,'') = COALESCE(b.lote,'');

CREATE UNIQUE INDEX IF NOT EXISTS estoque_sistemico_sku_lote_uniq
  ON public.estoque_sistemico (id_produto, lote);
