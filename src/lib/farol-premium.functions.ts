import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dispara manualmente o Farol Premium (mesmo envio do agendamento). Apenas gestores. */
export const enviarFarolPremiumAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: gestor } = await context.supabase.rpc("is_gestor", { _user_id: context.userId });
    if (!gestor) return { ok: false, error: "Apenas gestores podem forçar o envio." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await (supabaseAdmin as any)
      .from("app_config").select("valor").eq("chave", "farol_premium_cron_secret").maybeSingle();
    const secret = cfg?.valor ? String(cfg.valor).replace(/^"|"$/g, "") : "";
    if (!secret) return { ok: false, error: "Segredo do agendamento não configurado." };

    const url = `${process.env["SUPABASE_URL"]}/functions/v1/farol-premium-semanal`;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret, apikey: key },
      body: "{}",
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body?.ok === false) {
      return { ok: false, error: body?.error ?? `Falha no envio (HTTP ${r.status})` };
    }
    return { ok: true };
  });
