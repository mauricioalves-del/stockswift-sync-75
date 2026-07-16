
CREATE TABLE public.cadastro_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finalidade TEXT NOT NULL,
  email TEXT NOT NULL,
  nome_contato TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finalidade, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadastro_emails TO authenticated;
GRANT ALL ON public.cadastro_emails TO service_role;

ALTER TABLE public.cadastro_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadastro_emails_select_auth"
  ON public.cadastro_emails FOR SELECT TO authenticated USING (true);

CREATE POLICY "cadastro_emails_admin_coord_write"
  ON public.cadastro_emails FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMINISTRADOR')
    OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMINISTRADOR')
    OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE')
  );

CREATE TRIGGER trg_cadastro_emails_updated_at
  BEFORE UPDATE ON public.cadastro_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
