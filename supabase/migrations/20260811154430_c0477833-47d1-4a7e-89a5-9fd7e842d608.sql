ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'DIRETOR_OPERACOES';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'COORDENADOR_FINANCEIRO';

ALTER TABLE public.baixa_operacional
  ADD COLUMN IF NOT EXISTS aprovado_diretor_operacoes_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprovado_diretor_operacoes_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_coordenador_financeiro_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprovado_coordenador_financeiro_em timestamptz,
  ADD COLUMN IF NOT EXISTS documento_baixa_url text,
  ADD COLUMN IF NOT EXISTS motivo_reprovacao text;

DROP POLICY IF EXISTS "docs baixa leitura autenticada" ON storage.objects;
CREATE POLICY "docs baixa leitura autenticada" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documentos-baixa');

DROP POLICY IF EXISTS "docs baixa upload autenticado" ON storage.objects;
CREATE POLICY "docs baixa upload autenticado" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos-baixa');

DROP POLICY IF EXISTS "docs baixa update autenticado" ON storage.objects;
CREATE POLICY "docs baixa update autenticado" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documentos-baixa') WITH CHECK (bucket_id = 'documentos-baixa');