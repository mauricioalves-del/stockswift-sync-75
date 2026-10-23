// Plano de Integração (pilar Gestão): modelo do ciclo de 90 dias — etapas com portão, ações com prazo
// relativo à data de início (dia 0 = primeiro dia), indicadores, rituais e riscos. Baseado no
// "Plano de Ação — Integração da Estagiária de Operações".

export type Etapa = { nome: string; periodo: string; meta: string; criterio: string };
export const ETAPAS: Etapa[] = [
  { nome: "Pré-chegada", periodo: "Semana anterior", meta: "Tudo pronto antes do primeiro dia, para que a semana 1 seja de imersão e não de espera por acessos.", criterio: "Acessos ativos, padrinho definido e agenda do dia 2 confirmada." },
  { nome: "Imersão", periodo: "Semana 1", meta: "Entende o fluxo físico e sistêmico do estoque e conhece os responsáveis de cada processo. Nenhuma execução ainda.", criterio: "Ela explica o fluxo do estoque com as próprias palavras e o gestor valida." },
  { nome: "Execução guiada", periodo: "Semanas 2–4", meta: "Executa as frentes 5, 3 e 1 com revisão diária do gestor. Ela aponta problemas; as decisões ainda são do gestor.", criterio: "Checklists das três frentes escritos e menos de uma correção por dia na revisão (checkpoint de 30 dias)." },
  { nome: "Autonomia", periodo: "Mês 2", meta: "As frentes 1, 3 e 5 rodam sem revisão diária e a frente 2 começa. O gestor revisa uma vez por semana.", criterio: "Frentes 1, 3 e 5 sem revisão diária e frente 2 em andamento (checkpoint de 60 dias)." },
  { nome: "Análise e cobrança", periodo: "Mês 3", meta: "Consolida os indicadores das frentes e conduz a cobrança semanal dos responsáveis, com escalonamento ao gestor.", criterio: "Comunicado formal enviado, cobrança semanal rodando e escalonamento aplicado." },
  { nome: "Fechamento", periodo: "Semana 12", meta: "Resultado dos 90 dias comparado com a linha de base, com feedback nos dois sentidos.", criterio: "Indicadores medidos, resultados apresentados e decisão registrada (checkpoint de 90 dias)." },
];

export const FRENTES: Record<string, string> = {
  "1": "1. Lotes", "2": "2. Ficha técnica", "3": "3. FEFO", "4": "4. Análise e cobrança", "5": "5. Movimentações e inventário",
};

export type AcaoModelo = { etapa: number; acao: string; responsavel: string; prazo_dia: number; frente?: string; entregavel?: string; rota?: string; recorrente?: boolean };
const A = (etapa: number, prazo_dia: number, acao: string, responsavel: string, o: Partial<AcaoModelo> = {}): AcaoModelo => ({ etapa, prazo_dia, acao, responsavel, ...o });

