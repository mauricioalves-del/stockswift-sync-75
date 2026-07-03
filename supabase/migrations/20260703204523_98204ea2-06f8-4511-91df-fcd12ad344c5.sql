
CREATE TABLE public.produtos_reposicao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_produto TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'UN',
  custo_referencia NUMERIC(14,4) NOT NULL DEFAULT 0,
  cobertura_dias INTEGER NOT NULL DEFAULT 8,
  ativo BOOLEAN NOT NULL DEFAULT true,
  importado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_reposicao TO authenticated;
GRANT ALL ON public.produtos_reposicao TO service_role;

ALTER TABLE public.produtos_reposicao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler produtos_reposicao"
  ON public.produtos_reposicao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem inserir produtos_reposicao"
  ON public.produtos_reposicao FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados podem atualizar produtos_reposicao"
  ON public.produtos_reposicao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem apagar produtos_reposicao"
  ON public.produtos_reposicao FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_produtos_reposicao_updated_at
  BEFORE UPDATE ON public.produtos_reposicao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_produtos_reposicao_ativo ON public.produtos_reposicao(ativo);
