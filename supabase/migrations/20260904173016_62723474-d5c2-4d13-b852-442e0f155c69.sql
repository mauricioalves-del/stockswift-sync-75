CREATE TABLE public.campanha_lote_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas_lote(id) ON DELETE CASCADE,
  texto text NOT NULL,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_lote_comentarios TO authenticated;
GRANT ALL ON public.campanha_lote_comentarios TO service_role;

ALTER TABLE public.campanha_lote_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cl_coment_select" ON public.campanha_lote_comentarios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cl_coment_insert" ON public.campanha_lote_comentarios
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());
CREATE POLICY "cl_coment_update" ON public.campanha_lote_comentarios
  FOR UPDATE TO authenticated USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE POLICY "cl_coment_delete" ON public.campanha_lote_comentarios
  FOR DELETE TO authenticated USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE INDEX idx_cl_coment_campanha ON public.campanha_lote_comentarios(campanha_id, created_at);

CREATE TRIGGER update_campanha_lote_comentarios_updated_at
  BEFORE UPDATE ON public.campanha_lote_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill do vínculo das tarefas antigas de ação de lote (apenas correspondência única)
WITH cand AS (
  SELECT t.id AS tarefa_id, min(c.id::text)::uuid AS campanha_id, count(*) AS n
  FROM public.tarefas_operacionais t
  JOIN public.campanhas_lote c ON c.sku = t.sku_ou_local AND c.data_acao = t.data_prevista
  JOIN public.tipos_acao_shelf_life ta ON ta.id = c.tipo_acao_id
  WHERE t.campanha_lote_id IS NULL
    AND t.titulo LIKE 'Ação de lote:%'
    AND t.titulo LIKE ('Ação de lote: ' || ta.nome || ' —%')
  GROUP BY t.id
)
UPDATE public.tarefas_operacionais t
SET campanha_lote_id = cand.campanha_id
FROM cand
WHERE t.id = cand.tarefa_id AND cand.n = 1;