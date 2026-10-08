CREATE TABLE public.tipos_acao_obsoleto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'SAVING',
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_acao_obsoleto TO authenticated;
GRANT ALL ON public.tipos_acao_obsoleto TO service_role;
ALTER TABLE public.tipos_acao_obsoleto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tao_select" ON public.tipos_acao_obsoleto FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));
CREATE POLICY "tao_write" ON public.tipos_acao_obsoleto FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

INSERT INTO public.tipos_acao_obsoleto (nome, categoria, ordem) VALUES
 ('Reaproveitar na produção','SAVING',1),
 ('Venda / Liquidação','RECEITA',2),
 ('Devolução ao fornecedor','SAVING',3),
 ('Transferência entre almoxarifados','SAVING',4),
 ('Doação','SAVING',5);

CREATE TABLE public.acoes_obsoleto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_produto text NOT NULL,
  descricao text,
  lote text,
  almoxarifado text,
  faixa text,
  dias_sem_mov integer,
  tipo_acao_id uuid REFERENCES public.tipos_acao_obsoleto(id) ON DELETE SET NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  custo_unitario numeric NOT NULL DEFAULT 0,
  valor_em_risco numeric NOT NULL DEFAULT 0,
  valor_recuperado numeric NOT NULL DEFAULT 0,
  saving_recuperado numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PLANEJADA',
  data_acao date NOT NULL DEFAULT current_date,
  responsavel_id uuid,
  responsavel_label text,
  observacao text,
  concluido_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acoes_obsoleto TO authenticated;
GRANT ALL ON public.acoes_obsoleto TO service_role;
ALTER TABLE public.acoes_obsoleto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ao_select" ON public.acoes_obsoleto FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()) OR responsavel_id = auth.uid());
CREATE POLICY "ao_insert" ON public.acoes_obsoleto FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "ao_update" ON public.acoes_obsoleto FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid()) OR responsavel_id = auth.uid());
CREATE POLICY "ao_delete" ON public.acoes_obsoleto FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_acoes_obsoleto_upd BEFORE UPDATE ON public.acoes_obsoleto FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tarefas_operacionais ADD COLUMN IF NOT EXISTS acao_obsoleto_id uuid REFERENCES public.acoes_obsoleto(id) ON DELETE SET NULL;