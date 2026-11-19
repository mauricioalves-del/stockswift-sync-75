CREATE TABLE public.log_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  endereco text,
  cep text,
  cidade text,
  uf text,
  zona text,
  lat numeric,
  lng numeric,
  chave text GENERATED ALWAYS AS (lower(btrim(nome)) || '|' || regexp_replace(coalesce(cep, ''), '\D', '', 'g')) STORED,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT log_clientes_chave_unq UNIQUE (chave)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_clientes TO authenticated;
GRANT ALL ON public.log_clientes TO service_role;
ALTER TABLE public.log_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura" ON public.log_clientes FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY "cadastrar" ON public.log_clientes FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()));
CREATE POLICY "atualizar" ON public.log_clientes FOR UPDATE TO authenticated USING (public.usuario_aprovado(auth.uid())) WITH CHECK (public.usuario_aprovado(auth.uid()));
CREATE POLICY "excluir" ON public.log_clientes FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

INSERT INTO public.log_clientes (nome, endereco, cep, cidade, uf, zona, lat, lng)
SELECT DISTINCT ON (lower(btrim(s.cliente)) || '|' || regexp_replace(coalesce(s.destino_cep, ''), '\D', '', 'g'))
  btrim(s.cliente), s.destino_endereco, s.destino_cep, s.destino_cidade, s.destino_uf, s.zona, s.lat, s.lng
FROM public.log_solicitacoes s
WHERE coalesce(btrim(s.cliente), '') <> ''
ORDER BY lower(btrim(s.cliente)) || '|' || regexp_replace(coalesce(s.destino_cep, ''), '\D', '', 'g'), s.created_at DESC
ON CONFLICT (chave) DO NOTHING;