-- ============ Tabelas ============
CREATE TABLE public.movimentacoes_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_produto text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  data timestamptz NOT NULL,
  doc text NOT NULL DEFAULT '',
  desc_movimento text NOT NULL DEFAULT '',
  desc_almox text NOT NULL DEFAULT '',
  qtd numeric NOT NULL DEFAULT 0,
  id_lote text NOT NULL DEFAULT '',
  importado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_diarias TO authenticated;
GRANT ALL ON public.movimentacoes_diarias TO service_role;
ALTER TABLE public.movimentacoes_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_select_auth" ON public.movimentacoes_diarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "mov_write" ON public.movimentacoes_diarias FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE') OR public.has_role(auth.uid(),'OPERADOR_ESTOQUE'))
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE') OR public.has_role(auth.uid(),'OPERADOR_ESTOQUE'));
CREATE INDEX idx_mov_diarias_data ON public.movimentacoes_diarias (data);
CREATE INDEX idx_mov_diarias_prod ON public.movimentacoes_diarias (id_produto);
CREATE TRIGGER trg_mov_diarias_updated BEFORE UPDATE ON public.movimentacoes_diarias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mapa_almoxarifados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  codigo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapa_almoxarifados TO authenticated;
GRANT ALL ON public.mapa_almoxarifados TO service_role;
ALTER TABLE public.mapa_almoxarifados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mapa_select_auth" ON public.mapa_almoxarifados FOR SELECT TO authenticated USING (true);
CREATE POLICY "mapa_write" ON public.mapa_almoxarifados FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE'))
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE'));
CREATE TRIGGER trg_mapa_almox_updated BEFORE UPDATE ON public.mapa_almoxarifados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.mapa_almoxarifados (nome, codigo) VALUES
  ('Almox - SP Fabrica','Alm_SP_Fabrica'),
  ('Almox - SP Loja','Alm_SP_Loja'),
  ('Almox - PARA','Alm_Para'),
  ('Almox Processo - SP Fabrica','Alm_SP_Processo'),
  ('PDV Ativação','Alm_PDV_Ativacao'),
  ('Almox Qualidade - PARA','Alm_Qualidade_Para'),
  ('Almox Box','Alm_Box'),
  ('Almox Box 2','Alm_Box2'),
  ('Almox Degustação','Alm_Degustacao'),
  ('Almox Qualidade','Alm_SP_Qualidade');

CREATE TABLE public.excecoes_fefo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_produto text NOT NULL,
  lote_mais_antigo text NOT NULL,
  motivo text,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_produto, lote_mais_antigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.excecoes_fefo TO authenticated;
GRANT ALL ON public.excecoes_fefo TO service_role;
ALTER TABLE public.excecoes_fefo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exc_select_auth" ON public.excecoes_fefo FOR SELECT TO authenticated USING (true);
CREATE POLICY "exc_write" ON public.excecoes_fefo FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE'))
  WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(),'INVENTARIANTE'));
CREATE TRIGGER trg_excecoes_fefo_updated BEFORE UPDATE ON public.excecoes_fefo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.checagens_fefo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  id_produto text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  desc_movimento text NOT NULL DEFAULT '',
  desc_almox text NOT NULL DEFAULT '',
  destino text NOT NULL DEFAULT '',
  doc text NOT NULL DEFAULT '',
  lote_movimentado text NOT NULL DEFAULT '',
  qtd_movimentado numeric NOT NULL DEFAULT 0,
  validade_movimentado date,
  quebra boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  lote_mais_antigo text,
  qtd_lote_mais_antigo numeric,
  validade_mais_antiga date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checagens_fefo TO authenticated;
GRANT ALL ON public.checagens_fefo TO service_role;
ALTER TABLE public.checagens_fefo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_select_auth" ON public.checagens_fefo FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_checagens_fefo_data ON public.checagens_fefo (data);
CREATE INDEX idx_checagens_fefo_quebra ON public.checagens_fefo (quebra);

