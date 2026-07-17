
-- 1. Nova tabela periodos_sazonais
CREATE TABLE public.periodos_sazonais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  recorrente_anual BOOLEAN NOT NULL DEFAULT false,
  escopo_tipo TEXT NOT NULL CHECK (escopo_tipo IN ('EMPRESA','GRUPO','FAMILIA','SKU')),
  escopo_valor TEXT,
  indice_multiplicador NUMERIC NOT NULL DEFAULT 1,
  origem_indice TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem_indice IN ('MANUAL','AUTOMATICO')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodos_sazonais TO authenticated;
GRANT ALL ON public.periodos_sazonais TO service_role;

ALTER TABLE public.periodos_sazonais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periodos_sazonais_select_auth"
  ON public.periodos_sazonais FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "periodos_sazonais_insert_gestor"
  ON public.periodos_sazonais FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "periodos_sazonais_update_gestor"
  ON public.periodos_sazonais FOR UPDATE
  TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "periodos_sazonais_delete_gestor"
  ON public.periodos_sazonais FOR DELETE
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE TRIGGER update_periodos_sazonais_updated_at
  BEFORE UPDATE ON public.periodos_sazonais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_periodos_sazonais_escopo ON public.periodos_sazonais(escopo_tipo, escopo_valor) WHERE ativo = true;
CREATE INDEX idx_periodos_sazonais_datas ON public.periodos_sazonais(data_inicio, data_fim) WHERE ativo = true;

-- 2. metodo_override em parametros_abastecimento
ALTER TABLE public.parametros_abastecimento
  ADD COLUMN IF NOT EXISTS metodo_override TEXT
  CHECK (metodo_override IS NULL OR metodo_override IN ('POR_DEMANDA','MIN_IDEAL_MAX'));
