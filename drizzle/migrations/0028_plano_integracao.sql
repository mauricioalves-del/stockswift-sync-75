-- Plano de Integração (pilar Gestão): ciclo de etapas com portões, ações com prazo relativo à data de início e indicadores.

CREATE TABLE IF NOT EXISTS public.integracao_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  pessoa_nome text NOT NULL,
  pessoa_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  gestor_nome text,
  padrinho_nome text,
  data_inicio date NOT NULL,
  etapa_atual int NOT NULL DEFAULT 0 CHECK (etapa_atual BETWEEN 0 AND 6),   -- 6 = ciclo concluído
  portoes jsonb NOT NULL DEFAULT '{}'::jsonb,                               -- { "<etapa>": { "aprovado_em", "aprovado_por", "obs" } }
  indicadores jsonb NOT NULL DEFAULT '[]'::jsonb,                           -- [{ frente, nome, unidade, base, meta, atual }]
  status text NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Concluido','Cancelado')),
  observacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integracao_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.integracao_planos(id) ON DELETE CASCADE,
  etapa int NOT NULL CHECK (etapa BETWEEN 0 AND 5),
  frente text,
  acao text NOT NULL,
  responsavel text,
  entregavel text,
  rota text,                                   -- tela do sistema onde a rotina acontece
  prazo_dia int NOT NULL DEFAULT 0,            -- dias a partir da data de início (negativo = antes da chegada)
  recorrente boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  concluida boolean NOT NULL DEFAULT false,
  concluida_em timestamptz,
  concluida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integracao_acoes_plano ON public.integracao_acoes(plano_id, etapa, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracao_planos, public.integracao_acoes TO authenticated;
GRANT ALL ON public.integracao_planos, public.integracao_acoes TO service_role;

ALTER TABLE public.integracao_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracao_acoes ENABLE ROW LEVEL SECURITY;

-- Leitura: gestor vê todos; a pessoa integrada vê o próprio plano.
CREATE POLICY "integracao_planos_read" ON public.integracao_planos FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR pessoa_id = auth.uid());
CREATE POLICY "integracao_planos_manage_gestor" ON public.integracao_planos FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "integracao_acoes_read" ON public.integracao_acoes FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.integracao_planos p WHERE p.id = plano_id AND p.pessoa_id = auth.uid()));
CREATE POLICY "integracao_acoes_manage_gestor" ON public.integracao_acoes FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
-- A pessoa integrada marca as próprias ações como concluídas.
CREATE POLICY "integracao_acoes_update_pessoa" ON public.integracao_acoes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.integracao_planos p WHERE p.id = plano_id AND p.pessoa_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.integracao_planos p WHERE p.id = plano_id AND p.pessoa_id = auth.uid()));

CREATE TRIGGER trg_integracao_planos_updated BEFORE UPDATE ON public.integracao_planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_integracao_acoes_updated BEFORE UPDATE ON public.integracao_acoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();