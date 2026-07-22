
ALTER TABLE public.requisicoes ADD COLUMN IF NOT EXISTS origem_geracao text NOT NULL DEFAULT 'Manual';
CREATE SEQUENCE IF NOT EXISTS public.req_op_seq START 1;
GRANT USAGE ON SEQUENCE public.req_op_seq TO authenticated, service_role;
INSERT INTO public.app_config (chave, valor) VALUES ('slack_webhook_requisicao_producao', '""'::jsonb)
  ON CONFLICT (chave) DO NOTHING;
