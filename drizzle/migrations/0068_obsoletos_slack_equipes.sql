-- Risco sem Giro (Obsoletos) no Slack: parâmetros próprios — equipes que se posicionam (Comercial, Produtos…) e
-- seus responsáveis, separados dos departamentos por almoxarifado do Risco de Shelf.
CREATE TABLE IF NOT EXISTS public.obsoletos_slack_equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obsoletos_slack_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.obsoletos_slack_equipes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, user_id)
);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obsoletos_slack_equipes','obsoletos_slack_responsaveis'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "leitura" ON public.%I', t);
    EXECUTE format('CREATE POLICY "leitura" ON public.%I FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "gestao" ON public.%I', t);
    EXECUTE format('CREATE POLICY "gestao" ON public.%I FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()))', t);
  END LOOP;
END $$;
INSERT INTO public.obsoletos_slack_equipes (nome, ordem) VALUES ('Comercial', 1), ('Produtos', 2) ON CONFLICT (nome) DO NOTHING;
-- O campo "canal" de Obsoletos não pode guardar URL de webhook (vai no campo próprio).
UPDATE public.app_config SET valor = to_jsonb(''::text) WHERE chave = 'slack_canal_obsoletos' AND valor #>> '{}' ILIKE 'http%';
