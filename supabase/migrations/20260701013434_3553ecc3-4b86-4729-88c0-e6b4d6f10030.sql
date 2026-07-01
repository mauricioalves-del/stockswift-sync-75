-- Trocar chave única do estoque: incluir origem (almox), pois o mesmo SKU+Lote existe em vários almox
DROP INDEX IF EXISTS public.estoque_sistemico_sku_lote_uniq;
DELETE FROM public.estoque_sistemico a
USING public.estoque_sistemico b
WHERE a.ctid < b.ctid
  AND a.id_produto = b.id_produto
  AND COALESCE(a.lote,'') = COALESCE(b.lote,'')
  AND COALESCE(a.origem,'') = COALESCE(b.origem,'');
CREATE UNIQUE INDEX IF NOT EXISTS estoque_sistemico_sku_lote_origem_uniq
  ON public.estoque_sistemico (id_produto, lote, origem);