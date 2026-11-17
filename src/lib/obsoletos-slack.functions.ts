import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { almoxDosItens, brl, chaveEnvio, dividir, indexarEnviosPorLote, mensagemWebhookObs, padraoPosicionamento, prazoPosicionamento, tabelaItensObs, tituloTrendObs, totalValor, type EnvioSlack, type Equipe, type ItemSlackObs } from "./obsoletos-slack";

const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";
const schema = z.object({
  observacao: z.string().trim().min(1).max(300),
  departamentoIds: z.array(z.string().uuid()).max(50),
  equipes: z.array(z.enum(["Comercial", "Produtos"])).min(1),
  // pessoas específicas marcadas na Trend, além dos responsáveis dos departamentos
  usuarioIds: z.array(z.string().uuid()).max(50).optional(),
  itens: z.array(z.object({ sku: z.string().max(40), lote: z.string().max(80), almoxarifado: z.string().max(120) })).min(1).max(1000),
  reenviar: z.boolean().optional(),
});
const temApi = () => !!process.env["LOVABLE_API_KEY"] && !!process.env["SLACK_API_KEY"];
async function slack(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/${method}`, { method: "POST", headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["SLACK_API_KEY"] ?? "", "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Slack ${method} [${res.status}]: ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt); if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`); return j;
}
const cfg = async (supabase: any, chave: string) => { const { data } = await supabase.from("app_config").select("valor").eq("chave", chave).maybeSingle(); return typeof data?.valor === "string" ? data.valor.trim() : ""; };

/**
 * Trend de Risco sem Giro: com o canal configurado (slack_canal_obsoletos) usa a API como no Risco de Shelf
 * (mensagem principal + fio com responsáveis, tabela e padrão de posicionamento); sem canal, usa o webhook
 * (slack_webhook_obsoletos) numa mensagem única.
 */
