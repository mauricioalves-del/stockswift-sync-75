-- Tipos de ação configuráveis
CREATE TABLE public.tipos_acao_shelf_life (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  categoria text NOT NULL DEFAULT 'SAVING' CHECK (categoria IN ('RECEITA','SAVING')),
  motivo_baixa_id uuid REFERENCES public.motivo_baixa(id) ON DELETE SET NULL,
  custo_padrao numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_acao_shelf_life TO authenticated;
GRANT ALL ON public.tipos_acao_shelf_life TO service_role;
ALTER TABLE public.tipos_acao_shelf_life ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_acao_select" ON public.tipos_acao_shelf_life
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_acao_admin_write" ON public.tipos_acao_shelf_life
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE TRIGGER trg_tipos_acao_shelf_life_updated
  BEFORE UPDATE ON public.tipos_acao_shelf_life
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campanhas de lote
CREATE TABLE public.campanhas_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  descricao text,
  lote text NOT NULL DEFAULT '',
  almoxarifado text,
  data_validade date,
  tipo_acao_id uuid REFERENCES public.tipos_acao_shelf_life(id) ON DELETE RESTRICT,
  quantidade_enderecada numeric NOT NULL DEFAULT 0,
  valor_estimado_recuperado numeric NOT NULL DEFAULT 0,
  valor_estimado_saving numeric NOT NULL DEFAULT 0,
  custo_acao numeric NOT NULL DEFAULT 0,
  responsavel text,
  data_acao date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
  observacao text,
  baixa_operacional_id uuid REFERENCES public.baixa_operacional(id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campanhas_lote_sku_lote ON public.campanhas_lote (sku, lote);
CREATE INDEX idx_campanhas_lote_data_acao ON public.campanhas_lote (data_acao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas_lote TO authenticated;
GRANT ALL ON public.campanhas_lote TO service_role;
ALTER TABLE public.campanhas_lote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campanhas_select" ON public.campanhas_lote
  FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE POLICY "campanhas_insert" ON public.campanhas_lote
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE POLICY "campanhas_update" ON public.campanhas_lote
  FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE POLICY "campanhas_delete" ON public.campanhas_lote
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE TRIGGER trg_campanhas_lote_updated
  BEFORE UPDATE ON public.campanhas_lote
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos tipos de ação, vinculando ao motivo de baixa quando existir
INSERT INTO public.tipos_acao_shelf_life (nome, categoria, ordem, motivo_baixa_id) VALUES
  ('Desconto Colaborador', 'RECEITA', 1, NULL),
  ('Anúncio Refood', 'RECEITA', 2, NULL),
  ('Transformação de Produto', 'SAVING', 3, NULL),
  ('Forçar Produção', 'SAVING', 4, NULL),
  ('Degustação', 'SAVING', 5, (SELECT id FROM public.motivo_baixa WHERE descricao = 'Degustação' LIMIT 1)),
  ('Outro', 'SAVING', 6, NULL);

-- Módulos de menu
INSERT INTO public.modulos_sistema (chave, nome, rota, ordem) VALUES
  ('shelf_life', 'Shelf Life', NULL, 60),
  ('shelf.risco', 'Mapeamento de Risco', '/shelf-life/risco', 61),
  ('shelf.acoes', 'Ações de Lote', '/shelf-life/acoes', 62),
  ('shelf.dashboard', 'Dashboard Shelf Life', '/shelf-life/dashboard', 63)
ON CONFLICT DO NOTHING;