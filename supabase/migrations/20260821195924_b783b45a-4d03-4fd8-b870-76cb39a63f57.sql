
-- Tarefas de aprovação de requisições de baixa
CREATE OR REPLACE FUNCTION public.criar_tarefas_aprovacao_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tarefas_operacionais
    (titulo, descricao, prioridade, data_prevista, responsavel_tipo, responsavel_id,
     responsavel_label, sku_ou_local, status, criado_por)
  SELECT
    'Aprovar Requisição de Baixa #' || NEW.id,
    'Requisição de baixa #' || NEW.id || ' aguardando sua assinatura.'
      || COALESCE(' Solicitante: ' || NEW.solicitante_nome, '')
      || COALESCE(' Almoxarifado: ' || NEW.id_local, ''),
    'Alta',
    CURRENT_DATE,
    'Pessoa',
    ur.user_id,
    CASE ur.role::text
      WHEN 'DIRETOR_OPERACOES' THEN 'Diretor de Operações'
      ELSE 'Coordenador Financeiro' END,
    'REQ-' || NEW.id,
    'Pendente',
    NEW.solicitante_id
  FROM public.user_roles ur
  WHERE ur.role IN ('DIRETOR_OPERACOES','COORDENADOR_FINANCEIRO');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarefas_aprovacao_baixa ON public.solicitacoes_baixa;
CREATE TRIGGER trg_tarefas_aprovacao_baixa
AFTER INSERT ON public.solicitacoes_baixa
FOR EACH ROW EXECUTE FUNCTION public.criar_tarefas_aprovacao_baixa();

CREATE OR REPLACE FUNCTION public.concluir_tarefas_aprovacao_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pendentes int;
BEGIN
  IF NEW.solicitacao_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO pendentes
  FROM public.baixa_operacional b
  WHERE b.solicitacao_id = NEW.solicitacao_id
    AND COALESCE(b.status_fluxo,'') <> 'REPROVADA'
    AND (b.aprovado_diretor_operacoes_por IS NULL
      OR b.aprovado_coordenador_financeiro_por IS NULL);

  IF pendentes = 0 THEN
    UPDATE public.tarefas_operacionais
       SET status = 'Concluida',
           concluido_em = now(),
           observacao = COALESCE(observacao, 'Concluída automaticamente: requisição finalizada.')
     WHERE sku_ou_local = 'REQ-' || NEW.solicitacao_id
       AND status <> 'Concluida';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concluir_tarefas_aprovacao_baixa ON public.baixa_operacional;
CREATE TRIGGER trg_concluir_tarefas_aprovacao_baixa
AFTER UPDATE ON public.baixa_operacional
FOR EACH ROW EXECUTE FUNCTION public.concluir_tarefas_aprovacao_baixa();
