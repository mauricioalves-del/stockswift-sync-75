-- Pré-inventário (pilar Gestão): todo inventário agendado abre, X dias antes, um ciclo de preparação
-- com checklist, pendências operacionais a zerar e liberação formal ("Apto para inventário").

CREATE TABLE IF NOT EXISTS public.inventarios_agendados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almoxarifado text NOT NULL REFERENCES public.origens(codigo_origem) ON UPDATE CASCADE,
  data_inventario date NOT NULL,
  antecedencia_dias int NOT NULL DEFAULT 7 CHECK (antecedencia_dias BETWEEN 1 AND 60),
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  status text NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO','APTO','REALIZADO','CANCELADO')),
  liberado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  liberado_nome text,
  liberado_em timestamptz,
  liberacao_obs text,
  pendencias_na_liberacao jsonb,                -- foto das pendências no momento da liberação
  historico jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ evento, em, por, obs }]
  observacao text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_agendados_data ON public.inventarios_agendados(data_inventario);
-- Um único inventário ativo por almoxarifado e data.
CREATE UNIQUE INDEX IF NOT EXISTS ux_inv_agendados_ativo ON public.inventarios_agendados(almoxarifado, data_inventario)
  WHERE status IN ('AGENDADO','APTO');

CREATE TABLE IF NOT EXISTS public.pre_inventario_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES public.inventarios_agendados(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  etapa text NOT NULL DEFAULT 'Preparação',
  descricao text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  concluido boolean NOT NULL DEFAULT false,
  concluido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_nome text,
  concluido_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pre_inv_itens_inv ON public.pre_inventario_itens(inventario_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventarios_agendados, public.pre_inventario_itens TO authenticated;
GRANT ALL ON public.inventarios_agendados, public.pre_inventario_itens TO service_role;
ALTER TABLE public.inventarios_agendados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_inventario_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_agendados_read" ON public.inventarios_agendados FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_agendados_manage_gestor" ON public.inventarios_agendados FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "pre_inv_itens_read" ON public.pre_inventario_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "pre_inv_itens_manage_gestor" ON public.pre_inventario_itens FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
-- O responsável pelo inventário marca o checklist enquanto ele está em preparação.
CREATE POLICY "pre_inv_itens_update_responsavel" ON public.pre_inventario_itens FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventarios_agendados i WHERE i.id = inventario_id AND i.responsavel_id = auth.uid() AND i.status = 'AGENDADO'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventarios_agendados i WHERE i.id = inventario_id AND i.responsavel_id = auth.uid() AND i.status = 'AGENDADO'));

CREATE TRIGGER trg_inv_agendados_updated BEFORE UPDATE ON public.inventarios_agendados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pre_inv_itens_updated BEFORE UPDATE ON public.pre_inventario_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Checklist não muda depois que o almoxarifado foi liberado (só reabrindo).
CREATE OR REPLACE FUNCTION public.pre_inventario_itens_bloqueio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.inventarios_agendados
   WHERE id = COALESCE(NEW.inventario_id, OLD.inventario_id);
  -- Pai inexistente = exclusão em cascata do inventário: deixa passar.
  IF v_status IS NOT NULL AND v_status <> 'AGENDADO' THEN
    RAISE EXCEPTION 'Checklist bloqueado: o inventário está %.', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_pre_inv_itens_bloqueio BEFORE INSERT OR UPDATE OR DELETE ON public.pre_inventario_itens
  FOR EACH ROW EXECUTE FUNCTION public.pre_inventario_itens_bloqueio();

