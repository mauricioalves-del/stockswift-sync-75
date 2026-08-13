import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatNum } from "@/lib/inventory";
import { notificarAprovacaoBaixa } from "@/lib/baixa-email.functions";

export type Etapa = "DIRETOR_OPERACOES" | "COORDENADOR_FINANCEIRO";

export const ETAPA_LABEL: Record<Etapa, string> = {
  DIRETOR_OPERACOES: "Diretor de Operações",
  COORDENADOR_FINANCEIRO: "Coordenador Financeiro",
};

export const CAMPO_POR = {
  DIRETOR_OPERACOES: "aprovado_diretor_operacoes_por",
  COORDENADOR_FINANCEIRO: "aprovado_coordenador_financeiro_por",
} as const;

export const CAMPO_EM = {
  DIRETOR_OPERACOES: "aprovado_diretor_operacoes_em",
  COORDENADOR_FINANCEIRO: "aprovado_coordenador_financeiro_em",
} as const;

export type StatusAprovacao = "PENDENTE" | "PARCIAL" | "AGUARDANDO_ADMIN" | "APROVADA" | "REPROVADA";

export const STATUS_APROVACAO_LABEL: Record<StatusAprovacao, string> = {
  PENDENTE: "Pendente",
  PARCIAL: "Aprovação Parcial",
  AGUARDANDO_ADMIN: "Aguardando Administrador",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
};

export const STATUS_APROVACAO_TONE: Record<StatusAprovacao, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-warning/20 text-warning-foreground",
  AGUARDANDO_ADMIN: "bg-primary/15 text-primary",
  APROVADA: "bg-success/15 text-success",
  REPROVADA: "bg-destructive/15 text-destructive",
};

/** Status derivado a partir das duas assinaturas. */
export function statusAprovacao(b: any): StatusAprovacao {
  if (b?.status_fluxo === "REPROVADA") return "REPROVADA";
  const dir = !!b?.aprovado_diretor_operacoes_por;
  const fin = !!b?.aprovado_coordenador_financeiro_por;
  if (dir && fin) {
    return b?.status_fluxo === "AGUARDANDO_ADMIN" ? "AGUARDANDO_ADMIN" : "APROVADA";
  }
  if (dir || fin) return "PARCIAL";
  // registros legados aprovados antes da dupla assinatura
  if (b?.status_fluxo === "APROVADA" || b?.status_fluxo === "EXECUTADA") return "APROVADA";
  return "PENDENTE";
}

/** Assinaturas concluídas, aguardando a aprovação final do Administrador. */
export function aguardandoAdmin(b: any): boolean {
  return b?.status_fluxo === "AGUARDANDO_ADMIN";
}

export function assinaturaFeita(b: any, etapa: Etapa): boolean {
  return !!b?.[CAMPO_POR[etapa]];
}


/** Etapa que o usuário atual pode assinar nesta linha, ou null. */
export function etapaDisponivel(
  b: any,
  opts: { etapas: Etapa[]; isAdmin: boolean },
): Etapa | null {
  if (statusAprovacao(b) === "REPROVADA") return null;
  const candidatas: Etapa[] = opts.etapas.length
    ? opts.etapas
    : opts.isAdmin
      ? ["DIRETOR_OPERACOES", "COORDENADOR_FINANCEIRO"]
      : [];
  for (const e of candidatas) if (!assinaturaFeita(b, e)) return e;
  return null;
}

async function nomeDe(userId: string | null | undefined): Promise<string> {
  if (!userId) return "—";
  const { data } = await (supabase as any)
    .from("profiles").select("nome, email").eq("id", userId).maybeSingle();
  return data?.nome || data?.email || userId;
}

