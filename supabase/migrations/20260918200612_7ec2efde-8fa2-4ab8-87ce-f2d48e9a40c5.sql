CREATE TABLE public.contexto_baixa_opcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('CORTESIA','DEGUSTACAO')),
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, descricao)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contexto_baixa_opcoes TO authenticated;
GRANT ALL ON public.contexto_baixa_opcoes TO service_role;

ALTER TABLE public.contexto_baixa_opcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contexto_baixa_opcoes_select" ON public.contexto_baixa_opcoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "contexto_baixa_opcoes_write" ON public.contexto_baixa_opcoes
  FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_contexto_baixa_opcoes_updated
  BEFORE UPDATE ON public.contexto_baixa_opcoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.contexto_baixa_opcoes (tipo, descricao) VALUES
  ('CORTESIA','Comercial'),('CORTESIA','Compras'),('CORTESIA','Diretoria'),('CORTESIA','Logística'),('CORTESIA','RH'),
  ('DEGUSTACAO','Ativações & Grêmio'),('DEGUSTACAO','Shopping Pátio Paulista'),('DEGUSTACAO','Shopping Eldorado'),('DEGUSTACAO','Loja Itaim')
ON CONFLICT DO NOTHING;