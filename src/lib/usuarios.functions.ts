import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string") {
      throw new Error("userId inválido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    if (data.userId === callerId) {
      throw new Error("Você não pode excluir seu próprio usuário.");
    }

    // Autorização: apenas ADMINISTRADOR ou COORDENADOR_CONTROLE
    const { data: rolesData, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesErr) throw new Error(rolesErr.message);
    const roles = (rolesData ?? []).map((r) => r.role);
    const autorizado = roles.includes("ADMINISTRADOR") || roles.includes("COORDENADOR_CONTROLE");
    if (!autorizado) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Limpa vínculos antes de excluir o auth user
    await supabaseAdmin.from("usuario_almoxarifados").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error(delErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      usuario: callerId,
      acao: "EXCLUIR_USUARIO",
      entidade: "auth.users",
      entidade_id: data.userId,
      payload: {},
    });

    return { ok: true };
  });