function dataHora(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

/**
 * Gera o PDF de aprovação de uma requisição (todas as linhas já Aprovadas),
 * salva no Storage e grava o caminho em documento_baixa_url das linhas.
 * Retorna o caminho do arquivo ou null quando não há o que documentar.
 */
export async function gerarDocumentoAprovacao(solicitacaoId: number | string): Promise<string | null> {
  const { data: linhas, error } = await (supabase as any)
    .from("baixa_operacional")
    .select("*, motivo:motivo_baixa(descricao)")
    .eq("solicitacao_id", solicitacaoId);
  if (error) throw error;

  const aprovadas = (linhas ?? []).filter((b: any) => {
    const s = statusAprovacao(b);
    return s === "APROVADA" || s === "AGUARDANDO_ADMIN";
  });

  if (aprovadas.length === 0) return null;

  const ref = aprovadas[0];
  const nomeDir = await nomeDe(ref.aprovado_diretor_operacoes_por);
  const nomeFin = await nomeDe(ref.aprovado_coordenador_financeiro_por);

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Documento de Aprovação de Baixa Operacional — Req #${solicitacaoId}`, 40, 40);
  doc.setFontSize(9);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 40, 56);

  const total = aprovadas.reduce((s: number, b: any) => s + Number(b.valor_total ?? 0), 0);

  autoTable(doc, {
    startY: 72,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [17, 24, 39] },
    head: [["Código", "Descrição", "Lote", "Quantidade", "Valor", "Motivo", "Almoxarifado"]],
    body: aprovadas.map((b: any) => [
      String(b.codigo_produto ?? ""),
      String(b.descricao ?? ""),
      String(b.lote ?? "—"),
      formatNum(Number(b.quantidade ?? 0)),
      formatBRL(Number(b.valor_total ?? 0)),
      String(b.motivo?.descricao ?? "—"),
      String(b.id_local ?? "—"),
    ]),
  });

  let y = (doc as any).lastAutoTable.finalY + 24;
  doc.setFontSize(11);
  doc.text(`Valor Total da Baixa: ${formatBRL(total)}`, 40, y);

  y += 32;
  doc.setFontSize(10);
  doc.text("Assinaturas", 40, y);
  y += 8;
  doc.setLineWidth(0.5);
  doc.line(40, y, 800, y);
  y += 22;
  doc.setFontSize(9);
  doc.text(`Nome: ${nomeDir}`, 40, y);
  doc.text("Cargo: Diretor de Operações", 300, y);
  doc.text(`Data/Hora: ${dataHora(ref.aprovado_diretor_operacoes_em)}`, 560, y);
  y += 24;
  doc.text(`Nome: ${nomeFin}`, 40, y);
  doc.text("Cargo: Coordenador Financeiro", 300, y);
  doc.text(`Data/Hora: ${dataHora(ref.aprovado_coordenador_financeiro_em)}`, 560, y);

  const blob = doc.output("blob") as Blob;
  const path = `req-${solicitacaoId}/aprovacao-${Date.now()}.pdf`;
  const up = await supabase.storage
    .from("documentos-baixa")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;

  await (supabase as any)
    .from("baixa_operacional")
    .update({ documento_baixa_url: path })
    .in("id", aprovadas.map((b: any) => b.id));

  return path;
}

