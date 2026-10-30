import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { almoxDosLotes, brl, dividir, tabelaLotes, tituloTrend, totalCusto, type LoteSlack } from "./shelf-slack";

const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

const schema = z.object({
  observacao: z.string().trim().min(1).max(300),
  departamentoIds: z.array(z.string().uuid()).max(50),
  lotes: z.array(z.object({ sku: z.string().max(40), lote: z.string().max(80), almoxarifado: z.string().max(120) })).min(1).max(1000),
});

async function slack(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["SLACK_API_KEY"] ?? "",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Slack ${method} [${res.status}]: ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`);
  return j;
}

export const enviarRiscoShelfSlack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!process.env["LOVABLE_API_KEY"] || !process.env["SLACK_API_KEY"]) throw new Error("Slack não conectado.");

    const { data: cfg } = await supabase.from("app_config").select("valor").eq("chave", "slack_canal_shelf").maybeSingle();
    const canal = typeof cfg?.valor === "string" ? cfg.valor.trim() : "";
    if (!canal) throw new Error("Canal do Slack não configurado em Configurações.");

    // Relê os lotes no servidor
    const skus = Array.from(new Set(data.lotes.map((l) => l.sku)));
    const encontrados: LoteSlack[] = [];
    for (const parte of dividir(skus, 200)) {
      const { data: rows, error } = await supabase
        .from("estoque_sistemico")
        .select("id_produto, descricao, lote, origem, data_validade, quantidade, custo_unitario, custo_contabil")
        .in("id_produto", parte)
        .gt("quantidade", 0);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const alvo = data.lotes.find((l) => l.sku === r.id_produto && l.lote === r.lote && l.almoxarifado === r.origem);
        if (!alvo) continue;
        const custo = Number(r.custo_contabil ?? r.custo_unitario ?? 0);
        const ja = encontrados.find((e) => e.sku === r.id_produto && e.lote === r.lote && e.almoxarifado === r.origem);
        if (ja) { ja.quantidade += Number(r.quantidade); ja.custo_contabil += Number(r.quantidade) * custo; continue; }
        encontrados.push({
          sku: r.id_produto, descricao: r.descricao, lote: r.lote, almoxarifado: r.origem,
          data_validade: r.data_validade, quantidade: Number(r.quantidade), custo_contabil: Number(r.quantidade) * custo,
        });
      }
    }
    if (!encontrados.length) throw new Error("Nenhum dos lotes selecionados tem saldo no sistema.");
    encontrados.sort((a, b) => (a.data_validade ?? "9").localeCompare(b.data_validade ?? "9"));

    // Responsáveis
    let deptNomes: string[] = [];
    let emails: string[] = [];
    if (data.departamentoIds.length) {
      const { data: deps } = await supabase.from("shelf_slack_departamentos").select("id, nome").in("id", data.departamentoIds);
      deptNomes = (deps ?? []).map((d) => d.nome);
      const { data: resp } = await supabase.from("shelf_slack_responsaveis").select("user_id").in("departamento_id", data.departamentoIds);
      const ids = Array.from(new Set((resp ?? []).map((r) => r.user_id)));
      if (ids.length) {
        // Emails dos responsáveis cadastrados (lidos no servidor; o cadastro é restrito a gestores)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profs } = await supabaseAdmin.from("profiles").select("email").in("id", ids);
        emails = Array.from(new Set((profs ?? []).map((p) => p.email).filter(Boolean)));
      }
    }

    const almox = almoxDosLotes(encontrados);
    const total = totalCusto(encontrados);
    const { data: log } = await supabase.from("shelf_slack_envios").insert({
      enviado_por: userId, observacao: data.observacao, almox, departamentos: deptNomes,
      lotes: encontrados as never, valor_total: total, canal,
    }).select("id").single();

    try {
      const mencoes: string[] = [];
      for (const e of emails) {
        try {
          // users.lookupByEmail não aceita corpo JSON: envia o e-mail na URL
          const u = await slack(`users.lookupByEmail?email=${encodeURIComponent(e)}`, {});
          mencoes.push(`<@${u.user.id}>`);
        } catch { mencoes.push(`*${e}*`); }
      }
      const raiz = await slack("chat.postMessage", { channel: canal, text: tituloTrend(data.observacao, almox, new Date()), unfurl_links: false });
      const ts = raiz.ts as string;
      const ch = raiz.channel as string;
      const partes = dividir(encontrados, 40);
      const cabecalho = `*Para tratativa:* ${mencoes.length ? mencoes.join(" ") : "_sem responsáveis selecionados_"}\n` +
        (deptNomes.length ? `Departamentos: ${deptNomes.join(", ")}\n` : "") +
        `*${encontrados.length} lote(s) · Custo contábil total: ${brl(total)}*`;
      for (let i = 0; i < partes.length; i++) {
        const txt = (i === 0 ? cabecalho + "\n" : `_Continuação ${i + 1}/${partes.length}_\n`) + tabelaLotes(partes[i]);
        await slack("chat.postMessage", { channel: ch, thread_ts: ts, text: txt });
      }
      let link: string | null = null;
      try { link = (await slack("chat.getPermalink", { channel: ch, message_ts: ts })).permalink; } catch { /* opcional */ }
      if (log) await supabase.from("shelf_slack_envios").update({ thread_ts: ts, link }).eq("id", log.id);
      return { ok: true, lotes: encontrados.length, total, link, naoEncontrados: data.lotes.length - encontrados.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (log) await supabase.from("shelf_slack_envios").update({ erro: msg }).eq("id", log.id);
      const amigavel = msg.includes("not_in_channel") ? "Sua conta do Slack não está no canal configurado."
        : msg.includes("channel_not_found") ? "Canal do Slack não encontrado. Confira o nome/ID em Configurações." : msg;
      throw new Error(amigavel);
    }
  });
