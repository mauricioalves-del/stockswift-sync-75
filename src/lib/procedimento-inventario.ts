// Procedimento Operacional Padrão de Inventário (POP-INV-001) — gerado em PDF sob demanda (jsPDF carregado só ao abrir).
// O texto fica aqui para revisão por versão; ao alterar, atualize VERSAO e o controle de revisões.
export const VERSAO = { codigo: "POP-INV-001", versao: "1.0", data: "26/11/2026" };

type Bloco = { t: "p"; texto: string } | { t: "lista"; itens: string[] } | { t: "tabela"; cab: string[]; linhas: string[][]; larguras?: number[] } | { t: "sub"; texto: string };
type Secao = { titulo: string; blocos: Bloco[] };

export const SECOES: Secao[] = [
  { titulo: "1. Objetivo", blocos: [{ t: "p", texto: "Padronizar o inventário físico de estoques da Mágio Chocolates, garantindo contagens confiáveis, rastreabilidade completa das informações, segregação de funções e aprovação formal dos ajustes, de forma auditável por auditoria interna ou externa." }] },
  { titulo: "2. Abrangência", blocos: [
    { t: "p", texto: "Aplica-se a todos os almoxarifados com saldo no sistema: Fábrica, Processo, Qualidade, Ativação, Degustação, Loja, Pátio Paulista, ElDorado, Box, Box 2 e Pará; e a todos os tipos de item (matéria-prima, embalagem, produto em processo, produto acabado, revenda e material de consumo)." },
    { t: "p", texto: "Vale para o inventário geral (anual ou por demanda de auditoria) e serve de base para as contagens cíclicas semanais (Contagem Cíclica Lojas e Fabril)." },
  ] },
  { titulo: "3. Sistema e registros", blocos: [
    { t: "p", texto: "Todo o processo é executado e registrado no Stock Savvy. Não são aceitas contagens em planilha ou papel como registro oficial; papel só é permitido como contingência e deve ser lançado no sistema no mesmo dia, com observação." },
    { t: "lista", itens: [
      "Inventário > Contagem de Inventário: planejamento, duplas, lista, contagem, recontagem, apuração e fechamento.",
      "Inventário > Resultado de Inventário: fechamento oficial, assinaturas, indicadores (item a item, IAQ, IAP) e pós-inventário.",
      "Atlas: investigação das divergências e histórico por SKU.",
      "Baixas Operacionais e Pacote de Baixas: baixas aprovadas e conciliadas.",
    ] },
  ] },
  { titulo: "4. Definições", blocos: [{ t: "tabela", cab: ["Termo", "Definição"], larguras: [45, 135], linhas: [
    ["Contagem cega", "Contagem feita sem conhecer o saldo do sistema. Só o Administrador vê o saldo; as duplas recebem apenas o sinal sonoro de dentro da tolerância ou divergência."],
    ["Dupla", "Dois usuários do sistema que contam juntos os grupos de produtos atribuídos. Uma pessoa não pode estar em duas duplas do mesmo inventário."],
    ["Corte (cut-off)", "Momento a partir do qual nenhuma movimentação física ou fiscal do almoxarifado é feita até o fim da contagem."],
    ["Tolerância", "Diferença percentual por SKU (soma dos lotes) aceita sem recontagem. Padrão: 5%. Itens fora da tolerância ou não contados vão para recontagem."],
    ["Recontagem", "Nova contagem, por dupla diferente da que contou, dos itens divergentes. Registra se o produto foi identificado na 2a contagem (Sim/Não)."],
    ["Contagem final oficial", "Recontagem, quando houve; senão a 1a contagem. É a quantidade que vai para o fechamento."],
    ["Fechamento oficial", "Registro do inventário no Atlas (sistema x físico por SKU, valorizado pelo custo contábil da data), que exige três assinaturas."],
    ["Item a item / IAQ / IAP", "Acurácia por SKU sem divergência / ponderada pela quantidade / ponderada pelo valor (indicador principal)."],
  ] }] },
  { titulo: "5. Responsabilidades", blocos: [{ t: "tabela", cab: ["Papel", "Responsabilidades"], larguras: [50, 130], linhas: [
    ["Diretor de Operações", "Aprovar o procedimento e o calendário; assinar a ciência do fechamento; aprovar ajustes acima da alçada."],
    ["Coordenador Financeiro", "Validar corte, custo contábil e valorização das diferenças; assinar a ciência; acompanhar os lançamentos contábeis."],
    ["Responsável pelo Departamento", "Garantir a organização física e o saneamento; assinar a ciência do seu almoxarifado; responder pelas ações pós-inventário."],
    ["Coordenador do inventário (Administrador)", "Planejar o inventário no sistema, definir duplas e grupos, encerrar a contagem, finalizar, gerar o fechamento e abrir as ações pós-inventário. Não conta nem reconta."],
    ["Duplas de contagem", "Contar os grupos atribuídos seguindo as regras do item 7.4; registrar observações; concluir a etapa da dupla."],
    ["Duplas de recontagem", "Recontar os itens divergentes de outra dupla, sem consultar a contagem anterior; registrar se o produto foi identificado na 2a contagem."],
    ["Auditoria / Controladoria", "Acompanhar a contagem, realizar contagens-teste e receber o pacote de evidências."],
  ] }] },
  { titulo: "6. Segregação de funções", blocos: [{ t: "lista", itens: [
    "Quem conta não reconta os próprios grupos: cada dupla tem uma dupla de recontagem diferente, definida no planejamento.",
    "Quem conta ou reconta não aprova ajustes nem assina o fechamento.",
    "O Administrador que coordena o inventário não participa das duplas.",
    "Ajustes de saldo no ERP só são lançados após as três assinaturas do fechamento.",
    "Alteração de contagem após a apuração só pelo Administrador, com justificativa registrada no sistema.",
  ] }] },
  { titulo: "7. Etapas do processo", blocos: [
    { t: "tabela", cab: ["Etapa", "Quando", "Responsável", "Registro no sistema"], larguras: [45, 25, 50, 60], linhas: [
      ["7.1 Planejamento", "D-10", "Coordenador", "Inventário criado com duplas, grupos e recontagem"],
      ["7.2 Pré-inventário", "D-7 a D-1", "Resp. Departamento", "Baixas e notas pendentes zeradas"],
      ["7.3 Corte", "D-1 / D0", "Coord. + Financeiro", "Lista gerada na data e hora programadas"],
      ["7.4 Contagem", "D0", "Duplas", "Contagens por lote, observações"],
      ["7.5 Apuração e recontagem", "D0 / D+1", "Coord. + Duplas rec.", "Divergências e recontagem"],
      ["7.6 Fechamento oficial", "D+1", "Coordenador", "Fechamento gerado no Atlas"],
      ["7.7 Aprovação", "Até D+3", "Diretor, Financeiro, Resp.", "Três ciências assinadas"],
      ["7.8 Ajustes e baixas", "Após 7.7", "Financeiro", "Lançamentos e Pacote de Baixas"],
      ["7.9 Pós-inventário", "Até D+30", "Responsáveis das ações", "Ações com checklist e prazo"],
    ] },
    { t: "sub", texto: "7.1 Planejamento (D-10)" },
    { t: "lista", itens: [
      "Criar o inventário em Contagem de Inventário > Planejamento: nome, almoxarifado, data e hora da geração da lista, critério ABC (se houver) e tolerância.",
      "Montar as duplas com usuários do sistema, marcar Conta/Reconta e atribuir os grupos de produtos a cada dupla (cada grupo, uma única dupla).",
      "Definir, para cada dupla que conta, a dupla que reconta seus grupos (sempre diferente).",
      "Verificar os produtos sem grupo cadastrado e definir a dupla que os recebe.",
    ] },
    { t: "sub", texto: "7.2 Pré-inventário (D-7 a D-1)" },
    { t: "lista", itens: [
      "Zerar baixas operacionais pendentes de aprovação e conciliar o Pacote de Baixas.",
      "Receber ou registrar todas as notas de transferência em trânsito; resolver transferências entre almoxarifados.",
      "Segregar e identificar material avariado, vencido, obsoleto e material de terceiros (consignado, em demonstração ou em poder da Mágio).",
      "Organizar fisicamente por grupo e endereço; etiquetar itens com SKU e lote.",
      "Confirmar que a carga diária de lotes traz o custo contábil (Custo_Contabil_SP/Para).",
      "Treinar as duplas na tela de contagem (lote, inclusão de produto fora da lista, observações).",
    ] },
    { t: "sub", texto: "7.3 Corte (D-1 / D0)" },
    { t: "lista", itens: [
      "Registrar o número da última nota fiscal de entrada, da última de saída e da última transferência do almoxarifado.",
      "Suspender recebimentos, expedições, transferências, apontamentos e baixas do almoxarifado até o fim da contagem.",
      "Materiais que chegarem durante a contagem ficam em área separada, identificados como \"após o corte\", e não são contados.",
      "A lista é gerada automaticamente na data e hora programadas (fotografia do estoque); o Financeiro valida a data e hora.",
    ] },
    { t: "sub", texto: "7.4 Contagem (D0)" },
    { t: "lista", itens: [
      "Cada dupla conta apenas os itens da sua lista, por lote, na unidade de medida do sistema.",
      "Contar o que está fisicamente presente, sem consultar saldos, relatórios ou colegas de outras duplas.",
      "Lote não listado: usar \"Adicionar lote manual\". Produto não listado (inclusive sem saldo no sistema): usar \"Produto fora da lista\".",
      "Item avariado, vencido ou de terceiro: contar separadamente e registrar em \"Observação desta linha\".",
      "Ao sinal de divergência, a dupla reconfere antes de seguir; não altera a contagem sem nova conferência física.",
      "Ao terminar, a dupla clica em \"Concluir contagem da dupla\".",
    ] },
    { t: "sub", texto: "7.5 Apuração e recontagem" },
    { t: "lista", itens: [
      "O Coordenador encerra a contagem; itens fora da tolerância ou não contados vão para a dupla de recontagem definida no planejamento.",
      "A dupla de recontagem conta sem ver a 1a contagem e registra se o produto foi identificado na 2a contagem (Sim/Não).",
      "A recontagem passa a ser a contagem final oficial do item.",
    ] },
    { t: "sub", texto: "7.6 Fechamento oficial" },
    { t: "lista", itens: [
      "Ao finalizar o inventário, o sistema gera o fechamento oficial no Atlas: uma linha por SKU, valorizada pelo custo contábil vigente na data.",
      "As divergências são abertas e investigadas no Atlas; a recorrência por SKU é registrada.",
      "Não há importação de planilha: o fechamento vem exclusivamente da contagem no sistema.",
    ] },
    { t: "sub", texto: "7.7 Aprovação" },
    { t: "p", texto: "O fechamento só é considerado fechado com as três ciências: Diretor de Operações, Coordenador Financeiro e Responsável pelo Departamento, até D+3. Cada assinatura fica registrada com usuário, data, hora e observação." },
    { t: "sub", texto: "7.8 Ajustes e baixas" },
    { t: "lista", itens: [
      "Os ajustes de saldo são lançados no ERP somente após as três assinaturas, pelo Financeiro, com referência ao número do fechamento.",
      "Perdas reais seguem o fluxo de Baixas Operacionais e Pacote de Baixas, com aprovação.",
      "Divergências classificadas como erro de processo não viram perda: seguem para ação pós-inventário.",
    ] },
    { t: "sub", texto: "7.9 Ações pós-inventário" },
    { t: "p", texto: "O Administrador seleciona, na aba Ações pós-inventário, os itens que exigem tratamento - inclusive com saldo correto - e abre ações com motivo (ex.: recebido sem nota fiscal, nota emitida sem baixa, transferência não registrada), responsável, prazo e checklist. O acompanhamento é feito em Atlas > Pós-inventário até a conclusão." },
  ] },
  { titulo: "8. Situações especiais", blocos: [{ t: "tabela", cab: ["Situação", "Tratamento"], larguras: [55, 125], linhas: [
    ["Produto sem etiqueta ou código ilegível", "Identificar pela descrição/embalagem com o Responsável; contar e registrar observação; abrir ação pós-inventário de etiquetagem."],
    ["Lote divergente do sistema", "Contar no lote físico (lote manual) e zerar o lote inexistente; o sistema apura pelo total do SKU."],
    ["Produto não cadastrado", "Contar em \"Produto fora da lista\" pela descrição mais próxima e abrir ação de cadastro."],
    ["Material de terceiros", "Não compõe o estoque da Mágio: segregar, listar à parte com documento de origem."],
    ["Avariado, vencido ou obsoleto", "Contar à parte, registrar observação e encaminhar para baixa operacional com aprovação."],
    ["Item fracionado ou por peso", "Pesar em balança aferida e lançar na unidade do sistema (kg, g, un)."],
  ] }] },
  { titulo: "9. Indicadores e metas", blocos: [{ t: "tabela", cab: ["Indicador", "Cálculo", "Meta"], larguras: [45, 95, 40], linhas: [
    ["IAP (principal)", "1 - valor divergente / valor do estoque avaliado", "98% ou mais"],
    ["IAQ", "1 - |divergência| / quantidade em sistema", "Acompanhar"],
    ["Item a item", "SKUs sem divergência / SKUs contados", "Acompanhar"],
    ["% de recontagem", "SKUs recontados / SKUs contados", "Até 10%"],
    ["Prazo de fechamento", "Dias entre a contagem e a 3a assinatura", "Até 3 dias"],
    ["Ações no prazo", "Ações concluídas no prazo / ações vencidas", "90% ou mais"],
  ] }] },
  { titulo: "10. Registros e evidências", blocos: [
    { t: "tabela", cab: ["Registro", "Onde fica", "Guarda"], larguras: [70, 75, 35], linhas: [
      ["Planejamento, duplas e grupos", "Contagem de Inventário", "5 anos"],
      ["Lista gerada (data/hora) e corte", "Contagem de Inventário", "5 anos"],
      ["Contagens, recontagens e observações", "Contagem de Inventário (exportação)", "5 anos"],
      ["Fechamento oficial e assinaturas", "Resultado de Inventário > Fechamento", "5 anos"],
      ["Divergências e investigação", "Atlas", "5 anos"],
      ["Ajustes e baixas", "ERP + Pacote de Baixas", "5 anos"],
      ["Ações pós-inventário", "Atlas > Pós-inventário", "5 anos"],
    ] },
    { t: "p", texto: "O pacote de evidências do inventário reúne esses registros e é entregue à auditoria ao fim do processo." },
  ] },
  { titulo: "11. Auditoria externa", blocos: [{ t: "lista", itens: [
    "O auditor acompanha a contagem e pode realizar contagens-teste em duas direções: do sistema para o físico e do físico para o sistema.",
    "Diferenças encontradas pelo auditor são recontadas na hora, com o Coordenador, e registradas em observação.",
    "O auditor recebe acesso de consulta ou a exportação dos registros do item 10.",
  ] }] },
  { titulo: "12. Frequência", blocos: [{ t: "lista", itens: [
    "Inventário geral: anual (ou por demanda de auditoria), em todos os almoxarifados.",
    "Contagem cíclica: semanal nas lojas e na fábrica, conforme planejamento cíclico.",
    "Revisão deste procedimento: anual ou sempre que o processo ou o sistema mudar.",
  ] }] },
  { titulo: "13. Controle de revisões", blocos: [{ t: "tabela", cab: ["Versão", "Data", "Descrição"], larguras: [25, 30, 125], linhas: [["1.0", "26/11/2026", "Emissão inicial: inventário pelo sistema (Contagem de Inventário), fechamento oficial automático e ações pós-inventário."]] }] },
];

