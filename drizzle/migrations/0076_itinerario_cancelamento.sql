ALTER TABLE public.log_itinerarios
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid;

CREATE OR REPLACE FUNCTION public.log_trg_itinerario() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    -- Rota cancelada é definitiva: não volta a valer km nem muda de situação.
    IF OLD.status = 'cancelado' THEN
      RAISE EXCEPTION 'Rota cancelada não pode ser alterada.';
    END IF;
    IF NEW.status = 'cancelado' THEN
      IF OLD.status = 'finalizado' AND current_setting('request.jwt.claim.role', true) = 'authenticated' AND NOT public.is_gestor(auth.uid()) THEN
        RAISE EXCEPTION 'Corrida finalizada não pode ser cancelada.';
      END IF;
      IF coalesce(btrim(NEW.motivo_cancelamento), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo do cancelamento.';
      END IF;
      NEW.motivo_cancelamento := btrim(NEW.motivo_cancelamento);
      NEW.cancelado_em := now();
      NEW.cancelado_por := auth.uid();
    ELSE
      NEW.motivo_cancelamento := NULL; NEW.cancelado_em := NULL; NEW.cancelado_por := NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.motivo_cancelamento := NULL; NEW.cancelado_em := NULL; NEW.cancelado_por := NULL;
  END IF;
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' AND NOT public.is_gestor(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN NEW.km_total := NULL; NEW.duracao_min := NULL; NEW.geometria := NULL; NEW.status := 'planejado';
    ELSE NEW.km_total := OLD.km_total; NEW.duracao_min := OLD.duracao_min; NEW.geometria := OLD.geometria; NEW.prestador_id := OLD.prestador_id;
      IF NEW.status = 'finalizado' AND OLD.status <> 'finalizado' THEN NEW.status := OLD.status; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;