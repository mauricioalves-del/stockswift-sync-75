
-- =========================
-- ficha_tecnica_bom (BOM recursivo)
-- =========================
CREATE TABLE public.ficha_tecnica_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_produto TEXT NOT NULL,
  produto TEXT,
  id_subconjunto TEXT,
  subconjunto TEXT,
  id_item TEXT NOT NULL,
  item TEXT,
  qtd NUMERIC NOT NULL DEFAULT 0,
  tem_filho BOOLEAN NOT NULL DEFAULT false,
  gera_oc BOOLEAN NOT NULL DEFAULT false,
  linha_origem TEXT,
  custo NUMERIC NOT NULL DEFAULT 0,
  item_unidade TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bom_produto ON public.ficha_tecnica_bom(id_produto);
CREATE INDEX idx_bom_item ON public.ficha_tecnica_bom(id_item);
CREATE INDEX idx_bom_subconj ON public.ficha_tecnica_bom(id_subconjunto);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ficha_tecnica_bom TO authenticated;
GRANT ALL ON public.ficha_tecnica_bom TO service_role;

ALTER TABLE public.ficha_tecnica_bom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bom_select_authenticated" ON public.ficha_tecnica_bom
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bom_write_admin_coord" ON public.ficha_tecnica_bom
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'));

CREATE TRIGGER trg_bom_updated_at BEFORE UPDATE ON public.ficha_tecnica_bom
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- producao_consumo (consumo por OP)
-- =========================
CREATE TABLE public.producao_consumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_mes TEXT NOT NULL,               -- 'YYYY-MM'
  id_op TEXT NOT NULL,
  produto TEXT,
  desc_produto TEXT,
  material TEXT NOT NULL,
  desc_material TEXT,
  um TEXT,
  qtd_consumo NUMERIC NOT NULL DEFAULT 0,
  qtd_previsto NUMERIC NOT NULL DEFAULT 0,
  qtd_dif NUMERIC GENERATED ALWAYS AS (qtd_consumo - qtd_previsto) STORED,
  qtd_produzida NUMERIC,               -- opcional; usado na aba Ficha x Previsto
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pc_ano_mes ON public.producao_consumo(ano_mes);
CREATE INDEX idx_pc_op ON public.producao_consumo(id_op);
CREATE INDEX idx_pc_material ON public.producao_consumo(material);
CREATE INDEX idx_pc_produto ON public.producao_consumo(produto);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producao_consumo TO authenticated;
GRANT ALL ON public.producao_consumo TO service_role;

ALTER TABLE public.producao_consumo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select_authenticated" ON public.producao_consumo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc_write_admin_coord" ON public.producao_consumo
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'));

CREATE TRIGGER trg_pc_updated_at BEFORE UPDATE ON public.producao_consumo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- parametros_dispersao (faixas de alerta)
-- =========================
CREATE TABLE public.parametros_dispersao (
  id INT PRIMARY KEY DEFAULT 1,
  limite_atencao_pct NUMERIC NOT NULL DEFAULT 5,
  limite_critico_pct NUMERIC NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parametros_dispersao_singleton CHECK (id = 1)
);
INSERT INTO public.parametros_dispersao (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.parametros_dispersao TO authenticated;
GRANT ALL ON public.parametros_dispersao TO service_role;

ALTER TABLE public.parametros_dispersao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pd_select_authenticated" ON public.parametros_dispersao
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pd_update_admin" ON public.parametros_dispersao
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR'));

-- =========================
-- dispersao_causa_raiz
-- =========================
CREATE TABLE public.dispersao_causa_raiz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_consumo_id UUID NOT NULL REFERENCES public.producao_consumo(id) ON DELETE CASCADE,
  causa TEXT NOT NULL CHECK (causa IN (
    'FALHA_PROCESSO','ERRO_APONTAMENTO','VARIACAO_MATERIA_PRIMA',
    'FALHA_EQUIPAMENTO','FICHA_DESATUALIZADA','OUTRO'
  )),
  observacao TEXT,
  classificado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  classificado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dcr_pc ON public.dispersao_causa_raiz(producao_consumo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispersao_causa_raiz TO authenticated;
GRANT ALL ON public.dispersao_causa_raiz TO service_role;

ALTER TABLE public.dispersao_causa_raiz ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dcr_select_authenticated" ON public.dispersao_causa_raiz
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dcr_write_gestor" ON public.dispersao_causa_raiz
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'ADMINISTRADOR')
    OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE')
    OR public.has_role(auth.uid(),'GERENTE')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'ADMINISTRADOR')
    OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE')
    OR public.has_role(auth.uid(),'GERENTE')
  );

CREATE TRIGGER trg_dcr_updated_at BEFORE UPDATE ON public.dispersao_causa_raiz
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- dispersao_acoes_corretivas
-- =========================
CREATE TABLE public.dispersao_acoes_corretivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_consumo_id UUID REFERENCES public.producao_consumo(id) ON DELETE SET NULL,
  material TEXT,
  ano_mes TEXT,
  descricao_acao TEXT NOT NULL,
  responsavel TEXT,
  status TEXT NOT NULL DEFAULT 'IDENTIFICADA'
    CHECK (status IN ('IDENTIFICADA','EM_ANALISE','ACAO_DEFINIDA','EM_ANDAMENTO','CONCLUIDA')),
  data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conclusao TIMESTAMPTZ,
  aberto_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fechado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dac_status ON public.dispersao_acoes_corretivas(status);
CREATE INDEX idx_dac_pc ON public.dispersao_acoes_corretivas(producao_consumo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispersao_acoes_corretivas TO authenticated;
GRANT ALL ON public.dispersao_acoes_corretivas TO service_role;

ALTER TABLE public.dispersao_acoes_corretivas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dac_select_authenticated" ON public.dispersao_acoes_corretivas
  FOR SELECT TO authenticated USING (true);
-- Abrir/editar: Admin, Coord, Gerente
CREATE POLICY "dac_insert_gestor" ON public.dispersao_acoes_corretivas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'ADMINISTRADOR')
    OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE')
    OR public.has_role(auth.uid(),'GERENTE')
  );
-- Update: gerentes podem editar tudo EXCETO fechar; para fechar (status=CONCLUIDA) só Admin/Coord
CREATE POLICY "dac_update_admin_coord" ON public.dispersao_acoes_corretivas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'));
CREATE POLICY "dac_update_gerente_nao_concluir" ON public.dispersao_acoes_corretivas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'GERENTE'))
  WITH CHECK (public.has_role(auth.uid(),'GERENTE') AND status <> 'CONCLUIDA');
CREATE POLICY "dac_delete_admin" ON public.dispersao_acoes_corretivas
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR'));

CREATE TRIGGER trg_dac_updated_at BEFORE UPDATE ON public.dispersao_acoes_corretivas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- Catálogo de módulos
-- =========================
INSERT INTO public.modulos_sistema (chave, nome, rota, ordem)
VALUES ('PRODUCAO_DISPERSAO', 'Produção — Dispersão de Lote', '/producao/dispersao', 900)
ON CONFLICT DO NOTHING;
