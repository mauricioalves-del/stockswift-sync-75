-- Indicador de processo de inventário (aderência ao plano de contagem) + ações por etapa do processo.

-- 1) Momento da conclusão da missão, para medir execução no prazo.
ALTER TABLE public.missoes ADD COLUMN IF NOT EXISTS concluida_em timestamptz;

-- Missões já concluídas: melhor aproximação disponível é a última atualização.
UPDATE public.missoes SET concluida_em = updated_at
 WHERE status = 'CONCLUIDA' AND concluida_em IS NULL;

CREATE OR REPLACE FUNCTION public.missoes_marca_conclusao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'CONCLUIDA' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONCLUIDA') THEN
    NEW.concluida_em := COALESCE(NEW.concluida_em, now());
  ELSIF NEW.status <> 'CONCLUIDA' THEN
    NEW.concluida_em := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_missoes_conclusao ON public.missoes;
CREATE TRIGGER trg_missoes_conclusao BEFORE INSERT OR UPDATE OF status ON public.missoes
  FOR EACH ROW EXECUTE FUNCTION public.missoes_marca_conclusao();

-- 2) Ações por etapa do processo de inventário.
CREATE TABLE IF NOT EXISTS public.processo_inventario_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa text NOT NULL CHECK (etapa IN ('PLANEJAMENTO','EXECUCAO','DIVERGENCIA','AJUSTE','ENCERRAMENTO')),
  titulo text NOT NULL,
  descricao text,
  origem text,                       -- almoxarifado (codigo_origem); nulo = todos
  missao_id uuid REFERENCES public.missoes(id) ON DELETE SET NULL,
  responsavel_nome text,
  prazo date,
  status text NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
  concluida_em timestamptz,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proc_inv_acoes_etapa ON public.processo_inventario_acoes(etapa, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processo_inventario_acoes TO authenticated;
GRANT ALL ON public.processo_inventario_acoes TO service_role;
ALTER TABLE public.processo_inventario_acoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proc_inv_acoes read" ON public.processo_inventario_acoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "proc_inv_acoes gestor" ON public.processo_inventario_acoes FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE OR REPLACE FUNCTION public.proc_inv_acoes_conclusao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'CONCLUIDA' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONCLUIDA') THEN
    NEW.concluida_em := now();
  ELSIF NEW.status <> 'CONCLUIDA' THEN
    NEW.concluida_em := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proc_inv_acoes ON public.processo_inventario_acoes;
CREATE TRIGGER trg_proc_inv_acoes BEFORE INSERT OR UPDATE ON public.processo_inventario_acoes
  FOR EACH ROW EXECUTE FUNCTION public.proc_inv_acoes_conclusao();
