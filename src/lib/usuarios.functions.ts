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

const APP_ROLES = [
  "ADMINISTRADOR", "COORDENADOR_CONTROLE", "GERENTE", "DIRETOR_OPERACOES",
  "COORDENADOR_FINANCEIRO", "AUDITOR", "OPERADOR_ESTOQUE", "VENDEDOR",
  "INVENTARIANTE", "CONSULTA",
] as const;

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nome: string; email: string; senha: string; role: string; almoxes?: string[] }) => {
    if (!input?.nome?.trim()) throw new Error("Nome obrigatório");
    const email = (input.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido");
    if (!input?.senha || input.senha.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres");
    if (!(APP_ROLES as readonly string[]).includes(input.role)) throw new Error("Perfil inválido");
    return { nome: input.nome.trim(), email, senha: input.senha, role: input.role, almoxes: input.almoxes ?? [] };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    // Autorização: apenas ADMINISTRADOR ou COORDENADOR_CONTROLE
    const { data: rolesData, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesErr) throw new Error(rolesErr.message);
    const roles = (rolesData ?? []).map((r) => r.role);
    if (!roles.includes("ADMINISTRADOR") && !roles.includes("COORDENADOR_CONTROLE")) {
      throw new Error("Acesso negado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (cErr) throw new Error(cErr.message);
    const uid = created.user.id;

    async function desfazer() {
      await supabaseAdmin.from("usuario_almoxarifados").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
      await supabaseAdmin.auth.admin.deleteUser(uid);
    }

    // O gatilho handle_new_user já cria o profile; o upsert garante nome e aprovação
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, nome: data.nome, email: data.email, aprovado: true });
    if (pErr) { await desfazer(); throw new Error(pErr.message); }

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: data.role as (typeof APP_ROLES)[number] });
    if (rErr) { await desfazer(); throw new Error(rErr.message); }

    if (data.almoxes.length > 0) {
      const { error: aErr } = await supabaseAdmin
        .from("usuario_almoxarifados")
        .insert(data.almoxes.map((codigo_origem) => ({ user_id: uid, codigo_origem })));
      if (aErr) { await desfazer(); throw new Error(aErr.message); }
    }

    await supabaseAdmin.from("audit_logs").insert({
      usuario: callerId,
      acao: "CRIAR_USUARIO",
      entidade: "auth.users",
      entidade_id: uid,
      payload: { email: data.email, role: data.role, almoxes: data.almoxes },
    });

    return { ok: true, id: uid };
  });