/** URL temporária para abrir/baixar o documento de aprovação. */
export async function urlDocumento(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("documentos-baixa")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** URL temporária para visualizar a foto anexada à baixa. */
export async function urlFoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Compatibilidade: alguns registros antigos guardam a URL completa.
  if (/^https?:\/\//i.test(path)) return path;
  const limpo = path.replace(/^baixas-fotos\//, "");
  const { data, error } = await supabase.storage
    .from("baixas-fotos")
    .createSignedUrl(limpo, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Registra a assinatura de uma etapa em um conjunto de linhas.
 * Quando as duas assinaturas se completam para uma requisição, gera o
 * documento e dispara o e-mail automático (falhas não bloqueiam a aprovação).
 */
export async function assinarBaixas(
  itens: any[],
  etapa: Etapa,
  opts: { userId: string; comoAdmin: boolean; comentario?: string | null },
): Promise<{ assinadas: number; requisicoesConcluidas: (number | string)[] }> {
  const alvos = itens.filter((b) => !assinaturaFeita(b, etapa) && statusAprovacao(b) !== "REPROVADA");
  if (alvos.length === 0) return { assinadas: 0, requisicoesConcluidas: [] };

  const agora = new Date().toISOString();
  const ids = alvos.map((b) => b.id);

  const patch: Record<string, unknown> = {
    [CAMPO_POR[etapa]]: opts.userId,
    [CAMPO_EM[etapa]]: agora,
    aprovador_id: opts.userId,
    comentario_aprovacao: opts.comentario ?? null,
  };
  const { error } = await (supabase as any).from("baixa_operacional").update(patch).in("id", ids);
  if (error) throw error;

  // status_fluxo consolidado quando as duas assinaturas existem
  const concluidasIds = alvos
    .filter((b) => {
      const outra: Etapa = etapa === "DIRETOR_OPERACOES" ? "COORDENADOR_FINANCEIRO" : "DIRETOR_OPERACOES";
      return assinaturaFeita(b, outra);
    })
    .map((b) => b.id);

  if (concluidasIds.length > 0) {
    // Assinaturas completas: segue para a aprovação final do Administrador,
    // que também dispara o e-mail de Baixa Fiscal.
    await (supabase as any)
      .from("baixa_operacional")
      .update({ status_fluxo: "AGUARDANDO_ADMIN", data_aprovacao: agora })
      .in("id", concluidasIds);
  }


  await (supabase as any).from("audit_logs").insert(
    alvos.map((b) => ({
      usuario: opts.userId,
      acao: opts.comoAdmin ? "BAIXA_APROVACAO_ADMINISTRATIVA" : "BAIXA_ASSINATURA",
      entidade: "baixa_operacional",
      entidade_id: String(b.id),
      payload: {
        etapa,
        descricao: opts.comoAdmin ? `aprovação administrativa em nome de ${ETAPA_LABEL[etapa]}` : ETAPA_LABEL[etapa],
        codigo_produto: b.codigo_produto,
        lote: b.lote,
        quantidade: b.quantidade,
        comentario: opts.comentario ?? null,
      },
    })),
  );

  // Requisições que passaram a estar 100% aprovadas
  const reqs = Array.from(
    new Set(alvos.filter((b) => concluidasIds.includes(b.id)).map((b) => b.solicitacao_id).filter((v) => v != null)),
  );

  const concluidas: (number | string)[] = [];
  for (const reqId of reqs) {
    try {
      const { data: linhas } = await (supabase as any)
        .from("baixa_operacional")
        .select("id, status_fluxo, aprovado_diretor_operacoes_por, aprovado_coordenador_financeiro_por")
        .eq("solicitacao_id", reqId);
      const pendente = (linhas ?? []).some((b: any) => statusAprovacao(b) === "PENDENTE" || statusAprovacao(b) === "PARCIAL");
      if (pendente) continue;

      // Documento formal já fica disponível; o e-mail sai na aprovação do Administrador.
      await gerarDocumentoAprovacao(reqId as any);
      concluidas.push(reqId as any);
    } catch (e) {
      console.warn("[assinarBaixas] falha ao gerar documento", e);
    }
  }

  return { assinadas: alvos.length, requisicoesConcluidas: concluidas };
}

/**
 * Aprovação final do Administrador: consolida o status como APROVADA e
 * dispara o e-mail de aprovação/baixa fiscal por requisição.
 */
export async function aprovarComoAdministrador(
  itens: any[],
  userId: string,
): Promise<{ aprovadas: number; emailsOk: number; emailsFalha: number }> {
  const alvos = itens.filter((b) => aguardandoAdmin(b));
  if (alvos.length === 0) return { aprovadas: 0, emailsOk: 0, emailsFalha: 0 };

  const agora = new Date().toISOString();
  const { error } = await (supabase as any)
    .from("baixa_operacional")
    .update({ status_fluxo: "APROVADA", data_aprovacao: agora })
    .in("id", alvos.map((b) => b.id));
  if (error) throw error;

  await (supabase as any).from("audit_logs").insert(
    alvos.map((b) => ({
      usuario: userId,
      acao: "BAIXA_APROVADA_ADMIN",
      entidade: "baixa_operacional",
      entidade_id: String(b.id),
      payload: { codigo_produto: b.codigo_produto, lote: b.lote, quantidade: b.quantidade },
    })),
  );

  const reqs = Array.from(new Set(alvos.map((b) => b.solicitacao_id).filter((v) => v != null)));
  let emailsOk = 0;
  let emailsFalha = 0;
  for (const reqId of reqs) {
    try {
      const path = await gerarDocumentoAprovacao(reqId as any);
      await notificarAprovacaoBaixa({ data: { solicitacaoId: reqId as any, documentoPath: path } });
      emailsOk++;
    } catch (e) {
      emailsFalha++;
      console.warn("[aprovarComoAdministrador] falha no e-mail de aprovação", e);
      await (supabase as any).from("audit_logs").insert({
        usuario: userId, acao: "BAIXA_APROVACAO_EMAIL_FALHA",
        entidade: "solicitacoes_baixa", entidade_id: String(reqId),
        payload: { erro: String(e) },
      });
    }
  }

  return { aprovadas: alvos.length, emailsOk, emailsFalha };
}


/** Reprova imediatamente (qualquer uma das duas etapas ou Administrador). */
export async function reprovarBaixas(itens: any[], motivo: string, userId: string): Promise<number> {
  const ids = itens.map((b) => b.id);
  if (ids.length === 0) return 0;
  const { error } = await (supabase as any).from("baixa_operacional").update({
    status_fluxo: "REPROVADA",
    motivo_reprovacao: motivo,
    comentario_aprovacao: motivo,
    aprovador_id: userId,
    data_aprovacao: new Date().toISOString(),
  }).in("id", ids);
  if (error) throw error;
  await (supabase as any).from("audit_logs").insert(
    itens.map((b) => ({
      usuario: userId, acao: "BAIXA_REPROVADA", entidade: "baixa_operacional",
      entidade_id: String(b.id), payload: { motivo, codigo_produto: b.codigo_produto, lote: b.lote },
    })),
  );
  return ids.length;
}
