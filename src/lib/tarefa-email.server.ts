// Server-only: e-mail de notificação de tarefa atribuída a um usuário.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRawEmail, sendViaGmail } from "@/lib/baixa-email.server";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function enviarEmailTarefaAtribuida(
  admin: SupabaseClient<any>,
  args: { tarefaId: string; userId: string },
) {
  const { data: tarefa } = await admin
    .from("tarefas_operacionais")
    .select("id, titulo, descricao, prioridade, data_prevista, responsavel_id, sku_ou_local, observacao, link_rota")
    .eq("id", args.tarefaId)
    .maybeSingle();

  if (!tarefa) return { ok: false, code: "NOT_FOUND", error: "Tarefa não encontrada" };
  if (!(tarefa as any).responsavel_id) return { ok: false, code: "NO_RESPONSAVEL", error: "Tarefa sem responsável" };

  const { data: perfil } = await admin
    .from("profiles").select("nome, email").eq("id", (tarefa as any).responsavel_id).maybeSingle();
  const email = (perfil as any)?.email as string | undefined;
  if (!email) return { ok: false, code: "NO_EMAIL", error: "Responsável sem e-mail cadastrado" };

  const { data: cfgFrom } = await admin
    .from("app_config").select("valor").eq("chave", "resend_from").maybeSingle();
  const from = (cfgFrom as any)?.valor ? String((cfgFrom as any).valor).replace(/^"|"$/g, "") : null;

  const prazo = (tarefa as any).data_prevista
    ? new Date(`${String((tarefa as any).data_prevista).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")
    : "—";

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
    <h2 style="margin:0 0 8px">Nova tarefa atribuída a você</h2>
    <p style="font-size:13px;color:#374151;margin:0 0 12px">Olá${(perfil as any)?.nome ? `, ${esc((perfil as any).nome)}` : ""}. Uma nova pendência foi criada no Controle Operacional.</p>
    <table style="border-collapse:collapse;border:1px solid #e5e7eb;width:100%">
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb;width:160px">Tarefa</td><td style="padding:8px;font-size:13px"><strong>${esc((tarefa as any).titulo)}</strong></td></tr>
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb">Descrição</td><td style="padding:8px;font-size:13px">${esc((tarefa as any).descricao || "—")}</td></tr>
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb">Prioridade</td><td style="padding:8px;font-size:13px">${esc((tarefa as any).prioridade || "—")}</td></tr>
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb">Prazo</td><td style="padding:8px;font-size:13px">${prazo}</td></tr>
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb">Referência</td><td style="padding:8px;font-size:13px">${esc((tarefa as any).sku_ou_local || "—")}</td></tr>
      <tr><td style="padding:8px;font-size:12px;background:#f9fafb">Observação</td><td style="padding:8px;font-size:13px;white-space:pre-wrap">${esc((tarefa as any).observacao || "—")}</td></tr>
    </table>
    ${(tarefa as any).link_rota
      ? `<p style="margin:16px 0 0"><a href="${esc(baseUrl)}${esc((tarefa as any).link_rota)}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:13px">Abrir item vinculado</a></p>`
      : ""}
    <p style="font-size:12px;color:#6b7280;margin:12px 0 0">Acesse "Minhas Tarefas" no sistema para concluir esta pendência.</p>
  </body></html>`;

  const r = await sendViaGmail(buildRawEmail({
    from,
    to: [email],
    subject: `Nova tarefa atribuída: ${(tarefa as any).titulo}`,
    html,
  }));

  await admin.from("audit_logs").insert({
    usuario: args.userId,
    acao: r.ok ? "TAREFA_EMAIL_ENVIADO" : "TAREFA_EMAIL_FALHA",
    entidade: "tarefas_operacionais",
    entidade_id: String(args.tarefaId),
    payload: { destinatario: email, erro: r.ok ? null : `${r.status}: ${r.body.slice(0, 400)}` },
  });

  if (!r.ok) return { ok: false, code: "GMAIL_ERROR", error: `Gmail HTTP ${r.status}` };
  return { ok: true, destinatario: email };
}
