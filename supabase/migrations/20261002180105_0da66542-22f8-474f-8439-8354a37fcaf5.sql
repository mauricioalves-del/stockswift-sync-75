CREATE TABLE public.planos_contagem_ciclica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  dias_semana integer[] NOT NULL DEFAULT '{}',
  familias text[],
  grupos text[],
  origem text,
  criterio_abc text CHECK (criterio_abc IS NULL OR criterio_abc IN ('A','B','C')),
  ultima_execucao date,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos_contagem_ciclica TO authenticated;
GRANT ALL ON public.planos_contagem_ciclica TO service_role;
ALTER TABLE public.planos_contagem_ciclica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planos_ciclicos gestor" ON public.planos_contagem_ciclica FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_planos_ciclicos_updated BEFORE UPDATE ON public.planos_contagem_ciclica
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missoes
  ADD COLUMN plano_origem_id uuid REFERENCES public.planos_contagem_ciclica(id) ON DELETE SET NULL,
  ADD COLUMN familias_alvo text[],
  ADD COLUMN grupos_alvo text[];

CREATE OR REPLACE FUNCTION public.executar_planos_contagem_ciclica()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _dow int := extract(dow FROM _hoje)::int;
  p record; _mid uuid; _n int := 0; _skus text[];
BEGIN
  FOR p IN SELECT * FROM planos_contagem_ciclica
    WHERE ativo AND _dow = ANY(dias_semana)
      AND (ultima_execucao IS NULL OR ultima_execucao <> _hoje)
  LOOP
    SELECT array_agg(DISTINCT c) INTO _skus FROM (
      SELECT codigo_produto c FROM grupo_produtos WHERE p.grupos IS NOT NULL AND grupo = ANY(p.grupos)
      UNION
      SELECT codigo_produto FROM familias WHERE p.familias IS NOT NULL AND familia = ANY(p.familias)
    ) u;
    IF p.criterio_abc IS NOT NULL THEN
      IF _skus IS NULL AND p.grupos IS NULL AND p.familias IS NULL THEN
        SELECT array_agg(DISTINCT codigo_produto) INTO _skus FROM classificacao_abc WHERE classe = p.criterio_abc;
      ELSE
        SELECT array_agg(DISTINCT codigo_produto) INTO _skus FROM classificacao_abc
          WHERE classe = p.criterio_abc AND codigo_produto = ANY(coalesce(_skus,'{}'));
      END IF;
    END IF;

    INSERT INTO missoes (titulo, descricao, tipo, origem, data_execucao, criado_por, plano_origem_id, familias_alvo, grupos_alvo)
    VALUES ('Contagem Cíclica - ' || p.nome || ' - ' || to_char(_hoje,'DD/MM/YYYY'),
            'Gerada automaticamente pelo planejamento cíclico', 'SEMANAL', p.origem, _hoje,
            p.criado_por, p.id, p.familias, p.grupos)
    RETURNING id INTO _mid;

    INSERT INTO missoes_itens (missao_id, codigo_produto, descricao, lote, quantidade_prevista)
    SELECT _mid, e.id_produto, e.descricao, e.lote, e.quantidade FROM estoque_sistemico e
    WHERE (p.origem IS NULL OR e.origem = p.origem)
      AND (
        (p.grupos IS NULL AND p.familias IS NULL AND p.criterio_abc IS NULL)
        OR e.id_produto = ANY(coalesce(_skus,'{}'))
      );

    UPDATE planos_contagem_ciclica SET ultima_execucao = _hoje WHERE id = p.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.executar_planos_contagem_ciclica() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('planos-contagem-ciclica-diario', '0 9 * * *', $$SELECT public.executar_planos_contagem_ciclica();$$);