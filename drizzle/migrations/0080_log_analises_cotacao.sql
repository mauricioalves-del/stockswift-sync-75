-- Visão executiva por solicitação de transporte: parâmetros da calculadora de custo real, resultado (custo-alvo,
-- avaliação das cotações, recomendação) e o fluxo de aprovação da diretoria.
CREATE TABLE IF NOT EXISTS public.log_analises_cotacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.log_solicitacoes(id) ON DELETE CASCADE,
  parametros jsonb NOT NULL,
  resultado jsonb NOT NULL,
  cotacao_recomendada uuid,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviada','aprovada','reprovada')),
  enviado_por uuid, enviado_em timestamptz,
  decidido_por uuid, decidido_em timestamptz, comentario text,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS log_analises_cotacao_sol_idx ON public.log_analises_cotacao (solicitacao_id);
GRANT SELECT, INSERT, UPDATE ON public.log_analises_cotacao TO authenticated;
GRANT ALL ON public.log_analises_cotacao TO service_role;
ALTER TABLE public.log_analises_cotacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leitura" ON public.log_analises_cotacao;
CREATE POLICY "leitura" ON public.log_analises_cotacao FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "preparar" ON public.log_analises_cotacao;
CREATE POLICY "preparar" ON public.log_analises_cotacao FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()) AND status IN ('rascunho','enviada'));
DROP POLICY IF EXISTS "atualizar" ON public.log_analises_cotacao;
CREATE POLICY "atualizar" ON public.log_analises_cotacao FOR UPDATE TO authenticated
  USING (public.usuario_aprovado(auth.uid()))
  WITH CHECK (status IN ('rascunho','enviada') OR public.is_gestor(auth.uid())); -- só gestão/diretoria aprova ou reprova
