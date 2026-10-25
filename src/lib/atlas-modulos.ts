// Pilar Atlas: módulos trazidos do Atlas Operações BI (Render) para o Stock Savvy, com a fase da migração de cada um.
// O histórico de todos eles já fica nas tabelas atlas_* (fase 1); as telas são reescritas fase a fase.

export type AtlasModulo = {
  id: string; nome: string; fase: number; descricao: string;
  tabelas: string[];             // tabelas atlas_* (sem o prefixo) que guardam o histórico do módulo
  unificadoCom?: { rota: string; nome: string };   // módulo que passa a usar a tela equivalente do Stock Savvy
  rota?: string;                 // tela já reescrita no Stock Savvy (módulo concluído)
};

export const ATLAS_FASES: Record<number, string> = {
  1: "Histórico (tabelas e importação do backup)",
  2: "Base: Cadastros, Usuários, Auditoria e Importar",
  3: "Operação: Painel, Divergências e Mapeamento de Passivos",
  4: "Inventário: Painel, Acurácia, Fechamento e Pós-Inventário",
  5: "Início: mapa de módulos, voz e assistente",
};

export const ATLAS_MODULOS: AtlasModulo[] = [
  { id: "inicio", nome: "Início", fase: 5, descricao: "Mapa de módulos, comandos de voz e Assistente Atlas (perguntas padrão e resumo do dia).", tabelas: ["perguntas_padrao_personalizadas", "dashboards_externos", "estado_treino_ml"] },
  { id: "painel", nome: "Painel", fase: 3, descricao: "KPIs de acurácia, acurácia por dia, mensal e por almoxarifado, causas, mapa de calor e ranking de divergências.", tabelas: ["divergencias", "movimentacoes_historico", "dias_operacionais", "conferencias_realizadas", "lotes_importacao"] , rota: "/atlas/painel" },
  { id: "divergencias", nome: "Divergências", fase: 3, descricao: "Investigação das divergências com hipóteses por regra, modelo de ML e IA, evidências e solução aplicada.", tabelas: ["divergencias", "hipoteses", "casos_ml_feedback", "baixas_operacionais"], rota: "/atlas/divergencias" },
  { id: "mapeamento-passivos", nome: "Mapeamento de Passivos", fase: 3, descricao: "Baixas aprovadas (passivos) × resultado de inventário, por motivo, mês e almoxarifado, com resumo executivo e exportação em Excel.", tabelas: ["baixas_operacionais", "ajustes_inventario_oficial", "divergencias"], rota: "/atlas/mapeamento-passivos" },
  { id: "importar", nome: "Importar", fase: 2, descricao: "Importação das planilhas do ERP: movimentações, transferências, faturamento, consumo de OP e ajustes de inventário.", tabelas: ["lotes_importacao", "movimentacoes_brutas", "transferencias", "faturamento", "consumo_op", "ordens_producao", "ficha_tecnica_bom"], rota: "/atlas/importar" },
  { id: "painel-inventario", nome: "Painel Inventário", fase: 4, descricao: "Ajustes oficiais de inventário por almoxarifado e período, com justificativas.", tabelas: ["ajustes_inventario_oficial", "lotes_ajuste_inventario", "justificativas_ajuste_inventario", "anexos_justificativa"] },
  { id: "acuracia-ponderada", nome: "Acurácia Ponderada", fase: 4, descricao: "Acurácia ponderada por valor, por mês e almoxarifado.", tabelas: ["ajustes_inventario_oficial", "movimentacoes_brutas", "conferencias_realizadas", "dias_operacionais"] },
  { id: "fechamento-inventario", nome: "Fechamento Inventário", fase: 4, descricao: "Fechamento com dupla assinatura (Diretor de Operações e Coordenador Financeiro), ciência e PDF.", tabelas: ["fechamentos_inventario", "itens_fechamento", "conciliacoes_ciencia", "fechamentos_stock_savvy"] },
  { id: "pos-inventario", nome: "Pós-Inventário", fase: 4, descricao: "Ações corretivas abertas a partir dos itens do fechamento, com checklist e prazo.", tabelas: ["acoes_pos_inventario", "itens_fechamento"] },
  { id: "cadastros", nome: "Cadastros", fase: 2, descricao: "Produtos, almoxarifados, hipóteses e fornecedores do Atlas, unificados com os cadastros do Stock Savvy.", tabelas: ["produtos", "almoxarifados", "hipoteses", "fornecedores"], rota: "/atlas/cadastros" },
  { id: "auditoria", nome: "Auditoria", fase: 2, descricao: "Log de ações. Unificado com a Auditoria do Stock Savvy, que mostra também o histórico do Atlas.", tabelas: ["log_auditoria"], unificadoCom: { rota: "/logs", nome: "Auditoria" }, rota: "/logs" },
  { id: "usuarios", nome: "Usuários", fase: 2, descricao: "Login pelo Stock Savvy; cada usuário do Atlas é ligado a um usuário daqui, com o papel sugerido.", tabelas: ["usuarios"], unificadoCom: { rota: "/usuarios", nome: "Usuários" }, rota: "/usuarios" },
];

export const moduloAtlas = (id: string) => ATLAS_MODULOS.find((m) => m.id === id);
/** Fase em andamento: a menor fase com algum módulo ainda sem tela no Stock Savvy (a fase 1 depende do histórico importado). */
export const faseEmAndamento = (historicoOk: boolean) => (!historicoOk ? 1 : Math.min(...ATLAS_MODULOS.filter((m) => !m.rota).map((m) => m.fase), 6));
/** Endereço do Atlas original, que segue no ar até a última fase ser aprovada. */
export const ATLAS_RENDER_URL = "https://atlas-re9d.onrender.com";
