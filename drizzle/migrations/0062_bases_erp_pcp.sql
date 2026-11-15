-- Bases do ERP usadas pelo PCP e pelo Indicador de Produção (carga pela planilha GrPCP_Conexoes_ERP.xlsx).
-- Carga integral por base: o importador apaga e regrava. Dados pessoais de clientes (razão social, CPF/CNPJ) não são gravados.
CREATE TABLE IF NOT EXISTS public.erp_producao_op (
  id bigserial PRIMARY KEY,
  empresa text, id_op text NOT NULL, id_seq integer, tipo_material text, id_produto text NOT NULL, descricao text, um text, status text,
  dt_prevista date, qtd_prevista numeric, qtd_prod numeric, qtd_saldo numeric, dt_producao date, dt_registro date, custo_contabil numeric,
  importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_producao_op_op_idx ON public.erp_producao_op (id_op, id_produto);
CREATE INDEX IF NOT EXISTS erp_producao_op_data_idx ON public.erp_producao_op (dt_producao);

CREATE TABLE IF NOT EXISTS public.erp_producao_mes (
  id bigserial PRIMARY KEY,
  tipo_material text, id_produto text NOT NULL, descricao text, um text, anomes text, qtd_produzir numeric, qtd_ja_produzida numeric, status text, empresa text,
  importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_producao_mes_idx ON public.erp_producao_mes (anomes, id_produto);

CREATE TABLE IF NOT EXISTS public.erp_faturamento (
  id bigserial PRIMARY KEY,
  empresa text, ano integer, anomes text, dt_emissao date, mes text, semana text, nr_nf text, serie text, tipo_documento text, cidade text, estado text,
  cod_prod text, desc_produto text, qtd numeric, vt_total_item numeric, id_cfo text, natureza text, grupo text, linha text, vendedor text, orig_ped text,
  tipo_produto text, dt_inclusao date, dt_faturado date, pedido_cancelado text, dias_para_faturar numeric, nota_cancelada text, dt_cancelamento_nota date,
  grupo1 text, grupo2 text, vt_frete numeric, cont_ped numeric, canal_venda text, vt_desc numeric, vt_fat_liquido numeric, meio_pgto text, cond_pgto text,
  operacao text, lote text, custo_unitario_estoque numeric,
  importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_faturamento_data_idx ON public.erp_faturamento (dt_emissao);
CREATE INDEX IF NOT EXISTS erp_faturamento_prod_idx ON public.erp_faturamento (cod_prod);

CREATE TABLE IF NOT EXISTS public.erp_faturamento_pendente (
  id bigserial PRIMARY KEY,
  comentario text, descricao text, id_pedido text, cliente text, produto text, qtd numeric,
  importado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.erp_saldo_estoque (
  id bigserial PRIMARY KEY,
  id_produto text NOT NULL, descricao text, um text, ativo text, tipo_material text, grupo text, linha text, cod_barras text, tipo_produto text, prod_ref1 text,
  estoque_minimo numeric, estoque_maximo numeric, validade_meses numeric, custo_vlr numeric, custo_contabil numeric,
  saldos jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Alm_* (quantidade por almoxarifado)
  saldos_kg jsonb NOT NULL DEFAULT '{}'::jsonb, -- Kg_* (peso por almoxarifado)
  importado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_saldo_estoque_prod_idx ON public.erp_saldo_estoque (id_produto);

CREATE TABLE IF NOT EXISTS public.erp_importacoes (
  id bigserial PRIMARY KEY,
  base text NOT NULL, linhas integer NOT NULL, arquivo text, importado_por text,
  importado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_producao_op','erp_producao_mes','erp_faturamento','erp_faturamento_pendente','erp_saldo_estoque','erp_importacoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "erp leitura" ON public.%I', t);
    EXECUTE format('CREATE POLICY "erp leitura" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "erp carga" ON public.%I', t);
    EXECUTE format('CREATE POLICY "erp carga" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "erp limpeza" ON public.%I', t);
    EXECUTE format('CREATE POLICY "erp limpeza" ON public.%I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;