export const enviarObsoletosSlack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Mesmo modelo do Risco de Shelf: mensagem principal + detalhes como resposta no fio. Sem canal próprio, usa o canal do Shelf.
    const canal = (await cfg(supabase, "slack_canal_obsoletos")) || (await cfg(supabase, "slack_canal_shelf")), webhook = await cfg(supabase, "slack_webhook_obsoletos");
    const viaApi = !!canal && temApi();
    if (!viaApi && !webhook) throw new Error("Configure o canal ou o webhook do Slack para Obsoletos em Configurações.");

    // Relê os itens no servidor (valor e dias sem movimentação atuais)
    const skus = Array.from(new Set(data.itens.map((l) => l.sku)));
    const itens: ItemSlackObs[] = [];
    for (const parte of dividir(skus, 200)) {
      const { data: rows, error } = await (supabase as any).from("v_risco_obsoletos").select("id_produto, descricao, almoxarifado, lote, saldo, valor, dias_sem_mov, faixa").in("id_produto", parte).neq("faixa", "movimentado");
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        if (!data.itens.some((l) => l.sku === r.id_produto && (l.lote ?? "") === (r.lote ?? "") && l.almoxarifado === r.almoxarifado)) continue;
        itens.push({ sku: r.id_produto, descricao: r.descricao ?? r.id_produto, lote: r.lote ?? "", almoxarifado: r.almoxarifado ?? "", dias_sem_mov: r.dias_sem_mov, faixa: r.faixa, quantidade: Number(r.saldo) || 0, valor: Number(r.valor) || 0 });
      }
    }
    if (!itens.length) throw new Error("Nenhum dos itens selecionados está mais sem giro no sistema.");

    let jaEnviados = 0;
    if (!data.reenviar) {
      const { data: prev, error } = await (supabase as any).from("obsoletos_slack_envios").select("id, numero, link, created_at, observacao, lotes").is("erro", null);
      if (error) throw new Error(error.message);
      const idx = indexarEnviosPorLote((prev ?? []).map((p: any) => ({ ...p, lotes: (p.lotes ?? []).map((l: any) => ({ sku: l.sku, lote: l.lote, almoxarifado: l.almoxarifado })) })) as EnvioSlack[]);
      const antes = itens.length;
      for (let i = itens.length - 1; i >= 0; i--) if (idx.has(chaveEnvio(itens[i]))) itens.splice(i, 1);
      jaEnviados = antes - itens.length;
      if (!itens.length) throw new Error("Todos os itens selecionados já estão em uma Trend. Marque \"Reenviar\" para abrir outra.");
    }
    itens.sort((a, b) => b.valor - a.valor);

    // Responsáveis (mesmo cadastro de departamentos do Risco de Shelf)
    let deptNomes: string[] = [], emails: string[] = [];
    if (data.usuarioIds?.length) { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data: profs } = await supabaseAdmin.from("profiles").select("email").in("id", data.usuarioIds); emails.push(...((profs ?? []).map((p) => p.email).filter(Boolean) as string[])); }
    if (data.departamentoIds.length) {
      const { data: deps } = await supabase.from("shelf_slack_departamentos").select("id, nome").in("id", data.departamentoIds);
      deptNomes = (deps ?? []).map((d) => d.nome);
      const { data: resp } = await supabase.from("shelf_slack_responsaveis").select("user_id").in("departamento_id", data.departamentoIds);
      const ids = Array.from(new Set((resp ?? []).map((r) => r.user_id)));
      if (ids.length) { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data: profs } = await supabaseAdmin.from("profiles").select("email").in("id", ids); emails = Array.from(new Set([...emails, ...((profs ?? []).map((p) => p.email).filter(Boolean) as string[])])); }
    }
    const mencoes: string[] = [];
    for (const e of emails) { try { if (!temApi()) throw new Error(); const u = await slack(`users.lookupByEmail?email=${encodeURIComponent(e)}`, {}); mencoes.push(`<@${u.user.id}>`); } catch { mencoes.push(`*${e}*`); } }

    const almox = almoxDosItens(itens), total = totalValor(itens), prazo = prazoPosicionamento(itens), equipes = data.equipes as Equipe[];
    const { data: log } = await (supabase as any).from("obsoletos_slack_envios").insert({ enviado_por: userId, observacao: data.observacao, almox, departamentos: deptNomes, equipes, lotes: itens, valor_total: total, canal: viaApi ? canal : "webhook", prazo_posicionamento: prazo.data.toISOString().slice(0, 10) }).select("id, numero").single();
    try {
      const titulo = tituloTrendObs(data.observacao, almox, new Date(), log?.numero);
      let link: string | null = null, ts: string | null = null;
      if (viaApi) {
        const raiz = await slack("chat.postMessage", { channel: canal, text: titulo, unfurl_links: false });
        ts = raiz.ts; const ch = raiz.channel as string;
        const cab = `*Para posicionamento:* ${mencoes.length ? mencoes.join(" ") : "_sem responsáveis selecionados_"}\n` + (deptNomes.length ? `Departamentos: ${deptNomes.join(", ")}\n` : "") + `*${itens.length} item(ns) sem giro · Valor parado: ${brl(total)}*`;
        const partes = dividir(itens, 40);
        for (let i = 0; i < partes.length; i++) await slack("chat.postMessage", { channel: ch, thread_ts: ts, text: (i === 0 ? cab + "\n" : `_Continuação ${i + 1}/${partes.length}_\n`) + tabelaItensObs(partes[i]) });
        await slack("chat.postMessage", { channel: ch, thread_ts: ts, text: padraoPosicionamento(equipes, prazo) });
        try { const r = await slack(`chat.getPermalink?channel=${encodeURIComponent(ch)}&message_ts=${encodeURIComponent(ts!)}`, {}); link = r.permalink ?? null; } catch { /* opcional */ }
      } else {
        const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: mensagemWebhookObs({ titulo, mencoes, departamentos: deptNomes, itens, equipes, prazo }), unfurl_links: false }) });
        if (!res.ok) throw new Error(`Webhook do Slack [${res.status}]: ${(await res.text()).slice(0, 120)}`);
      }
      if (log) await (supabase as any).from("obsoletos_slack_envios").update({ thread_ts: ts, link, enviado_em: new Date().toISOString() }).eq("id", log.id);
      return { ok: true, numero: log?.numero ?? null, itens: itens.length, total, link, jaEnviados, via: viaApi ? "api" : "webhook", prazo: prazo.data.toISOString().slice(0, 10) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (log) await (supabase as any).from("obsoletos_slack_envios").update({ erro: msg }).eq("id", log.id);
      throw new Error(msg.includes("not_in_channel") ? "Sua conta do Slack não está no canal configurado." : msg.includes("channel_not_found") ? "Canal do Slack não encontrado. Confira em Configurações." : msg);
    }
  });
