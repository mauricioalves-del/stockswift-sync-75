
-- =========================================================
-- Módulo Abastecimento — Fase 1 (fundação)
-- =========================================================

-- 1. parametros_abastecimento
CREATE TABLE public.parametros_abastecimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL UNIQUE,
  cobertura_dias INTEGER NOT NULL DEFAULT 8,
  dias_seguranca INTEGER NOT NULL DEFAULT 1,
  frequencia_abastecimento TEXT NOT NULL DEFAULT 'SEMANAL',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_abastecimento TO authenticated;
GRANT ALL ON public.parametros_abastecimento TO service_role;
ALTER TABLE public.parametros_abastecimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "params_select_auth" ON public.parametros_abastecimento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "params_write_gestor" ON public.parametros_abastecimento
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "params_update_gestor" ON public.parametros_abastecimento
  FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()));
CREATE POLICY "params_delete_admin" ON public.parametros_abastecimento
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE TRIGGER update_parametros_abastecimento_updated_at
  BEFORE UPDATE ON public.parametros_abastecimento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial (não falha se origens não existirem ainda)
INSERT INTO public.parametros_abastecimento (origem, cobertura_dias, dias_seguranca, frequencia_abastecimento)
VALUES
  ('Alm_SP_Loja', 8, 1, 'SEMANAL'),
  ('Alm_PDV_Ativacao', 8, 1, 'SEMANAL')
ON CONFLICT (origem) DO NOTHING;

-- 2. historico_consumo
CREATE TABLE public.historico_consumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  sku TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  data_movimento DATE NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  importado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hc_origem_sku_data ON public.historico_consumo(origem, sku, data_movimento);
CREATE INDEX idx_hc_data ON public.historico_consumo(data_movimento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_consumo TO authenticated;
GRANT ALL ON public.historico_consumo TO service_role;
ALTER TABLE public.historico_consumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hc_select_auth" ON public.historico_consumo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hc_write_gestor" ON public.historico_consumo
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "hc_update_gestor" ON public.historico_consumo
  FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()));
CREATE POLICY "hc_delete_admin" ON public.historico_consumo
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- 3. demanda_extra
CREATE TABLE public.demanda_extra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  grupo_produto TEXT DEFAULT '',
  familia TEXT DEFAULT '',
  sku TEXT NOT NULL,
  produto TEXT NOT NULL DEFAULT '',
  quantidade_extra NUMERIC NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT '',
  observacao TEXT DEFAULT '',
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE NOT NULL DEFAULT CURRENT_DATE,
  responsavel UUID REFERENCES auth.users(id),
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_de_origem_sku ON public.demanda_extra(origem, sku);
CREATE INDEX idx_de_status ON public.demanda_extra(status);
CREATE INDEX idx_de_periodo ON public.demanda_extra(data_inicio, data_fim);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demanda_extra TO authenticated;
GRANT ALL ON public.demanda_extra TO service_role;
ALTER TABLE public.demanda_extra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "de_select_auth" ON public.demanda_extra
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "de_insert_gestor" ON public.demanda_extra
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "de_update_gestor" ON public.demanda_extra
  FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()));
CREATE POLICY "de_delete_admin" ON public.demanda_extra
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE TRIGGER update_demanda_extra_updated_at
  BEFORE UPDATE ON public.demanda_extra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
