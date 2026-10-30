-- Alerta diário de assinatura do fechamento de inventário.
-- 1) Cadastro de responsáveis por papel de assinatura e almoxarifado (almoxarifado nulo = todos).
-- 2) pendencias_assinatura_inventario(): quem deve assinar o quê, hoje.
--    Ordem de definição do responsável: cadastro do almoxarifado → cadastro "todos os almoxarifados" →
--    usuários com o perfil do papel (DIRETOR_OPERACOES / COORDENADOR_FINANCEIRO). Sem ninguém: linha sem usuário,
--    que o alerta envia aos administradores como "sem responsável".
-- 3) Tarefas em "Minhas Tarefas" (sino) para cada assinatura pendente, concluídas sozinhas ao assinar.
-- 4) Registro dos e-mails enviados.
-- Os agendamentos (pg_cron, 12h de Brasília) e o segredo do disparo são criados fora da migration, como nos demais farois.
-- Idempotente: pode ser executada mais de uma vez sem erro.

CREATE TABLE IF NOT EXISTS public.atlas_responsaveis_assinatura (
  id bigserial PRIMARY KEY,
  papel text NOT NULL CHECK (papel IN ('Diretor_Operacoes','Coordenador_Financeiro','Responsavel_Departamento')),
  almoxarifado text,                                   -- nulo = todos os almoxarifados
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_atlas_resp_assinatura ON public.atlas_responsaveis_assinatura (papel, coalesce(almoxarifado, ''), user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_responsaveis_assinatura TO authenticated;
GRANT ALL ON public.atlas_responsaveis_assinatura TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.atlas_responsaveis_assinatura_id_seq TO authenticated;
ALTER TABLE public.atlas_responsaveis_assinatura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resp_assinatura read" ON public.atlas_responsaveis_assinatura;
DROP POLICY IF EXISTS "resp_assinatura gestor" ON public.atlas_responsaveis_assinatura;
CREATE POLICY "resp_assinatura read" ON public.atlas_responsaveis_assinatura FOR SELECT TO authenticated USING (true);
CREATE POLICY "resp_assinatura gestor" ON public.atlas_responsaveis_assinatura FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE TABLE IF NOT EXISTS public.alertas_assinatura_envios (
  id bigserial PRIMARY KEY,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  data_ref date NOT NULL,
  user_id uuid,
  email text NOT NULL,
  tipo text NOT NULL DEFAULT 'RESPONSAVEL',          -- RESPONSAVEL | SEM_RESPONSAVEL
  fechamentos integer[] NOT NULL DEFAULT '{}',
  ok boolean NOT NULL,
  erro text
);
CREATE INDEX IF NOT EXISTS ix_alertas_assinatura_envios_data ON public.alertas_assinatura_envios (data_ref, email);
GRANT SELECT ON public.alertas_assinatura_envios TO authenticated;
GRANT ALL ON public.alertas_assinatura_envios TO service_role;
ALTER TABLE public.alertas_assinatura_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alertas_assinatura read" ON public.alertas_assinatura_envios;
CREATE POLICY "alertas_assinatura read" ON public.alertas_assinatura_envios FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));

