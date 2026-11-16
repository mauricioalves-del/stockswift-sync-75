ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS encerrada_sem_contagem_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_sem_contagem_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_encerramento text;

CREATE OR REPLACE FUNCTION public.encerrar_missao_sem_contagem(_missao_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m record;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _uid IS NULL OR NOT public.is_gestor(_uid) THEN
    RAISE EXCEPTION 'Apenas Administrador ou Gerente podem confirmar a pendência';
  END IF;
  IF coalesce(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo';
  END IF;
  SELECT id, titulo, status, data_execucao INTO _m FROM public.missoes WHERE id = _missao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada';
  END IF;
  IF _m.status IN ('CONCLUIDA', 'CANCELADA') THEN
    RAISE EXCEPTION 'Missão já está %', _m.status;
  END IF;
  IF _m.data_execucao IS NULL OR _m.data_execucao + 1 > _hoje THEN
    RAISE EXCEPTION 'A pendência só pode ser confirmada 1 dia após a data de execução';
  END IF;

  UPDATE public.missoes
     SET status = 'CANCELADA',
         encerrada_sem_contagem_em = now(),
         encerrada_sem_contagem_por = _uid,
         motivo_encerramento = btrim(_motivo)
   WHERE id = _missao_id;

  INSERT INTO public.audit_logs (usuario, acao, entidade, entidade_id, payload)
  VALUES (_uid, 'ENCERRAR_MISSAO_SEM_CONTAGEM', 'missoes', _missao_id,
          jsonb_build_object('titulo', _m.titulo, 'status_anterior', _m.status,
                             'data_execucao', _m.data_execucao, 'motivo', btrim(_motivo)));
END $$;

REVOKE ALL ON FUNCTION public.encerrar_missao_sem_contagem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_missao_sem_contagem(uuid, text) TO authenticated;