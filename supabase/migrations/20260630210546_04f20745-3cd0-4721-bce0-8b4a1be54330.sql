
-- 1. Origens
CREATE TABLE IF NOT EXISTS public.origens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_origem text NOT NULL UNIQUE,
  descricao text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.origens TO authenticated;
GRANT ALL ON public.origens TO service_role;
ALTER TABLE public.origens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "origens_select_auth" ON public.origens FOR SELECT TO authenticated USING (true);
CREATE POLICY "origens_admin_write" ON public.origens FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "origens_admin_update" ON public.origens FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid()));
CREATE POLICY "origens_admin_delete" ON public.origens FOR DELETE TO authenticated USING (has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_origens_updated BEFORE UPDATE ON public.origens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.origens (codigo_origem, descricao) VALUES
  ('ALMOX_MP','Almoxarifado Matéria Prima'),
  ('ALMOX_PA','Almoxarifado Produto Acabado'),
  ('ALMOX_EMB','Almoxarifado Embalagens'),
  ('LOJA_MANAUARA','Loja Manauara'),
  ('CONGONHAS','Aeroporto Congonhas')
ON CONFLICT (codigo_origem) DO NOTHING;

-- 2. Importacoes
CREATE TABLE IF NOT EXISTS public.importacoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  arquivo text NOT NULL DEFAULT '',
  registros_processados integer NOT NULL DEFAULT 0,
  novos integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.importacoes_estoque TO authenticated;
GRANT ALL ON public.importacoes_estoque TO service_role;
ALTER TABLE public.importacoes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_select_auth" ON public.importacoes_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "imp_insert_inv" ON public.importacoes_estoque FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'ADMINISTRADOR') OR has_role(auth.uid(),'INVENTARIANTE') OR has_role(auth.uid(),'GERENTE'));

-- 3. Adicionar origem nas tabelas operacionais
ALTER TABLE public.estoque_sistemico ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT '';
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT '';
ALTER TABLE public.recontagem ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT '';
ALTER TABLE public.baixa_operacional ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.missoes ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS origem text;

CREATE INDEX IF NOT EXISTS idx_estoque_origem ON public.estoque_sistemico(origem);
CREATE INDEX IF NOT EXISTS idx_inv_origem ON public.inventario(origem);
CREATE INDEX IF NOT EXISTS idx_rec_origem ON public.recontagem(origem);
CREATE INDEX IF NOT EXISTS idx_baixa_origem ON public.baixa_operacional(origem);
CREATE INDEX IF NOT EXISTS idx_missoes_origem ON public.missoes(origem);
