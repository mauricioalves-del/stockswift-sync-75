CREATE TABLE IF NOT EXISTS public.precos_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  descricao text,
  prod_ref1 text,
  pr_venda numeric NOT NULL DEFAULT 0,
  marca text,
  pr_sugerido numeric,
  vl_custo numeric,
  percentual_desconto_tabela numeric,
  percentual_margem numeric,
  margem_real numeric,
  ativo boolean NOT NULL DEFAULT true,
  importado_por uuid,
  importado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.precos_venda TO authenticated;
GRANT ALL ON public.precos_venda TO service_role;
ALTER TABLE public.precos_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY precos_venda_select ON public.precos_venda FOR SELECT TO authenticated USING (is_gestor(auth.uid()) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
CREATE POLICY precos_venda_insert ON public.precos_venda FOR INSERT TO authenticated WITH CHECK (is_gestor(auth.uid()) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
CREATE POLICY precos_venda_update ON public.precos_venda FOR UPDATE TO authenticated USING (is_gestor(auth.uid()) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role)) WITH CHECK (is_gestor(auth.uid()) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
CREATE POLICY precos_venda_delete ON public.precos_venda FOR DELETE TO authenticated USING (has_role(auth.uid(),'ADMINISTRADOR'::app_role) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
CREATE INDEX IF NOT EXISTS idx_precos_venda_sku ON public.precos_venda (sku);

CREATE TABLE IF NOT EXISTS public.parametros_desconto_colaborador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  percentual_desconto numeric NOT NULL DEFAULT 60,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.parametros_desconto_colaborador TO authenticated;
GRANT ALL ON public.parametros_desconto_colaborador TO service_role;
ALTER TABLE public.parametros_desconto_colaborador ENABLE ROW LEVEL SECURITY;
CREATE POLICY pdc_select ON public.parametros_desconto_colaborador FOR SELECT TO authenticated USING (true);
CREATE POLICY pdc_insert ON public.parametros_desconto_colaborador FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'ADMINISTRADOR'::app_role) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
CREATE POLICY pdc_update ON public.parametros_desconto_colaborador FOR UPDATE TO authenticated USING (has_role(auth.uid(),'ADMINISTRADOR'::app_role) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role)) WITH CHECK (has_role(auth.uid(),'ADMINISTRADOR'::app_role) OR has_role(auth.uid(),'COORDENADOR_CONTROLE'::app_role));
INSERT INTO public.parametros_desconto_colaborador (percentual_desconto, ativo)
SELECT 60, true WHERE NOT EXISTS (SELECT 1 FROM public.parametros_desconto_colaborador);

ALTER TABLE public.campanhas_lote
  ADD COLUMN IF NOT EXISTS preco_venda_referencia numeric,
  ADD COLUMN IF NOT EXISTS percentual_desconto_aplicado numeric,
  ADD COLUMN IF NOT EXISTS preco_com_desconto numeric;