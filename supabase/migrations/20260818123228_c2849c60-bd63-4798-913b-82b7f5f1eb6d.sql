CREATE OR REPLACE VIEW public.v_impacto_consumo AS
SELECT
  c.id,
  c.id_op AS numero_op,
  c.produto AS sku_produto_final,
  c.desc_produto AS desc_prod,
  c.material,
  c.desc_material,
  c.um,
  CASE
    WHEN c.data_producao IS NOT NULL THEN to_char(c.data_producao::timestamp with time zone, 'YYYY-MM')
    WHEN c.ano_mes ~ '^20\d{2}-(0[1-9]|1[0-2])$' THEN c.ano_mes
    ELSE NULL
  END AS ano_mes,
  c.data_producao AS dt_producao,
  c.qtd_consumo,
  c.qtd_previsto,
  COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) AS qtd_dif,
  COALESCE(m.custo_unit_medio, 0::numeric) AS custo_unit_medio,
  m.qtd_custos_distintos,
  COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) * COALESCE(m.custo_unit_medio, 0::numeric) AS impacto_rs,
  CASE
    WHEN abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) < 0.0001 THEN 'ok'::text
    WHEN COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) > 0::numeric THEN 'perda'::text
    ELSE 'economia'::text
  END AS tipo_desvio,
  abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) >= 0.0001 AS tem_furo
FROM public.producao_consumo c
LEFT JOIN public.item_custo_mestre m ON m.id_item = c.material;

GRANT SELECT ON public.v_impacto_consumo TO authenticated;
GRANT SELECT ON public.v_impacto_consumo TO service_role;