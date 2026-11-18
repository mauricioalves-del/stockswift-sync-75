-- Mapa de entregas: coordenadas do destino (geocodificadas pelo CEP na solicitação) e ponto de origem configurável.
ALTER TABLE public.log_solicitacoes ADD COLUMN IF NOT EXISTS lat double precision, ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.log_envios ADD COLUMN IF NOT EXISTS lat double precision, ADD COLUMN IF NOT EXISTS lng double precision;
-- Envio gerado por ordem herda as coordenadas da solicitação
CREATE OR REPLACE FUNCTION public.log_trg_envio_geo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ordem_id IS NOT NULL AND NEW.lat IS NULL THEN
    SELECT s.lat, s.lng INTO NEW.lat, NEW.lng FROM log_ordens o JOIN log_solicitacoes s ON s.id = o.solicitacao_id WHERE o.id = NEW.ordem_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_envios_geo ON public.log_envios;
CREATE TRIGGER log_envios_geo BEFORE INSERT OR UPDATE ON public.log_envios FOR EACH ROW EXECUTE FUNCTION public.log_trg_envio_geo();
-- Origem das entregas (centro das zonas). Ajustável em Configurações › Cadastros de transporte.
INSERT INTO public.app_config (chave, valor, updated_at)
VALUES ('log_origem', '{"nome":"Fábrica Mágio (SP)","lat":-23.5505,"lng":-46.6333}'::jsonb, now())
ON CONFLICT (chave) DO NOTHING;
