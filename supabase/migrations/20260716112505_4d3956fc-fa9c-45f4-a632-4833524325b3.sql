-- Tabela de lançamentos por lote dentro do item da missão
CREATE TABLE public.itens_missao_lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_missao_id UUID NOT NULL REFERENCES public.missoes_itens(id) ON DELETE CASCADE,
  lote TEXT,                          -- código do lote sistêmico (nulo quando eh_nao_relacionado)
  eh_nao_relacionado BOOLEAN NOT NULL DEFAULT false,
  quantidade_contada NUMERIC(14,3) NOT NULL DEFAULT 0,
  saldo_sistemico_lote NUMERIC(14,3), -- snapshot do saldo do lote no momento da contagem
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario UUID,
  CONSTRAINT chk_lote_ou_nao_relacionado CHECK (
    (eh_nao_relacionado = true AND lote IS NULL)
    OR (eh_nao_relacionado = false AND lote IS NOT NULL)
  )
);

CREATE INDEX idx_iml_item ON public.itens_missao_lotes(item_missao_id);
CREATE INDEX idx_iml_lote ON public.itens_missao_lotes(lote);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens_missao_lotes TO authenticated;
GRANT ALL ON public.itens_missao_lotes TO service_role;

ALTER TABLE public.itens_missao_lotes ENABLE ROW LEVEL SECURITY;

-- Mesmas regras que já usamos em missoes_itens: quem enxerga a missão enxerga os lotes.
CREATE POLICY "Autenticados podem ver lotes de itens de missão"
  ON public.itens_missao_lotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir lotes de itens de missão"
  ON public.itens_missao_lotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar lotes de itens de missão"
  ON public.itens_missao_lotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados podem excluir lotes de itens de missão"
  ON public.itens_missao_lotes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_iml_updated_at
  BEFORE UPDATE ON public.itens_missao_lotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fila de Ocorrências de Quebra de FEFO (separada da recontagem)
CREATE TABLE public.quebras_fefo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  missao_id UUID REFERENCES public.missoes(id) ON DELETE SET NULL,
  item_missao_id UUID REFERENCES public.missoes_itens(id) ON DELETE SET NULL,
  codigo_produto TEXT NOT NULL,
  descricao TEXT,
  origem TEXT,                         -- almoxarifado
  id_local TEXT,
  total_sistemico NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_contado NUMERIC(14,3) NOT NULL DEFAULT 0,
  detalhes JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{lote, sistemico, contado, eh_nao_relacionado}]
  status TEXT NOT NULL DEFAULT 'PENDENTE',     -- PENDENTE | REALOCADO | IGNORADO
  usuario UUID,
  resolvido_por UUID,
  resolvido_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qfefo_status ON public.quebras_fefo(status);
CREATE INDEX idx_qfefo_origem ON public.quebras_fefo(origem);
CREATE INDEX idx_qfefo_item ON public.quebras_fefo(item_missao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quebras_fefo TO authenticated;
GRANT ALL ON public.quebras_fefo TO service_role;

ALTER TABLE public.quebras_fefo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver quebras de fefo"
  ON public.quebras_fefo FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir quebras de fefo"
  ON public.quebras_fefo FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin/Coordenador podem atualizar quebras de fefo"
  ON public.quebras_fefo FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE'));

CREATE POLICY "Admin podem excluir quebras de fefo"
  ON public.quebras_fefo FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR'));

CREATE TRIGGER trg_qfefo_updated_at
  BEFORE UPDATE ON public.quebras_fefo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();