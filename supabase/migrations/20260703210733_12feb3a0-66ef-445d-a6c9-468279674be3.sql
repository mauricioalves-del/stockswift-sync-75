
-- Adiciona campos de separação FEFO em requisicao_itens
ALTER TABLE public.requisicao_itens
  ADD COLUMN IF NOT EXISTS status_item text NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS quantidade_separada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_nao_separacao text,
  ADD COLUMN IF NOT EXISTS lotes_separados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS separado_por uuid,
  ADD COLUMN IF NOT EXISTS separado_em timestamptz;
