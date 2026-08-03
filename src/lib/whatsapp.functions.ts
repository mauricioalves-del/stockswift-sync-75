import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarMensagemQueima, type MensagemQueimaInput } from "@/lib/whatsapp-message";

/**
 * Dispara a mensagem de queima de estoque no grupo de WhatsApp dos colaboradores.
 * Chamada HTTP genérica (bot próprio do cliente), no mesmo padrão do webhook do Slack.
 * Falha nunca bloqueia a criação da ação — TODO cenário deixa rastro em audit_logs:
 *   whatsapp_enviado | whatsapp_erro_conexao | whatsapp_nao_configurado | whatsapp_falha_interna
 */
export const notificarWhatsappColaboradores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MensagemQueimaInput) => {
    if (!input || typeof input.descricao !== "string") throw new Error("Dados inválidos");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const registrar = async (acao: string, payload: Record<string, unknown>) => {
      try {
        await supabaseAdmin.from("audit_logs").insert({
          usuario: context.userId,
          acao,
          entidade: "campanhas_lote",
          entidade_id: data.sku ?? null,
          payload: { sku: data.sku ?? null, lote: data.lote ?? null, ...payload },
        });
      } catch (e) {
        console.error("[whatsapp] falha ao gravar audit_logs", e);
      }
    };

    try {
      const { data: cfgs, error: cfgErr } = await supabaseAdmin
        .from("app_config")
        .select("chave, valor")
        .in("chave", ["whatsapp_bot_url", "whatsapp_bot_token", "whatsapp_grupo_nome"]);
      if (cfgErr) throw cfgErr;

      const get = (k: string) => {
        const v = (cfgs ?? []).find((c: any) => c.chave === k)?.valor;
        return typeof v === "string" ? v : v == null ? "" : String(v);
      };
      const url = get("whatsapp_bot_url").trim();
      const token = get("whatsapp_bot_token").trim();
      const grupo = get("whatsapp_grupo_nome").trim();

      const faltando = [
        !url && "whatsapp_bot_url",
        !grupo && "whatsapp_grupo_nome",
      ].filter(Boolean) as string[];

      if (faltando.length) {
        const motivo = `Integração de WhatsApp não configurada (${faltando.join(", ")}).`;
        await registrar("whatsapp_nao_configurado", { motivo, faltando });
        return { enviado: false, motivo };
      }

      const mensagem = montarMensagemQueima(data);
      const body = JSON.stringify({ groupName: grupo, message: mensagem });

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const resposta = (await res.text().catch(() => "")).slice(0, 500);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${resposta}`);
        await registrar("whatsapp_enviado", { url, grupo, status: res.status, resposta });
        return { enviado: true };
      } catch (err: any) {
        const motivo = String(err?.message ?? err);
        await registrar("whatsapp_erro_conexao", { url, grupo, erro: motivo });
        return { enviado: false, motivo };
      }
    } catch (err: any) {
      const motivo = String(err?.message ?? err);
      await registrar("whatsapp_falha_interna", { erro: motivo });
      return { enviado: false, motivo: `Falha interna: ${motivo}` };
    }
  });
