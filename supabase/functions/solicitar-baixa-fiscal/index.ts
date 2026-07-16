// Edge Function: monta e envia por e-mail (Resend) a solicitação de Baixa Fiscal
// com todos os itens pendentes na fila de aprovação, agrupados por Almoxarifado
// e por Motivo. Restrito a Administrador. Registra em audit_logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_EMAIL = "Mauricio.alves@Magiochocolates.com.br";
const STATUS_FILA = ["PENDENTE", "ANALISE", "AJUSTE_SOLICITADO"];

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new Error("Não autenticado");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Identifica caller e valida role
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userRes.user) throw new Error("Não autenticado");
    const userId = userRes.user.id;

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "ADMINISTRADOR" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Apenas Administrador pode disparar esta ação" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Destinatários ativos
    const { data: dests, error: derr } = await admin
      .from("cadastro_emails")
      .select("email, nome_contato")
      .eq("finalidade", "Baixa Fiscal")
      .eq("ativo", true);
    if (derr) throw derr;
    if (!dests || dests.length === 0) throw new Error("Nenhum destinatário cadastrado para 'Baixa Fiscal'");

    // Itens da fila
    const { data: itens, error: ierr } = await admin
      .from("baixa_operacional")
      .select("id, codigo_produto, descricao, unidade, lote, quantidade, custo_unitario, valor_total, id_local, motivo:motivo_baixa(descricao)")
      .in("status_fluxo", STATUS_FILA)
      .order("id_local", { ascending: true })
      .order("created_at", { ascending: true });
    if (ierr) throw ierr;
    if (!itens || itens.length === 0) throw new Error("Não há itens pendentes na fila de aprovação");

    // Agrupa por almox -> motivo
    const porAlmox = new Map<string, any[]>();
    for (const it of itens) {
      const k = it.id_local ?? "—";
      if (!porAlmox.has(k)) porAlmox.set(k, []);
      porAlmox.get(k)!.push(it);
    }

    let totalGeral = 0;
    let semCustoGeral = 0;
    const dataHoje = new Date().toLocaleDateString("pt-BR");

    const seccoes: string[] = [];
    for (const [almox, lista] of porAlmox) {
      // agrupa por motivo mantendo ordem de aparição
      const porMotivo = new Map<string, any[]>();
      for (const it of lista) {
        const m = it.motivo?.descricao ?? "—";
        if (!porMotivo.has(m)) porMotivo.set(m, []);
        porMotivo.get(m)!.push(it);
      }

      let subtotal = 0;
      const linhas: string[] = [];
      for (const [motivo, its] of porMotivo) {
        linhas.push(
          `<tr style="background:#f3f4f6"><td colspan="7" style="padding:6px 8px;font-weight:600;font-size:12px;color:#374151">Motivo: ${esc(motivo)}</td></tr>`,
        );
        for (const it of its) {
          const qtd = Number(it.quantidade ?? 0);
          const cu = Number(it.custo_unitario ?? 0);
          const semCusto = cu <= 0;
          const custoLinha = semCusto ? 0 : (Number(it.valor_total ?? 0) || qtd * cu);
          if (semCusto) semCustoGeral++;
          else subtotal += custoLinha;

          linhas.push(`
            <tr>
              <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(it.codigo_produto)}</td>
              <td style="padding:6px 8px;font-size:12px">${esc(it.descricao)}</td>
              <td style="padding:6px 8px;font-family:monospace;font-size:12px">${esc(it.lote || "—")}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${qtd.toLocaleString("pt-BR")}${it.unidade ? " " + esc(it.unidade) : ""}</td>
              <td style="padding:6px 8px;font-size:12px">${esc(motivo)}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${semCusto ? "N/D" : "R$ " + formatBRL(cu)}</td>
              <td style="padding:6px 8px;font-size:12px;text-align:right">${semCusto ? "N/D" : "R$ " + formatBRL(custoLinha)}</td>
            </tr>`);
        }
      }
      totalGeral += subtotal;

      seccoes.push(`
        <h3 style="margin:20px 0 6px;font-size:14px;color:#111827">Almoxarifado: ${esc(almox)}</h3>
        <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#111827;color:#fff">
              <th style="padding:8px;font-size:12px;text-align:left">Código</th>
              <th style="padding:8px;font-size:12px;text-align:left">Descrição</th>
              <th style="padding:8px;font-size:12px;text-align:left">Lote</th>
              <th style="padding:8px;font-size:12px;text-align:right">Quantidade</th>
              <th style="padding:8px;font-size:12px;text-align:left">Motivo</th>
              <th style="padding:8px;font-size:12px;text-align:right">Custo Unit.</th>
              <th style="padding:8px;font-size:12px;text-align:right">Custo Total</th>
            </tr>
          </thead>
          <tbody>${linhas.join("")}</tbody>
          <tfoot>
            <tr style="background:#f9fafb">
              <td colspan="6" style="padding:8px;font-size:12px;font-weight:600;text-align:right">Subtotal ${esc(almox)}:</td>
              <td style="padding:8px;font-size:12px;font-weight:600;text-align:right">R$ ${formatBRL(subtotal)}</td>
            </tr>
          </tfoot>
        </table>`);
    }

    const rodapeSemCusto = semCustoGeral > 0
      ? `<p style="font-size:11px;color:#b45309;margin-top:8px"><em>* ${semCustoGeral} item(ns) sem custo apurado — exibidos como "N/D" e não somados ao total.</em></p>`
      : "";

    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;padding:16px;background:#ffffff">
      <h2 style="margin:0 0 4px">Solicitação de Baixa Fiscal — ${esc(dataHoje)}</h2>
      <p style="font-size:13px;color:#374151;margin:0 0 12px">
        Segue relação de itens pendentes de baixa fiscal, organizados por almoxarifado e motivo.
        Total de ${itens.length} item(ns) na fila de aprovação.
      </p>
      ${seccoes.join("")}
      <p style="margin-top:20px;font-size:14px;font-weight:700;color:#111827">
        Custo Total Geral: R$ ${formatBRL(totalGeral)}
      </p>
      ${rodapeSemCusto}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <p style="font-size:11px;color:#6b7280">Enviado automaticamente pelo Sistema de Baixas Operacionais.</p>
    </body></html>`;

    const toList = dests.map((d: any) => d.email);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: toList,
        subject: `Solicitação de Baixa Fiscal — ${dataHoje}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      const errMsg = `Resend HTTP ${resendRes.status}: ${body.slice(0, 400)}`;
      await admin.from("audit_logs").insert({
        usuario: userId, acao: "BAIXA_FISCAL_FALHA", entidade: "baixa_operacional",
        payload: { erro: errMsg, destinatarios: toList, qtd_itens: itens.length },
      });
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const resendJson = await resendRes.json().catch(() => ({}));

    await admin.from("audit_logs").insert({
      usuario: userId,
      acao: "BAIXA_FISCAL_ENVIADA",
      entidade: "baixa_operacional",
      payload: {
        destinatarios: toList,
        qtd_itens: itens.length,
        custo_total: totalGeral,
        itens_sem_custo: semCustoGeral,
        resend_id: resendJson?.id ?? null,
      },
    });

    return new Response(JSON.stringify({
      ok: true, qtd_itens: itens.length, destinatarios: toList, custo_total: totalGeral,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("solicitar-baixa-fiscal", err);
    return new Response(JSON.stringify({ ok: false, error: err.message ?? String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
