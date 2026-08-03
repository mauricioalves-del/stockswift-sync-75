/**
 * Bot de WhatsApp (Selenium/ChromeDriver) — Desconto Colaborador / Shelf Life
 *
 * Serviço standalone: mantém uma sessão logada no WhatsApp Web e expõe
 * POST /send-message  { groupName, message }  (Authorization: Bearer <BOT_AUTH_TOKEN>)
 * GET  /health        -> { ready: boolean }
 *
 * NÃO roda em serverless: a sessão do navegador precisa persistir entre chamadas.
 */

require("dotenv").config();

const express = require("express");
const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const PORT = Number(process.env.PORT || 3000);
const BOT_AUTH_TOKEN = process.env.BOT_AUTH_TOKEN || "";
const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR || "./.chrome-profile";
const HEADLESS = String(process.env.HEADLESS ?? "true").toLowerCase() !== "false";
const CHROME_BINARY = process.env.CHROME_BINARY || "";
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS || 120000);
const SEND_TIMEOUT_MS = Number(process.env.SEND_TIMEOUT_MS || 60000);

if (!BOT_AUTH_TOKEN || BOT_AUTH_TOKEN.length < 16) {
  console.error("[bot] BOT_AUTH_TOKEN ausente ou fraco. Gere com: openssl rand -hex 32");
  process.exit(1);
}

/**
 * Seletores do WhatsApp Web. O layout muda de tempos em tempos —
 * se o bot parar de achar a busca ou a caixa de mensagem, ajuste AQUI.
 */
const SELECTORS = {
  // Presença = sessão logada
  appReady: '#pane-side',
  // Caixa de busca de conversas
  searchBox: '//div[@contenteditable="true"][@data-tab="3"]',
  // Resultado de conversa pelo título exato
  chatByTitle: (title) => `//span[@title=${xpathLiteral(title)}]`,
  // Caixa de digitação da mensagem (footer)
  messageBox: '//footer//div[@contenteditable="true"]',
};

/** Escapa aspas para uso literal em XPath (nomes de grupo podem conter " ou '). */
function xpathLiteral(value) {
  const s = String(value);
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return "concat('" + s.split("'").join(`',"'",'`) + "')";
}

let driver = null;
let ready = false;
let starting = null;
/** Fila serial: o navegador é um recurso único, envios não podem se sobrepor. */
let queue = Promise.resolve();

function log(...args) {
  console.log(new Date().toISOString(), "[bot]", ...args);
}

async function buildDriver() {
  const options = new chrome.Options();
  options.addArguments(`--user-data-dir=${CHROME_PROFILE_DIR}`);
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--window-size=1280,900");
  options.addArguments(
    "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  );
  if (HEADLESS) options.addArguments("--headless=new");
  if (CHROME_BINARY) options.setChromeBinaryPath(CHROME_BINARY);

  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

async function start() {
  if (starting) return starting;
  starting = (async () => {
    log(`iniciando Chrome (headless=${HEADLESS}, perfil=${CHROME_PROFILE_DIR})`);
    driver = await buildDriver();
    await driver.get("https://web.whatsapp.com");

    if (!HEADLESS) {
      log("Se aparecer o QR Code, escaneie com o número dedicado da empresa.");
    }

    try {
      await driver.wait(until.elementLocated(By.css(SELECTORS.appReady)), READY_TIMEOUT_MS);
      ready = true;
      log("sessão do WhatsApp Web pronta");
    } catch (err) {
      ready = false;
      log("não foi possível confirmar login (QR Code pendente ou sessão caiu):", err.message);
    }
  })();

  try {
    await starting;
  } finally {
    starting = null;
  }
}

async function checkReady() {
  if (!driver) return false;
  try {
    const els = await driver.findElements(By.css(SELECTORS.appReady));
    ready = els.length > 0;
  } catch {
    ready = false;
  }
  return ready;
}

/** Restaura o navegador quando a sessão do Selenium morre. */
async function recover() {
  log("recuperando sessão do navegador...");
  ready = false;
  try {
    if (driver) await driver.quit();
  } catch {
    /* ignore */
  }
  driver = null;
  await start();
}

async function sendMessage(groupName, message) {
  if (!driver) await start();
  if (!(await checkReady())) {
    await recover();
    if (!(await checkReady())) {
      throw new Error("Sessão do WhatsApp Web não está logada (escaneie o QR Code novamente).");
    }
  }

  // 1) abre a busca e procura o grupo pelo nome exato
  const search = await driver.wait(
    until.elementLocated(By.xpath(SELECTORS.searchBox)),
    SEND_TIMEOUT_MS,
  );
  await search.click();
  await search.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
  await search.sendKeys(groupName);

  let chat;
  try {
    chat = await driver.wait(
      until.elementLocated(By.xpath(SELECTORS.chatByTitle(groupName))),
      15000,
    );
  } catch {
    await search.sendKeys(Key.ESCAPE);
    throw new Error(
      `Grupo "${groupName}" não encontrado. O nome precisa ser exatamente igual ao do WhatsApp.`,
    );
  }
  await chat.click();

  // 2) digita a mensagem preservando quebras de linha (Shift+Enter)
  const box = await driver.wait(
    until.elementLocated(By.xpath(SELECTORS.messageBox)),
    SEND_TIMEOUT_MS,
  );
  await box.click();

  const lines = String(message).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await box.sendKeys(lines[i]);
    if (i < lines.length - 1) await box.sendKeys(Key.chord(Key.SHIFT, Key.ENTER));
  }

  // 3) envia
  await box.sendKeys(Key.ENTER);
  log(`mensagem enviada para "${groupName}" (${lines.length} linhas)`);
  return true;
}

/** Enfileira o envio para garantir execução serial no navegador único. */
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", async (_req, res) => {
  res.json({ ready: await checkReady() });
});

app.post("/send-message", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== BOT_AUTH_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { groupName, message } = req.body || {};
  if (typeof groupName !== "string" || !groupName.trim()) {
    return res.status(400).json({ ok: false, error: "groupName obrigatório" });
  }
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ ok: false, error: "message obrigatório" });
  }

  try {
    await enqueue(() => sendMessage(groupName.trim(), message));
    res.json({ ok: true });
  } catch (err) {
    log("falha no envio:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  log(`HTTP ouvindo em http://127.0.0.1:${PORT}`);
  start().catch((e) => log("falha ao iniciar navegador:", e.message));
});

async function shutdown() {
  log("encerrando...");
  try {
    if (driver) await driver.quit();
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
