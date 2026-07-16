import { supabase } from "@/integrations/supabase/client";

export type BaixaItemInsert = {
  codigo_produto: string;
  descricao: string;
  unidade?: string | null;
  lote?: string | null;
  id_local: string;
  quantidade: number;
  custo_unitario: number;
  motivo_baixa_id: string | null;
  observacao?: string | null;
  foto_url?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  responsavel_nome?: string | null;
  data_ocorrencia?: string | null;
  origem_lancamento?: string;
};

export type NovaSolicitacaoInput = {
  id_local: string;
  motivo_baixa_id?: string | null;
  observacao?: string | null;
  origem_lancamento?: string;
  itens: BaixaItemInsert[];
};

/**
 * Cria uma solicitação de baixa (cabeçalho) + insere todos os itens
 * agrupados sob o mesmo solicitacao_id, e dispara a notificação Slack.
 * Falhas de notificação NÃO revertem a criação — são logadas no backend.
 */
export async function criarSolicitacaoBaixa(entrada: NovaSolicitacaoInput): Promise<{ id: number }> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Usuário não autenticado");

  // Nome amigável do solicitante
  const { data: profile } = await supabase
    .from("profiles").select("nome, email").eq("id", user.id).maybeSingle();
  const solicitante_nome = profile?.nome || profile?.email || user.email || user.id;

  // Se todos os itens têm o mesmo motivo, usa-o no cabeçalho (senão fica MISTO)
  const motivosUnicos = new Set(entrada.itens.map((i) => i.motivo_baixa_id).filter(Boolean));
  const motivoCabecalho = motivosUnicos.size === 1
    ? [...motivosUnicos][0] as string
    : (entrada.motivo_baixa_id ?? null);

  const { data: sol, error: solErr } = await (supabase as any)
    .from("solicitacoes_baixa")
    .insert({
      solicitante_id: user.id,
      solicitante_nome,
      id_local: entrada.id_local,
      motivo_baixa_id: motivoCabecalho,
      observacao: entrada.observacao ?? null,
      origem_lancamento: entrada.origem_lancamento ?? "MANUAL",
    })
    .select("id")
    .single();
  if (solErr) throw solErr;

  const payload = entrada.itens.map((i) => ({
    codigo_produto: i.codigo_produto,
    descricao: i.descricao,
    unidade: i.unidade ?? null,
    lote: i.lote ?? null,
    id_local: entrada.id_local,
    quantidade: i.quantidade,
    custo_unitario: i.custo_unitario,
    motivo_baixa_id: i.motivo_baixa_id,
    observacao: i.observacao ?? null,
    foto_url: i.foto_url ?? null,
    categoria: i.categoria ?? null,
    subcategoria: i.subcategoria ?? null,
    responsavel_nome: i.responsavel_nome ?? solicitante_nome,
    data_ocorrencia: i.data_ocorrencia ?? null,
    origem_lancamento: i.origem_lancamento ?? entrada.origem_lancamento ?? "MANUAL",
    solicitante_id: user.id,
    status_fluxo: "PENDENTE",
    solicitacao_id: sol.id,
  }));

  const { error: itErr } = await (supabase as any).from("baixa_operacional").insert(payload);
  if (itErr) throw itErr;

  // Notifica Slack (efeito colateral — não bloqueia)
  try {
    await supabase.functions.invoke("notificar-baixa-slack", {
      body: { solicitacao_id: sol.id },
    });
  } catch (err) {
    console.warn("[criarSolicitacaoBaixa] falha ao notificar Slack:", err);
  }

  return { id: sol.id as number };
}
