import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notificarAprovacaoBaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoId: string | number; documentoPath?: string | null }) => {
    if (input?.solicitacaoId === undefined || input?.solicitacaoId === null) {
      throw new Error("solicitacaoId obrigatório");
    }
    return { solicitacaoId: input.solicitacaoId, documentoPath: input.documentoPath ?? null };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enviarEmailAprovacao } = await import("@/lib/baixa-email.server");
    return enviarEmailAprovacao(supabaseAdmin as any, {
      solicitacaoId: data.solicitacaoId,
      documentoPath: data.documentoPath,
      userId,
    });
  });
