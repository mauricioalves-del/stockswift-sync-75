-- Risco sem Giro (Obsoletos) no Slack: registro numerado de cada Trend, como no Risco de Shelf, com as equipes
-- chamadas a se posicionar (Comercial/Produtos) e o prazo do posicionamento.
CREATE SEQUENCE IF NOT EXISTS public.obsoletos_slack_envios_numero_seq;
CREATE TABLE IF NOT EXISTS public.obsoletos_slack_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint NOT NULL DEFAULT nextval('public.obsoletos_slack_envios_numero_seq'),
  enviado_por uuid NOT NULL DEFAULT auth.uid(),
  observacao text NOT NULL,
  almox text,
  departamentos text[] NOT NULL DEFAULT '{}',
  equipes text[] NOT NULL DEFAULT '{}',
  lotes jsonb NOT NULL DEFAULT '[]',
  valor_total numeric NOT NULL DEFAULT 0,
  prazo_posicionamento date,
  canal text, thread_ts text, link text, erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.obsoletos_slack_envios_numero_seq OWNED BY public.obsoletos_slack_envios.numero;
CREATE UNIQUE INDEX IF NOT EXISTS ux_obsoletos_slack_envios_numero ON public.obsoletos_slack_envios (numero);
CREATE INDEX IF NOT EXISTS ix_obsoletos_slack_envios_lotes ON public.obsoletos_slack_envios USING gin (lotes jsonb_path_ops);
GRANT SELECT, INSERT, UPDATE ON public.obsoletos_slack_envios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.obsoletos_slack_envios_numero_seq TO authenticated;
GRANT ALL ON public.obsoletos_slack_envios TO service_role;
ALTER TABLE public.obsoletos_slack_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ose_read ON public.obsoletos_slack_envios;
DROP POLICY IF EXISTS ose_insert ON public.obsoletos_slack_envios;
DROP POLICY IF EXISTS ose_update ON public.obsoletos_slack_envios;
CREATE POLICY ose_read ON public.obsoletos_slack_envios FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY ose_insert ON public.obsoletos_slack_envios FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid() AND public.usuario_aprovado(auth.uid()));
CREATE POLICY ose_update ON public.obsoletos_slack_envios FOR UPDATE TO authenticated USING (enviado_por = auth.uid()) WITH CHECK (enviado_por = auth.uid());
