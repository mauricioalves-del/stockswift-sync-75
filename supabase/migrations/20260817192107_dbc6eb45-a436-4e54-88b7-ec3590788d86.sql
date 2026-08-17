ALTER TABLE public.parametros_dispersao
  ADD COLUMN IF NOT EXISTS limite_freq_ops integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS limite_impacto_rs numeric NOT NULL DEFAULT 150;

CREATE OR REPLACE VIEW public.item_custo_mestre
WITH (security_invoker = on) AS
SELECT
  id_item,
  max(item) AS descricao_item,
  avg(NULLIF(custo, 0)) AS custo_unit_medio,
  min(NULLIF(custo, 0)) AS custo_unit_min,
  max(NULLIF(custo, 0)) AS custo_unit_max,
  count(DISTINCT NULLIF(custo, 0)) AS qtd_custos_distintos
FROM public.ficha_tecnica_bom
GROUP BY id_item;

CREATE OR REPLACE VIEW public.v_impacto_consumo
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.id_op AS numero_op,
  c.produto AS sku_produto_final,
  c.desc_produto AS desc_prod,
  c.material,
  c.desc_material,
  c.um,
  c.ano_mes,
  CASE WHEN c.ano_mes ~ '^\d{4}-\d{2}$' THEN to_date(c.ano_mes || '-01', 'YYYY-MM-DD') END AS dt_producao,
  c.qtd_consumo,
  c.qtd_previsto,
  COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) AS qtd_dif,
  COALESCE(m.custo_unit_medio, 0) AS custo_unit_medio,
  m.qtd_custos_distintos,
  COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) * COALESCE(m.custo_unit_medio, 0) AS impacto_rs,
  CASE
    WHEN abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) < 0.0001 THEN 'ok'
    WHEN COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) > 0 THEN 'perda'
    ELSE 'economia'
  END AS tipo_desvio,
  abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) >= 0.0001 AS tem_furo
FROM public.producao_consumo c
LEFT JOIN public.item_custo_mestre m ON m.id_item = c.material;

CREATE OR REPLACE VIEW public.v_kpis_executivo
WITH (security_invoker = on) AS
WITH base AS (SELECT * FROM public.v_impacto_consumo),
ops AS (SELECT numero_op, bool_or(tem_furo) AS op_tem_furo FROM base GROUP BY numero_op),
materiais_criticos AS (
  SELECT desc_material FROM base WHERE tem_furo
  GROUP BY desc_material
  HAVING count(DISTINCT numero_op) >= (SELECT limite_freq_ops FROM public.parametros_dispersao LIMIT 1)
)
SELECT
  (SELECT count(*) FROM ops) AS total_ops,
  (SELECT count(*) FROM ops WHERE op_tem_furo) AS ops_com_furo,
  round(100.0 * (SELECT count(*) FROM ops WHERE op_tem_furo) / NULLIF((SELECT count(*) FROM ops), 0), 1) AS taxa_furo_pct,
  round(COALESCE((SELECT sum(impacto_rs) FROM base WHERE tipo_desvio = 'perda'), 0)::numeric, 2) AS perda_total_rs,
  round(COALESCE((SELECT sum(impacto_rs) FROM base WHERE tipo_desvio = 'economia'), 0)::numeric, 2) AS economia_total_rs,
  round(COALESCE((SELECT sum(impacto_rs) FROM base), 0)::numeric, 2) AS impacto_liquido_rs,
  (SELECT count(*) FROM materiais_criticos) AS materiais_cronicos;

CREATE OR REPLACE VIEW public.v_pareto_concentracao
WITH (security_invoker = on) AS
WITH impacto_material AS (
  SELECT desc_material, sum(abs(impacto_rs)) AS impacto_abs
  FROM public.v_impacto_consumo GROUP BY desc_material
),
top20 AS (SELECT impacto_abs FROM impacto_material ORDER BY impacto_abs DESC LIMIT 20)
SELECT round(100.0 * (SELECT sum(impacto_abs) FROM top20) / NULLIF((SELECT sum(impacto_abs) FROM impacto_material), 0), 1) AS pct_top20;

