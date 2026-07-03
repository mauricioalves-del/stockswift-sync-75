ALTER TABLE public.parametros_abastecimento
  ADD COLUMN IF NOT EXISTS origem_abastecimento text NOT NULL DEFAULT 'Alm_SP_Fabrica';

UPDATE public.parametros_abastecimento SET origem_abastecimento = 'Alm_SP_Fabrica' WHERE origem_abastecimento IS NULL OR origem_abastecimento = '';