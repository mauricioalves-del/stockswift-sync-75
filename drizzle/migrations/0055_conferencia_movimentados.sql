-- Farol de Processo · Conferência de Movimentados (Fábrica, Processo, Qualidade, Pará).
-- Uma conferência por almoxarifado e dia de movimento, com o resultado item a item dos SKUs movimentados.
-- Registrar de novo o mesmo dia atualiza a conferência (o horário passa a ser o da última gravação).
-- Idempotente.
CREATE TABLE IF NOT EXISTS public.conferencias_movimentados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almox text NOT NULL CHECK (almox IN ('FABRICA','PROCESSO','QUALIDADE','PARA')),
  data_movimento date NOT NULL,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  conferente_id uuid DEFAULT auth.uid(),
  conferente_nome text,
  itens_movimentados int NOT NULL DEFAULT 0,
  itens_conferidos int NOT NULL DEFAULT 0,
  divergentes int NOT NULL DEFAULT 0,
  observacao text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (almox, data_movimento)
);
CREATE INDEX IF NOT EXISTS ix_conf_mov_data ON public.conferencias_movimentados (data_movimento);
GRANT SELECT ON public.conferencias_movimentados TO authenticated;
GRANT ALL ON public.conferencias_movimentados TO service_role;
ALTER TABLE public.conferencias_movimentados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conf_mov leitura" ON public.conferencias_movimentados;
CREATE POLICY "conf_mov leitura" ON public.conferencias_movimentados FOR SELECT TO authenticated
  USING (public.equipe_aprovada_para_leitura(auth.uid()));

-- Registra (ou atualiza) a conferência do dia. Os totais são calculados a partir dos itens enviados.
CREATE OR REPLACE FUNCTION public.registrar_conferencia_movimentados(p_almox text, p_data date, p_itens jsonb, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); _nome text; _id uuid; _mov int; _conf int; _div int;
BEGIN
  IF uid IS NULL OR NOT public.equipe_aprovada_para_leitura(uid) THEN RAISE EXCEPTION 'Usuário sem acesso' USING errcode = '42501'; END IF;
  IF p_almox NOT IN ('FABRICA','PROCESSO','QUALIDADE','PARA') THEN RAISE EXCEPTION 'Almoxarifado inválido'; END IF;
  IF p_data IS NULL OR p_data > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data de movimento inválida'; END IF;
  IF jsonb_typeof(p_itens) <> 'array' THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
  SELECT count(*), count(*) FILTER (WHERE x->>'status' IN ('OK','DIVERGENTE')), count(*) FILTER (WHERE x->>'status' = 'DIVERGENTE')
    INTO _mov, _conf, _div FROM jsonb_array_elements(p_itens) x;
  IF _conf = 0 THEN RAISE EXCEPTION 'Marque ao menos um item como conferido'; END IF;
  SELECT coalesce(nome, email) INTO _nome FROM public.profiles WHERE id = uid;
  INSERT INTO public.conferencias_movimentados (almox, data_movimento, conferido_em, conferente_id, conferente_nome, itens_movimentados, itens_conferidos, divergentes, observacao, itens)
  VALUES (p_almox, p_data, now(), uid, _nome, _mov, _conf, _div, nullif(left(trim(coalesce(p_observacao, '')), 1000), ''), p_itens)
  ON CONFLICT (almox, data_movimento) DO UPDATE SET conferido_em = now(), conferente_id = uid, conferente_nome = _nome,
    itens_movimentados = _mov, itens_conferidos = _conf, divergentes = _div, observacao = excluded.observacao, itens = excluded.itens
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'itens_conferidos', _conf, 'divergentes', _div);
END $$;
REVOKE ALL ON FUNCTION public.registrar_conferencia_movimentados(text, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_movimentados(text, date, jsonb, text) TO authenticated;
