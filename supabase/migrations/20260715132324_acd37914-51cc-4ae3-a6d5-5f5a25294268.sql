
ALTER TABLE public.baixa_operacional
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS origem_lancamento text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS data_ocorrencia date;

INSERT INTO public.motivo_baixa (descricao, ativo)
SELECT v.descricao, true
FROM (VALUES ('AVARIA'), ('QUALIDADE')) AS v(descricao)
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivo_baixa m WHERE upper(m.descricao) = upper(v.descricao)
);
