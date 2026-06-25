
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.grupo_produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo TEXT NOT NULL,
  codigo_produto TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grupo_produtos_grupo ON public.grupo_produtos(grupo);
CREATE INDEX idx_grupo_produtos_codigo ON public.grupo_produtos(codigo_produto);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupo_produtos TO authenticated;
GRANT ALL ON public.grupo_produtos TO service_role;
ALTER TABLE public.grupo_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupo_select_auth" ON public.grupo_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "grupo_admin_inv_write" ON public.grupo_produtos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'ADMINISTRADOR') OR has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "grupo_admin_inv_update" ON public.grupo_produtos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'ADMINISTRADOR') OR has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "grupo_admin_delete" ON public.grupo_produtos FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_grupo_updated_at BEFORE UPDATE ON public.grupo_produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recontagem (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID REFERENCES public.inventario(id) ON DELETE CASCADE,
  codigo_produto TEXT NOT NULL,
  lote TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  id_local TEXT NOT NULL DEFAULT '',
  saldo_sistema NUMERIC NOT NULL DEFAULT 0,
  contagem NUMERIC NOT NULL DEFAULT 0,
  acuracidade NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDENTE_RECONTAGEM',
  usuario UUID REFERENCES auth.users(id),
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recontagem_status ON public.recontagem(status);
CREATE INDEX idx_recontagem_codigo_lote ON public.recontagem(codigo_produto, lote);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recontagem TO authenticated;
GRANT ALL ON public.recontagem TO service_role;
ALTER TABLE public.recontagem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_select_auth" ON public.recontagem FOR SELECT TO authenticated USING (true);
CREATE POLICY "rec_write_inv" ON public.recontagem FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'ADMINISTRADOR') OR has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "rec_update_inv" ON public.recontagem FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'ADMINISTRADOR') OR has_role(auth.uid(),'INVENTARIANTE'));
CREATE POLICY "rec_delete_admin" ON public.recontagem FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_recontagem_updated_at BEFORE UPDATE ON public.recontagem
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deduplica inventario mantendo o mais recente por (id_produto, lote)
DELETE FROM public.inventario a USING public.inventario b
WHERE a.id_produto = b.id_produto
  AND a.lote = b.lote
  AND (a.data_contagem < b.data_contagem
       OR (a.data_contagem = b.data_contagem AND a.id < b.id));

CREATE UNIQUE INDEX idx_inventario_unique_produto_lote
  ON public.inventario(id_produto, lote);

CREATE OR REPLACE FUNCTION public.handle_recontagem_on_inventario()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'RECONTAGEM_NECESSARIA' OR (NEW.acuracidade IS NOT NULL AND NEW.acuracidade < 97 AND NEW.status <> 'APROVADO') THEN
    INSERT INTO public.recontagem (inventario_id, codigo_produto, lote, descricao, id_local, saldo_sistema, contagem, acuracidade, status, usuario)
    VALUES (NEW.id, NEW.id_produto, NEW.lote, NEW.descricao, NEW.id_local, NEW.saldo_sistemico, NEW.quantidade_contada, NEW.acuracidade, 'PENDENTE_RECONTAGEM', NEW.usuario)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventario_recontagem
  AFTER INSERT OR UPDATE ON public.inventario
  FOR EACH ROW EXECUTE FUNCTION public.handle_recontagem_on_inventario();