-- Pendências operacionais do almoxarifado que precisam estar zeradas (ou justificadas) antes da contagem.
-- Retorna só contagens/valores agregados, por isso roda como definer para enxergar todas as fontes.
CREATE OR REPLACE FUNCTION public.pre_inventario_pendencias(p_almox text)
RETURNS TABLE (tipo text, rotulo text, quantidade bigint, valor numeric, rota text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  RETURN QUERY
  SELECT 'BAIXAS'::text, 'Baixas operacionais não executadas'::text, count(*), COALESCE(sum(b.valor_total), 0)::numeric, '/baixas'::text
    FROM public.baixa_operacional b
   WHERE b.origem = p_almox AND b.status_fluxo IN ('PENDENTE','ANALISE','APROVADA','AJUSTE_SOLICITADO');

  RETURN QUERY
  SELECT 'REQUISICOES'::text, 'Requisições em aberto (enviadas, aprovadas ou em separação)'::text, count(*), COALESCE(sum(r.valor_total), 0)::numeric, '/suprimentos/requisicoes'::text
    FROM public.requisicoes r
   WHERE p_almox IN (r.origem_fornecedora, r.origem_solicitante) AND r.status IN ('ENVIADA','APROVADA','EM_SEPARACAO');

  RETURN QUERY
  SELECT 'RECONTAGEM'::text, 'Recontagens pendentes'::text, count(*), 0::numeric, '/recontagem'::text
    FROM public.recontagem rc
   WHERE rc.origem = p_almox AND rc.status = 'PENDENTE_RECONTAGEM';

  RETURN QUERY
  SELECT 'DIVERGENCIAS'::text, 'Divergências do Atlas não resolvidas'::text, count(*), COALESCE(sum(abs(d.valor_estimado)), 0)::numeric, '/atlas/divergencias'::text
    FROM public.atlas_divergencias d
   WHERE (d.almoxarifado = p_almox OR d.almoxarifado IN (SELECT a.codigo FROM public.atlas_almoxarifados a WHERE a.codigo_origem = p_almox))
     AND COALESCE(d.status, '') NOT IN ('Resolvida','Resolvido','Historico_Resolvido');
END $$;
GRANT EXECUTE ON FUNCTION public.pre_inventario_pendencias(text) TO authenticated;

-- Liberação "Apto para inventário": exige checklist obrigatório completo; com pendências abertas exige justificativa.
CREATE OR REPLACE FUNCTION public.pre_inventario_liberar(p_id uuid, p_obs text DEFAULT NULL)
RETURNS public.inventarios_agendados
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.inventarios_agendados;
  v_faltam int;
  v_pend jsonb;
  v_total bigint;
  v_nome text;
BEGIN
  SELECT * INTO v_inv FROM public.inventarios_agendados WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;
  IF NOT (public.is_gestor(auth.uid()) OR v_inv.responsavel_id = auth.uid()) THEN
    RAISE EXCEPTION 'Só um gestor ou o responsável pelo inventário pode liberar.';
  END IF;
  IF v_inv.status <> 'AGENDADO' THEN RAISE EXCEPTION 'Inventário já está %.', v_inv.status; END IF;

  SELECT count(*) INTO v_faltam FROM public.pre_inventario_itens WHERE inventario_id = p_id AND obrigatorio AND NOT concluido;
  IF v_faltam > 0 THEN RAISE EXCEPTION 'Faltam % item(ns) obrigatório(s) do checklist.', v_faltam; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb), COALESCE(sum(p.quantidade), 0)
    INTO v_pend, v_total FROM public.pre_inventario_pendencias(v_inv.almoxarifado) p;
  IF v_total > 0 AND COALESCE(btrim(p_obs), '') = '' THEN
    RAISE EXCEPTION 'Há % pendência(s) em aberto: justifique para liberar com ressalvas.', v_total;
  END IF;

  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  UPDATE public.inventarios_agendados SET
    status = 'APTO', liberado_por = auth.uid(), liberado_nome = v_nome, liberado_em = now(),
    liberacao_obs = NULLIF(btrim(p_obs), ''), pendencias_na_liberacao = v_pend,
    historico = historico || jsonb_build_array(jsonb_build_object(
      'evento', CASE WHEN v_total > 0 THEN 'LIBERADO_COM_RESSALVAS' ELSE 'LIBERADO' END,
      'em', now(), 'por', v_nome, 'obs', NULLIF(btrim(p_obs), '')))
  WHERE id = p_id RETURNING * INTO v_inv;
  RETURN v_inv;
END $$;
GRANT EXECUTE ON FUNCTION public.pre_inventario_liberar(uuid, text) TO authenticated;

-- Reabrir a preparação (só gestor, com motivo).
CREATE OR REPLACE FUNCTION public.pre_inventario_reabrir(p_id uuid, p_motivo text)
RETURNS public.inventarios_agendados
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv public.inventarios_agendados; v_nome text;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Só gestores podem reabrir o pré-inventário.'; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo da reabertura.'; END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  UPDATE public.inventarios_agendados SET
    status = 'AGENDADO', liberado_por = NULL, liberado_nome = NULL, liberado_em = NULL, liberacao_obs = NULL, pendencias_na_liberacao = NULL,
    historico = historico || jsonb_build_array(jsonb_build_object('evento', 'REABERTO', 'em', now(), 'por', v_nome, 'obs', btrim(p_motivo)))
  WHERE id = p_id AND status = 'APTO' RETURNING * INTO v_inv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Só é possível reabrir um inventário que está Apto.'; END IF;
  RETURN v_inv;
END $$;
GRANT EXECUTE ON FUNCTION public.pre_inventario_reabrir(uuid, text) TO authenticated;