// Relatório em Excel de uma Missão de Inventário (contagem cíclica).
// Regras idênticas às da tela de execução: faixa de tolerância 95–105%
// (classificarFaixa), saldo "ao vivo" do almoxarifado da missão e lote manual
// (fora do sistema) tratado como Quebra de FEFO.
import * as XLSX from "xlsx";
import { classificarFaixa } from "@/lib/inventory";

type ItemMissao = {
  id: string;
  codigo_produto: string;
  descricao: string | null;
};
type LinhaSalva = {
  lote: string | null;
  lote_manual_texto: string | null;
  eh_nao_relacionado: boolean;
  quantidade_contada: number | string | null;
  saldo_sistemico_lote: number | string | null;
};
type LoteSist = { lote: string; saldo: number; custo_unitario: number };

export type EntradaRelatorio = {
  missao: { titulo: string; origem: string | null; data_execucao: string | null };
  itens: ItemMissao[];
  linhasPorItem: Map<string, LinhaSalva[]>;
  lotesPorSku: Map<string, LoteSist[]>;
};

type StatusLote = "OK" | "DIVERGENCIA_NEGATIVA" | "DIVERGENCIA_POSITIVA" | "QUEBRA_FEFO";
type Celula = string | number | null;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;

const ROTULO_STATUS: Record<StatusLote, string> = {
  OK: "Dentro da tolerância",
  DIVERGENCIA_NEGATIVA: "Falta (contado < sistema)",
  DIVERGENCIA_POSITIVA: "Sobra (contado > sistema)",
  QUEBRA_FEFO: "Lote fora do sistema",
};

type LinhaLote = {
  sku: string;
  produto: string;
  lote: string;
  tipo: "Lote do sistema" | "Lote manual (fora do sistema)";
  sistema: number;
  contado: number;
  status: StatusLote;
  percentual: number | null;
  custo: number;
};

type ResumoSku = {
  sku: string;
  produto: string;
  itensTotal: number;
  itensContados: number;
  sistemaPorLote: Map<string, number>;
  contado: number;
  custo: number;
};

function slug(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function adicionarAba(wb: XLSX.WorkBook, nome: string, cabecalho: string[], linhas: Celula[][], larguras: number[]) {
  const corpo: Celula[][] = linhas.length > 0 ? linhas : [["— nenhum registro —"]];
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...corpo]);
  ws["!cols"] = larguras.map((wch) => ({ wch }));
  if (linhas.length > 0) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cabecalho.length - 1 } }) };
  }
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

