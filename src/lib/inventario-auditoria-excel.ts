import ExcelJS from "exceljs";
import type { DadosInv, FiltroInv } from "./atlas-inventario";
import type { Database } from "@/integrations/supabase/types";
import { lotesParaCorrecao, lotesPosFaturamento, qtdFinal } from "./inventario-correcao-lotes";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type InventarioAudit = Row<"inv_inventarios"> & { fechamento_id?: number | null };
export type PacoteAuditoria = {
  dados: DadosInv; filtro: FiltroInv; inventarios: InventarioAudit[];
  itens: Row<"inv_itens">[]; duplas: Row<"inv_duplas">[];
  usuarios: { id: string; nome: string | null; email: string | null }[];
  historico: Row<"auditoria">[]; assinaturas: Row<"atlas_conciliacoes_ciencia">[];
  fechamentos: Record<string, unknown>[];
  validades: Map<string, Map<string, string | null>>;
  indicadores: Record<string, number | null>; geradoEm: string;
};
type Valor = ExcelJS.CellValue;
const decimal = '0.0000;[Red](0.0000);"-"';
const moeda = '"R$" #,##0.00;[Red]("R$" #,##0.00);"-"';
const json = (v: unknown) => v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

export function montarExcelAuditoria(p: PacoteAuditoria) {
  const wb = new ExcelJS.Workbook(); wb.creator = "Mágio — Inventário"; wb.created = new Date(p.geradoEm);
  function aba(nome: string, cab: string[], linhas: Valor[][]) {
    const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(cab); linhas.forEach((l) => ws.addRow(l));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: cab.length } };
    ws.columns.forEach((c, idx) => { c.width = Math.min(42, Math.max(16, (cab[idx]?.length ?? 16) + 2)); });
    ws.eachRow((row, n) => {
      row.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, ...(n === 1 ? { bold: true, color: { argb: "FFFFFFFF" } } : {}) };
        cell.alignment = { vertical: "top", wrapText: true };
        if (n === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263238" } };
        else if (typeof cell.value === "number" || cell.type === ExcelJS.ValueType.Formula) cell.numFmt = decimal;
        else if (typeof cell.value === "string") cell.numFmt = "@";
      });
      if (n === 1) row.height = 30;
    });
    return ws;
  }
  const usuario = (id: string | null) => { const u = p.usuarios.find((x) => x.id === id); return u?.nome || u?.email || id || ""; };
  const dupla = (id: string | null) => p.duplas.find((x) => x.id === id)?.nome ?? id ?? "";
  const oficiais = p.dados.itens.filter((i) => (!p.filtro.almox || i.almoxarifado === p.filtro.almox) && (!p.filtro.mes || i.mes === p.filtro.mes));
  const resumo = aba("Resumo", ["Informação", "Valor"], [
    ["Exportado em (UTC)", p.geradoEm], ["Competência", p.filtro.mes ?? "Todo o histórico"], ["Almoxarifado", p.filtro.almox ?? "Todos"],
    ["Itens no resultado oficial", oficiais.length], ["Inventários com contagens acessíveis", p.inventarios.length],
    ["Lotes de contagem exportados", p.itens.length],
    ...Object.entries(p.indicadores).map(([k, v]): Valor[] => [k, v]),
    ["Critério de contagem", "Final oficial; na ausência, recontagem e depois primeira contagem. Quantidade em branco permanece pendente."],
    ["Critério de ajuste", "Produtos faturados são excluídos integralmente do ajuste geral; a simulação FEFO é apresentada separadamente."],
    ["Cobertura", "Somente registros acessíveis ao usuário. Fechamentos importados por planilha podem não ter contagem por lote vinculada. Ausência de histórico ou assinatura não comprova ausência da ação."],
    ["FEFO", "Simulação da venda, não baixa efetiva. Validades consultadas no estoque na exportação; sem validade, lote ordenado por código após os datados."],
    ["Fonte", "Resultado oficial, Contagem de Inventário, registros de auditoria e assinaturas da plataforma; nenhuma alteração de estoque."],
  ]); resumo.getColumn(2).width = 90;
  resumo.eachRow((row, n) => { if (n === 1 || typeof row.getCell(2).value !== "number") return; const rotulo = String(row.getCell(1).value); row.getCell(2).numFmt = rotulo.includes("(R$)") ? moeda : rotulo.includes("(%)") ? '0.00"%"' : "0"; });
  const resultado = oficiais.map((i): Valor[] => {
    const custo = i.custoUsado ?? p.dados.custos.get(i.sku) ?? null;
    return [i.fechamento_id, i.data, i.mes, i.almoxarifado, i.sku, i.descricao, i.categoria, i.qtd_sistema, i.qtd_contagem, i.divergencia, custo, i.divergente ? Math.round((custo == null ? Math.abs(i.valor) : Math.abs(i.divergencia) * custo) * 100) / 100 : 0, i.divergente ? "Divergente" : "Acurado", i.recorrencias];
  });
  const cabResultado = ["Fechamento", "Data", "Competência", "Almoxarifado", "SKU", "Produto", "Grupo", "Sistema", "Final oficial", "Diferença final", "Custo unitário (R$)", "Valor divergente (R$)", "Status oficial", "Recorrências"];
  for (const [nome, linhas] of [["Resultado por produto", resultado], ["Divergências oficiais", resultado.filter((l) => l[12] === "Divergente")]] as const) {
    const ws = aba(nome, cabResultado, linhas);
    ws.getColumn(11).numFmt = moeda; ws.getColumn(12).numFmt = moeda;
  }
  aba("Inventários", ["ID", "Número", "Título", "Almoxarifado", "Status", "Data planejada", "Lista gerada em", "Apurado em", "Finalizado em", "Finalizado por", "Observações"], p.inventarios.map((i) => [i.id, i.numero, i.titulo, i.almoxarifado, i.status, i.data_geracao, i.gerada_em, i.apurado_em, i.finalizado_em, usuario(i.finalizado_por), i.observacao]));
  const lotes = aba("Contagens por lote", ["Inventário", "Número", "Almoxarifado", "SKU", "Produto", "Grupo", "Lote", "Local físico", "Unidade", "Origem", "Sistema", "1ª contagem", "2ª contagem", "Final oficial", "Qtd. faturada", "Físico sem faturamento", "Diferença final", "Custo unitário (R$)", "Diferença lote (R$)", "Dupla contagem", "Contado por", "Contado em", "Dupla recontagem", "Recontado por", "Recontado em", "Observações"], p.itens.map((i) => {
    const inv = p.inventarios.find((x) => x.id === i.inventario_id); const final = qtdFinal(i);
    return [i.inventario_id, inv?.numero ?? null, inv?.almoxarifado ?? "", i.codigo_produto, i.descricao, i.grupo, i.lote, i.local_fisico, i.unidade, i.origem_item, i.qtd_sistema, i.qtd_contagem, i.qtd_recontagem, final, i.qtd_faturada, final == null ? null : final - i.qtd_faturada, final == null ? null : final - i.qtd_sistema, i.custo_unitario, final == null || i.custo_unitario == null ? null : Math.round((final - i.qtd_sistema) * i.custo_unitario * 100) / 100, dupla(i.dupla_id), usuario(i.contado_por), i.contado_em, dupla(i.dupla_recontagem_id), usuario(i.recontado_por), i.recontado_em, i.observacao];
  }));
  for (let r = 2; r <= lotes.rowCount; r++) {
    for (const [col, formula] of [[16, `IF(N${r}="","",N${r}-O${r})`], [17, `IF(N${r}="","",N${r}-K${r})`], [19, `IF(OR(N${r}="",R${r}=""),"",ROUND(Q${r}*R${r},2))`]] as const) {
      const cell = lotes.getCell(r, col); const result = cell.value; cell.value = { formula, result: typeof result === "number" ? result : "" }; cell.numFmt = col === 19 ? moeda : decimal;
    }
  }
  lotes.getColumn(18).numFmt = moeda;
  const ajustes: Valor[][] = [], fefo: Valor[][] = [];
  for (const inv of p.inventarios) {
    const itens = p.itens.filter((i) => i.inventario_id === inv.id);
    // Não fabricar ajuste zero para produto ainda pendente em um de seus lotes.
    const pendentes = new Set(itens.filter((i) => qtdFinal(i) == null).map((i) => i.codigo_produto));
    for (const l of lotesParaCorrecao(itens.filter((i) => !pendentes.has(i.codigo_produto)))) ajustes.push([inv.numero, inv.almoxarifado, l.sku, l.descricao, l.lote, l.sistema, l.contado, l.diferenca, l.tipo]);
    for (const l of lotesPosFaturamento(itens, p.validades.get(inv.id) ?? new Map())) fefo.push([inv.numero, inv.almoxarifado, l.sku, l.descricao, l.lote, l.validade, l.sistema, l.baixaFefo, l.sistemaPos, l.fisico, l.diferenca, l.diferenca ? "Correção de lote" : "Sem correção"]);
  }
  aba("Ajustes e correções de lote", ["Inventário", "Almoxarifado", "SKU", "Produto", "Lote", "Sistema", "Final", "Ajuste quantidade", "Tipo"], ajustes);
  aba("Faturamento aplicado", ["Inventário", "SKU", "Produto", "Lote", "Qtd. faturada", "Final após conciliação", "Físico sem faturamento", "Contado em", "Observações"], p.itens.filter((i) => i.qtd_faturada > 0).map((i) => [p.inventarios.find((v) => v.id === i.inventario_id)?.numero ?? null, i.codigo_produto, i.descricao, i.lote, i.qtd_faturada, qtdFinal(i), qtdFinal(i) == null ? null : Number(qtdFinal(i)) - i.qtd_faturada, i.contado_em, i.observacao]));
  aba("FEFO pós-faturamento", ["Inventário", "Almoxarifado", "SKU", "Produto", "Lote", "Validade consultada", "Sistema antes", "Baixa FEFO simulada", "Sistema pós-venda", "Físico", "Correção quantidade", "Situação"], fefo);
  aba("Equipes", ["Inventário", "Dupla", "Membro 1", "Membro 2", "Conta", "Reconta", "Contagem concluída em", "Recontagem concluída em"], p.duplas.map((d) => [p.inventarios.find((i) => i.id === d.inventario_id)?.numero ?? null, d.nome, usuario(d.membro1), usuario(d.membro2), d.conta ? "Sim" : "Não", d.reconta ? "Sim" : "Não", d.contagem_concluida_em, d.recontagem_concluida_em]));
  aba("Histórico de alterações", ["Registro", "Data UTC", "Entidade", "Registro de origem", "Ação", "Usuário", "Antes", "Depois", "Observação"], p.historico.map((h) => [h.id, h.created_at, h.entidade, h.entidade_id, h.acao, usuario(h.usuario), json(h.dados_antes), json(h.dados_depois), h.observacao]));
  aba("Assinaturas", ["Fechamento", "Papel", "Assinante", "Data", "Total divergentes assinado", "Valor divergente assinado (R$)", "Resumo assinado", "Itens assinados", "Observação"], p.assinaturas.map((s) => [s.fechamento_id, s.papel_assinatura, s.gestor_nome || s.gestor_username, s.data_assinatura, s.total_itens_divergentes, s.valor_total_divergente, json(s.resumo_acuracia_snapshot), json(s.itens_divergentes_snapshot), s.observacao])).getColumn(6).numFmt = moeda;
  const chaves = [...new Set(p.fechamentos.flatMap((f) => Object.keys(f)))];
  aba("Fechamentos de origem", chaves.length ? chaves : ["ID"], p.fechamentos.map((f) => chaves.map((k) => typeof f[k] === "number" ? f[k] as number : json(f[k]))));
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}