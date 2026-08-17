ALTER TABLE public.producao_consumo ADD COLUMN IF NOT EXISTS data_producao date;

CREATE OR REPLACE VIEW public.v_impacto_consumo AS
SELECT c.id,
    c.id_op AS numero_op,
    c.produto AS sku_produto_final,
    c.desc_produto AS desc_prod,
    c.material,
    c.desc_material,
    c.um,
    COALESCE(to_char(c.data_producao, 'YYYY-MM'), c.ano_mes) AS ano_mes,
    COALESCE(c.data_producao,
      CASE WHEN c.ano_mes ~ '^\d{4}-\d{2}$' THEN to_date(c.ano_mes || '-01', 'YYYY-MM-DD') ELSE NULL::date END
    ) AS dt_producao,
    c.qtd_consumo,
    c.qtd_previsto,
    COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) AS qtd_dif,
    COALESCE(m.custo_unit_medio, 0::numeric) AS custo_unit_medio,
    m.qtd_custos_distintos,
    COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) * COALESCE(m.custo_unit_medio, 0::numeric) AS impacto_rs,
    CASE
        WHEN abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) < 0.0001 THEN 'ok'
        WHEN COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto) > 0::numeric THEN 'perda'
        ELSE 'economia'
    END AS tipo_desvio,
    abs(COALESCE(c.qtd_dif, c.qtd_consumo - c.qtd_previsto)) >= 0.0001 AS tem_furo
FROM public.producao_consumo c
LEFT JOIN public.item_custo_mestre m ON m.id_item = c.material;