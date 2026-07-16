
-- 1) solicitacoes_baixa
CREATE TABLE public.solicitacoes_baixa (
  id BIGSERIAL PRIMARY KEY,
  solicitante_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  solicitante_nome TEXT,
  id_local TEXT,
  motivo_baixa_id UUID REFERENCES public.motivo_baixa(id),
  observacao TEXT,
  data_solicitacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  origem_lancamento TEXT NOT NULL DEFAULT 'MANUAL',
  slack_notificado_at TIMESTAMPTZ,
  slack_erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_baixa TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.solicitacoes_baixa_id_seq TO authenticated;
GRANT ALL ON public.solicitacoes_baixa TO service_role;
GRANT ALL ON SEQUENCE public.solicitacoes_baixa_id_seq TO service_role;

ALTER TABLE public.solicitacoes_baixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitacoes_baixa_select"
  ON public.solicitacoes_baixa FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'AUDITOR'::app_role));

CREATE POLICY "solicitacoes_baixa_insert"
  ON public.solicitacoes_baixa FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

CREATE POLICY "solicitacoes_baixa_update"
  ON public.solicitacoes_baixa FOR UPDATE TO authenticated
  USING (solicitante_id = auth.uid() OR public.is_gestor(auth.uid()))
  WITH CHECK (solicitante_id = auth.uid() OR public.is_gestor(auth.uid()));

CREATE TRIGGER trg_solicitacoes_baixa_updated_at
  BEFORE UPDATE ON public.solicitacoes_baixa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) baixa_operacional: link + foto opcional
ALTER TABLE public.baixa_operacional
  ADD COLUMN IF NOT EXISTS solicitacao_id BIGINT REFERENCES public.solicitacoes_baixa(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_baixa_solicitacao ON public.baixa_operacional(solicitacao_id);

ALTER TABLE public.baixa_operacional ALTER COLUMN foto_url DROP NOT NULL;

-- 3) app_config: webhook Slack
INSERT INTO public.app_config (chave, valor)
VALUES ('slack_webhook_baixas', to_jsonb('https://hooks.slack.com/services/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'::text))
ON CONFLICT (chave) DO NOTHING;
