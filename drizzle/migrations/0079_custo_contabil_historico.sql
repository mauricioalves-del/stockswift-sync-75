-- Custo contábil do inventário: a carga diária de lotes (Lote_Sistema) passa a gravar o custo contábil
-- (Custo_Contabil_SP / Custo_Contabil_Para) e um histórico por dia, SKU e região. O fechamento usa o custo
-- contábil vigente na data do inventário; sem histórico, mantém o custo usado hoje (planilha "Vl" ou cadastro).
CREATE TABLE IF NOT EXISTS public.custo_contabil_historico (
  data date NOT NULL,
  sku text NOT NULL,              -- código sem zeros à esquerda
  regiao text NOT NULL CHECK (regiao IN ('SP','PA')),
  custo_contabil numeric NOT NULL,
  custo_padrao numeric,
  quantidade numeric,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data, sku, regiao)
);
CREATE INDEX IF NOT EXISTS custo_contabil_historico_sku_idx ON public.custo_contabil_historico (sku, regiao, data DESC);
GRANT SELECT, INSERT, UPDATE ON public.custo_contabil_historico TO authenticated;
GRANT ALL ON public.custo_contabil_historico TO service_role;
ALTER TABLE public.custo_contabil_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leitura" ON public.custo_contabil_historico;
CREATE POLICY "leitura" ON public.custo_contabil_historico FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "carga" ON public.custo_contabil_historico;
CREATE POLICY "carga" ON public.custo_contabil_historico FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "carga atualiza" ON public.custo_contabil_historico;
CREATE POLICY "carga atualiza" ON public.custo_contabil_historico FOR UPDATE TO authenticated USING (public.usuario_aprovado(auth.uid())) WITH CHECK (public.usuario_aprovado(auth.uid()));

-- Custo usado em cada item do fechamento (rastreável)
ALTER TABLE public.atlas_itens_fechamento ADD COLUMN IF NOT EXISTS custo_unitario_usado numeric, ADD COLUMN IF NOT EXISTS origem_custo text;
