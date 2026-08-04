ALTER TABLE public.tipos_acao_shelf_life DROP CONSTRAINT IF EXISTS tipos_acao_shelf_life_categoria_check;
ALTER TABLE public.tipos_acao_shelf_life ADD CONSTRAINT tipos_acao_shelf_life_categoria_check CHECK (categoria = ANY (ARRAY['RECEITA'::text,'SAVING'::text,'PERDA'::text]));

INSERT INTO public.tipos_acao_shelf_life (nome, categoria, custo_padrao, ativo, ordem)
SELECT 'Descarte', 'PERDA', 0, true, 7
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_acao_shelf_life WHERE nome = 'Descarte');

ALTER TABLE public.campanhas_lote
  ADD COLUMN IF NOT EXISTS categoria_financeira text,
  ADD COLUMN IF NOT EXISTS quantidade_recuperada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_recuperado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saving_recuperado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recalculado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS recalculado_por uuid;