export const ACOES_MODELO: AcaoModelo[] = [
  // 0 · Pré-chegada
  A(0, -7, "Confirmar termo de compromisso com a instituição de ensino, supervisor e jornada (máx. 6h/dia e 30h/semana, Lei 11.788/2008)", "RH + Gestor", { entregavel: "Termo assinado" }),
  A(0, -7, "Solicitar e-mail corporativo, notebook e estação de trabalho", "TI", { entregavel: "Equipamento pronto" }),
  A(0, -5, "Liberar acessos: Slack, Sólides, Google, drive compartilhado, ERP em modo consulta e planilhas operacionais", "Peterson + Gestor", { entregavel: "Acessos ativos" }),
  A(0, -5, "Criar usuário não administrador no sistema de controle de estoque", "Gestor", { rota: "/usuarios", entregavel: "Usuário criado" }),
  A(0, -4, "Definir o que fica restrito no início (custo contábil, preços, telas de configuração)", "Gestor", { entregavel: "Lista de restrições" }),
  A(0, -4, "Eleger um padrinho no time para acompanhar os 3 primeiros meses", "Gestor", { entregavel: "Padrinho definido" }),
  A(0, -2, "Preparar material de boas-vindas: organograma, quem é quem, glossário e agenda da semana 1", "Gestor", { entregavel: "Material de boas-vindas" }),
  A(0, -2, "Agendar o dia 2 com Diretoria de Operações, Produção e subáreas (Compras, Controle, Expedição)", "Gestor", { entregavel: "Agenda do dia 2" }),
  // 1 · Imersão (dias 0 a 4)
  A(1, 0, "Recepção, apresentação ao time e tour pelo escritório", "RH + Gestor", { entregavel: "Primeiro contato com o time" }),
  A(1, 0, "Onboarding RH: história, cultura, organograma, sistemas, documentos de admissão e reuniões gerais", "RH", { entregavel: "Admissão concluída e acessos ativos" }),
  A(1, 0, "Onboarding liderança: contexto, desafios, expectativas das primeiras semanas e objetivo dos 90 dias", "Gestor", { entregavel: "Objetivos alinhados" }),
  A(1, 0, "Onboarding pares: apresentação do padrinho, rotina, projetos e cerimônias do time", "Padrinho", { entregavel: "Rotina do time conhecida" }),
  A(1, 1, "Diretoria de Operações: contexto, objetivos, membros e quem acionar em cada caso", "Diretoria de Operações", { entregavel: "Contatos da diretoria" }),
  A(1, 1, "Produção: apresentação da área e visita à fábrica, com foco em como a ficha técnica vira produto", "Produção + Gestor", { entregavel: "Anotações de campo" }),
  A(1, 1, "Subáreas (30 min cada): Compras, Controle e Expedição — contexto, membros e quem acionar", "Líderes das subáreas", { entregavel: "Lista de contatos por processo" }),
  A(1, 2, "Visita ao CD e almoxarifados: lotes, etiquetas de validade, endereçamento", "Padrinho", { entregavel: "Anotações de campo" }),
  A(1, 2, "Conceitos: lote, FEFO, shelf life, ficha técnica, dispersão e inventário mensal", "Gestor", { entregavel: "Glossário revisado por ela" }),
  A(1, 3, "Tour pelo ERP, pelo sistema e pelas planilhas de cada frente, em modo consulta", "Gestor", { rota: "/abastecimento/estoque", entregavel: "Mapa de onde está cada informação" }),
  A(1, 4, "Acompanhar as rotinas reais, só observando", "Estagiária", { entregavel: "Lista de dúvidas" }),
  A(1, 4, "Ler as Políticas Internas e o Acordo Individual", "Estagiária"),
  A(1, 4, "Ler o material interno sobre Produto e Produtores", "Estagiária"),
  A(1, 4, "Navegar pelas pastas do drive compartilhado", "Estagiária"),
  A(1, 4, "Avaliar as lojas no Google", "Estagiária"),
  A(1, 4, "Fechamento: explicar o fluxo do estoque com as próprias palavras", "Estagiária", { entregavel: "Fluxo validado pelo gestor" }),
  // 2 · Execução guiada (semanas 2 a 4 → dias 7 a 27)
  A(2, 7, "Registrar e acompanhar as movimentações diárias com revisão do gestor", "Estagiária", { frente: "5", rota: "/baixas", recorrente: true, entregavel: "Movimentações do dia conferidas" }),
  A(2, 11, "Escrever o checklist da rotina diária de movimentações", "Estagiária", { frente: "5", rota: "/gestao/modelos-checklist", entregavel: "Checklist v1" }),
  A(2, 18, "Montar a visão dos itens por data de vencimento, por almoxarifado", "Estagiária", { frente: "3", rota: "/suprimentos/fefo", entregavel: "Visão FEFO" }),
  A(2, 20, "Apontar saídas fora da ordem FEFO e itens próximos do vencimento", "Estagiária", { frente: "3", rota: "/quebras-fefo", recorrente: true, entregavel: "Lista semanal de alertas" }),
  A(2, 25, "Conferência periódica dos lotes e registro de não conformidades", "Estagiária", { frente: "1", rota: "/shelf-life/acoes", entregavel: "Registro de não conformidades" }),
  A(2, 27, "Propor ação corretiva para cada não conformidade; gestor valida", "Estagiária + Gestor", { frente: "1", rota: "/shelf-life/acoes", entregavel: "Ações propostas" }),
  A(2, 27, "Escrever os checklists das rotinas de FEFO e de lotes", "Estagiária", { frente: "3", rota: "/gestao/modelos-checklist", entregavel: "Checklists FEFO e lotes" }),
  // 3 · Autonomia (mês 2 → dias 28 a 55)
  A(3, 28, "Abrir e acompanhar ações corretivas de lote sozinha, escalando só exceções", "Estagiária", { frente: "1", rota: "/shelf-life/acoes", recorrente: true, entregavel: "Ações com dono e prazo" }),
  A(3, 28, "Lista de alertas FEFO passa a sair sem revisão prévia", "Estagiária", { frente: "3", rota: "/suprimentos/fefo", recorrente: true, entregavel: "Alertas enviados aos responsáveis" }),
  A(3, 41, "Levantar divergências entre fichas técnicas e consumo real", "Estagiária", { frente: "2", rota: "/producao/dispersao", entregavel: "Relatório de dispersão" }),
  A(3, 50, "Acompanhar o inventário mensal e registrar os problemas encontrados", "Estagiária", { frente: "5", rota: "/missoes", entregavel: "Lista de causas de divergência" }),
  A(3, 55, "Propor padronização das fichas técnicas; gestor e área responsável aprovam", "Estagiária + Gestor", { frente: "2", rota: "/producao/auditoria-ft", entregavel: "Fichas corrigidas e padrão definido" }),
  A(3, 55, "Propor 2 ou 3 melhorias para o próximo inventário", "Estagiária", { frente: "5", entregavel: "Propostas de melhoria" }),
  // 4 · Análise e cobrança (mês 3 → dias 56 a 83)
  A(4, 62, "Montar painel com os indicadores das frentes 1, 2, 3 e 5 (linha de base preenchida neste plano)", "Estagiária", { frente: "4", entregavel: "Painel v1" }),
  A(4, 62, "Comunicar formalmente às áreas que ela conduz a cobrança, com a regra de escalonamento", "Gestor", { frente: "4", entregavel: "Comunicado enviado" }),
  A(4, 63, "Rotina semanal: lista de pendências com responsável, prazo e status", "Estagiária", { frente: "4", rota: "/gestao/planejamento", recorrente: true, entregavel: "Lista semanal enviada" }),
  A(4, 63, "Pendência sem resolução em 7 dias sobe para o gestor", "Estagiária", { frente: "4", rota: "/gestao/minhas-tarefas", recorrente: true, entregavel: "Pendências escaladas" }),
  // 5 · Fechamento (semana 12 → dias 77 a 89)
  A(5, 82, "Medir os indicadores do dia 90 e comparar com a linha de base", "Estagiária", { entregavel: "Indicadores atualizados" }),
  A(5, 83, "Apresentar os resultados dos 90 dias ao gestor", "Estagiária", { entregavel: "Apresentação de resultados" }),
  A(5, 89, "Feedback nos dois sentidos e decisão sobre os próximos passos", "Gestor", { entregavel: "Decisão registrada" }),
];

