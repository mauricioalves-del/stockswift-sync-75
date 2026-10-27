// MBR — montagem do .pptx completo (modelo final "MBR - Controle"): capa + Seções 1 a 4, todos os KPIs lidos do Stock Savvy.
import PptxGenJS from "pptxgenjs";
import { carregarInventario } from "../atlas-inventario";
import { lerTudo } from "../atlas-investigacao";
import { coletarDados, type FontesMbr } from "./dados";
import { ALTURA, LARGURA, nomeMes } from "./formato";
import { slideAberturaSecao, slideCapa } from "./kit";
import { ITENS_SECAO2, SLIDES_SECAO2 } from "./secao2";
import { ITENS_SECAO1, slideResumoExecutivo, slideScorecard, type Consolidado } from "./secao1";
import { DESCRICAO_SECAO3, ITENS_SECAO3, slideBaixas, slideDispersao, slideFarol, slideFefo, slideInvestimento, slidePacotes, slideRecuperacao, slideSemMovimentacao, slideTestes } from "./secao3";
import { slideAberturaAtlas, slideAberturaMetas, slideFechamentoModulos, slideImpacto, slideMetas, slideProximosPassos, slidesFechamentoAcoes } from "./secao4";
import type { Riscos } from "./fontes3";

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

/** Quantos controles do Stock Savvy (Seção 3 + Fechamento) trouxeram dado no mês. */
export function controlesIntegrados(R: Partial<Riscos> | null | undefined) {
  if (!R) return 0;
  return [R.baixas?.quantidade, R.investimento?.qtd, R.farol?.totalLotes, R.semMov?.total, (R.recuperacao?.mensal.length ?? 0) + (R.recuperacao?.topRecuperados.length ?? 0), R.dispersao?.ops, R.testes?.itens, R.fefo?.total, R.fechamento?.resumo.length].filter((x) => !!x).length;
}

/** Monta o MBR do mês. `R` = fontes das Seções 1/3/4 (carregarRiscos); sem elas, os slides mostram o aviso de indisponível. */
export function montarMbr(F: FontesMbr, mes: string, geradoEm = new Date(), R: Partial<Riscos> | null = null) {
  const d = coletarDados(F, mes), rotulo = nomeMes(mes);
  const p = new PptxGenJS();
  p.defineLayout({ name: "MBR", width: LARGURA, height: ALTURA }); p.layout = "MBR";
  p.title = `MBR ${rotulo}`; p.company = "Mágio Chocolates";
  const c: Consolidado = { d, baixas: R?.baixas ?? null, pacotes: R?.pacotes ?? null, farol: R?.farol ?? null, obsolescencia: R?.obsolescencia ?? null, fefo: R?.fefo ?? null };
  let pag = 1; const prox = () => ++pag;
  slideCapa(p, rotulo, geradoEm.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
  // Seção 1
  slideAberturaSecao(p, rotulo, prox(), 1, TOTAL_SECOES, "Resumo Executivo Geral", "Leitura consolidada do mês e status por frente monitorada.", ITENS_SECAO1);
  slideResumoExecutivo(p, rotulo, prox(), c);
  slideScorecard(p, rotulo, prox(), c);
  // Seção 2
  slideAberturaSecao(p, rotulo, prox(), 2, TOTAL_SECOES, "Inventários e Movimentados", "Acurácia de fechamento, ponderação por valor e reconciliação diária sistema x físico.", ITENS_SECAO2);
  for (const f of SLIDES_SECAO2) f(p, rotulo, prox(), d);
  // Seção 3
  slideAberturaSecao(p, rotulo, prox(), 3, TOTAL_SECOES, "Mapeamento de Riscos e Passivos", DESCRICAO_SECAO3, ITENS_SECAO3);
  slideBaixas(p, rotulo, prox(), R?.baixas ?? null, mes);
  slideInvestimento(p, rotulo, prox(), R?.investimento ?? null);
  slidePacotes(p, rotulo, prox(), R?.pacotes ?? null, mes);
  slideFarol(p, rotulo, prox(), R?.farol ?? null, geradoEm);
  slideSemMovimentacao(p, rotulo, prox(), R?.semMov ?? null, geradoEm);
  slideRecuperacao(p, rotulo, prox(), R?.recuperacao ?? null);
  slideDispersao(p, rotulo, prox(), R?.dispersao ?? null);
  slideTestes(p, rotulo, prox(), R?.testes ?? null);
  slideFefo(p, rotulo, prox(), R?.fefo ?? null);
  // Seção 4
  slideAberturaMetas(p, rotulo, prox(), R?.metas ?? null);
  slideMetas(p, rotulo, prox(), R?.metas ?? null, R?.fechamento ?? null);
  slideAberturaAtlas(p, rotulo, prox());
  slideImpacto(p, rotulo, prox(), c, controlesIntegrados(R));
  slideFechamentoModulos(p, rotulo, prox(), R?.fechamento ?? null);
  slidesFechamentoAcoes(p, rotulo, prox, R?.fechamento ?? null);
  slideProximosPassos(p, rotulo, prox(), c);
  return { pptx: p, dados: d, consolidado: c, nomeArquivo: `MBR_Controle_${mes.replace("-", "")}.pptx` };
}
