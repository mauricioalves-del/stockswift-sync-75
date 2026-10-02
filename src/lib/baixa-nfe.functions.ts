import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  ids: string[];
  userIds: string[];
  nfe: { numero?: string | null; serie?: string | null; chave?: string | null; data?: string | null; observacao?: string | null };
  mensagem?: string | null;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Envia e-mail aos usuários escolhidos informando a Baixa Fiscal concluída com dados da NF-e. */
export const notificarBaixaNfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!Array.isArray(input?.ids) || input.ids.length === 0) throw new Error("ids obrigatórios");
    if (!Array.isArray(input?.userIds) || input.userIds.length === 0) throw new Error("Selecione ao menos um usuário");
    if (input.userIds.length > 100 || input.ids.length > 2000) throw new Error("Lista muito grande");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "ADMINISTRADOR" as any });
    if (!isAdmin) throw new Error("Apenas Administradores podem notificar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildRawEmail, sendViaGmail } = await import("@/lib/baixa-email.server");
    const admin = supabaseAdmin as any;

    const { data: perfis } = await admin.from("profiles").select("email").in("id", data.userIds);
    const to = ((perfis ?? []) as any[]).map((p) => p.email).filter(Boolean) as string[];
    if (to.length === 0) return { ok: false, error: "Usuários selecionados sem e-mail" };

    const { data: itens } = await admin
      .from("baixa_operacional")
      .select("codigo_produto, descricao, lote, quantidade, unidade, valor_total, solicitacao_id, id_local")
      .in("id", data.ids);
    const lista = (itens ?? []) as any[];
    const total = lista.reduce((s, b) => s + Number(b.valor_total ?? 0), 0);
    const reqs = Array.from(new Set(lista.map((b) => b.solicitacao_id).filter(Boolean)));
    const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const { data: cfgFrom } = await admin.from("app_config").select("valor").eq("chave", "resend_from").maybeSingle();
    const from = cfgFrom?.valor ? String(cfgFrom.valor).replace(/^"|"$/g, "") : null;
    const n = data.nfe;
    const dataNf = n.data ? new Date(`${n.data}T00:00:00`).toLocaleDateString("pt-BR") : "—";

    const linhas = lista.slice(0, 100).map((b) =>
      `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(b.codigo_produto)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(b.descricao)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(b.lote ?? "")}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${esc(b.quantidade)} ${esc(b.unidade ?? "")}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">R$ ${fmt(Number(b.valor_total ?? 0))}</td></tr>`).join("");

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px">
<h2 style="margin:0 0 8px">Baixa Fiscal concluída</h2>
<p style="margin:0 0 12px">Requisição(ões): ${esc(reqs.map((r) => "#" + r).join(", ") || "—")} — ${lista.length} item(ns), R$ ${fmt(total)}</p>
<table style="font-size:13px;margin-bottom:12px">
<tr><td style="color:#6b7280;padding-right:12px">NF-e</td><td><b>${esc(n.numero || "—")}</b>${n.serie ? " / série " + esc(n.serie) : ""}</td></tr>
<tr><td style="color:#6b7280;padding-right:12px">Data de emissão</td><td>${esc(dataNf)}</td></tr>
${n.chave ? `<tr><td style="color:#6b7280;padding-right:12px">Chave de acesso</td><td>${esc(n.chave)}</td></tr>` : ""}
${n.observacao ? `<tr><td style="color:#6b7280;padding-right:12px">Observação</td><td>${esc(n.observacao)}</td></tr>` : ""}
</table>
${data.mensagem ? `<p style="padding:10px;background:#f9fafb;border-radius:6px">${esc(data.mensagem)}</p>` : ""}
<table style="border-collapse:collapse;font-size:12px;width:100%"><tr style="background:#f3f4f6"><th align="left" style="padding:4px 8px">Código</th><th align="left" style="padding:4px 8px">Descrição</th><th align="left" style="padding:4px 8px">Lote</th><th align="right" style="padding:4px 8px">Qtd</th><th align="right" style="padding:4px 8px">Valor</th></tr>${linhas}</table>
</body></html>`;

    const raw = buildRawEmail({ from, to, subject: `Baixa Fiscal concluída — NF-e ${n.numero || "s/n"}`, html } as any);
    const r: any = await sendViaGmail(raw);
    await admin.from("audit_logs").insert({
      usuario: userId, acao: r?.ok ? "BAIXA_NFE_NOTIFICADA" : "BAIXA_NFE_NOTIFICACAO_FALHA",
      entidade: "baixa_operacional", payload: { ids: data.ids, destinatarios: to, nfe: n },
    });
    if (!r?.ok) return { ok: false, error: `Falha no envio (${r?.status ?? ""})` };
    return { ok: true, destinatarios: to.length };
  });
