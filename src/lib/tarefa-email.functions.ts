import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notificarTarefaAtribuida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tarefaId: string }) => {
    if (!input?.tarefaId || typeof input.tarefaId !== "string") {
      throw new Error("tarefaId obrigatório");
    }
    return { tarefaId: input.tarefaId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enviarEmailTarefaAtribuida } = await import("@/lib/tarefa-email.server");
    return enviarEmailTarefaAtribuida(supabaseAdmin as any, {
      tarefaId: data.tarefaId,
      userId: context.userId,
    });
  });
