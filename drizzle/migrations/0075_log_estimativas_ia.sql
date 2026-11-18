CREATE TABLE public.log_estimativas_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.log_solicitacoes(id) ON DELETE CASCADE,
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  premissas jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo text,
  modelo text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX log_estimativas_ia_sol_idx ON public.log_estimativas_ia (solicitacao_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.log_estimativas_ia TO authenticated;
GRANT ALL ON public.log_estimativas_ia TO service_role;

ALTER TABLE public.log_estimativas_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura" ON public.log_estimativas_ia FOR SELECT TO authenticated
  USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY "registrar" ON public.log_estimativas_ia FOR INSERT TO authenticated
  WITH CHECK (public.usuario_aprovado(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "excluir gestao" ON public.log_estimativas_ia FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

COMMENT ON TABLE public.log_estimativas_ia IS 'Estimativas de mercado por IA (3 opções externas) por solicitação; referência, não cotação real nem ordem de serviço.';