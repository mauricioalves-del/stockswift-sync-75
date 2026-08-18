// Notifica o Slack sobre uma nova solicitação de baixa.
// Chamada pelo frontend logo após criar a solicitação. Falha silenciosa
// para o usuário (registra o erro em solicitacoes_baixa.slack_erro e em audit_logs).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMOJI_MOTIVO: Record<string, string> = {
  VENCIMENTO: ":skull:",
  AVARIA: ":warning:",
  "PERCA/FURTO": ":rotating_light:",
  PERDA: ":rotating_light:",
  FURTO: ":rotating_light:",
  "DEGUSTAÇÃO": ":chocolate_bar:",
  DEGUSTACAO: ":chocolate_bar:",
  BRINDE: ":gift:",
  CONSUMO: ":inbox_tray:",
  QUALIDADE: ":warning:",
};

function emojiParaMotivo(m: string | null): string {
  if (!m) return ":inbox_tray:";
  return EMOJI_MOTIVO[m.toUpperCase().trim()] ?? ":inbox_tray:";
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatData(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { solicitacao_id } = await req.json();
    if (!solicitacao_id) {
      return new Response(JSON.stringify({ error: "solicitacao_id obrigatório" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Webhook
    const { data: cfg } = await admin
      .from("app_config").select("valor").eq("chave", "slack_webhook_baixas").maybeSingle();
    const webhook = typeof cfg?.valor === "string" ? cfg.valor : (cfg?.valor as any);
    if (!webhook) throw new Error("Webhook Slack não configurado");

    // Solicitação + motivo cabeçalho
    const { data: sol, error: solErr } = await admin
      .from("solicitacoes_baixa")
      .select("*, motivo:motivo_baixa(descricao)")
      .eq("id", solicitacao_id)
      .single();
    if (solErr || !sol) throw solErr ?? new Error("Solicitação não encontrada");

    // Itens
    const { data: itens, error: itErr } = await admin
      .from("baixa_operacional")
      .select("codigo_produto, descricao, unidade, lote, quantidade, custo_unitario, observacao, motivo:motivo_baixa(descricao)")
      .eq("solicitacao_id", solicitacao_id)
      .order("created_at", { ascending: true });
    if (itErr) throw itErr;
    if (!itens || itens.length === 0) throw new Error("Solicitação sem itens");

    // Detecta motivos mistos (planilha)
    const motivosDistintos = new Set(
      itens.map((i: any) => (i.motivo?.descricao ?? "").toUpperCase().trim()).filter(Boolean),
    );
    const motivosMistos = motivosDistintos.size > 1;
    const motivoCabecalho = motivosMistos
      ? "MISTO (ver itens)"
      : (sol.motivo?.descricao ?? [...motivosDistintos][0] ?? "—");
    const emojiCabecalho = motivosMistos ? ":inbox_tray:" : emojiParaMotivo(motivoCabecalho);

    // Custo por item / total
    let custoTotal = 0;
    let itensSemCusto = 0;
    const linhasItens = itens.map((i: any) => {
      const qtd = Number(i.quantidade ?? 0);
      const cu = Number(i.custo_unitario ?? 0);
      const custoItem = qtd * cu;
      const semCusto = cu <= 0;
      if (semCusto) itensSemCusto++;
      else custoTotal += custoItem;

      const motivoLinha = motivosMistos
        ? ` | Motivo: ${i.motivo?.descricao ?? "—"}`
        : "";
      const custoStr = semCusto ? "N/D" : `R$ ${formatBRL(custoItem)}`;
      const unidade = i.unidade ? `/${i.unidade}` : "";
      const lote = i.lote ?? "s/lote";
      const obsLinha = i.observacao?.trim() ? ` | Obs: ${i.observacao.trim()}` : "";
      return `• ${i.codigo_produto} - ${i.descricao}${unidade} - LT:${lote} | Qtd: ${qtd} | Custo: ${custoStr}${motivoLinha}${obsLinha}`;
    });

    const custoTotalStr = itensSemCusto > 0
      ? `R$ ${formatBRL(custoTotal)} _(parcial — ${itensSemCusto} item(ns) sem custo apurado)_`
      : `R$ ${formatBRL(custoTotal)}`;

    const solicitante = sol.solicitante_nome ?? "—";
    const setor = sol.id_local ?? "—";
    const observacao = sol.observacao?.trim() ? sol.observacao : "—";

    const texto = [
      `${emojiCabecalho} *NOVA SOLICITAÇÃO DE BAIXA*`,
      ``,
      `:page_facing_up: *ID:* ${sol.id}`,
      `:bust_in_silhouette: *Solicitante:* ${solicitante}`,
      `:factory: *Setor:* ${setor}`,
      `:warning: *Motivo:* ${motivoCabecalho}`,
      ``,
      `:package: *Itens:*`,
      ...linhasItens,
      ``,
      `:memo: *Observação:* ${observacao}`,
      ``,
      `:moneybag: *Custo Total:* ${custoTotalStr}`,
      ``,
      `:clock1: *Data:* ${formatData(sol.data_solicitacao)}`,
    ].join("\n");

    // JSON.stringify cuida do escaping (\ " \n)
    const payload = JSON.stringify({ text: texto });

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    if (!res.ok) {
      const body = await res.text();
      const errMsg = `HTTP ${res.status}: ${body.slice(0, 300)}`;
      await admin.from("solicitacoes_baixa")
        .update({ slack_erro: errMsg }).eq("id", solicitacao_id);
      await admin.from("audit_logs").insert({
        acao: "SLACK_BAIXA_FALHA", entidade: "solicitacoes_baixa",
        entidade_id: String(solicitacao_id), payload: { erro: errMsg },
      });
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    await admin.from("solicitacoes_baixa")
      .update({ slack_notificado_at: new Date().toISOString(), slack_erro: null })
      .eq("id", solicitacao_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notificar-baixa-slack", err);
    return new Response(JSON.stringify({ ok: false, error: err.message ?? String(err) }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
