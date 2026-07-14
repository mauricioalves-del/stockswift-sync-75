ALTER TABLE public.missoes_itens DROP CONSTRAINT IF EXISTS missoes_itens_status_item_check;
ALTER TABLE public.missoes_itens ADD CONSTRAINT missoes_itens_status_item_check
  CHECK (status_item IN ('PENDENTE','CONTADO','DIVERGENTE','OK','DIVERGENCIA_NEGATIVA','DIVERGENCIA_POSITIVA'));