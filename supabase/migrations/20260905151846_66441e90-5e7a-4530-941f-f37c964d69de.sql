
CREATE TABLE IF NOT EXISTS public.fechamentos_mensais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano int NOT NULL,
  mes int NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  acoes_criadas int NOT NULL DEFAULT 0,
  acoes_concluidas int NOT NULL DEFAULT 0,
  acoes_em_aberto int NOT NULL DEFAULT 0,
  aderencia_fefo numeric,
  resumo jsonb NOT NULL DEFAULT '[]'::jsonb,
  destaques jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacao text,
  enviado_email_em timestamptz,
  gerado_por uuid,
  gerado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos_mensais TO authenticated;
GRANT ALL ON public.fechamentos_mensais TO service_role;
ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fechamentos_select" ON public.fechamentos_mensais;
CREATE POLICY "fechamentos_select" ON public.fechamentos_mensais
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fechamentos_write" ON public.fechamentos_mensais;
CREATE POLICY "fechamentos_write" ON public.fechamentos_mensais
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'GERENTE') OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'GERENTE') OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));

CREATE OR REPLACE FUNCTION public.fechamento_mensal_resumo(data_inicio date, data_fim date)
RETURNS TABLE (
  modulo text,
  ordem int,
  acoes_criadas bigint,
  acoes_concluidas bigint,
  acoes_em_aberto bigint,
  valor_ou_quantidade numeric,
  unidade_valor text,
  status_geral text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  -- 1. Shelf Life: lotes com validade dentro do radar do periodo (ate 90 dias apos o fim)
  SELECT 'Shelf Life'::text AS modulo, 1 AS ordem,
    count(*)::bigint AS criadas,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM campanhas_lote c
      WHERE upper(btrim(c.sku)) = upper(btrim(e.id_produto))
        AND upper(btrim(coalesce(c.lote,''))) = upper(btrim(coalesce(e.lote,'')))
        AND c.status = 'CONCLUIDA'))::bigint AS concluidas,
    sum(coalesce(e.quantidade,0) * coalesce(e.custo_unitario,0))::numeric AS valor,
    'R$'::text AS unidade
  FROM estoque_sistemico e
  WHERE coalesce(e.quantidade,0) > 0
    AND e.data_validade IS NOT NULL
    AND e.data_validade <= (data_fim + 90)
    AND e.data_validade >= data_inicio

  UNION ALL
  -- 2. Recuperacao de Shelf: campanhas de lote criadas no periodo
  SELECT 'Recuperação de Shelf', 2,
    count(*)::bigint,
    count(*) FILTER (WHERE c.status IN ('CONCLUIDA','CANCELADA'))::bigint,
    sum(coalesce(c.valor_recuperado, c.valor_estimado_recuperado, 0)
      + coalesce(c.saving_recuperado, c.valor_estimado_saving, 0))::numeric,
    'R$'
  FROM campanhas_lote c
  WHERE c.created_at::date BETWEEN data_inicio AND data_fim

  UNION ALL
  -- 3. Baixas Operacionais
  SELECT 'Baixas Operacionais', 3,
    count(*)::bigint,
    count(*) FILTER (WHERE b.status_fluxo IN ('APROVADA','REPROVADA'))::bigint,
    sum(coalesce(b.valor_total,0))::numeric,
    'R$'
  FROM baixa_operacional b
  WHERE coalesce(b.data_ocorrencia, b.data_solicitacao::date, b.created_at::date)
        BETWEEN data_inicio AND data_fim

  UNION ALL
  -- 4. Dispersao de Lote: acoes corretivas abertas no periodo
  SELECT 'Controle de Dispersão de Lote', 4,
    count(*)::bigint,
    count(*) FILTER (WHERE a.status IN ('CONCLUIDA','RESOLVIDA','CANCELADA'))::bigint,
    coalesce((SELECT sum(abs(v.impacto_rs)) FROM v_impacto_consumo v
      WHERE v.dt_producao BETWEEN data_inicio AND data_fim AND coalesce(v.tipo_desvio,'OK') <> 'OK'), 0)::numeric,
    'R$'
  FROM dispersao_acoes_corretivas a
  WHERE a.data_abertura::date BETWEEN data_inicio AND data_fim

  UNION ALL
  -- 5. Testes Operacionais (SKU 05104122)
  SELECT 'Mapeamento de Testes Operacionais', 5,
    count(DISTINCT p.id_op)::bigint,
    count(DISTINCT p.id_op)::bigint,
    sum(coalesce(p.qtd_consumo,0))::numeric,
    'un'
  FROM producao_consumo p
  WHERE p.produto = '05104122'
    AND coalesce(p.data_producao, p.created_at::date) BETWEEN data_inicio AND data_fim

  UNION ALL
  -- 6. Controle de FEFO
  SELECT 'Controle de FEFO', 6,
    count(*)::bigint,
    count(*) FILTER (WHERE coalesce(f.quebra,false) = false)::bigint,
    count(*) FILTER (WHERE coalesce(f.quebra,false))::numeric,
    'quebras'
  FROM checagens_fefo f
  WHERE f.data BETWEEN data_inicio AND data_fim
)
SELECT b.modulo, b.ordem,
  coalesce(b.criadas,0),
  coalesce(b.concluidas,0),
  greatest(coalesce(b.criadas,0) - coalesce(b.concluidas,0), 0),
  coalesce(b.valor,0),
  b.unidade,
  CASE WHEN coalesce(b.criadas,0) = 0 THEN 'Sem movimento'
       WHEN (coalesce(b.criadas,0) - coalesce(b.concluidas,0))::numeric / b.criadas <= 0.15 THEN 'Sob controle'
       ELSE 'Atenção' END
