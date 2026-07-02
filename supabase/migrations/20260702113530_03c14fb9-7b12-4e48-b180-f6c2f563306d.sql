ALTER TABLE public.estoque_sistemico ADD COLUMN IF NOT EXISTS ean text;
CREATE INDEX IF NOT EXISTS idx_estoque_sistemico_ean ON public.estoque_sistemico (ean) WHERE ean IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_sistemico_produto_origem ON public.estoque_sistemico (id_produto, origem);