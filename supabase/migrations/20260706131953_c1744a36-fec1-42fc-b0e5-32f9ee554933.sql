
-- ==================================================================
-- ITEM 2: Tabelas de arquivo
-- ==================================================================
CREATE TABLE public.inventario_arquivado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id UUID,
  id_produto TEXT NOT NULL,
  lote TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  id_local TEXT NOT NULL,
  custo_unitario NUMERIC NOT NULL,
  saldo_sistemico NUMERIC NOT NULL,
  quantidade_contada NUMERIC NOT NULL,
  acuracidade NUMERIC,
  divergencia NUMERIC,
  valor_divergencia NUMERIC,
  status TEXT NOT NULL,
  contagem_numero INTEGER NOT NULL,
  usuario UUID,
  data_contagem TIMESTAMPTZ NOT NULL,
  data_validade DATE,
  sincronizado BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  origem TEXT NOT NULL,
  arquivado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  arquivado_por UUID,
  motivo_arquivamento TEXT,
  escopo_lote TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_arquivado TO authenticated;
GRANT ALL ON public.inventario_arquivado TO service_role;
ALTER TABLE public.inventario_arquivado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_inv_arq" ON public.inventario_arquivado
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE TABLE public.recontagem_arquivada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recontagem_id UUID,
  inventario_id UUID,
  codigo_produto TEXT NOT NULL,
  lote TEXT NOT NULL,
  descricao TEXT NOT NULL,
  id_local TEXT NOT NULL,
  saldo_sistema NUMERIC NOT NULL,
  contagem NUMERIC NOT NULL,
  acuracidade NUMERIC,
  status TEXT NOT NULL,
  usuario UUID,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  motivo TEXT,
  origem TEXT NOT NULL,
  arquivado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  arquivado_por UUID,
  motivo_arquivamento TEXT,
  escopo_lote TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recontagem_arquivada TO authenticated;
GRANT ALL ON public.recontagem_arquivada TO service_role;
ALTER TABLE public.recontagem_arquivada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_rec_arq" ON public.recontagem_arquivada
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- ==================================================================
-- ITEM 3: perfis + modulos + permissoes
-- ==================================================================

CREATE TABLE public.perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  role_key public.app_role,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_perfis" ON public.perfis FOR SELECT TO authenticated USING (true);
CREATE POLICY "coord_manage_perfis" ON public.perfis FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));
CREATE TRIGGER trg_perfis_updated BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.modulos_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  rota TEXT,
  modulo_pai_id UUID REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.modulos_sistema TO authenticated;
GRANT ALL ON public.modulos_sistema TO service_role;
ALTER TABLE public.modulos_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_modulos" ON public.modulos_sistema FOR SELECT TO authenticated USING (true);
CREATE POLICY "coord_manage_modulos" ON public.modulos_sistema FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE TABLE public.permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  modulo_id UUID NOT NULL REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  pode_visualizar BOOLEAN NOT NULL DEFAULT false,
  pode_criar BOOLEAN NOT NULL DEFAULT false,
  pode_editar BOOLEAN NOT NULL DEFAULT false,
  pode_aprovar BOOLEAN NOT NULL DEFAULT false,
  pode_excluir BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, modulo_id)
);
GRANT SELECT ON public.permissoes TO authenticated;
GRANT ALL ON public.permissoes TO service_role;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_permissoes" ON public.permissoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "coord_manage_permissoes" ON public.permissoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));
CREATE TRIGGER trg_permissoes_updated BEFORE UPDATE ON public.permissoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS perfil_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

-- ==================================================================
-- SEED perfis
-- ==================================================================
INSERT INTO public.perfis (nome, descricao, role_key) VALUES
  ('Administrador', 'Acesso total operacional', 'ADMINISTRADOR'),
  ('Coordenador de Controle', 'Governança de acessos e auditoria', 'COORDENADOR_CONTROLE'),
  ('Gerente', 'Gestão de operações e aprovações', 'GERENTE'),
  ('Vendedor', 'Executa tarefas operacionais', 'VENDEDOR'),
  ('Operador de Estoque', 'Movimenta estoque, separa requisições', 'OPERADOR_ESTOQUE')
ON CONFLICT (nome) DO NOTHING;

-- ==================================================================
-- SEED modulos_sistema
-- ==================================================================
INSERT INTO public.modulos_sistema (chave, nome, rota, ordem) VALUES
  ('dashboard', 'Dashboard', '/dashboard', 10),
  ('cadastro', 'Cadastro', NULL, 20),
  ('inventario', 'Inventário', NULL, 30),
  ('suprimentos', 'Suprimentos', NULL, 40),
  ('gestao', 'Gestão', NULL, 50),
  ('relatorios', 'Relatórios', NULL, 60),
  ('config', 'Configurações', '/config', 70)
ON CONFLICT (chave) DO NOTHING;

