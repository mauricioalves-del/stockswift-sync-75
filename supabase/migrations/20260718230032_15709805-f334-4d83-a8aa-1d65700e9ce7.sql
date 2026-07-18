CREATE TABLE public.ordens_producao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_op text NOT NULL UNIQUE,
  produto text NOT NULL,
  desc_produto text,
  quantidade_planejada numeric NOT NULL CHECK (quantidade_planejada > 0),
  quantidade_produzida_real numeric,
  data_planejada date,
  data_inicio_real timestamptz,
  data_conclusao_real timestamptz,
  origem_demanda text NOT NULL DEFAULT 'MANUAL' CHECK (origem_demanda IN ('MANUAL','SUGESTAO_ABASTECIMENTO')),
  referencia_id text,
  op_pai_id uuid REFERENCES public.ordens_producao(id) ON DELETE SET NULL,
  almoxarifado_producao text,
  status text NOT NULL DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA','LIBERADA','EM_PRODUCAO','CONCLUIDA','CANCELADA')),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_producao TO authenticated;
GRANT ALL ON public.ordens_producao TO service_role;
ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ordens_producao_read_auth" ON public.ordens_producao FOR SELECT TO authenticated USING (true);
CREATE POLICY "ordens_producao_insert_gestor" ON public.ordens_producao FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'GERENTE'));
CREATE POLICY "ordens_producao_update_gestor" ON public.ordens_producao FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'GERENTE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'GERENTE'));
CREATE POLICY "ordens_producao_delete_admin" ON public.ordens_producao FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR'));
CREATE TRIGGER trg_ordens_producao_updated BEFORE UPDATE ON public.ordens_producao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ordens_producao_status ON public.ordens_producao(status);
CREATE INDEX idx_ordens_producao_pai ON public.ordens_producao(op_pai_id);
CREATE INDEX idx_ordens_producao_produto ON public.ordens_producao(produto);

CREATE TABLE public.necessidade_materiais_op (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id uuid NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  id_item text NOT NULL,
  item text,
  um text,
  qtd_necessaria numeric NOT NULL,
  eh_semiacabado boolean NOT NULL DEFAULT false,
  op_filha_id uuid REFERENCES public.ordens_producao(id) ON DELETE SET NULL,
  saldo_disponivel_no_calculo numeric,
  status_disponibilidade text CHECK (status_disponibilidade IN ('SUFICIENTE','INSUFICIENTE')),
  qtd_consumo_real numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.necessidade_materiais_op TO authenticated;
GRANT ALL ON public.necessidade_materiais_op TO service_role;
ALTER TABLE public.necessidade_materiais_op ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nec_mat_read_auth" ON public.necessidade_materiais_op FOR SELECT TO authenticated USING (true);
CREATE POLICY "nec_mat_write_gestor" ON public.necessidade_materiais_op FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'GERENTE'))
  WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'GERENTE'));
CREATE TRIGGER trg_nec_mat_updated BEFORE UPDATE ON public.necessidade_materiais_op
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_nec_mat_op ON public.necessidade_materiais_op(op_id);
CREATE INDEX idx_nec_mat_item ON public.necessidade_materiais_op(id_item);

INSERT INTO public.modulos_sistema (chave, nome, rota, ordem)
SELECT 'PRODUCAO_PCP', 'Produção — PCP', '/producao/pcp', 950
WHERE NOT EXISTS (SELECT 1 FROM public.modulos_sistema WHERE chave = 'PRODUCAO_PCP');