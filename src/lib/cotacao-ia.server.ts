// Chamada server-only ao Lovable AI Gateway (Responses, saída estruturada) para a estimativa de mercado de frete.
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, NoObjectGeneratedError, Output, streamText, APICallError } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./ai/run-id.server";
import { ESQUEMA_IA, INSTRUCOES_IA, erroIA } from "./cotacao-ia";

export const MODELO_IA = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export async function estimarComIA(pedido: string, signal?: AbortSignal): Promise<{ bruto: unknown; runId?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Serviço de IA não configurado neste projeto.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: GATEWAY, apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runIdFetch.fetch });
  let falha: unknown = null;
  const result = streamText({
    model: provider.responses(MODELO_IA),
    instructions: INSTRUCOES_IA,
    messages: [{ role: "user", content: pedido }],
    output: Output.object({ schema: jsonSchema(ESQUEMA_IA as any) }),
    abortSignal: signal,
    onError: ({ error }) => { falha = error; },
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  try {
    const bruto = await result.output;
    return { bruto, runId: runIdFetch.getRunId() };
  } catch (e) {
    const err = falha ?? e;
    if (APICallError.isInstance(err)) {
      let msg: string | undefined; try { msg = JSON.parse(err.responseBody ?? "{}")?.message ?? JSON.parse(err.responseBody ?? "{}")?.error?.message; } catch { /* sem corpo */ }
      console.error("[cotacao-ia] gateway", err.statusCode, msg ?? err.message);
      throw new Error(erroIA(err.statusCode, msg));
    }
    if (NoObjectGeneratedError.isInstance(e)) { console.error("[cotacao-ia] resposta fora do formato", e.text?.slice(0, 300)); throw new Error("A IA respondeu fora do formato esperado. Tente gerar novamente."); }
    console.error("[cotacao-ia]", err);
    throw new Error(erroIA(undefined));
  }
}