CREATE OR REPLACE VIEW public.v_matriz_criticidade
WITH (security_invoker = on) AS
SELECT
  v.material,
  COALESCE(v.desc_material, v.material) AS desc_material,
  v.ano_mes,
  count(DISTINCT v.numero_op) AS freq_ops,
  sum(v.impacto_rs) AS impacto_liquido,
  sum(abs(v.impacto_rs)) AS impacto_abs,
  CASE
    WHEN count(DISTINCT v.numero_op) >= p.limite_freq_ops AND sum(abs(v.impacto_rs)) >= p.limite_impacto_rs THEN 'critico_recorrente'
    WHEN count(DISTINCT v.numero_op) <  p.limite_freq_ops AND sum(abs(v.impacto_rs)) >= p.limite_impacto_rs THEN 'pontual'
    WHEN count(DISTINCT v.numero_op) >= p.limite_freq_ops AND sum(abs(v.impacto_rs)) <  p.limite_impacto_rs THEN 'cronico'
    ELSE 'controle'
  END AS quadrante
FROM public.v_impacto_consumo v
CROSS JOIN LATERAL (SELECT limite_freq_ops, limite_impacto_rs FROM public.parametros_dispersao LIMIT 1) p
WHERE v.tem_furo
GROUP BY v.material, COALESCE(v.desc_material, v.material), v.ano_mes, p.limite_freq_ops, p.limite_impacto_rs;

CREATE OR REPLACE VIEW public.v_impacto_origem
WITH (security_invoker = on) AS
WITH origem_item AS (
  SELECT id_item, max(linha_origem) AS origem
  FROM public.ficha_tecnica_bom
  WHERE linha_origem IS NOT NULL AND linha_origem <> ''
  GROUP BY id_item
)
SELECT
  o.origem,
  v.ano_mes,
  sum(abs(v.impacto_rs)) AS impacto_abs,
  sum(v.impacto_rs) AS impacto_liquido,
  count(*) FILTER (WHERE v.tem_furo) AS n_furos,
  count(*) AS n_itens,
  round(100.0 * count(*) FILTER (WHERE v.tem_furo) / NULLIF(count(*), 0), 1) AS taxa_furo_pct
FROM public.v_impacto_consumo v
JOIN origem_item o ON o.id_item = v.material
GROUP BY o.origem, v.ano_mes;

CREATE OR REPLACE VIEW public.v_tendencia_mensal
WITH (security_invoker = on) AS
SELECT
  ano_mes,
  COALESCE(sum(impacto_rs) FILTER (WHERE tipo_desvio = 'perda'), 0) AS perda_rs,
  COALESCE(-sum(impacto_rs) FILTER (WHERE tipo_desvio = 'economia'), 0) AS economia_rs,
  count(*) FILTER (WHERE tem_furo) AS n_furos
FROM public.v_impacto_consumo
GROUP BY ano_mes;

GRANT SELECT ON public.item_custo_mestre TO authenticated;
GRANT SELECT ON public.v_impacto_consumo TO authenticated;
GRANT SELECT ON public.v_kpis_executivo TO authenticated;
GRANT SELECT ON public.v_pareto_concentracao TO authenticated;
GRANT SELECT ON public.v_matriz_criticidade TO authenticated;
GRANT SELECT ON public.v_impacto_origem TO authenticated;
GRANT SELECT ON public.v_tendencia_mensal TO authenticated;
GRANT SELECT ON public.item_custo_mestre, public.v_impacto_consumo, public.v_kpis_executivo, public.v_pareto_concentracao, public.v_matriz_criticidade, public.v_impacto_origem, public.v_tendencia_mensal TO service_role;