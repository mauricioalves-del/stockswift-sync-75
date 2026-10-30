-- Alerta de assinatura: a tarefa do sino passa a abrir a tela própria de assinatura
-- (/atlas/assinatura-fechamento/<id>?papel=<papel>) em vez do pop-up sobre a lista de fechamentos.
-- Idempotente.

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
              '/atlas/assinatura-fechamento/' || r.fechamento_id || '?papel=' || r.papel, chave);
      n := n + 1;
    END IF;
    UPDATE public.tarefas_operacionais SET status = 'Atrasada'
     WHERE sku_ou_local = chave AND responsavel_id = r.user_id AND status = 'Pendente' AND r.dias_aberto >= 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_tarefas_assinatura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_tarefas_assinatura() TO service_role;

UPDATE public.tarefas_operacionais
   SET link_rota = '/atlas/assinatura-fechamento/' || split_part(sku_ou_local, ':', 2) || '?papel=' || split_part(sku_ou_local, ':', 3)
 WHERE sku_ou_local LIKE 'assinatura:%' AND link_rota LIKE '/atlas/fechamento-inventario?fechamento=%';