export function baixarRelatorioMissao(entrada: EntradaRelatorio) {
  const { missao, itens, linhasPorItem, lotesPorSku } = entrada;

  const linhas: LinhaLote[] = [];
  const porSku = new Map<string, ResumoSku>();

  for (const item of itens) {
    const sku = item.codigo_produto;
    const s: ResumoSku = porSku.get(sku) ?? {
      sku, produto: item.descricao ?? "", itensTotal: 0, itensContados: 0,
      sistemaPorLote: new Map(), contado: 0, custo: 0,
    };
    porSku.set(sku, s);
    s.itensTotal += 1;
    if (!s.produto && item.descricao) s.produto = item.descricao;

    const salvas = linhasPorItem.get(item.id) ?? [];
    if (salvas.length === 0) continue; // item ainda pendente: não entra em nenhuma análise
    s.itensContados += 1;

    const lotesSku = lotesPorSku.get(sku) ?? [];
    for (const l of salvas) {
      const q = Number(l.quantidade_contada ?? 0) || 0;
      if (l.eh_nao_relacionado) {
        // Lote que existe fisicamente mas não no sistema: sistema = 0 por definição.
        s.contado += q;
        if (q > 0) {
          linhas.push({
            sku, produto: s.produto, lote: (l.lote_manual_texto ?? "").trim() || "(sem código)",
            tipo: "Lote manual (fora do sistema)", sistema: 0, contado: q,
            status: "QUEBRA_FEFO", percentual: null, custo: 0,
          });
        }
        continue;
      }
      const live = lotesSku.find((x) => x.lote === l.lote);
      const saldo = live ? live.saldo : Number(l.saldo_sistemico_lote ?? 0) || 0;
      const custo = live?.custo_unitario ?? 0;
      s.sistemaPorLote.set(l.lote ?? "", saldo); // por lote: não conta o mesmo saldo duas vezes
      s.contado += q;
      if (custo > 0 && s.custo === 0) s.custo = custo;
      const { classe, percentual } = classificarFaixa(q, saldo);
      linhas.push({
        sku, produto: s.produto, lote: l.lote ?? "", tipo: "Lote do sistema",
        sistema: saldo, contado: q, status: classe as StatusLote,
        percentual: saldo ? percentual : null, custo,
      });
    }
  }

  // ---- Análise por SKU (montante): soma dos lotes contados × soma do que o sistema tinha neles ----
  type AnaliseSku = {
    s: ResumoSku; sistema: number; dif: number; percentual: number | null;
    classe: "OK" | "DIVERGENCIA_NEGATIVA" | "DIVERGENCIA_POSITIVA" | "NAO_CONTADO";
    completo: boolean; lotesDivergentes: LinhaLote[];
  };
  const analises: AnaliseSku[] = [...porSku.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((s) => {
      const sistema = [...s.sistemaPorLote.values()].reduce((x, y) => x + y, 0);
      const lotesSku = linhas.filter((l) => l.sku === s.sku);
      const lotesDivergentes = lotesSku.filter((l) => l.status !== "OK");
      if (s.itensContados === 0) {
        return { s, sistema: 0, dif: 0, percentual: null, classe: "NAO_CONTADO" as const, completo: false, lotesDivergentes };
      }
      const { classe, percentual } = classificarFaixa(s.contado, sistema);
      return {
        s, sistema, dif: s.contado - sistema, percentual: sistema ? percentual : null,
        classe: classe as AnaliseSku["classe"],
        completo: s.itensContados === s.itensTotal, lotesDivergentes,
      };
    });

  const skuDivergente = (a: AnaliseSku) => a.classe === "DIVERGENCIA_NEGATIVA" || a.classe === "DIVERGENCIA_POSITIVA";
  // "Só lote": montante do SKU dentro da tolerância, contagem completa, mas há lote(s) divergente(s).
  const soLote = (a: AnaliseSku) => a.classe === "OK" && a.completo && a.lotesDivergentes.length > 0;

  const situacaoSku = (a: AnaliseSku) =>
    a.classe === "NAO_CONTADO" ? "Não contado"
    : a.classe === "OK" ? "Dentro da tolerância"
    : a.classe === "DIVERGENCIA_NEGATIVA" ? "Divergente — falta" : "Divergente — sobra";

  const tipoDiv = (a: AnaliseSku) =>
    skuDivergente(a) ? "Quantitativa"
    : soLote(a) ? "Só de lote"
    : a.classe === "OK" && !a.completo && a.lotesDivergentes.length > 0 ? "Verificar ao concluir a contagem"
    : "—";

  const linhaSku = (a: AnaliseSku): Celula[] => [
    a.s.sku, a.s.produto, a.s.itensTotal, a.s.itensContados,
    r3(a.sistema), r3(a.s.contado), r3(a.dif),
    a.percentual == null ? null : r1(a.percentual),
    a.s.custo || null, a.s.custo ? r3(a.dif * a.s.custo) : null,
    situacaoSku(a), tipoDiv(a),
  ];
  const cabSku = [
    "SKU", "Produto", "Lotes na missão", "Lotes contados", "Sistema (lotes contados)", "Contado", "Diferença",
    "Acuracidade (%)", "Custo unit. (R$)", "Impacto estimado (R$)", "Situação do SKU", "Tipo de divergência",
  ];
  const largSku = [14, 42, 10, 10, 16, 11, 11, 12, 12, 16, 22, 28];

  const linhaLote = (l: LinhaLote, a?: AnaliseSku): Celula[] => [
    l.sku, l.produto, l.lote, l.tipo, r3(l.sistema), r3(l.contado), r3(l.contado - l.sistema),
    l.percentual == null ? null : r1(l.percentual), ROTULO_STATUS[l.status],
    ...(a ? [situacaoSku(a), tipoDiv(a)] : []),
  ];
  const cabLote = ["SKU", "Produto", "Lote", "Tipo de lote", "Sistema (lote)", "Contado (lote)", "Diferença", "Acuracidade (%)", "Situação do lote"];
  const largLote = [14, 42, 24, 28, 14, 14, 11, 12, 26];

  const porSkuMap = new Map(analises.map((a) => [a.s.sku, a]));
  const lotesDiv = linhas
    .filter((l) => l.status !== "OK")
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.lote.localeCompare(b.lote));

  const acao = (l: LinhaLote) =>
    l.status === "QUEBRA_FEFO" ? "Lote existe fisicamente e não está no sistema — cadastrar/corrigir o lote"
    : l.status === "DIVERGENCIA_NEGATIVA" ? "Sistema tem saldo a mais neste lote — corrigir o lote no sistema"
    : "Contado a mais neste lote — corrigir o lote no sistema";

  const wb = XLSX.utils.book_new();

  adicionarAba(wb, "Resumo por SKU", cabSku, analises.map(linhaSku), largSku);

  adicionarAba(wb, "SKUs divergentes", cabSku,
    analises.filter(skuDivergente).map(linhaSku), largSku);

  adicionarAba(wb, "Lotes divergentes",
    [...cabLote, "SKU divergente no montante?", "Tipo de divergência do SKU"],
    lotesDiv.map((l) => {
      const a = porSkuMap.get(l.sku)!;
      return [...linhaLote(l), skuDivergente(a) ? "Sim" : "Não", tipoDiv(a)];
    }),
    [...largLote, 22, 28]);

  const soLoteLinhas: Celula[][] = [];
  for (const a of analises.filter(soLote)) {
    for (const l of a.lotesDivergentes.sort((x, y) => x.lote.localeCompare(y.lote))) {
      soLoteLinhas.push([...linhaLote(l), r3(a.sistema), r3(a.s.contado), acao(l)]);
    }
  }
  adicionarAba(wb, "Só correção de lote",
    [...cabLote, "Sistema (SKU)", "Contado (SKU)", "Ação sugerida"],
    soLoteLinhas, [...largLote, 14, 14, 62]);

  const dia = (missao.data_execucao ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  XLSX.writeFile(wb, `Relatorio_Missao_${slug(missao.titulo)}_${dia}.xlsx`);

  return {
    skusDivergentes: analises.filter(skuDivergente).length,
    lotesDivergentes: lotesDiv.length,
    soCorrecaoLote: analises.filter(soLote).length,
  };
}
