insert into app_config (chave, valor) values
 ('whatsapp_bot_url', to_jsonb('https://webhook.site/b223bca3-cb15-450e-87c2-30877af6f993'::text)),
 ('whatsapp_grupo_nome', to_jsonb('Colaboradores'::text)),
 ('whatsapp_bot_token', to_jsonb(''::text))
on conflict (chave) do update set valor = excluded.valor;