/** Gera o PDF do procedimento. Em navegador, abre em nova aba (ou baixa). */
export async function gerarProcedimentoPdf(opcoes: { abrir?: boolean } = { abrir: true }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 15, W = 180, AZUL: [number, number, number] = [52, 67, 108];
  let y = 0;
  const cab = () => { doc.setFillColor(...AZUL); doc.rect(0, 0, 210, 12, "F"); doc.setTextColor(255); doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("MÁGIO CHOCOLATES · PROCEDIMENTO DE INVENTÁRIO", L, 7.8); doc.setFont("helvetica", "normal"); doc.text(`${VERSAO.codigo} · v${VERSAO.versao} · ${VERSAO.data}`, 210 - L, 7.8, { align: "right" }); doc.setTextColor(30); };
  const garante = (h: number) => { if (y + h > 280) { doc.addPage(); cab(); y = 20; } };
  cab(); y = 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...AZUL); doc.text("Procedimento Operacional Padrão", L, y); y += 8;
  doc.setFontSize(14); doc.text("Inventário Físico de Estoques", L, y); y += 7; doc.setTextColor(30);
  autoTable(doc, { startY: y, margin: { left: L, right: L }, theme: "grid", styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: AZUL },
    body: [["Código", VERSAO.codigo, "Versão", VERSAO.versao], ["Emissão", VERSAO.data, "Área", "Operações / PCP"], ["Elaborado por", "Gestão de Operação e PCP", "Aprovação", "Diretor de Operações e Coordenador Financeiro"]],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 }, 2: { fontStyle: "bold", cellWidth: 24 } } });
  y = (doc as any).lastAutoTable.finalY + 6;
  for (const s of SECOES) {
    garante(14); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...AZUL); doc.text(s.titulo, L, y); y += 2; doc.setDrawColor(...AZUL); doc.line(L, y, L + W, y); y += 5; doc.setTextColor(30);
    for (const b of s.blocos) {
      if (b.t === "sub") { garante(10); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(b.texto, L, y); y += 5; continue; }
      if (b.t === "p") { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); const ls = doc.splitTextToSize(b.texto, W); garante(ls.length * 4.5 + 2); doc.text(ls, L, y); y += ls.length * 4.5 + 2.5; continue; }
      if (b.t === "lista") { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); for (const it of b.itens) { const ls = doc.splitTextToSize(it, W - 5); garante(ls.length * 4.5 + 1); doc.text("•", L + 1, y); doc.text(ls, L + 5, y); y += ls.length * 4.5 + 1.2; } y += 1.5; continue; }
      if (b.t === "tabela") {
        garante(16);
        autoTable(doc, { startY: y, margin: { left: L, right: L, top: 18 }, head: [b.cab], body: b.linhas, theme: "grid", styles: { fontSize: 8.5, cellPadding: 1.6, valign: "top" }, headStyles: { fillColor: AZUL, textColor: 255 },
          columnStyles: Object.fromEntries((b.larguras ?? []).map((w, i) => [i, { cellWidth: w, ...(i === 0 ? { fontStyle: "bold" } : {}) }])), didDrawPage: (d: any) => { if (d.pageNumber > 1 || doc.getNumberOfPages() > 1) cab(); } });
        y = (doc as any).lastAutoTable.finalY + 5;
      }
    }
    y += 2;
  }
  garante(40); y += 6; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...AZUL); doc.text("Aprovação", L, y); y += 14; doc.setTextColor(30); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  ["Diretor de Operações", "Coordenador Financeiro", "Gestão de Operação / PCP"].forEach((p, i) => { const x = L + i * 62; doc.line(x, y, x + 55, y); doc.text(p, x, y + 4.5); doc.text("Data: ____/____/______", x, y + 9); });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`Documento controlado · cópia impressa não controlada · página ${i} de ${n}`, 105, 291, { align: "center" }); }
  if (opcoes.abrir && typeof window !== "undefined") { const url = doc.output("bloburl"); const w = window.open(url as unknown as string, "_blank"); if (!w) doc.save(`${VERSAO.codigo}-procedimento-inventario.pdf`); }
  return doc;
}
