import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORIGEM_GERACAO = "Produção (PCP)";
const ALMOX_ORIGEM = "Alm_SP_Fabrica";
const ALMOX_DESTINO = "Alm_SP_Processo";
const ROLES_AUTORIZADAS = new Set(["ADMINISTRADOR", "COORDENADOR_CONTROLE", "GERENTE"]);

type ItemEntrada = {
  id_produto: string;
  descricao: string;
  unidade?: string | null;
  quantidade: number;
  custo_unitario?: number | null;
};

function formatData(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatQtd(n: number, um?: string | null): string {
  const s = Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return um ? `${s} ${um}` : s;
}

export const criarRequisicaoProducao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    produto_id: string;
    produto_nome: string;
    quantidade_planejada: number;
    observacao?: string | null;
    itens: ItemEntrada[];
  }) => {
    if (!input?.produto_id) throw new Error("Produto obrigatório.");
    if (!Array.isArray(input.itens) || input.itens.length === 0) {
      throw new Error("Nenhum item na solicitação.");
    }
    for (const it of input.itens) {
      if (!it.id_produto || !it.descricao) throw new Error("Item inválido.");
      if (!(Number(it.quantidade) > 0)) throw new Error(`Quantidade inválida para ${it.id_produto}.`);
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autorização (Admin, Coord Controle, Gerente)
    const { data: rolesData, error: rolesErr } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const roles = (rolesData ?? []).map((r) => r.role);
    if (!roles.some((r) => ROLES_AUTORIZADAS.has(r))) {
      throw new Error("Acesso negado. Apenas Administrador, Coordenador de Controle ou Gerente.");
    }

    // Perfil (nome amigável do solicitante)
    const { data: profile } = await supabase
      .from("profiles").select("nome, email").eq("id", userId).maybeSingle();
    const solicitante_nome = profile?.nome || profile?.email || "Usuário";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Numeração dedicada (Req_OP_N via sequence)
    const { data: numRow, error: numErr } = await (supabaseAdmin as any).rpc("proximo_numero_req_op");
    if (numErr || !numRow) throw new Error(numErr?.message ?? "Falha ao gerar número de requisição.");
    const numero = String(numRow);

    // Cabeçalho
    const { data: req, error: reqErr } = await (supabaseAdmin as any)
      .from("requisicoes")
      .insert({
        numero,
        origem_solicitante: ALMOX_DESTINO,
        origem_fornecedora: ALMOX_ORIGEM,
        solicitante: userId,
        tipo: "NORMAL",
        status: "ENVIADA",
        observacao: data.observacao ?? `Produção: ${data.produto_nome} (${data.produto_id}) — ${data.quantidade_planejada} un`,
        origem_geracao: ORIGEM_GERACAO,
      })
      .select("id, numero, created_at")
      .single();
    if (reqErr) throw new Error(reqErr.message);

    // Itens
    const payload = data.itens.map((i) => ({
      requisicao_id: req.id,
      id_produto: i.id_produto,
      descricao: i.descricao,
      unidade: i.unidade ?? "UN",
      quantidade_solicitada: i.quantidade,
      custo_unitario: i.custo_unitario ?? 0,
    }));
    const { error: itErr } = await (supabaseAdmin as any).from("requisicao_itens").insert(payload);
    if (itErr) throw new Error(itErr.message);

    // Notificação Slack (não bloqueia)
    try {
      const { data: cfg } = await (supabaseAdmin as any)
        .from("app_config").select("valor").eq("chave", "slack_webhook_requisicao_producao").maybeSingle();
      const webhook = typeof cfg?.valor === "string" ? cfg.valor : (cfg?.valor as any);
      if (webhook && typeof webhook === "string" && webhook.startsWith("http")) {
        const totalItens = data.itens.length;
        const somaQtd = data.itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
        const linhas = data.itens.map(
          (i) => `• ${i.descricao}\n   ↳ Qtd: ${formatQtd(Number(i.quantidade), i.unidade)}`
        ).join("\n");
        const texto = [
          "📦 *REQUISIÇÃO DE MATERIAL*",
          "----------------------------------------",
          `*ID:* ${numero}`,
          `*Data:* ${formatData(req.created_at)}`,
          `*Solicitante:* ${solicitante_nome}`,
          `*Setor:* Produção`,
          `*Total de Itens:* ${totalItens}`,
          `*Quantidade Total:* ${formatQtd(somaQtd)}`,
          "----------------------------------------",
          "*ITENS SOLICITADOS:*",
          linhas,
          "----------------------------------------",
          "📌 Status: *PENDENTE*",
        ].join("\n");
        const resp = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: texto }),
        });
        if (!resp.ok) throw new Error(`Slack HTTP ${resp.status}: ${await resp.text()}`);
      } else {
        throw new Error("Webhook Slack de Requisição de Produção não configurado.");
      }
    } catch (err: any) {
      console.warn("[criarRequisicaoProducao] falha ao notificar Slack:", err?.message ?? err);
      await (supabaseAdmin as any).from("audit_logs").insert({
        usuario: userId,
        acao: "SLACK_REQUISICAO_PRODUCAO_FALHOU",
        entidade: "requisicoes",
        entidade_id: req.id,
        payload: { erro: String(err?.message ?? err), numero },
      });
    }

    return { id: req.id as string, numero: req.numero as string };
  });