CREATE OR REPLACE FUNCTION public.pendencias_assinatura_inventario()
RETURNS TABLE (
  fechamento_id integer, data_fechamento date, almoxarifado text, arquivo text,
  total_itens integer, total_divergentes integer, valor_divergente numeric, dias_aberto integer,
  papel text, papel_nome text, origem_responsavel text, user_id uuid, nome text, email text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a gestores';
  END IF;
  RETURN QUERY
  WITH papeis(papel, papel_nome, perfil) AS (
    VALUES ('Diretor_Operacoes', 'Diretor de Operações', 'DIRETOR_OPERACOES'),
           ('Coordenador_Financeiro', 'Coordenador Financeiro', 'COORDENADOR_FINANCEIRO'),
           ('Responsavel_Departamento', 'Responsável pelo Departamento', NULL)
  ),
  pend AS (
    SELECT f.id::integer AS fid, f.data_fechamento::date AS dt, f.almoxarifado::text AS alm, f.arquivo_origem::text AS arq,
           f.total_itens::integer AS ti, f.total_divergentes::integer AS td, coalesce(f.valor_total_divergente, 0)::numeric AS vd,
           greatest(0, (now() AT TIME ZONE 'America/Sao_Paulo')::date - coalesce(f.criado_em::timestamptz, f.data_fechamento::timestamptz)::date)::integer AS dias,
           p.papel::text AS pap, p.papel_nome::text AS pnome, p.perfil::text AS perfil
    FROM public.atlas_fechamentos_inventario f
    CROSS JOIN papeis p
    WHERE coalesce(f.aprovado_manual, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.atlas_conciliacoes_ciencia c WHERE c.fechamento_id = f.id AND c.papel_assinatura = p.papel)
  ),
  esp AS (
    SELECT pend.fid, pend.pap, r.user_id AS uid, 'Almoxarifado'::text AS origem FROM pend
    JOIN public.atlas_responsaveis_assinatura r ON r.ativo AND r.papel = pend.pap AND r.almoxarifado = pend.alm
  ),
  glob AS (
    SELECT pend.fid, pend.pap, r.user_id, 'Todos os almoxarifados'::text FROM pend
    JOIN public.atlas_responsaveis_assinatura r ON r.ativo AND r.papel = pend.pap AND r.almoxarifado IS NULL
    WHERE NOT EXISTS (SELECT 1 FROM esp WHERE esp.fid = pend.fid AND esp.pap = pend.pap)
  ),
  perf AS (
    SELECT pend.fid, pend.pap, ur.user_id, 'Perfil do usuário'::text FROM pend
    JOIN public.user_roles ur ON pend.perfil IS NOT NULL AND ur.role::text = pend.perfil
    WHERE NOT EXISTS (SELECT 1 FROM esp WHERE esp.fid = pend.fid AND esp.pap = pend.pap)
      AND NOT EXISTS (SELECT 1 FROM glob WHERE glob.fid = pend.fid AND glob.pap = pend.pap)
  ),
  resp AS (SELECT * FROM esp UNION SELECT * FROM glob UNION SELECT * FROM perf)
  SELECT pend.fid, pend.dt, pend.alm, pend.arq, pend.ti, pend.td, pend.vd, pend.dias, pend.pap, pend.pnome,
         resp.origem::text, pr.id, pr.nome::text, pr.email::text
  FROM pend
  LEFT JOIN resp ON resp.fid = pend.fid AND resp.pap = pend.pap
  LEFT JOIN public.profiles pr ON pr.id = resp.uid AND pr.aprovado
  ORDER BY pend.dt, pend.fid, pend.pap;
END $$;
REVOKE ALL ON FUNCTION public.pendencias_assinatura_inventario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pendencias_assinatura_inventario() TO authenticated, service_role;

-- Tarefas no sino: uma por fechamento × papel × responsável, chave em sku_ou_local = 'assinatura:<id>:<papel>'.
CREATE OR REPLACE FUNCTION public.concluir_tarefas_assinatura(p_fechamento integer, p_papel text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.tarefas_operacionais
     SET status = 'Concluida', concluido_em = now(), observacao = coalesce(observacao, 'Concluída automaticamente: assinatura registrada')
   WHERE status IN ('Pendente','EmAndamento','Atrasada')
     AND sku_ou_local LIKE 'assinatura:' || p_fechamento || ':' || coalesce(p_papel, '%');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.concluir_tarefas_assinatura(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_tarefas_assinatura(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_tarefas_assinatura()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; chave text;
BEGIN
  -- Fecha tarefas cujo papel já foi assinado ou cujo fechamento foi aprovado manualmente.
  UPDATE public.tarefas_operacionais t
     SET status = 'Concluida', concluido_em = now(), observacao = coalesce(t.observacao, 'Concluída automaticamente: assinatura registrada')
   WHERE t.status IN ('Pendente','EmAndamento','Atrasada') AND t.sku_ou_local LIKE 'assinatura:%'
     AND NOT EXISTS (
       SELECT 1 FROM public.pendencias_assinatura_inventario() p
        WHERE t.sku_ou_local = 'assinatura:' || p.fechamento_id || ':' || p.papel AND t.responsavel_id = p.user_id);
  -- Abre as que faltam e marca como atrasadas as que já passaram de um dia.
  FOR r IN SELECT * FROM public.pendencias_assinatura_inventario() WHERE user_id IS NOT NULL LOOP
    chave := 'assinatura:' || r.fechamento_id || ':' || r.papel;
    IF NOT EXISTS (SELECT 1 FROM public.tarefas_operacionais WHERE sku_ou_local = chave AND responsavel_id = r.user_id AND status IN ('Pendente','EmAndamento','Atrasada')) THEN
      INSERT INTO public.tarefas_operacionais (titulo, descricao, status, prioridade, recorrencia, responsavel_tipo, responsavel_id, responsavel_label, data_prevista, link_rota, sku_ou_local)
      VALUES ('Assinar inventário #' || r.fechamento_id || ' — ' || coalesce(r.almoxarifado, '?'),
              'Assinatura pendente como ' || r.papel_nome || '. Fechamento de ' || to_char(r.data_fechamento, 'DD/MM/YYYY') || ': ' ||
                coalesce(r.total_divergentes, 0) || ' itens divergentes, ' || 'R$ ' || replace(to_char(r.valor_divergente, 'FM999999990.00'), '.', ',') || ' em valor divergente.',
              'Pendente', 'Alta', 'Unica', 'Pessoa', r.user_id, r.nome, r.data_fechamento,
              '/atlas/fechamento-inventario?fechamento=' || r.fechamento_id, chave);
      n := n + 1;
    END IF;
    UPDATE public.tarefas_operacionais SET status = 'Atrasada'
     WHERE sku_ou_local = chave AND responsavel_id = r.user_id AND status = 'Pendente' AND r.dias_aberto >= 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_tarefas_assinatura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_tarefas_assinatura() TO service_role;

-- Assinou ou aprovou manualmente: a tarefa sai do sino na hora.
CREATE OR REPLACE FUNCTION public.trg_ciencia_conclui_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fechamento_id IS NOT NULL AND NEW.papel_assinatura IS NOT NULL THEN
    PERFORM public.concluir_tarefas_assinatura(NEW.fechamento_id::integer, NEW.papel_assinatura);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ciencia_conclui_tarefa ON public.atlas_conciliacoes_ciencia;
CREATE TRIGGER trg_ciencia_conclui_tarefa AFTER INSERT ON public.atlas_conciliacoes_ciencia
  FOR EACH ROW EXECUTE FUNCTION public.trg_ciencia_conclui_tarefa();

CREATE OR REPLACE FUNCTION public.trg_fechamento_aprovado_conclui_tarefas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.aprovado_manual, false) AND NOT coalesce(OLD.aprovado_manual, false) THEN
    PERFORM public.concluir_tarefas_assinatura(NEW.id::integer, NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fechamento_aprovado_conclui_tarefas ON public.atlas_fechamentos_inventario;
CREATE TRIGGER trg_fechamento_aprovado_conclui_tarefas AFTER UPDATE OF aprovado_manual ON public.atlas_fechamentos_inventario
  FOR EACH ROW EXECUTE FUNCTION public.trg_fechamento_aprovado_conclui_tarefas();
