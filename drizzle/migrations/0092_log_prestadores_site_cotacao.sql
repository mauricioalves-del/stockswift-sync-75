-- Link do site oficial de cotação por prestador (ícone nas cotações de transporte; editável em Cadastros).
ALTER TABLE public.log_prestadores ADD COLUMN IF NOT EXISTS site_cotacao text;
UPDATE public.log_prestadores SET site_cotacao = x.url FROM (VALUES
  ('melhor envio', 'https://melhorenvio.com.br/'), ('jamef', 'https://www.jamef.com.br/'), ('braspress', 'https://www.braspress.com/'),
  ('latam', 'https://www.latamcargo.com/'), ('azul', 'https://www.azulcargoexpress.com.br/'), ('gol', 'https://www.gollog.com.br/'),
  ('lalamove', 'https://www.lalamove.com/pt-br/')) AS x(chave, url)
WHERE site_cotacao IS NULL AND lower(nome) LIKE '%' || x.chave || '%';
