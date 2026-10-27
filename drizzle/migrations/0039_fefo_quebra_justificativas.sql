CREATE TABLE public.checagens_fefo_justificativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  id_produto text NOT NULL,
  doc text NOT NULL DEFAULT '',
  lote_movimentado text NOT NULL DEFAULT '',
  destino text NOT NULL DEFAULT '',
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 5),
  justificado_por uuid NOT NULL DEFAULT auth.uid(),
  justificado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, id_produto, doc, lote_movimentado, destino)
);
GRANT SELECT, INSERT, UPDATE ON public.checagens_fefo_justificativas TO authenticated;
GRANT ALL ON public.checagens_fefo_justificativas TO service_role;
ALTER TABLE public.checagens_fefo_justificativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aprovados_apenas" ON public.checagens_fefo_justificativas AS RESTRICTIVE TO authenticated
  USING (public.usuario_aprovado(auth.uid())) WITH CHECK (public.usuario_aprovado(auth.uid()));
CREATE POLICY "just_select" ON public.checagens_fefo_justificativas FOR SELECT TO authenticated
  USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "just_insert" ON public.checagens_fefo_justificativas FOR INSERT TO authenticated
  WITH CHECK (justificado_por = auth.uid());
CREATE POLICY "just_update" ON public.checagens_fefo_justificativas FOR UPDATE TO authenticated
  USING (justificado_por = auth.uid() OR public.is_gestor(auth.uid()))
  WITH CHECK (justificado_por = auth.uid());