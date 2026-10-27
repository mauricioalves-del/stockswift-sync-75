// MBR — montagem do .pptx (entrega 1: capa + Seção 2 "Inventários e Movimentados").
import PptxGenJS from "pptxgenjs";
import { carregarInventario } from "../atlas-inventario";
import { lerTudo } from "../atlas-investigacao";
import { coletarDados, type FontesMbr } from "./dados";
import { ALTURA, LARGURA, nomeMes } from "./formato";
import { slideAberturaSecao, slideCapa } from "./kit";
import { ITENS_SECAO2, slideConcentracao, slideFaixas, slideIap, slideIaq, slideItemAItem, slideLoja, slideMovimentados, slidePatio, slideScorecardAlmox } from "./secao2";

export const TOTAL_SECOES = 4;

/** Lê do banco tudo o que o MBR usa (tabelas atlas_* migradas do Atlas). */
export async function carregarFontesMbr(): Promise<FontesMbr> {
  const [inv, movHist, movDiv, resumoMov, almox] = await Promise.all([
    carregarInventario(),
    lerTudo<any>("atlas_movimentacoes_historico", "id, almoxarifado, data_movimento, divergencia, valor_divergencia", (q) => q.eq("origem", "movimentacao")),
    lerTudo<any>("atlas_divergencias", "id, almoxarifado, data_deteccao, valor_estimado", (q) => q.eq("origem", "movimentacao")),
    lerTudo<any>("atlas_resumos_movimentacao_mensal", "id, mes, almoxarifado, itens_analisados, itens_sem_divergencia, pct_acuracia"),
    lerTudo<any>("atlas_almoxarifados", "codigo, nome_exibicao, ativo, participa_contagem_diaria", undefined, "codigo"),
  ]);
  return { inv, movHist, movDiv, resumoMov, almox };
}

/** Meses com fechamento de inventário (mais recente primeiro). */
export const mesesDisponiveis = (F: FontesMbr) => [...new Set(F.inv.fechamentos.map((f) => f.mes))].sort().reverse();

export function montarMbr(F: FontesMbr, mes: string, geradoEm = new Date()) {
  const d = coletarDados(F, mes), rotulo = nomeMes(mes);
  const p = new PptxGenJS();
  p.defineLayout({ name: "MBR", width: LARGURA, height: ALTURA }); p.layout = "MBR";
  p.title = `MBR ${rotulo}`; p.company = "Mágio Chocolates";
  let pag = 1;
  slideCapa(p, rotulo, geradoEm.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
  slideAberturaSecao(p, rotulo, ++pag, 2, TOTAL_SECOES, "Inventários e Movimentados", "Acurácia de fechamento, ponderação por valor e reconciliação diária sistema x físico.", ITENS_SECAO2);
  for (const f of [slideIap, slideIaq, slideConcentracao, slideFaixas, slideLoja, slidePatio, slideItemAItem, slideMovimentados, slideScorecardAlmox]) f(p, rotulo, ++pag, d);
  return { pptx: p, dados: d, nomeArquivo: `MBR_Atlas_${mes.replace("-", "")}.pptx` };
}
