CREATE TABLE public.dispersao_acao_comentarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao_id UUID NOT NULL REFERENCES public.dispersao_acoes_corretivas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  autor_id UUID,
  autor_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dispersao_acao_comentarios_acao ON public.dispersao_acao_comentarios(acao_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispersao_acao_comentarios TO authenticated;
GRANT ALL ON public.dispersao_acao_comentarios TO service_role;

ALTER TABLE public.dispersao_acao_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem comentarios"
  ON public.dispersao_acao_comentarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autor cria comentario"
  ON public.dispersao_acao_comentarios FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

CREATE POLICY "Autor ou admin edita comentario"
  ON public.dispersao_acao_comentarios FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE POLICY "Autor ou admin exclui comentario"
  ON public.dispersao_acao_comentarios FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));

CREATE TRIGGER update_dispersao_acao_comentarios_updated_at
  BEFORE UPDATE ON public.dispersao_acao_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();