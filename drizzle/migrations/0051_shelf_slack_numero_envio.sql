-- Risco de Shelf no Slack: numeração sequencial de cada envio (Trend), exibida no título da mensagem e na tela,
-- e índice para conferir rapidamente se um lote já foi enviado. Envios existentes recebem número na ordem de criação.
-- Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shelf_slack_envios' AND column_name = 'numero') THEN
    ALTER TABLE public.shelf_slack_envios ADD COLUMN numero bigint;
    CREATE SEQUENCE IF NOT EXISTS public.shelf_slack_envios_numero_seq OWNED BY public.shelf_slack_envios.numero;
    UPDATE public.shelf_slack_envios e SET numero = s.n
      FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM public.shelf_slack_envios) s
     WHERE s.id = e.id;
    PERFORM setval('public.shelf_slack_envios_numero_seq', coalesce((SELECT max(numero) FROM public.shelf_slack_envios), 0) + 1, false);
    ALTER TABLE public.shelf_slack_envios ALTER COLUMN numero SET DEFAULT nextval('public.shelf_slack_envios_numero_seq');
    ALTER TABLE public.shelf_slack_envios ALTER COLUMN numero SET NOT NULL;
  END IF;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.shelf_slack_envios_numero_seq TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS ux_shelf_slack_envios_numero ON public.shelf_slack_envios (numero);
CREATE INDEX IF NOT EXISTS ix_shelf_slack_envios_lotes ON public.shelf_slack_envios USING gin (lotes jsonb_path_ops);
