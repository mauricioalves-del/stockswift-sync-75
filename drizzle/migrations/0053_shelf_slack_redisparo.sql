-- Risco de Shelf no Slack: controle do redisparo das Trends criadas antes da numeração.
--   numero_no_slack    — a Trend publicada já tem o número no título (novos envios e Trends redisparadas).
--   thread_ts_anterior — ts da mensagem antiga, apagada no redisparo (rastreabilidade).
--   redisparado_em     — quando a Trend foi republicada.
-- Envios feitos depois da numeração (0051) já saíram com número no título.
-- Idempotente.
ALTER TABLE public.shelf_slack_envios
  ADD COLUMN IF NOT EXISTS numero_no_slack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS thread_ts_anterior text,
  ADD COLUMN IF NOT EXISTS redisparado_em timestamptz;
UPDATE public.shelf_slack_envios SET numero_no_slack = true WHERE numero > 20 AND numero_no_slack = false;
