-- Pilar Controle Logístico · fase 1: envios (todos os modais), trechos do PJ e custos fixos de prestadores.
-- Carga do histórico pela planilha "Fechamento de fretes"; a chave evita duplicar o mesmo envio.
CREATE TABLE IF NOT EXISTS public.log_envios (
  id bigserial PRIMARY KEY,
  data date NOT NULL,
  pedido text, valor_pedido numeric, cliente text, operacao text, cc text,
  natureza text NOT NULL CHECK (natureza IN ('venda','compra','interno')),
  modal text, km numeric, fora_sp boolean, uf text, origem_destino text, kg numeric,
  frete numeric NOT NULL DEFAULT 0, isopor numeric NOT NULL DEFAULT 0, gelox numeric NOT NULL DEFAULT 0, seguro numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (frete + isopor + gelox + seguro) STORED,
  cobrado numeric NOT NULL DEFAULT 0, observacao text, fonte text,
  chave text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS log_envios_data_idx ON public.log_envios (data);
CREATE TABLE IF NOT EXISTS public.log_trechos_pj (
  id bigserial PRIMARY KEY,
  prestador text NOT NULL, data date NOT NULL, saida text, destino text, operacao text, cc text,
  km numeric, valor numeric NOT NULL DEFAULT 0, fonte text,
  chave text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS log_trechos_pj_data_idx ON public.log_trechos_pj (data);
CREATE TABLE IF NOT EXISTS public.log_custos_fixos (
  id bigserial PRIMARY KEY,
  prestador text NOT NULL, mes text NOT NULL, descricao text NOT NULL, valor numeric NOT NULL,
  rateio jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prestador, mes, descricao)
);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['log_envios','log_trechos_pj','log_custos_fixos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "leitura" ON public.%I', t);
    EXECUTE format('CREATE POLICY "leitura" ON public.%I FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "gestao" ON public.%I', t);
    EXECUTE format('CREATE POLICY "gestao" ON public.%I FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()))', t);
  END LOOP;
END $$;
-- Contrato atual do PJ Nelson (como está): R$ 4.000 fixos/mês, rateados por área, desde jun/2026.
INSERT INTO public.log_custos_fixos (prestador, mes, descricao, valor, rateio)
SELECT 'Nelson', m, 'Prestação de serviços', 4000, '{"Facilities":1000,"Ativação":1500,"Operação":1500}'::jsonb
FROM unnest(ARRAY['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']) AS m
ON CONFLICT DO NOTHING;
