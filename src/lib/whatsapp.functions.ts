import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarMensagemQueima, type MensagemQueimaInput } from "@/lib/whatsapp-message";

/**
 * Dispara a mensagem de queima de estoque no grupo de WhatsApp dos colaboradores.
 * Chamada HTTP genérica (bot próprio do cliente), no mesmo padrão do webhook do Slack.
 * Falha nunca bloqueia a criação da ação — apenas registra em audit_logs.
 */
export const notificarWhatsappColaboradores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MensagemQueimaInput) => {
    if (!input || typeof input.descricao !== "string") throw new Error("Dados inválidos");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfgs } = await supabaseAdmin
      .from("app_config")
      .select("chave, valor")
      .in("chave", ["whatsapp_bot_url", "whatsapp_bot_token", "whatsapp_grupo_nome"]);

    const get = (k: string) => {
      const v = (cfgs ?? []).find((c: any) => c.chave === k)?.valor;
      return typeof v === "string" ? v : v == null ? "" : String(v);
    };
    const url = get("whatsapp_bot_url").trim();
    const token = get("whatsapp_bot_token").trim();
    const grupo = get("whatsapp_grupo_nome").trim();

    if (!url || !grupo) {
      return { enviado: false, motivo: "Integração de WhatsApp não configurada." };
    }

    const mensagem = montarMensagemQueima(data);

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ groupName: grupo, message: mensagem }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { enviado: true };
    } catch (err: any) {
      await supabaseAdmin.from("audit_logs").insert({
        usuario: context.userId,
        acao: "WHATSAPP_DESCONTO_COLABORADOR_ERRO",
        entidade: "campanhas_lote",
        entidade_id: data.sku ?? null,
        payload: {
          erro: String(err?.message ?? err),
          sku: data.sku ?? null,
          lote: data.lote ?? null,
        },
      });
      return { enviado: false, motivo: String(err?.message ?? err) };
    }
  });
