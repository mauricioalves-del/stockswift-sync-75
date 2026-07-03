
-- =============== REQUISICOES ===============
CREATE TABLE public.requisicoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  origem_solicitante TEXT NOT NULL,
  origem_fornecedora TEXT NOT NULL,
  solicitante UUID NOT NULL REFERENCES auth.users(id),
  tipo TEXT NOT NULL DEFAULT 'NORMAL' CHECK (tipo IN ('NORMAL','URGENTE','EXTRA')),
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO','ENVIADA','APROVADA','REJEITADA','EM_SEPARACAO','ATENDIDA','CANCELADA')),
  observacao TEXT,
  aprovador UUID REFERENCES auth.users(id),
  data_aprovacao TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_requisicoes_status ON public.requisicoes(status);
CREATE INDEX idx_requisicoes_solicitante ON public.requisicoes(solicitante);
CREATE INDEX idx_requisicoes_origem_solic ON public.requisicoes(origem_solicitante);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisicoes TO authenticated;
GRANT ALL ON public.requisicoes TO service_role;
ALTER TABLE public.requisicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados visualizam requisicoes"
  ON public.requisicoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados criam requisicoes"
  ON public.requisicoes FOR INSERT TO authenticated
  WITH CHECK (solicitante = auth.uid());

CREATE POLICY "Solicitante edita rascunho ou gestor edita"
  ON public.requisicoes FOR UPDATE TO authenticated
  USING (
    (solicitante = auth.uid() AND status = 'RASCUNHO')
    OR public.is_gestor(auth.uid())
  )
  WITH CHECK (
    (solicitante = auth.uid() AND status IN ('RASCUNHO','ENVIADA','CANCELADA'))
    OR public.is_gestor(auth.uid())
  );

CREATE POLICY "Admin exclui requisicoes"
  ON public.requisicoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE TRIGGER trg_requisicoes_updated
  BEFORE UPDATE ON public.requisicoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== REQUISICAO_ITENS ===============
CREATE TABLE public.requisicao_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requisicao_id UUID NOT NULL REFERENCES public.requisicoes(id) ON DELETE CASCADE,
  id_produto TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  quantidade_solicitada NUMERIC(14,3) NOT NULL DEFAULT 0,
  quantidade_aprovada NUMERIC(14,3),
  quantidade_atendida NUMERIC(14,3),
  custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_req_itens_req ON public.requisicao_itens(requisicao_id);
CREATE INDEX idx_req_itens_prod ON public.requisicao_itens(id_produto);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisicao_itens TO authenticated;
GRANT ALL ON public.requisicao_itens TO service_role;
ALTER TABLE public.requisicao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados visualizam itens"
  ON public.requisicao_itens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solicitante ou gestor gerencia itens"
  ON public.requisicao_itens FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requisicoes r
      WHERE r.id = requisicao_id
        AND (
          (r.solicitante = auth.uid() AND r.status = 'RASCUNHO')
          OR public.is_gestor(auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requisicoes r
      WHERE r.id = requisicao_id
        AND (
          (r.solicitante = auth.uid() AND r.status = 'RASCUNHO')
          OR public.is_gestor(auth.uid())
        )
    )
  );

CREATE TRIGGER trg_req_itens_updated
  BEFORE UPDATE ON public.requisicao_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para calcular valor_total do item
CREATE OR REPLACE FUNCTION public.compute_req_item_total()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.valor_total := COALESCE(NEW.quantidade_solicitada,0) * COALESCE(NEW.custo_unitario,0);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_req_itens_total
  BEFORE INSERT OR UPDATE ON public.requisicao_itens
  FOR EACH ROW EXECUTE FUNCTION public.compute_req_item_total();

-- =============== AUDITORIA ===============
CREATE TABLE public.auditoria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  acao TEXT NOT NULL,
  usuario UUID REFERENCES auth.users(id),
  dados_antes JSONB,
  dados_depois JSONB,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_entidade ON public.auditoria(entidade, entidade_id);
CREATE INDEX idx_auditoria_usuario ON public.auditoria(usuario);
CREATE INDEX idx_auditoria_created ON public.auditoria(created_at DESC);

GRANT SELECT, INSERT ON public.auditoria TO authenticated;
GRANT ALL ON public.auditoria TO service_role;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem auditoria"
  ON public.auditoria FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem auditoria"
  ON public.auditoria FOR INSERT TO authenticated
  WITH CHECK (usuario = auth.uid() OR usuario IS NULL);
