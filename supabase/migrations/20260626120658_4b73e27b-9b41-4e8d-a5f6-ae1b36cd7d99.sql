
-- Tabela familias: codigo_produto -> familia
CREATE TABLE public.familias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_produto TEXT NOT NULL,
  descricao_produto TEXT,
  familia TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_produto)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.familias TO authenticated;
GRANT ALL ON public.familias TO service_role;
ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read familias" ON public.familias FOR SELECT TO authenticated USING (true);
CREATE POLICY "write familias" ON public.familias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'INVENTARIANTE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'INVENTARIANTE'));
CREATE TRIGGER trg_familias_updated BEFORE UPDATE ON public.familias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_familias_familia ON public.familias(familia);

-- Tabela locais (combobox de locais de inventário)
CREATE TABLE public.locais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais TO authenticated;
GRANT ALL ON public.locais TO service_role;
ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read locais" ON public.locais FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write locais" ON public.locais FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_locais_updated BEFORE UPDATE ON public.locais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.locais (nome) VALUES
  ('Almoxarifado Fábrica'),
  ('Loja Shopping Ponta Negra'),
  ('Loja Shopping Manauara'),
  ('Aeroporto Congonhas')
ON CONFLICT (nome) DO NOTHING;
