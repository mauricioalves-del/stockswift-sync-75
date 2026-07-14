
-- Add mission linkage to recontagem
ALTER TABLE public.recontagem
  ADD COLUMN IF NOT EXISTS missao_id uuid REFERENCES public.missoes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_missao_id uuid REFERENCES public.missoes_itens(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS recontagem_item_missao_uidx
  ON public.recontagem (item_missao_id)
  WHERE item_missao_id IS NOT NULL;

-- New tolerance band: 95..105 OK, <95 negative, >105 positive
CREATE OR REPLACE FUNCTION public.compute_inventario_metrics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.divergencia := COALESCE(NEW.quantidade_contada,0) - COALESCE(NEW.saldo_sistemico,0);
  NEW.valor_divergencia := ABS(COALESCE(NEW.divergencia,0)) * COALESCE(NEW.custo_unitario,0);
  IF COALESCE(NEW.saldo_sistemico,0) = 0 THEN
    IF COALESCE(NEW.quantidade_contada,0) = 0 THEN
      NEW.acuracidade := 100;
    ELSE
      NEW.acuracidade := 999;
    END IF;
  ELSE
    NEW.acuracidade := ROUND((COALESCE(NEW.quantidade_contada,0) / NEW.saldo_sistemico) * 100, 2);
  END IF;

  IF NEW.status NOT IN ('APROVADO') THEN
    IF NEW.acuracidade >= 95 AND NEW.acuracidade <= 105 THEN
      NEW.status := 'OK';
    ELSE
      IF NEW.contagem_numero >= 2 THEN
        NEW.status := 'AGUARDANDO_APROVACAO';
      ELSE
        NEW.status := 'RECONTAGEM_NECESSARIA';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_recontagem_on_inventario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'RECONTAGEM_NECESSARIA'
     OR (NEW.acuracidade IS NOT NULL AND (NEW.acuracidade < 95 OR NEW.acuracidade > 105) AND NEW.status <> 'APROVADO') THEN
    INSERT INTO public.recontagem (inventario_id, codigo_produto, lote, descricao, id_local, origem, saldo_sistema, contagem, acuracidade, status, usuario)
    VALUES (NEW.id, NEW.id_produto, NEW.lote, NEW.descricao, NEW.id_local, COALESCE(NEW.origem,''), NEW.saldo_sistemico, NEW.quantidade_contada, NEW.acuracidade, 'PENDENTE_RECONTAGEM', NEW.usuario)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
