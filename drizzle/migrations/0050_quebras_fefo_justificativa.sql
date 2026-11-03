-- Quebras de FEFO: duas soluções possíveis para cada ocorrência.
--   REALOCADO   — o saldo voltou ao almoxarifado/lote de origem após identificada a ruptura (corrige a distribuição entre lotes).
--   JUSTIFICADO — há uma justificativa lógica para a causa central da ruptura; o estoque não é alterado.
-- motivo_resolucao guarda a causa escolhida (lista fixa na tela); observacao guarda o texto livre.
-- Idempotente.
ALTER TABLE public.quebras_fefo ADD COLUMN IF NOT EXISTS motivo_resolucao text;
COMMENT ON COLUMN public.quebras_fefo.status IS 'PENDENTE | REALOCADO | JUSTIFICADO | IGNORADO (legado)';
CREATE INDEX IF NOT EXISTS idx_qfefo_resolvido_em ON public.quebras_fefo (resolvido_em DESC);
