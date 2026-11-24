-- Contagem de Inventário → fechamento oficial do Atlas: vínculo do inventário com o fechamento gerado.
ALTER TABLE public.inv_inventarios ADD COLUMN IF NOT EXISTS fechamento_id bigint, ADD COLUMN IF NOT EXISTS fechamento_gerado_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS inv_inventarios_fechamento_uidx ON public.inv_inventarios (fechamento_id) WHERE fechamento_id IS NOT NULL;
