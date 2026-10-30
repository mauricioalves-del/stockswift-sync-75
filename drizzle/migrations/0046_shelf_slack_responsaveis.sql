CREATE TABLE public.shelf_slack_departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shelf_slack_departamentos TO authenticated;
GRANT ALL ON public.shelf_slack_departamentos TO service_role;
ALTER TABLE public.shelf_slack_departamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssd_read ON public.shelf_slack_departamentos FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY ssd_write ON public.shelf_slack_departamentos FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE TABLE public.shelf_slack_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento_id uuid NOT NULL REFERENCES public.shelf_slack_departamentos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (departamento_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shelf_slack_responsaveis TO authenticated;
GRANT ALL ON public.shelf_slack_responsaveis TO service_role;
ALTER TABLE public.shelf_slack_responsaveis ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssr_read ON public.shelf_slack_responsaveis FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY ssr_write ON public.shelf_slack_responsaveis FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE TABLE public.shelf_slack_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enviado_por uuid NOT NULL DEFAULT auth.uid(),
  observacao text NOT NULL,
  almox text,
  departamentos text[] NOT NULL DEFAULT '{}',
  lotes jsonb NOT NULL DEFAULT '[]',
  valor_total numeric NOT NULL DEFAULT 0,
  canal text,
  thread_ts text,
  link text,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.shelf_slack_envios TO authenticated;
GRANT ALL ON public.shelf_slack_envios TO service_role;
ALTER TABLE public.shelf_slack_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY sse_read ON public.shelf_slack_envios FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY sse_insert ON public.shelf_slack_envios FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid() AND public.usuario_aprovado(auth.uid()));
CREATE POLICY sse_update ON public.shelf_slack_envios FOR UPDATE TO authenticated USING (enviado_por = auth.uid()) WITH CHECK (enviado_por = auth.uid());