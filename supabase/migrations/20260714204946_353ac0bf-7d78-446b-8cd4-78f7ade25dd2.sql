
-- 1. Remover duplicatas pendentes: quando existirem 2 linhas pendentes para o mesmo produto/lote/local,
--    manter a que tem item_missao_id preenchido e apagar a que veio pelo trigger (item_missao_id nulo).
DELETE FROM public.recontagem r1
USING public.recontagem r2
WHERE r1.id <> r2.id
  AND r1.codigo_produto = r2.codigo_produto
  AND COALESCE(r1.lote,'') = COALESCE(r2.lote,'')
  AND COALESCE(r1.id_local,'') = COALESCE(r2.id_local,'')
  AND r1.status IN ('PENDENTE_RECONTAGEM','RECONTAGEM_OBRIGATORIA')
  AND r2.status IN ('PENDENTE_RECONTAGEM','RECONTAGEM_OBRIGATORIA')
  AND r1.item_missao_id IS NULL
  AND r2.item_missao_id IS NOT NULL;

-- 2. Índice único parcial: apenas um pendente por produto/lote/local
CREATE UNIQUE INDEX IF NOT EXISTS recontagem_pendente_unique
  ON public.recontagem (codigo_produto, COALESCE(lote,''), COALESCE(id_local,''))
  WHERE status IN ('PENDENTE_RECONTAGEM','RECONTAGEM_OBRIGATORIA');

-- 3. Corrigir trigger para não duplicar
CREATE OR REPLACE FUNCTION public.handle_recontagem_on_inventario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'RECONTAGEM_NECESSARIA'
     OR (NEW.acuracidade IS NOT NULL AND (NEW.acuracidade < 95 OR NEW.acuracidade > 105) AND NEW.status <> 'APROVADO') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.recontagem
      WHERE codigo_produto = NEW.id_produto
        AND COALESCE(lote,'') = COALESCE(NEW.lote,'')
        AND COALESCE(id_local,'') = COALESCE(NEW.id_local,'')
        AND status IN ('PENDENTE_RECONTAGEM','RECONTAGEM_OBRIGATORIA')
    ) THEN
      INSERT INTO public.recontagem (inventario_id, codigo_produto, lote, descricao, id_local, origem, saldo_sistema, contagem, acuracidade, status, usuario)
      VALUES (NEW.id, NEW.id_produto, NEW.lote, NEW.descricao, NEW.id_local, COALESCE(NEW.origem,''), NEW.saldo_sistemico, NEW.quantidade_contada, NEW.acuracidade, 'PENDENTE_RECONTAGEM', NEW.usuario);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Vincular item de missão à recontagem que o originou (para missões geradas pelo botão "Recontagem")
ALTER TABLE public.missoes_itens
  ADD COLUMN IF NOT EXISTS recontagem_origem_id uuid REFERENCES public.recontagem(id) ON DELETE SET NULL;
