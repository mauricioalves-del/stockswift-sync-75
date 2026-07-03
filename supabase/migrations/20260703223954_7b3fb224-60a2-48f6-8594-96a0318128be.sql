
ALTER TABLE public.produtos_reposicao
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_ideal  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo numeric NOT NULL DEFAULT 0;

ALTER TABLE public.requisicoes
  ADD COLUMN IF NOT EXISTS metodo_utilizado text;
