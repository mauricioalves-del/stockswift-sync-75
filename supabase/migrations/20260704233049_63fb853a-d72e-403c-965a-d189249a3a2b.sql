
-- ============ TIPOS DE TAREFA ============
CREATE TABLE public.tipos_tarefa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  integra_com text, -- ex: 'MISSAO_INVENTARIO'
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_tarefa TO authenticated;
GRANT ALL ON public.tipos_tarefa TO service_role;
ALTER TABLE public.tipos_tarefa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_tarefa_read" ON public.tipos_tarefa FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_tarefa_manage_gestor" ON public.tipos_tarefa FOR ALL TO authenticated
  USING (is_gestor(auth.uid())) WITH CHECK (is_gestor(auth.uid()));
CREATE TRIGGER trg_tipos_tarefa_updated BEFORE UPDATE ON public.tipos_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MODELOS DE CHECKLIST ============
CREATE TABLE public.modelos_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_tarefa_id uuid REFERENCES public.tipos_tarefa(id) ON DELETE SET NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modelos_checklist TO authenticated;
GRANT ALL ON public.modelos_checklist TO service_role;
ALTER TABLE public.modelos_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modelos_checklist_read" ON public.modelos_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "modelos_checklist_manage_gestor" ON public.modelos_checklist FOR ALL TO authenticated
  USING (is_gestor(auth.uid())) WITH CHECK (is_gestor(auth.uid()));
CREATE TRIGGER trg_modelos_checklist_updated BEFORE UPDATE ON public.modelos_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.modelos_checklist_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.modelos_checklist(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  descricao_item text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modelos_checklist_itens TO authenticated;
GRANT ALL ON public.modelos_checklist_itens TO service_role;
ALTER TABLE public.modelos_checklist_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modelos_checklist_itens_read" ON public.modelos_checklist_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "modelos_checklist_itens_manage_gestor" ON public.modelos_checklist_itens FOR ALL TO authenticated
  USING (is_gestor(auth.uid())) WITH CHECK (is_gestor(auth.uid()));

-- ============ TAREFAS OPERACIONAIS ============
CREATE TABLE public.tarefas_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id uuid REFERENCES public.tipos_tarefa(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'Media' CHECK (prioridade IN ('Baixa','Media','Alta')),
  data_prevista date,
  recorrencia text NOT NULL DEFAULT 'Unica' CHECK (recorrencia IN ('Unica','Diaria','Semanal','Quinzenal','Mensal')),
  responsavel_tipo text NOT NULL DEFAULT 'Pessoa' CHECK (responsavel_tipo IN ('Pessoa','Turno','Equipe')),
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_label text,
  loja_setor text,
  grupo_produto text,
  familia text,
  sku_ou_local text,
  checklist_modelo_id uuid REFERENCES public.modelos_checklist(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','EmAndamento','Concluida','Atrasada','Cancelada')),
  missao_id uuid REFERENCES public.missoes(id) ON DELETE SET NULL,
  tarefa_origem_id uuid REFERENCES public.tarefas_operacionais(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  concluido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em timestamptz,
  evidencia_url text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tarefas_op_status ON public.tarefas_operacionais(status);
CREATE INDEX idx_tarefas_op_responsavel ON public.tarefas_operacionais(responsavel_id);
CREATE INDEX idx_tarefas_op_data ON public.tarefas_operacionais(data_prevista);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_operacionais TO authenticated;
GRANT ALL ON public.tarefas_operacionais TO service_role;
ALTER TABLE public.tarefas_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarefas_op_read" ON public.tarefas_operacionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "tarefas_op_manage_gestor" ON public.tarefas_operacionais FOR ALL TO authenticated
  USING (is_gestor(auth.uid())) WITH CHECK (is_gestor(auth.uid()));
CREATE POLICY "tarefas_op_update_responsavel" ON public.tarefas_operacionais FOR UPDATE TO authenticated
  USING (responsavel_id = auth.uid()) WITH CHECK (responsavel_id = auth.uid());
CREATE TRIGGER trg_tarefas_op_updated BEFORE UPDATE ON public.tarefas_operacionais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CHECKLIST EXECUÇÃO ============
CREATE TABLE public.checklist_execucao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.tarefas_operacionais(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.modelos_checklist_itens(id) ON DELETE CASCADE,
  marcado boolean NOT NULL DEFAULT false,
  marcado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  marcado_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tarefa_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_execucao TO authenticated;
GRANT ALL ON public.checklist_execucao TO service_role;
ALTER TABLE public.checklist_execucao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_exec_read" ON public.checklist_execucao FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_exec_manage_gestor" ON public.checklist_execucao FOR ALL TO authenticated
  USING (is_gestor(auth.uid())) WITH CHECK (is_gestor(auth.uid()));
CREATE POLICY "checklist_exec_responsavel" ON public.checklist_execucao FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.tarefas_operacionais t WHERE t.id = tarefa_id AND t.responsavel_id = auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.tarefas_operacionais t WHERE t.id = tarefa_id AND t.responsavel_id = auth.uid()));

-- ============ AJUSTE CLASSIFICAÇÃO ABC ============
ALTER TABLE public.classificacao_abc
  ADD COLUMN IF NOT EXISTS valor_movimentado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_acumulado numeric,
  ADD COLUMN IF NOT EXISTS periodo_dias int,
  ADD COLUMN IF NOT EXISTS calculado_em timestamptz;

-- ============ SEED TIPOS DE TAREFA ============
INSERT INTO public.tipos_tarefa (nome, integra_com, ordem) VALUES
  ('Contagem de Estoque', 'MISSAO_INVENTARIO', 1),
  ('Organização de Seção', NULL, 2),
  ('Treinamento', NULL, 3),
  ('Verificação de Preço/Validade', NULL, 4),
  ('Reposição de Loja', NULL, 5),
  ('Outro', NULL, 99)
ON CONFLICT (nome) DO NOTHING;
