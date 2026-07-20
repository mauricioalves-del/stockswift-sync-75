
-- ============= motivo_classificacao_prejuizo =============
CREATE TABLE public.motivo_classificacao_prejuizo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motivo_baixa_id uuid NOT NULL UNIQUE REFERENCES public.motivo_baixa(id) ON DELETE CASCADE,
  classificacao text NOT NULL CHECK (classificacao IN ('Controlado','Operacional','Investimento')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motivo_classificacao_prejuizo TO authenticated;
GRANT ALL ON public.motivo_classificacao_prejuizo TO service_role;
ALTER TABLE public.motivo_classificacao_prejuizo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_select_auth" ON public.motivo_classificacao_prejuizo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mcp_write_gestor" ON public.motivo_classificacao_prejuizo
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_mcp_updated
  BEFORE UPDATE ON public.motivo_classificacao_prejuizo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semente: mapear os motivos existentes por descrição
INSERT INTO public.motivo_classificacao_prejuizo (motivo_baixa_id, classificacao)
SELECT m.id,
  CASE
    WHEN m.descricao ILIKE ANY (ARRAY['Uso e Consumo','Cortesia','Envio/Laboratório','Amostra Comercial','Consumo','Consumo Loja','Consumo S/OP']) THEN 'Controlado'
    WHEN m.descricao ILIKE ANY (ARRAY['Avaria','Descarte/Qualidade','Descarte','Dispersão de Lote','Erro no Processo','Perda/Furto','Vencimento']) THEN 'Operacional'
    WHEN m.descricao ILIKE ANY (ARRAY['Degustação','Brinde','Mostruário']) THEN 'Investimento'
    ELSE 'Operacional'
  END
FROM public.motivo_baixa m
ON CONFLICT (motivo_baixa_id) DO NOTHING;

-- ============= parametros_alerta_baixas =============
CREATE TABLE public.parametros_alerta_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL CHECK (escopo IN ('Setor','SKU')),
  chave text,
  limite_valor numeric NOT NULL DEFAULT 0,
  limite_percentual_variacao_mom numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_alerta_baixas TO authenticated;
GRANT ALL ON public.parametros_alerta_baixas TO service_role;
ALTER TABLE public.parametros_alerta_baixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pab_select_auth" ON public.parametros_alerta_baixas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pab_write_gestor" ON public.parametros_alerta_baixas
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_pab_updated
  BEFORE UPDATE ON public.parametros_alerta_baixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default global thresholds (used when no specific chave)
INSERT INTO public.parametros_alerta_baixas (escopo, chave, limite_valor, limite_percentual_variacao_mom)
VALUES
  ('Setor', NULL, 5000, 30),
  ('SKU', NULL, 1000, 30);
