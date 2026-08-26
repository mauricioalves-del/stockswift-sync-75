CREATE TABLE public.ficha_tecnica_revisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id text NOT NULL,
  material_id text NOT NULL,
  produto_desc text,
  material_desc text,
  qtd_atual numeric NOT NULL DEFAULT 0,
  qtd_sugerida numeric NOT NULL DEFAULT 0,
  metodo_calculo text,
  justificativa text,
  status text NOT NULL DEFAULT 'Sugerida',
  aprovador_producao_id uuid REFERENCES auth.users,
  aprovador_producao_em timestamptz,
  aprovador_suprimentos_id uuid REFERENCES auth.users,
  aprovador_suprimentos_em timestamptz,
  motivo_rejeicao text,
  criado_por uuid REFERENCES auth.users,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  aplicada_em timestamptz,
  aplicada_por uuid REFERENCES auth.users,
  ficha_tecnica_bom_versao_anterior jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.ficha_tecnica_revisoes TO authenticated;
GRANT ALL ON public.ficha_tecnica_revisoes TO service_role;

ALTER TABLE public.ficha_tecnica_revisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem revisoes de FT"
  ON public.ficha_tecnica_revisoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados sugerem revisoes de FT"
  ON public.ficha_tecnica_revisoes FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());

CREATE POLICY "Gestores atualizam revisoes de FT"
  ON public.ficha_tecnica_revisoes FOR UPDATE TO authenticated
  USING (
    public.is_gestor(auth.uid())
    OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
    OR public.has_role(auth.uid(), 'DIRETOR_OPERACOES')
  )
  WITH CHECK (
    public.is_gestor(auth.uid())
    OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
    OR public.has_role(auth.uid(), 'DIRETOR_OPERACOES')
  );

CREATE TRIGGER trg_ft_revisoes_updated
  BEFORE UPDATE ON public.ficha_tecnica_revisoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ft_revisoes_status ON public.ficha_tecnica_revisoes (status);
CREATE INDEX idx_ft_revisoes_produto ON public.ficha_tecnica_revisoes (produto_id, material_id);

CREATE VIEW public.v_consumo_relevancia_sku
WITH (security_invoker = on) AS
  SELECT sku,
         sum(quantidade) AS qtd_total,
         max(data_movimento) AS ultimo_movimento
    FROM public.historico_consumo
   GROUP BY sku;

GRANT SELECT ON public.v_consumo_relevancia_sku TO authenticated;