-- filhos
INSERT INTO public.modulos_sistema (chave, nome, rota, modulo_pai_id, ordem)
SELECT c.chave, c.nome, c.rota, (SELECT id FROM public.modulos_sistema WHERE chave = c.pai), c.ordem
FROM (VALUES
  ('cadastro.origens', 'Almox', '/origens', 'cadastro', 1),
  ('cadastro.importar', 'Sincronização de Estoque', '/importar', 'cadastro', 2),
  ('cadastro.familias', 'Importador de Famílias', '/importar-familias', 'cadastro', 3),
  ('cadastro.grupos', 'Importador de Grupos', '/grupos', 'cadastro', 4),
  ('inv.contar', 'Contagem', '/contar', 'inventario', 1),
  ('inv.scanner', 'Scanner', '/scanner', 'inventario', 2),
  ('inv.recontagem', 'Recontagem', '/recontagem', 'inventario', 3),
  ('sup.dashboard', 'Dashboard Suprimentos', '/suprimentos/dashboard', 'suprimentos', 1),
  ('sup.estoque', 'Posição de Estoque', '/suprimentos/estoque', 'suprimentos', 2),
  ('sup.requisicoes', 'Requisições', '/suprimentos/requisicoes', 'suprimentos', 3),
  ('sup.abastecimento', 'Abastecimento', '/abastecimento/planejamento', 'suprimentos', 4),
  ('sup.demandas', 'Demandas Extras', '/abastecimento/demandas', 'suprimentos', 5),
  ('sup.consumo', 'Importar Consumo', '/abastecimento/consumo', 'suprimentos', 6),
  ('sup.parametros', 'Parâmetros Abastecimento', '/abastecimento/parametros', 'suprimentos', 7),
  ('gest.minhas_tarefas', 'Minhas Tarefas', '/gestao/minhas-tarefas', 'gestao', 1),
  ('gest.planejamento', 'Planejamento de Tarefas', '/gestao/planejamento', 'gestao', 2),
  ('gest.modelos_checklist', 'Modelos de Checklist', '/gestao/modelos-checklist', 'gestao', 3),
  ('gest.baixas', 'Baixas Operacionais', '/baixas', 'gestao', 4),
  ('gest.missoes', 'Missões de Inventário', '/missoes', 'gestao', 5),
  ('gest.abc', 'Classificação ABC', '/abc', 'gestao', 6),
  ('rel.dashboard', 'Dashboard Executivo', '/dashboard', 'relatorios', 1),
  ('rel.relatorios', 'Relatório de Inventário', '/relatorios', 'relatorios', 2),
  ('rel.usuarios', 'Usuários', '/usuarios', 'relatorios', 3),
  ('rel.logs', 'Auditoria', '/logs', 'relatorios', 4),
  ('config.perfis', 'Perfis e Permissões', '/config/perfis', 'config', 1)
) AS c(chave, nome, rota, pai, ordem)
ON CONFLICT (chave) DO NOTHING;

-- ==================================================================
-- SEED permissoes (matriz padrão)
-- Administrador e Coordenador de Controle: tudo liberado em todos os módulos.
-- ==================================================================
INSERT INTO public.permissoes (perfil_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_aprovar, pode_excluir)
SELECT p.id, m.id, true, true, true, true, true
FROM public.perfis p
CROSS JOIN public.modulos_sistema m
WHERE p.nome IN ('Administrador', 'Coordenador de Controle')
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Gerente: gestão, suprimentos, relatórios (V/C/E/A), inventário/cadastro (V)
INSERT INTO public.permissoes (perfil_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_aprovar, pode_excluir)
SELECT p.id, m.id,
  true,
  m.chave LIKE 'gest.%' OR m.chave LIKE 'sup.%',
  m.chave LIKE 'gest.%' OR m.chave LIKE 'sup.%',
  m.chave LIKE 'sup.demandas' OR m.chave LIKE 'sup.requisicoes' OR m.chave LIKE 'gest.%',
  false
FROM public.perfis p
CROSS JOIN public.modulos_sistema m
WHERE p.nome = 'Gerente'
  AND m.chave NOT IN ('config', 'config.perfis')
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Vendedor: minhas tarefas (V/E), dashboards (V)
INSERT INTO public.permissoes (perfil_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_aprovar, pode_excluir)
SELECT p.id, m.id,
  m.chave IN ('dashboard', 'sup.dashboard', 'gest.minhas_tarefas'),
  false,
  m.chave = 'gest.minhas_tarefas',
  false, false
FROM public.perfis p
CROSS JOIN public.modulos_sistema m
WHERE p.nome = 'Vendedor'
  AND m.chave IN ('dashboard', 'sup.dashboard', 'gest.minhas_tarefas')
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Operador de Estoque: inventário (V/C/E), suprimentos operacionais (V/C/E)
INSERT INTO public.permissoes (perfil_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_aprovar, pode_excluir)
SELECT p.id, m.id, true, true, true, false, false
FROM public.perfis p
CROSS JOIN public.modulos_sistema m
WHERE p.nome = 'Operador de Estoque'
  AND m.chave IN ('dashboard', 'inv.contar', 'inv.scanner', 'inv.recontagem',
                  'sup.dashboard', 'sup.estoque', 'sup.requisicoes', 'sup.demandas')
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;
