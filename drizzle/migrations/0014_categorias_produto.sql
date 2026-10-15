CREATE TABLE public.categorias_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_produto text NOT NULL UNIQUE,
  produto text,
  segmento text NOT NULL,
  jornada text NOT NULL,
  categoria text NOT NULL,
  atualizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_produto TO authenticated;
GRANT ALL ON public.categorias_produto TO service_role;
ALTER TABLE public.categorias_produto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aprovados leem categorias" ON public.categorias_produto FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY "Gestores inserem categorias" ON public.categorias_produto FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "Gestores atualizam categorias" ON public.categorias_produto FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'INVENTARIANTE')) WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "Admin exclui categorias" ON public.categorias_produto FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_categorias_produto_updated BEFORE UPDATE ON public.categorias_produto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();