-- ============ Motor ============
CREATE OR REPLACE FUNCTION public.fefo_norm_sku(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN btrim(coalesce(_v,'')) ~ '^[0-9]+$'
    THEN lpad(btrim(_v), 8, '0') ELSE upper(btrim(coalesce(_v,''))) END
$$;

CREATE OR REPLACE FUNCTION public.processar_fefo(_data date DEFAULT NULL)
RETURNS TABLE(dia date, processados integer, quebras integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date;
BEGIN
  d := COALESCE(_data, (SELECT max((m.data AT TIME ZONE 'America/Sao_Paulo')::date) FROM public.movimentacoes_diarias m));
  IF d IS NULL THEN
    RETURN QUERY SELECT NULL::date, 0, 0; RETURN;
  END IF;

  DELETE FROM public.checagens_fefo c WHERE c.data = d;

  INSERT INTO public.checagens_fefo (
    data, id_produto, descricao, desc_movimento, desc_almox, destino, doc,
    lote_movimentado, qtd_movimentado, validade_movimentado,
    quebra, status, lote_mais_antigo, qtd_lote_mais_antigo, validade_mais_antiga)
  SELECT
    d, x.sku, x.descricao, x.desc_movimento, x.desc_almox, x.dest_txt, x.doc,
    x.id_lote, x.qtd, x.val_mov,
    x.status_final = '⚠️ QUEBRA DE FEFO',
    x.status_final,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_lote END,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_qtd END,
    CASE WHEN x.status_final IN ('⚠️ QUEBRA DE FEFO','OK (exceção validada)') THEN x.c_val END
  FROM (
    SELECT f.*,
      CASE
        WHEN NOT f.eh_origem AND f.cod_linha IS NULL AND f.eh_fab THEN 'Almox não mapeado'
        WHEN NOT f.eh_origem THEN 'Destino (não auditado)'
        WHEN f.val_mov IS NULL THEN 'Sem validade (lote não encontrado)'
        WHEN f.n_cand = 0 AND f.n_semval = 0 THEN 'OK (almox vazio para este produto)'
        WHEN f.n_cand = 0 THEN 'Inconclusivo (lotes sem validade cadastrada no almox)'
        WHEN f.c_lote IS NULL THEN 'OK'
        WHEN EXISTS (SELECT 1 FROM public.excecoes_fefo e
                     WHERE public.fefo_norm_sku(e.id_produto) = f.sku
                       AND upper(btrim(e.lote_mais_antigo)) = upper(btrim(f.c_lote))) THEN 'OK (exceção validada)'
        ELSE '⚠️ QUEBRA DE FEFO'
      END AS status_final
    FROM (
      SELECT b.*,
        (SELECT min(e.data_validade) FROM public.estoque_sistemico e
          WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL
            AND public.fefo_norm_sku(e.id_produto) = b.sku) AS val_mov_p,
        (SELECT min(e.data_validade) FROM public.estoque_sistemico e
          WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL) AS val_mov_g,
        COALESCE(
          (SELECT min(e.data_validade) FROM public.estoque_sistemico e
            WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL
              AND public.fefo_norm_sku(e.id_produto) = b.sku),
          (SELECT min(e.data_validade) FROM public.estoque_sistemico e
            WHERE upper(btrim(e.lote)) = upper(btrim(b.id_lote)) AND e.data_validade IS NOT NULL)
        ) AS val_mov,
        (SELECT count(*) FROM public.estoque_sistemico e
          WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
            AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
            AND e.data_validade IS NOT NULL) AS n_cand,
        (SELECT count(*) FROM public.estoque_sistemico e
          WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
            AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
            AND e.data_validade IS NULL) AS n_semval,
        cand.lote AS c_lote, cand.quantidade AS c_qtd, cand.data_validade AS c_val
      FROM (
        SELECT m.id_produto, public.fefo_norm_sku(m.id_produto) AS sku, m.descricao, m.doc,
               m.desc_movimento, m.desc_almox, m.qtd, m.id_lote,
               btrim(split_part(m.desc_movimento,'->',1)) AS orig_txt,
               btrim(split_part(m.desc_movimento,'->',2)) AS dest_txt,
               (lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fabrica%'
                 OR lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fábrica%') AS eh_fab,
               (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                 WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1) AS cod_linha,
               (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                 WHERE lower(btrim(ma.nome)) = lower(btrim(split_part(m.desc_movimento,'->',1))) LIMIT 1) AS cod_orig,
               ((lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fabrica%'
                 OR lower(btrim(split_part(m.desc_movimento,'->',1))) LIKE '%fábrica%')
                AND (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1) IS NOT NULL
                AND (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(m.desc_almox)) LIMIT 1)
                    = (SELECT ma.codigo FROM public.mapa_almoxarifados ma
                      WHERE lower(btrim(ma.nome)) = lower(btrim(split_part(m.desc_movimento,'->',1))) LIMIT 1)
               ) AS eh_origem
        FROM public.movimentacoes_diarias m
        WHERE (m.data AT TIME ZONE 'America/Sao_Paulo')::date = d
          AND m.desc_movimento LIKE '%->%'
      ) b
      LEFT JOIN LATERAL (
        SELECT e.lote, e.quantidade, e.data_validade
        FROM public.estoque_sistemico e
        WHERE public.fefo_norm_sku(e.id_produto) = b.sku AND e.origem = b.cod_linha
          AND upper(btrim(e.lote)) <> upper(btrim(b.id_lote)) AND e.quantidade > 0
          AND e.data_validade IS NOT NULL
          AND e.data_validade < COALESCE(
            (SELECT min(e2.data_validade) FROM public.estoque_sistemico e2
              WHERE upper(btrim(e2.lote)) = upper(btrim(b.id_lote)) AND e2.data_validade IS NOT NULL
                AND public.fefo_norm_sku(e2.id_produto) = b.sku),
            (SELECT min(e2.data_validade) FROM public.estoque_sistemico e2
              WHERE upper(btrim(e2.lote)) = upper(btrim(b.id_lote)) AND e2.data_validade IS NOT NULL))
        ORDER BY e.data_validade ASC
        LIMIT 1
      ) cand ON true
    ) f
  ) x;

  RETURN QUERY
    SELECT d, count(*)::int, count(*) FILTER (WHERE c.quebra)::int
    FROM public.checagens_fefo c WHERE c.data = d;
END $$;

REVOKE ALL ON FUNCTION public.processar_fefo(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processar_fefo(date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fefo_norm_sku(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fefo_norm_sku(text) TO authenticated, service_role;

-- ============ Agendamento diário (08:00 America/Sao_Paulo = 11:00 UTC) ============
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fefo-diario';
SELECT cron.schedule('fefo-diario', '0 11 * * *', $$SELECT public.processar_fefo();$$);