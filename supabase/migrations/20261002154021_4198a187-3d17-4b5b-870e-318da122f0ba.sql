ALTER TABLE public.baixa_operacional
  ADD COLUMN IF NOT EXISTS nfe_baixa_numero text,
  ADD COLUMN IF NOT EXISTS nfe_baixa_serie text,
  ADD COLUMN IF NOT EXISTS nfe_baixa_chave text,
  ADD COLUMN IF NOT EXISTS nfe_baixa_data date,
  ADD COLUMN IF NOT EXISTS nfe_baixa_observacao text;