FROM base b
ORDER BY b.ordem;
$$;

CREATE OR REPLACE FUNCTION public.fechamento_mensal_destaques(data_inicio date, data_fim date)
RETURNS TABLE (modulo text, data_evento date, texto text, valor numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'Recuperação de Shelf'::text, c.data_acao,
    'Recuperação concluída: ' || c.sku || ' lote ' || coalesce(c.lote,'-') ||
    ' — ' || round(coalesce(c.quantidade_recuperada, c.quantidade_enderecada, 0), 2)::text || ' un',
    coalesce(c.valor_recuperado, c.valor_estimado_recuperado, 0)
      + coalesce(c.saving_recuperado, c.valor_estimado_saving, 0)
  FROM campanhas_lote c
  WHERE c.status = 'CONCLUIDA' AND c.data_acao BETWEEN data_inicio AND data_fim

  UNION ALL
  SELECT 'Controle de Dispersão de Lote', v.dt_producao,
    'Dispersão fora do padrão: OP ' || v.numero_op || ' — material ' || v.material ||
    coalesce(' (' || v.desc_material || ')', '') || ' — ' || v.tipo_desvio,
    abs(coalesce(v.impacto_rs,0))
  FROM v_impacto_consumo v
  WHERE v.dt_producao BETWEEN data_inicio AND data_fim
    AND coalesce(v.tipo_desvio,'OK') <> 'OK'
    AND abs(coalesce(v.impacto_rs,0)) >= 150

  UNION ALL
  SELECT 'Controle de FEFO', f.data,
    'Quebra de FEFO: produto ' || f.id_produto || ' — lote movimentado ' || coalesce(f.lote_movimentado,'-') ||
    ' em vez do lote mais antigo ' || coalesce(f.lote_mais_antigo,'-'),
    coalesce(f.qtd_movimentado,0)
  FROM checagens_fefo f
  WHERE f.data BETWEEN data_inicio AND data_fim AND coalesce(f.quebra,false)

  UNION ALL
  SELECT 'Baixas Operacionais', coalesce(b.data_ocorrencia, b.created_at::date),
    'Baixa reprovada: ' || b.codigo_produto || coalesce(' — ' || b.descricao, '') ||
    coalesce(' — motivo: ' || b.motivo_reprovacao, ''),
    coalesce(b.valor_total,0)
  FROM baixa_operacional b
  WHERE b.status_fluxo = 'REPROVADA'
    AND coalesce(b.data_ocorrencia, b.data_solicitacao::date, b.created_at::date) BETWEEN data_inicio AND data_fim

  ORDER BY 4 DESC NULLS LAST
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION public.fechamento_mensal_resumo(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fechamento_mensal_destaques(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechamento_mensal_resumo(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fechamento_mensal_destaques(date, date) TO authenticated, service_role;
