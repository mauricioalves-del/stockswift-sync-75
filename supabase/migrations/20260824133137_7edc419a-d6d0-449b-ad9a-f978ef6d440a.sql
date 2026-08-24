ALTER TABLE public.tarefas_operacionais
  ADD COLUMN IF NOT EXISTS campanha_lote_id uuid REFERENCES public.campanhas_lote(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_op_campanha_lote ON public.tarefas_operacionais(campanha_lote_id);