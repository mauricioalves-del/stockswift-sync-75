CREATE TABLE public.log_itinerarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.log_prestadores(id),
  ordem_id uuid REFERENCES public.log_ordens(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  descricao text,
  origem jsonb NOT NULL,
  paradas jsonb NOT NULL DEFAULT '[]'::jsonb,
  retorno_origem boolean NOT NULL DEFAULT false,
  km_total numeric,
  duracao_min numeric,
  geometria jsonb,
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','em_rota','finalizado','cancelado')),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  observacao text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_itinerarios TO authenticated;
GRANT ALL ON public.log_itinerarios TO service_role;
ALTER TABLE public.log_itinerarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestao itinerarios" ON public.log_itinerarios FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "leitura itinerarios" ON public.log_itinerarios FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
CREATE POLICY "prestador le itinerarios" ON public.log_itinerarios FOR SELECT TO authenticated USING (prestador_id = public.log_meu_prestador());
CREATE POLICY "prestador cria itinerarios" ON public.log_itinerarios FOR INSERT TO authenticated WITH CHECK (prestador_id = public.log_meu_prestador());
CREATE POLICY "prestador edita itinerarios" ON public.log_itinerarios FOR UPDATE TO authenticated USING (prestador_id = public.log_meu_prestador() AND status <> 'finalizado') WITH CHECK (prestador_id = public.log_meu_prestador());

CREATE OR REPLACE FUNCTION public.log_trg_itinerario() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' AND NOT public.is_gestor(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN NEW.km_total := NULL; NEW.duracao_min := NULL; NEW.geometria := NULL; NEW.status := 'planejado';
    ELSE NEW.km_total := OLD.km_total; NEW.duracao_min := OLD.duracao_min; NEW.geometria := OLD.geometria; NEW.prestador_id := OLD.prestador_id;
      IF NEW.status = 'finalizado' AND OLD.status <> 'finalizado' THEN NEW.status := OLD.status; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER log_itinerarios_trg BEFORE INSERT OR UPDATE ON public.log_itinerarios FOR EACH ROW EXECUTE FUNCTION public.log_trg_itinerario();
CREATE INDEX log_itinerarios_prestador_idx ON public.log_itinerarios(prestador_id, data DESC);