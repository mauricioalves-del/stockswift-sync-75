-- Guarda de integridade: solicitação que já virou ordem de serviço não pode ser excluída.
-- As FKs de public.log_cotacoes e public.log_ordens para public.log_solicitacoes são ON DELETE CASCADE,
-- então apagar a solicitação apagaria também a ordem de serviço e os eventos dela.
CREATE OR REPLACE FUNCTION public.log_solicitacao_bloquear_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.log_ordens o WHERE o.solicitacao_id = OLD.id) THEN
    RAISE EXCEPTION 'A solicitação #% já virou ordem de serviço. Exclua a ordem antes de excluir a solicitação.', OLD.numero
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.log_solicitacao_bloquear_exclusao() IS 'Bloqueia a exclusão de solicitação de cotação que já gerou ordem de serviço (FKs ON DELETE CASCADE de log_cotacoes e log_ordens).';

DROP TRIGGER IF EXISTS trg_log_solicitacao_bloquear_exclusao ON public.log_solicitacoes;
CREATE TRIGGER trg_log_solicitacao_bloquear_exclusao
BEFORE DELETE ON public.log_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.log_solicitacao_bloquear_exclusao();