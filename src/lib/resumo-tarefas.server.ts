// Server-only: resumo periódico (Seg/Qui 12:00) de tarefas pendentes por responsável.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRawEmail, sendViaGmail } from "@/lib/baixa-email.server";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const STATUS_ABERTOS = ["Pendente", "EmAndamento", "Atrasada"];

export async function enviarResumoTarefas(admin: SupabaseClient<any>) {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: tarefas, error } = await admin
    .from("tarefas_operacionais")
    .select("id, titulo, descricao, prioridade, data_prevista, responsavel_id, sku_ou_local, created_at")
    .in("status", STATUS_ABERTOS)
    .not("responsavel_id", "is", null)
    .order("data_prevista", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);

  const lista = (tarefas ?? []) as any[];
  if (lista.length === 0) return { ok: true, enviados: 0, tarefas: 0 };

  const ids = [...new Set(lista.map((t) => t.responsavel_id))];
  const { data: perfis } = await admin.from("profiles").select("id, nome, email").in("id", ids);
  const porId = new Map<string, any>(((perfis ?? []) as any[]).map((p) => [p.id, p]));

  const { data: cfgFrom } = await admin
    .from("app_config").select("valor").eq("chave", "resend_from").maybeSingle();
  const from = (cfgFrom as any)?.valor ? String((cfgFrom as any).valor).replace(/^"|"$/g, "") : null;

  let enviados = 0;
  const falhas: string[] = [];

  for (const uid of ids) {
    const perfil = porId.get(uid as string);
    const email = perfil?.email as string | undefined;
    if (!email) continue;

    const doUsuario = lista.filter((t) => t.responsavel_id === uid);
    const atrasadas = doUsuario.filter((t) => t.data_prevista && t.data_prevista < hoje);

    const linhas = doUsuario.map((t) => `
      <tr>
        <td style="padding:6px 8px;font-size:12px">${esc(t.titulo)}</td>
        <td style="padding:6px 8px;font-size:12px">${esc(t.sku_ou_local || "—")}</td>
        <td style="padding:6px 8px;font-size:12px">${esc(t.prioridade || "—")}</td>
        <td style="padding:6px 8px;font-size:12px;${t.data_prevista && t.data_prevista < hoje ? "color:#b91c1c;font-weight:700" : ""}">
          ${t.data_prevista ? new Date(`${String(t.data_prevista).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
        </td>
      </tr>`).join("");

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
      <h2 style="margin:0 0 8px">Resumo de tarefas pendentes</h2>
      <p style="font-size:13px;color:#374151;margin:0 0 12px">
        Olá${perfil?.nome ? `, ${esc(perfil.nome)}` : ""}. Você tem <b>${doUsuario.length}</b> tarefa(s) em aberto${atrasadas.length ? ` — <b style="color:#b91c1c">${atrasadas.length} atrasada(s)</b>` : ""}.
      </p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
        <thead><tr style="background:#111827;color:#fff">
          <th style="padding:8px;font-size:12px;text-align:left">Tarefa</th>
          <th style="padding:8px;font-size:12px;text-align:left">Referência</th>
          <th style="padding:8px;font-size:12px;text-align:left">Prioridade</th>
          <th style="padding:8px;font-size:12px;text-align:left">Prazo</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="font-size:12px;color:#6b7280;margin:12px 0 0">Acesse "Minhas Tarefas" no sistema para concluir suas pendências.</p>
    </body></html>`;

    const r = await sendViaGmail(buildRawEmail({
      from, to: [email],
      subject: `Resumo de tarefas pendentes (${doUsuario.length})`,
      html,
    }));
    if (r.ok) enviados++;
    else falhas.push(`${email}: ${r.status}`);
  }

  await admin.from("audit_logs").insert({
    acao: falhas.length ? "RESUMO_TAREFAS_PARCIAL" : "RESUMO_TAREFAS_ENVIADO",
    entidade: "tarefas_operacionais",
    payload: { enviados, tarefas: lista.length, falhas },
  });

  return { ok: true, enviados, tarefas: lista.length, falhas };
}
