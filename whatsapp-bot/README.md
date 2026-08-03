# Bot de WhatsApp (Selenium/ChromeDriver) — Desconto Colaborador / Shelf Life

Serviço **standalone** (não roda dentro do Lovable/backend) que mantém uma sessão logada no WhatsApp Web e expõe um endpoint HTTP para enviar mensagens a um grupo. O app chama esse endpoint sempre que uma ação **Desconto Colaborador** é gerada.

## Onde hospedar

Precisa de um servidor **sempre ligado, com Chrome instalado** — não pode ser função serverless, porque a sessão do navegador precisa persistir entre chamadas.

- VPS pequena (1 vCPU / 1–2 GB RAM basta): DigitalOcean, Hetzner, EC2, Contabo…
- Ou um computador dedicado da empresa ligado 24h.

## Instalação

```bash
npm install
cp .env.example .env
# edite o .env: BOT_AUTH_TOKEN forte  ->  openssl rand -hex 32
```

Instale também o Google Chrome no servidor. O `selenium-webdriver` (4.6+) baixa o ChromeDriver compatível automaticamente, mas o **navegador** precisa existir no sistema.

## Primeira execução (login)

```bash
HEADLESS=false npm start
```

Abre uma janela do Chrome com o WhatsApp Web — escaneie o QR Code com o **número dedicado da empresa** (não um número pessoal). A sessão fica salva em `CHROME_PROFILE_DIR`. Depois de logado uma vez:

```bash
HEADLESS=true npm start
```

## Manter sempre ligado

```bash
npm install -g pm2
pm2 start server.js --name whatsapp-bot
pm2 save
pm2 startup
```

## Segurança

- Nunca exponha a porta 3000 direto na internet. Use reverse proxy (Nginx/Caddy) com HTTPS (Let's Encrypt) e, se possível, restrinja por IP de origem.
- `BOT_AUTH_TOKEN` é a única proteção do endpoint — trate como senha. Nunca comitar no Git, nunca colocar no frontend.

## Uso

```bash
curl -X POST https://SEU_SERVIDOR/send-message \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "groupName": "Mágio: Geral Todos",
    "message": "🍇ATENÇÃO COLABORADORES🍇\n\n🔥SUPER QUEIMA DE ESTOQUE🔥\nConfira:\n\nBombom SF Açaí 10g 🍫\n -> De: R$ 8,50\n -> Por: R$ 3,40\n Estoque: 18\n Validade: 01/08/2026\n\nEstoque limitado!\nCorra antes que acabe! 🏃💨"
  }'
```

`groupName` precisa ser **exatamente** o nome do grupo como aparece no WhatsApp (a busca usa esse texto exato). Confira o nome real antes de configurar em **Configurações → WhatsApp → nome do grupo** no app.

Configuração no app (Configurações):
- `whatsapp_bot_url` → `https://SEU_SERVIDOR/send-message`
- `whatsapp_bot_token` → o mesmo `BOT_AUTH_TOKEN`
- `whatsapp_grupo_nome` → nome exato do grupo

## Verificar se está funcionando

```bash
curl https://SEU_SERVIDOR/health
# { "ready": true }
```

## Limitações e riscos conhecidos

- **A sessão pode cair sozinha.** Monitore `/health` (ex.: cron a cada 15 min) e alerte quando `ready: false`; relogue manualmente (`HEADLESS=false npm start`).
- **O WhatsApp muda o layout.** Se o bot parar de achar a busca ou a caixa de mensagem, ajuste `SELECTORS` no topo de `server.js`.
- **Risco de restrição da conta.** Automação não-oficial: use número dedicado, evite volume alto em pouco tempo e tenha plano B (envio manual).
