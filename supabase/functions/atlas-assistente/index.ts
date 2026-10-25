// Edge Function: Assistente Atlas (assistente_ia.py do Atlas, agora no Stock Savvy).
// Recebe a pergunta + o "retrato" do estado atual montado no navegador do próprio usuário (com as permissões
// dele) e pede à IA uma resposta curta, em português falado, usando SOMENTE os números do retrato.
// A IA nunca consulta o banco. Exige usuário logado (verify_jwt padrão).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELO = "google/gemini-2.5-flash";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const chave = Deno.env.get("LOVABLE_API_KEY");
  if (!chave) return json({ erro: "IA não configurada (LOVABLE_API_KEY ausente)." }, 503);

  let corpo: { pergunta?: string; contexto?: unknown; instrucao?: string | null; rotulo?: string | null; modulos?: { modulo: string; conteudo: string }[] };
  try { corpo = await req.json(); } catch { return json({ erro: "Corpo inválido." }, 400); }
  const pergunta = String(corpo.pergunta ?? "").trim().slice(0, 500);
  if (!pergunta) return json({ erro: "Pergunta vazia." }, 400);
  const retrato = JSON.stringify(corpo.contexto ?? {}, null, 2).slice(0, 40000);
  const modulos = (corpo.modulos ?? []).slice(0, 40).map((m) => `- ${m.modulo}: ${m.conteudo}`).join("\n");
  const instrucao = corpo.instrucao ? `\nEssa pergunta foi reconhecida como uma pergunta padrão do tipo "${corpo.rotulo ?? ""}" - siga esta orientação específica pra responder: ${String(corpo.instrucao).slice(0, 2000)}\n` : "";

  const prompt = `Você é o assistente de voz do Atlas, o sistema de inteligência de estoque da Magio Chocolates.
Alguém acabou de te fazer esta pergunta, falando em voz alta: "${pergunta}"

Responda em português do Brasil, em texto corrido (SEM markdown, SEM listas com
marcadores, SEM emojis, SEM títulos) - a resposta vai ser lida em voz alta por um
sintetizador de fala, então frases curtas e diretas funcionam muito melhor que
parágrafos longos. No máximo 5 frases.

Use SOMENTE os números do retrato abaixo - nunca invente um dado que não esteja
aqui. Se a pergunta pedir algo que não está neste retrato (ex: um SKU específico,
ou um período diferente de hoje), diga isso claramente e indique em qual módulo da
lista abaixo a pessoa provavelmente encontra essa informação, em vez de arriscar
um palpite.
${instrucao}
Retrato atual do Atlas:
${retrato}

Módulos disponíveis (use pra orientar perguntas do tipo "onde encontro X"):
${modulos}`;

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.3, messages: [{ role: "user", content: prompt }] }),
  });
  if (r.status === 429) return json({ erro: "Muitas perguntas seguidas. Tente de novo em instantes." }, 429);
  if (r.status === 402) return json({ erro: "Créditos de IA do workspace esgotados." }, 402);
  if (!r.ok) return json({ erro: `A IA não respondeu (${r.status}).` }, 502);
  const dados = await r.json();
  const resposta = String(dados?.choices?.[0]?.message?.content ?? "").trim();
  if (!resposta) return json({ erro: "A IA respondeu vazio." }, 502);
  return json({ resposta });
});
