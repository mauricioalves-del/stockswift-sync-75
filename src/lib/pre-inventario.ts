// Pré-inventário: regras puras (fase do ciclo, progresso do checklist, checklist padrão).

export type StatusInventario = "AGENDADO" | "APTO" | "REALIZADO" | "CANCELADO";
export type Fase = "agendado" | "preparacao" | "atrasado" | "apto" | "realizado" | "cancelado";

export type InventarioAgendado = {
  id: string; almoxarifado: string; data_inventario: string; antecedencia_dias: number;
  responsavel_id: string | null; responsavel_nome: string | null; status: StatusInventario;
  liberado_nome: string | null; liberado_em: string | null; liberacao_obs: string | null;
  pendencias_na_liberacao: Pendencia[] | null; historico: { evento: string; em: string; por: string | null; obs: string | null }[];
  observacao: string | null; created_at: string;
};
export type ItemChecklist = {
  id: string; inventario_id: string; ordem: number; etapa: string; descricao: string; obrigatorio: boolean;
  concluido: boolean; concluido_nome: string | null; concluido_em: string | null; observacao: string | null;
};
export type Pendencia = { tipo: string; rotulo: string; quantidade: number; valor: number; rota: string };

export const podeGerenciarItens = (gestor: boolean, status: StatusInventario) => gestor && status === "AGENDADO";
export const descricaoDuplicada = (itens: Pick<ItemChecklist, "descricao">[], descricao: string) =>
  itens.some((i) => i.descricao.trim().toLocaleLowerCase("pt-BR") === descricao.trim().toLocaleLowerCase("pt-BR"));
export const proximaOrdem = (itens: Pick<ItemChecklist, "ordem">[]) => Math.max(0, ...itens.map((i) => i.ordem)) + 1;

const DIA = 86_400_000;
const utc = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(a, m - 1, d); };
export const isoHoje = (agora = new Date()) => `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
export const somaDias = (iso: string, dias: number) => new Date(utc(iso) + dias * DIA).toISOString().slice(0, 10);
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / DIA);
export const fmtData = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Data em que a preparação abre (data do inventário − antecedência). */
export const aberturaPreparacao = (inv: Pick<InventarioAgendado, "data_inventario" | "antecedencia_dias">) =>
  somaDias(inv.data_inventario, -inv.antecedencia_dias);

/** Fase do ciclo: agendado → preparação (janela de antecedência) → apto; sem liberação até o dia do inventário = atrasado. */
export function faseDe(inv: Pick<InventarioAgendado, "status" | "data_inventario" | "antecedencia_dias">, hoje: string): Fase {
  if (inv.status === "CANCELADO") return "cancelado";
  if (inv.status === "REALIZADO") return "realizado";
  if (inv.status === "APTO") return "apto";
  if (hoje >= inv.data_inventario) return "atrasado";
  return hoje >= aberturaPreparacao(inv) ? "preparacao" : "agendado";
}

export const FASES: Record<Fase, { rotulo: string; cls: string }> = {
  agendado: { rotulo: "Agendado", cls: "bg-muted text-muted-foreground" },
  preparacao: { rotulo: "Em preparação", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  atrasado: { rotulo: "Não liberado", cls: "bg-destructive/10 text-destructive" },
  apto: { rotulo: "Apto para inventário", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  realizado: { rotulo: "Realizado", cls: "bg-primary/10 text-primary" },
  cancelado: { rotulo: "Cancelado", cls: "bg-muted text-muted-foreground line-through" },
};

export function progresso(itens: Pick<ItemChecklist, "obrigatorio" | "concluido">[]) {
  const obrig = itens.filter((i) => i.obrigatorio);
  const feitos = itens.filter((i) => i.concluido).length;
  const obrigFeitos = obrig.filter((i) => i.concluido).length;
  return {
    total: itens.length, feitos, obrigatorios: obrig.length, obrigatoriosFeitos: obrigFeitos,
    faltamObrigatorios: obrig.length - obrigFeitos,
    pct: itens.length ? Math.round((feitos / itens.length) * 100) : 0,
  };
}

export const totalPendencias = (p: Pick<Pendencia, "quantidade">[]) => p.reduce((a, x) => a + Number(x.quantidade || 0), 0);

/** O que falta para liberar; lista vazia = pode liberar (justificativa é exigida só se houver pendências). */
export function bloqueiosLiberacao(itens: Pick<ItemChecklist, "obrigatorio" | "concluido">[], pendencias: Pick<Pendencia, "quantidade">[], obs: string): string[] {
  const out: string[] = [];
  const { faltamObrigatorios } = progresso(itens);
  if (faltamObrigatorios > 0) out.push(`Conclua ${faltamObrigatorios} item(ns) obrigatório(s) do checklist.`);
  const pend = totalPendencias(pendencias);
  if (pend > 0 && !obs.trim()) out.push(`Há ${pend} pendência(s) em aberto: justifique para liberar com ressalvas.`);
  return out;
}

/** Checklist padrão de preparação (usado quando nenhum modelo de checklist é escolhido). */
export const CHECKLIST_PADRAO: { etapa: string; descricao: string; obrigatorio: boolean }[] = [
  { etapa: "Organização física", descricao: "Endereçamento revisado: todo produto no endereço correto e etiquetas de posição legíveis", obrigatorio: true },
  { etapa: "Organização física", descricao: "Produtos do mesmo SKU e lote agrupados (sem lotes misturados na mesma posição)", obrigatorio: true },
  { etapa: "Organização física", descricao: "Avarias, vencidos e bloqueados segregados e identificados em área própria", obrigatorio: true },
  { etapa: "Organização física", descricao: "Caixas abertas fechadas ou identificadas com a quantidade fracionada", obrigatorio: false },
  { etapa: "Organização física", descricao: "Corredores e áreas de contagem limpos e acessíveis", obrigatorio: false },
  { etapa: "Documentos e sistema", descricao: "Notas de entrada recebidas e lançadas no sistema", obrigatorio: true },
  { etapa: "Documentos e sistema", descricao: "Transferências entre almoxarifados conferidas e recebidas (nada em trânsito)", obrigatorio: true },
  { etapa: "Documentos e sistema", descricao: "Consumos de OP e requisições atendidas apontados no sistema", obrigatorio: true },
  { etapa: "Documentos e sistema", descricao: "Baixas operacionais do período lançadas e executadas", obrigatorio: true },
  { etapa: "Documentos e sistema", descricao: "Lotes vencidos ou bloqueados baixados/bloqueados no sistema (shelf life atualizado)", obrigatorio: true },
  { etapa: "Documentos e sistema", descricao: "Ações pós-inventário do último inventário concluídas ou justificadas", obrigatorio: false },
  { etapa: "Contagem", descricao: "Corte de movimentação comunicado (data/hora em que o almoxarifado para de movimentar)", obrigatorio: true },
  { etapa: "Contagem", descricao: "Equipe de contagem e duplas definidas", obrigatorio: true },
  { etapa: "Contagem", descricao: "Base de estoque sistêmico atualizada para gerar as listas de contagem", obrigatorio: true },
  { etapa: "Contagem", descricao: "Coletores/scanner carregados e testados", obrigatorio: false },
];
