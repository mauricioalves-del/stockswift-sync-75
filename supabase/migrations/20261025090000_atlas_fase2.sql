-- Atlas fase 2: liga cada almoxarifado do Atlas ao almoxarifado do Stock Savvy (cadastro Almox / origens).
ALTER TABLE public.atlas_almoxarifados ADD COLUMN IF NOT EXISTS codigo_origem text;
COMMENT ON COLUMN public.atlas_almoxarifados.codigo_origem IS 'origens.codigo_origem do Stock Savvy correspondente a este almoxarifado do Atlas';