export type Indicador = { frente: string; nome: string; unidade: string; base: number | null; meta: number | null; atual: number | null };
export const INDICADORES_MODELO: Indicador[] = [
  { frente: "1", nome: "Não conformidades com ação corretiva aberta", unidade: "%", base: null, meta: null, atual: null },
  { frente: "2", nome: "Fichas com dispersão acima da tolerância", unidade: "qtd.", base: null, meta: null, atual: null },
  { frente: "3", nome: "Perdas por vencimento", unidade: "R$/mês", base: null, meta: null, atual: null },
  { frente: "4", nome: "Pendências resolvidas no prazo", unidade: "%", base: null, meta: null, atual: null },
  { frente: "5", nome: "Acuracidade do inventário mensal", unidade: "%", base: null, meta: null, atual: null },
];

export const PREMISSAS = [
  "A rampa vai do menor para o maior risco: movimentações, FEFO e lotes primeiro; ficha técnica no mês 2; cobrança no mês 3.",
  "A cobrança só começa com respaldo formal do gestor e regra de escalonamento definida.",
  "Acessos são liberados por fase. Dados de custo e telas de administrador ficam restritos no início.",
  "Toda rotina aprendida vira um checklist escrito, que serve de documentação da área.",
];

export const RISCOS: [string, string][] = [
  ["Acessos atrasam e a semana 1 vira espera", "Solicitar acessos a TI na semana anterior; semana 1 é só consulta"],
  ["Áreas não reconhecem a cobrança feita por estagiária", "Comunicado formal do gestor e regra de escalonamento antes da semana 10"],
  ["Gestor sem tempo para revisar na fase 2", "Bloquear 30 min diários na agenda nas semanas 2 a 4"],
  ["Erro em dados de estoque por falta de experiência", "Revisão diária na fase 2 e checklists escritos por rotina"],
  ["Exposição de dados sensíveis de custo", "Acesso por fase; custo e telas de administrador só quando necessário"],
  ["Jornada de 6h não comporta todas as frentes", "Priorizar as frentes 3 e 1 (maior impacto em perdas)"],
];

/** Checkpoints do ciclo: dia (a partir do início) e o que é verificado. */
export const CHECKPOINTS: { dia: number; nome: string; pergunta: string }[] = [
  { dia: 29, nome: "Checkpoint 30 dias", pergunta: "Frentes 1, 3 e 5 executadas com revisão diária?" },
  { dia: 59, nome: "Checkpoint 60 dias", pergunta: "Frentes 1, 3 e 5 sem revisão diária e frente 2 em andamento?" },
  { dia: 89, nome: "Checkpoint 90 dias", pergunta: "Cobrança rodando e indicadores comparados com a linha de base?" },
];

// ---------- datas ----------
const parseIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dataDoDia(inicioIso: string, dia: number): string { const d = parseIso(inicioIso); d.setDate(d.getDate() + dia); return isoDe(d); }
export function diaDoCiclo(inicioIso: string, hojeIso: string): number { return Math.round((parseIso(hojeIso).getTime() - parseIso(inicioIso).getTime()) / 86400000); }
export const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export type StatusEtapa = "concluida" | "andamento" | "bloqueada";
export const statusEtapa = (i: number, etapaAtual: number): StatusEtapa => (i < etapaAtual ? "concluida" : i === etapaAtual ? "andamento" : "bloqueada");

/** Ação atrasada: não concluída e o prazo já passou. */
export function atrasada(a: { concluida: boolean; prazo_dia: number }, inicioIso: string, hojeIso: string): boolean {
  return !a.concluida && dataDoDia(inicioIso, a.prazo_dia) < hojeIso;
}
