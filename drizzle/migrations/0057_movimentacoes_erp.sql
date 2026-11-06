-- Farol de Movimentados: base de movimentação do ERP importada pela planilha (aba "Planilha2":
-- id_produto, descricao, Data, doc, desc_movimento, desc_almox, qtd, id_lote), com qualquer período.
-- Separada de movimentacoes_diarias (que alimenta o FEFO e só aceita o dia corrente).
-- Reimportar substitui as linhas do mesmo almoxarifado e dia. Idempotente.
CREATE TABLE IF NOT EXISTS public.movimentacoes_erp (
  id bigserial PRIMARY KEY,
  data date NOT NULL,
  desc_almox text NOT NULL,
  almox text,                       -- FABRICA | PROCESSO | QUALIDADE | PARA (null = fora do farol)
  id_produto text NOT NULL,
  descricao text,
  doc text,
  desc_movimento text,
  qtd numeric NOT NULL DEFAULT 0,
  id_lote text,
  arquivo text,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS ix_mov_erp_data ON public.movimentacoes_erp (data);
CREATE INDEX IF NOT EXISTS ix_mov_erp_almox_data ON public.movimentacoes_erp (almox, data);
GRANT SELECT, INSERT ON public.movimentacoes_erp TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.movimentacoes_erp_id_seq TO authenticated;
GRANT ALL ON public.movimentacoes_erp TO service_role;
ALTER TABLE public.movimentacoes_erp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mov_erp leitura" ON public.movimentacoes_erp;
DROP POLICY IF EXISTS "mov_erp insercao" ON public.movimentacoes_erp;
CREATE POLICY "mov_erp leitura" ON public.movimentacoes_erp FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "mov_erp insercao" ON public.movimentacoes_erp FOR INSERT TO authenticated WITH CHECK (public.equipe_aprovada_para_leitura(auth.uid()));

-- Limpa os pares (almoxarifado do ERP, dia) que serão reimportados. p_pares = [{"desc_almox": "...", "data": "AAAA-MM-DD"}, ...]
CREATE OR REPLACE FUNCTION public.limpar_movimentacoes_erp(p_pares jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.equipe_aprovada_para_leitura(auth.uid()) THEN RAISE EXCEPTION 'Usuário sem acesso' USING errcode = '42501'; END IF;
  DELETE FROM public.movimentacoes_erp m USING jsonb_array_elements(p_pares) x
   WHERE m.desc_almox = x->>'desc_almox' AND m.data = (x->>'data')::date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.limpar_movimentacoes_erp(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_movimentacoes_erp(jsonb) TO authenticated;
