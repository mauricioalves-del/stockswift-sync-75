import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES_AUTORIZADAS = new Set(["ADMINISTRADOR", "GERENTE", "COORDENADOR_CONTROLE"]);

export const reprocessarFefoHoje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) throw new Error(rolesError.message);
    if (!(roles ?? []).some(({ role }) => ROLES_AUTORIZADAS.has(role))) {
      throw new Error("Acesso negado para reprocessar o Controle FEFO.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const { data, error } = await supabaseAdmin.rpc("processar_fefo", { _data: hoje });
    if (error) throw new Error(error.message);

    const resultado = Array.isArray(data) ? data[0] : data;
    return {
      dia: resultado?.dia ?? null,
      processados: Number(resultado?.processados ?? 0),
      quebras: Number(resultado?.quebras ?? 0),
    };
  });