
-- Helper: is gestor (admin or gerente)
CREATE OR REPLACE FUNCTION public.is_gestor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('ADMINISTRADOR','GERENTE')
  )
$$;

-- App config threshold
INSERT INTO public.app_config (chave, valor)
VALUES ('recontagem_threshold_pct', '3')
ON CONFLICT (chave) DO NOTHING;

-- =====================
-- status_baixa
-- =====================
CREATE TABLE IF NOT EXISTS public.status_baixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.status_baixa TO authenticated;
GRANT ALL ON public.status_baixa TO service_role;
ALTER TABLE public.status_baixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_baixa read auth" ON public.status_baixa FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_baixa manage gestor" ON public.status_baixa FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_status_baixa_updated BEFORE UPDATE ON public.status_baixa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- motivo_baixa
-- =====================
CREATE TABLE IF NOT EXISTS public.motivo_baixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.motivo_baixa TO authenticated;
GRANT ALL ON public.motivo_baixa TO service_role;
ALTER TABLE public.motivo_baixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivo_baixa read auth" ON public.motivo_baixa FOR SELECT TO authenticated USING (true);
CREATE POLICY "motivo_baixa manage gestor" ON public.motivo_baixa FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_motivo_baixa_updated BEFORE UPDATE ON public.motivo_baixa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- baixa_operacional
-- =====================
CREATE TABLE IF NOT EXISTS public.baixa_operacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_produto text NOT NULL,
  descricao text NOT NULL,
  lote text,
  unidade text,
  id_local text,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  custo_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  motivo_baixa_id uuid REFERENCES public.motivo_baixa(id),
  status_fluxo text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_fluxo IN ('PENDENTE','ANALISE','APROVADA','REPROVADA','AJUSTE_SOLICITADO','EXECUTADA')),
  foto_url text,
  observacao text,
  comentario_aprovacao text,
  solicitante_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_solicitacao timestamptz NOT NULL DEFAULT now(),
  data_aprovacao timestamptz,
  data_execucao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.baixa_operacional TO authenticated;
GRANT ALL ON public.baixa_operacional TO service_role;
ALTER TABLE public.baixa_operacional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baixa select" ON public.baixa_operacional FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'AUDITOR'));
CREATE POLICY "baixa insert" ON public.baixa_operacional FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY "baixa update" ON public.baixa_operacional FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()) OR (solicitante_id = auth.uid() AND status_fluxo IN ('PENDENTE','AJUSTE_SOLICITADO')))
  WITH CHECK (public.is_gestor(auth.uid()) OR (solicitante_id = auth.uid() AND status_fluxo IN ('PENDENTE','AJUSTE_SOLICITADO')));

CREATE TRIGGER trg_baixa_updated BEFORE UPDATE ON public.baixa_operacional
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.compute_baixa_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.valor_total := COALESCE(NEW.quantidade,0) * COALESCE(NEW.custo_unitario,0);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_baixa_total BEFORE INSERT OR UPDATE ON public.baixa_operacional
  FOR EACH ROW EXECUTE FUNCTION public.compute_baixa_total();

CREATE INDEX IF NOT EXISTS idx_baixa_status ON public.baixa_operacional(status_fluxo);
CREATE INDEX IF NOT EXISTS idx_baixa_solicitante ON public.baixa_operacional(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_baixa_motivo ON public.baixa_operacional(motivo_baixa_id);

-- =====================
-- missoes
-- =====================
CREATE TABLE IF NOT EXISTS public.missoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'EXTRAORDINARIA'
    CHECK (tipo IN ('DIARIA','SEMANAL','QUINZENAL','MENSAL','EXTRAORDINARIA')),
  grupo text,
  familia text,
  id_local text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_execucao date,
  status text NOT NULL DEFAULT 'PLANEJADA'
    CHECK (status IN ('PLANEJADA','EM_ANDAMENTO','CONCLUIDA','ATRASADA','CANCELADA')),
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.missoes TO authenticated;
GRANT ALL ON public.missoes TO service_role;
ALTER TABLE public.missoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missoes read" ON public.missoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "missoes manage gestor" ON public.missoes FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "missoes update responsavel" ON public.missoes FOR UPDATE TO authenticated
  USING (responsavel_id = auth.uid()) WITH CHECK (responsavel_id = auth.uid());
CREATE TRIGGER trg_missoes_updated BEFORE UPDATE ON public.missoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- missoes_itens
-- =====================
CREATE TABLE IF NOT EXISTS public.missoes_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missao_id uuid NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  codigo_produto text NOT NULL,
  descricao text,
  lote text,
  quantidade_prevista numeric DEFAULT 0,
  quantidade_contada numeric,
  status_item text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_item IN ('PENDENTE','CONTADO','DIVERGENTE','OK')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missoes_itens TO authenticated;
GRANT ALL ON public.missoes_itens TO service_role;
ALTER TABLE public.missoes_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missoes_itens read" ON public.missoes_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "missoes_itens manage gestor" ON public.missoes_itens FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "missoes_itens update responsavel" ON public.missoes_itens FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.missoes m WHERE m.id = missao_id AND m.responsavel_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.missoes m WHERE m.id = missao_id AND m.responsavel_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_missoes_itens_missao ON public.missoes_itens(missao_id);
CREATE TRIGGER trg_missoes_itens_updated BEFORE UPDATE ON public.missoes_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- classificacao_abc
-- =====================
CREATE TABLE IF NOT EXISTS public.classificacao_abc (
  codigo_produto text PRIMARY KEY,
  classe text NOT NULL CHECK (classe IN ('A','B','C')),
  ultima_contagem date,
  proxima_contagem date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classificacao_abc TO authenticated;
GRANT ALL ON public.classificacao_abc TO service_role;
ALTER TABLE public.classificacao_abc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abc read" ON public.classificacao_abc FOR SELECT TO authenticated USING (true);
CREATE POLICY "abc manage gestor" ON public.classificacao_abc FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_abc_updated BEFORE UPDATE ON public.classificacao_abc
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- Storage policies (baixas-fotos)
-- =====================
CREATE POLICY "baixas-fotos upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'baixas-fotos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "baixas-fotos read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'baixas-fotos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_gestor(auth.uid())
      OR public.has_role(auth.uid(),'AUDITOR')
    )
  );
CREATE POLICY "baixas-fotos delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'baixas-fotos' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR public.is_gestor(auth.uid())
    )
  );

-- =====================
-- Seeds
-- =====================
INSERT INTO public.status_baixa (descricao) VALUES
  ('PENDENTE'),('ANALISE'),('APROVADA'),('REPROVADA'),('AJUSTE_SOLICITADO'),('EXECUTADA')
ON CONFLICT (descricao) DO NOTHING;

INSERT INTO public.motivo_baixa (descricao) VALUES
  ('Quebra'),('Vencimento'),('Perda'),('Avaria'),('Doação'),('Uso Interno')
ON CONFLICT (descricao) DO NOTHING;
