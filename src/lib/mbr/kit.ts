// MBR — primitivas de desenho sobre pptxgenjs, com a mesma geometria (polegadas) e identidade visual do gerador do Atlas.
import type PptxGenJS from "pptxgenjs";
import { ALTURA, COR, FONTE, LARGURA, MARGEM, alturaCaixaLeitura, caberNoEspaco, linhasEstimadas } from "./formato";

export type Pptx = PptxGenJS;
export type Slide = PptxGenJS.Slide;
type Align = "left" | "center" | "right";

export type TextoOpts = { tamanho?: number; negrito?: boolean; cor?: string; alinhamento?: Align; espacamento?: number; meio?: boolean; italico?: boolean };
export function texto(s: Slide, x: number, y: number, w: number, h: number, t: string | string[], o: TextoOpts = {}) {
  const linhas = Array.isArray(t) ? t : [t];
  const base = { fontFace: FONTE, fontSize: o.tamanho ?? 16, bold: !!o.negrito, italic: !!o.italico, color: o.cor ?? COR.CINZA_TEXTO, align: o.alinhamento ?? "left" };
  s.addText(linhas.map((l, i) => ({ text: l, options: { ...base, breakLine: i < linhas.length - 1 } })), {
    x, y, w, h, margin: 0, valign: o.meio ? "middle" : "top", wrap: true, fit: "none", lineSpacingMultiple: o.espacamento ?? 1, ...base,
  });
}
/** Texto com trechos de cor/negrito diferentes no mesmo parágrafo. */
export function textoRico(s: Slide, x: number, y: number, w: number, h: number, partes: { t: string; cor?: string; negrito?: boolean }[], tamanho: number, meio = true) {
  s.addText(partes.map((p) => ({ text: p.t, options: { fontFace: FONTE, fontSize: tamanho, bold: !!p.negrito, color: p.cor ?? COR.CINZA_TEXTO } })), { x, y, w, h, margin: 0, valign: meio ? "middle" : "top", wrap: true, fit: "none" });
}

export function retangulo(s: Slide, x: number, y: number, w: number, h: number, o: { fill?: string; borda?: string; arredondado?: boolean; raio?: number; esp?: number } = {}) {
  const arred = o.arredondado ?? true;
  s.addShape(arred ? "roundRect" : "rect", {
    x, y, w, h, rectRadius: arred ? (o.raio ?? 0.1) * Math.min(w, h) : undefined,
    fill: o.fill ? { color: o.fill } : { type: "none" } as any,
    line: o.borda ? { color: o.borda, width: o.esp ?? 0.75 } : { type: "none" } as any,
  });
}
export const fundo = (s: Slide, cor: string) => { s.background = { color: cor }; };

/** `alerta`: palavra destacada (marca-texto amarelo) antes do título, ex.: "Atenção – Acompanhamento Individual…". */
export function cabecalho(s: Slide, titulo: string, mesLabel: string, pagina: number, subtitulo?: string, alerta?: string) {
  texto(s, MARGEM, 0.32, 9.5, 0.22, "RELATÓRIO EXECUTIVO · MÁGIO CHOCOLATES", { tamanho: 10, negrito: true, cor: COR.VERDE_AMAZONIA });
  if (alerta) {
    const o = { fontFace: FONTE, fontSize: 24, bold: true, color: COR.AZUL_INSTITUCIONAL };
    s.addText([{ text: alerta, options: { ...o, highlight: "FFFF00" } as any }, { text: ` – ${titulo}`, options: o }], { x: MARGEM, y: 0.58, w: LARGURA - MARGEM - 0.4, h: 0.45, margin: 0, valign: "top", wrap: true, fit: "none" });
  } else texto(s, MARGEM, 0.58, 9.7, 0.55, titulo, { tamanho: 24, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (subtitulo) texto(s, MARGEM, 1.1, 9.7, 0.35, subtitulo, { tamanho: 13 });
  texto(s, LARGURA - 2.9, 0.32, 2.4, 0.3, mesLabel.toUpperCase(), { tamanho: 11, negrito: true, cor: COR.VERDE_AMAZONIA, alinhamento: "right" });
  texto(s, LARGURA - 2.9, ALTURA - 0.42, 2.4, 0.3, String(pagina).padStart(2, "0"), { tamanho: 10, alinhamento: "right" });
}

export type Kpi = { valor: string; rotulo: string; cor?: string; contexto?: string | null; corContexto?: string; borda?: string | null };
export function cartaoKpi(s: Slide, x: number, y: number, w: number, h: number, k: Kpi, deslocRotulo: number | null = null, tamValorBase = 27) {
  retangulo(s, x, y, w, h, { fill: COR.BRANCO, borda: k.borda ?? COR.CINZA_CLARO, raio: 0.14, esp: k.borda ? 1.5 : 0.75 });
  const pad = 0.16, lt = w - 2 * pad;
  let tv = tamValorBase, valor = k.valor;
  const maxC = (t: number, f: number) => Math.max(1, Math.floor(lt / ((t / 72) * f)));
  if (valor) {
    while (tv > 14 && valor.length > maxC(tv, 0.57)) tv--;
    if (valor.length > maxC(tv, 0.57)) valor = valor.slice(0, Math.max(1, maxC(tv, 0.57) - 1)).trimEnd() + "…";
  }
  texto(s, x + pad, y + 0.08, lt, 0.34, valor, { tamanho: tv, negrito: true, cor: k.cor ?? COR.AZUL_INSTITUCIONAL });
  let rot = k.rotulo.toUpperCase(), tr = 10;
  if (rot) {
    while (tr > 7 && rot.length > maxC(tr, 0.72)) tr -= 0.5;
    if (rot.length > maxC(tr, 0.72)) rot = rot.slice(0, Math.max(1, maxC(tr, 0.72) - 1)).trimEnd() + "…";
  }
  const yRot = deslocRotulo != null && !k.contexto ? y + deslocRotulo : y + h - (k.contexto ? 0.32 : 0.18);
  texto(s, x + pad, yRot, lt, 0.16, rot, { tamanho: tr, negrito: true });
  if (k.contexto) texto(s, x + pad, y + h - 0.16, lt, 0.16, k.contexto, { tamanho: 9.5, cor: k.corContexto ?? COR.CINZA_TEXTO });
}
export function linhaKpis(s: Slide, y: number, kpis: Kpi[], altura = 0.65, deslocRotulo = 0.383, tamValorBase = 20) {
  const n = kpis.length, gap = 0.22, wCard = (LARGURA - 2 * MARGEM - gap * (n - 1)) / n;
  kpis.forEach((k, i) => cartaoKpi(s, MARGEM + i * (wCard + gap), y, wCard, altura, k, deslocRotulo, tamValorBase));
}

export function caixaLeitura(s: Slide, x: number, y: number, w: number, h: number, rotulo: string, t: string, o: { fundo?: string; corRotulo?: string; tamanho?: number } = {}) {
  retangulo(s, x, y, w, h, { fill: o.fundo ?? COR.OFF_WHITE, raio: 0.1 });
  const pad = 0.2, ar = 0.26, tam = o.tamanho ?? 13;
  texto(s, x + pad, y + pad * 0.6, w - 2 * pad, ar, rotulo.toUpperCase(), { tamanho: 11, negrito: true, cor: o.corRotulo ?? COR.VERDE_AMAZONIA });
  const yt = y + pad * 0.6 + ar, lt = w - 2 * pad, at = y + h - yt - pad * 0.5;
  texto(s, x + pad, yt, lt, at, caberNoEspaco(t, lt, at, tam), { tamanho: tam, espacamento: 1.12 });
}
export { alturaCaixaLeitura };

export function listaMarcadores(s: Slide, x: number, y: number, w: number, h: number, itens: string[], cor: string = COR.VERDE_AMAZONIA, tam = 12.5, espLinha = 0.24) {
  if (!itens.length) itens = ["Sem observações relevantes neste recorte."];
  let yy = y, exibidos = 0;
  for (let i = 0; i < itens.length; i++) {
    const alt = espLinha * linhasEstimadas(itens[i], w - 0.22, tam) + 0.1;
    if (h && exibidos > 0 && yy - y + alt > h) { texto(s, x + 0.22, yy, w - 0.22, 0.24, `+ ${itens.length - i} adicional(is) — ver Scorecard.`, { tamanho: Math.max(9, tam - 1), italico: true }); return yy; }
    texto(s, x, yy, 0.18, 0.24, "•", { tamanho: tam, negrito: true, cor });
    texto(s, x + 0.22, yy, w - 0.22, 0.6, itens[i], { tamanho: tam, espacamento: 1.1 });
    yy += alt; exibidos++;
  }
  return yy;
}

// ---------- tabela ----------
export type Celula = string | { t: string; cor?: string; negrito?: boolean };
export function tabela(s: Slide, x: number, y: number, w: number, h: number, cab: string[], linhas: Celula[][], o: { larguras?: number[]; corCab?: string; tamanho?: number; margemV?: number } = {}) {
  const mv = o.margemV ?? 0.05;
  const tam = o.tamanho ?? 12, rel = o.larguras ?? cab.map(() => 1), tot = rel.reduce((a, b) => a + b, 0);
  const rows: PptxGenJS.TableRow[] = [
    cab.map((c) => ({ text: c, options: { bold: true, color: COR.BRANCO, fill: { color: o.corCab ?? COR.AZUL_INSTITUCIONAL }, fontSize: tam } })),
    ...linhas.map((l, i) => l.map((c) => {
      const v = typeof c === "string" ? { t: c } : c;
      return { text: v.t ?? "", options: { color: v.cor ?? COR.CINZA_TEXTO, bold: !!v.negrito, fill: { color: i % 2 === 0 ? COR.BRANCO : COR.CINZA_LINHA_PAR }, fontSize: tam - 1 } };
    })),
  ];
  s.addTable(rows, { x, y, w, colW: rel.map((r) => (w * r) / tot), rowH: h / rows.length, fontFace: FONTE, valign: "middle", margin: [mv, 0.1, mv, 0.1], border: { type: "none" } as any, autoPage: false });
}

// ---------- gráficos ----------
const eixos = (tam = 10) => ({
  catAxisLabelFontSize: tam, catAxisLabelColor: COR.CINZA_TEXTO, catAxisLabelFontFace: FONTE, catAxisLineShow: true, catAxisLineColor: COR.CINZA_CLARO,
  valAxisLabelFontSize: tam, valAxisLabelColor: COR.CINZA_TEXTO, valAxisLabelFontFace: FONTE, valAxisLineShow: false,
  valGridLine: { color: COR.CINZA_CLARO, size: 0.75 }, catGridLine: { style: "none" as const },
});
type Pts = (number | null)[];

/** Colunas de uma série (cores por ponto opcionais), rótulos de dado e, opcionalmente, reta de tendência tracejada. */
export function graficoColunas(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, cats: string[], nome: string, valores: Pts, o: { cor?: string; coresPontos?: (string | null)[]; formato?: string; tendencia?: Pts | null; corTendencia?: string; rotuloDentro?: boolean } = {}) {
  const cor = o.cor ?? COR.VERDE_AMAZONIA;
  const cores = o.coresPontos ? o.coresPontos.map((c) => c ?? cor) : [cor];
  const contraste = corContraste(cor);
  const barra = { type: p.ChartType.bar, data: [{ name: nome, labels: cats, values: valores as number[] }], options: { chartColors: cores.length > 1 ? cores : [cor], barGapWidthPct: 150 } };
  const base = { x, y, w, h, ...eixos(10), showLegend: false, showValue: true, dataLabelFontSize: o.rotuloDentro ? 9 : 10, dataLabelColor: o.rotuloDentro ? contraste : COR.CINZA_TEXTO, dataLabelFormatCode: o.formato ?? '0"%"', dataLabelPosition: o.rotuloDentro ? "inEnd" : "outEnd" } as any;
  if (o.tendencia) {
    const ct = o.corTendencia ?? COR.SUCESSO;
    const linha = { type: p.ChartType.line, data: [{ name: "Tendência linear", labels: cats, values: o.tendencia as number[] }], options: { chartColors: [ct], lineSize: 1.4, lineDash: "dash", lineDataSymbol: "circle", lineDataSymbolSize: 5, lineDataSymbolLineColor: COR.BRANCO, showValue: false, dataLabelPosition: "t" } };
    s.addChart([barra, linha] as any, { ...base, valAxes: [{ showValAxisTitle: false }], catAxes: [{ catAxisTitle: "" }] } as any);
  } else s.addChart(p.ChartType.bar, barra.data, { ...base, ...barra.options } as any);
}

/** Colunas agrupadas com várias séries e legenda embaixo. */
export function graficoMulti(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, cats: string[], series: { nome: string; valores: Pts; cor: string }[], o: { formato?: string; rotulos?: boolean } = {}) {
  s.addChart(p.ChartType.bar, series.map((v) => ({ name: v.nome, labels: cats, values: v.valores as number[] })), {
    x, y, w, h, ...eixos(10), chartColors: series.map((v) => v.cor), barGapWidthPct: 150,
    showLegend: true, legendPos: "b", legendFontSize: 10, legendColor: COR.CINZA_TEXTO, legendFontFace: FONTE,
    showValue: o.rotulos ?? true, dataLabelFontSize: 9, dataLabelColor: COR.CINZA_TEXTO, dataLabelFormatCode: o.formato ?? "#,##0",
  } as any);
}

/** Colunas no eixo principal + linha no eixo secundário (Pareto, magnitude). */
export function graficoComboDuplo(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, cats: string[], barra: { nome: string; valores: Pts; cor: string; formato: string; rotulos?: boolean }, linha: { nome: string; valores: Pts; cor: string; formato: string; tracejado?: boolean }) {
  s.addChart([
    { type: p.ChartType.bar, data: [{ name: barra.nome, labels: cats, values: barra.valores as number[] }], options: { chartColors: [barra.cor], barGapWidthPct: 150, showValue: !!barra.rotulos, dataLabelFormatCode: barra.formato, dataLabelFontSize: 9, dataLabelColor: COR.CINZA_TEXTO, dataLabelPosition: "outEnd" } },
    { type: p.ChartType.line, data: [{ name: linha.nome, labels: cats, values: linha.valores as number[] }], options: { chartColors: [linha.cor], lineSize: 1.5, lineDash: linha.tracejado ? "dash" : "solid", lineDataSymbol: "circle", lineDataSymbolSize: 5, lineDataSymbolLineColor: COR.BRANCO, secondaryValAxis: true, secondaryCatAxis: true, showValue: false } },
  ] as any, {
    x, y, w, h, ...eixos(9), showLegend: true, legendPos: "b", legendFontSize: 9, legendColor: COR.CINZA_TEXTO, legendFontFace: FONTE,
    valAxes: [
      { showValAxisTitle: false, valAxisLabelFormatCode: barra.formato, valAxisLabelFontSize: 9, valAxisLabelColor: COR.CINZA_TEXTO, valGridLine: { color: COR.CINZA_CLARO, size: 0.75 }, valAxisLineShow: false },
      { showValAxisTitle: false, valAxisLabelFormatCode: linha.formato, valAxisLabelFontSize: 9, valAxisLabelColor: COR.CINZA_TEXTO, valGridLine: { style: "none" }, valAxisLineShow: false },
    ],
    catAxes: [{ catAxisTitle: "", catAxisLabelFontSize: 9, catAxisLabelColor: COR.CINZA_TEXTO }, { catAxisHidden: true }],
  } as any);
}

/** Colunas (ou barras, `horizontal`) empilhadas por série; `percentual` = 100% empilhado; `totais` = rótulo do total no topo. */
export function graficoEmpilhado(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, cats: string[], series: { nome: string; valores: Pts; cor: string }[], o: { horizontal?: boolean; percentual?: boolean; formato?: string; totais?: Pts | null; corTotais?: string; legenda?: boolean; rotulos?: boolean; tamEixo?: number; rotacao?: number } = {}) {
  const dados = series.map((v) => ({ name: v.nome, labels: cats, values: v.valores as number[] }));
  const barra = { barDir: o.horizontal ? "bar" : "col", barGrouping: o.percentual ? "percentStacked" : "stacked", chartColors: series.map((v) => v.cor), barGapWidthPct: 60, overlap: 100 };
  const base = {
    x, y, w, h, ...eixos(o.tamEixo ?? 9), showLegend: o.legenda ?? true, legendPos: "b", legendFontSize: 9, legendColor: COR.CINZA_TEXTO, legendFontFace: FONTE,
    showValue: !!o.rotulos, dataLabelFontSize: 8, dataLabelColor: COR.BRANCO, dataLabelFormatCode: o.formato ?? "#,##0", valAxisLabelFormatCode: o.percentual ? "0%" : o.formato ?? "#,##0",
    catAxisOrientation: o.horizontal ? "maxMin" : "minMax", catAxisLabelRotate: o.rotacao,
  } as any;
  if (o.totais && !o.horizontal) {
    const linha = { type: p.ChartType.line, data: [{ name: "Total", labels: cats, values: o.totais as number[] }], options: { chartColors: [COR.BRANCO], lineSize: 0, lineDataSymbol: "none", showValue: true, dataLabelPosition: "t", dataLabelFontSize: 8, dataLabelColor: o.corTotais ?? COR.CINZA_TEXTO, dataLabelFormatCode: o.formato ?? "#,##0" } };
    s.addChart([{ type: p.ChartType.bar, data: dados, options: { ...barra, showValue: !!o.rotulos } }, linha] as any, { ...base, valAxes: [{ showValAxisTitle: false, valAxisLabelFormatCode: o.formato ?? "#,##0", valAxisLabelFontSize: o.tamEixo ?? 9, valAxisLabelColor: COR.CINZA_TEXTO, valGridLine: { color: COR.CINZA_CLARO, size: 0.75 } }], catAxes: [{ catAxisTitle: "", catAxisLabelFontSize: o.tamEixo ?? 9, catAxisLabelColor: COR.CINZA_TEXTO, catAxisLabelRotate: o.rotacao }] } as any);
  } else s.addChart(p.ChartType.bar, dados, { ...base, ...barra } as any);
}

/** Barras horizontais de uma série (ranking), rótulo de valor na ponta e uma cor por barra opcional. */
export function graficoBarrasH(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, cats: string[], nome: string, valores: Pts, o: { cor?: string; cores?: string[]; formato?: string; tamEixo?: number } = {}) {
  const cores = o.cores ?? [o.cor ?? COR.AZUL_INSTITUCIONAL];
  s.addChart(p.ChartType.bar, [{ name: nome, labels: cats, values: valores as number[] }], {
    x, y, w, h, ...eixos(o.tamEixo ?? 9), barDir: "bar", catAxisOrientation: "maxMin", chartColors: cores, barGapWidthPct: 60, showLegend: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 8, dataLabelColor: COR.CINZA_TEXTO, dataLabelFormatCode: o.formato ?? "#,##0", valAxisHidden: true, valGridLine: { style: "none" },
  } as any);
}

/** Rosca (ou pizza) com legenda à direita e o valor dentro de cada fatia. */
export function graficoRosca(p: Pptx, s: Slide, x: number, y: number, w: number, h: number, nomes: string[], valores: number[], cores: string[], o: { pizza?: boolean; formato?: string } = {}) {
  s.addChart(o.pizza ? p.ChartType.pie : p.ChartType.doughnut, [{ name: "Valor", labels: nomes, values: valores }], {
    x, y, w, h, chartColors: cores.slice(0, Math.max(1, nomes.length)), holeSize: 50, showLegend: true, legendPos: "r", legendFontSize: 8, legendColor: COR.CINZA_TEXTO, legendFontFace: FONTE,
    showValue: true, showPercent: false, showLabel: false, dataLabelColor: COR.BRANCO, dataLabelFontSize: 8, dataLabelFontBold: true, dataLabelFormatCode: o.formato ?? "#,##0", dataBorder: { pt: 1.5, color: COR.BRANCO },
  } as any);
}

/** Funil de retângulos centralizados, largura proporcional ao valor. */
export function funil(s: Slide, x: number, y: number, w: number, h: number, estagios: { nome: string; valor: number }[], cores: string[], fmt: (v: number) => string) {
  if (!estagios.length) return;
  const hf = h / estagios.length, max = Math.max(...estagios.map((e) => e.valor), 0) || 1, wMax = w * 0.96, wMin = w * 0.34;
  estagios.forEach((e, i) => {
    const wf = wMin + (wMax - wMin) * (e.valor / max), xf = x + (w - wf) / 2, yf = y + i * hf;
    retangulo(s, xf, yf + 0.02, wf, hf - 0.05, { fill: cores[i % cores.length], arredondado: false });
    texto(s, xf + 0.04, yf + 0.02, wf - 0.08, hf - 0.05, `${e.nome} · ${fmt(e.valor)}`, { tamanho: 8, negrito: true, cor: COR.BRANCO, alinhamento: "center", meio: true });
  });
}

/** Etiqueta de status (pílula colorida, texto branco). */
export function badge(s: Slide, x: number, y: number, w: number, h: number, t: string, cor: string) {
  retangulo(s, x, y, w, h, { fill: cor, raio: 0.5 });
  texto(s, x, y, w, h, t, { tamanho: 10.5, negrito: true, cor: COR.BRANCO, alinhamento: "center", meio: true });
}

/** Branco sobre cor escura, cinza escuro sobre cor clara. */
export function corContraste(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? COR.BRANCO : COR.CINZA_TEXTO;
}

// ---------- slides de estrutura ----------
export function slideCapa(p: Pptx, mesLabel: string, geradoEm: string) {
  const s = p.addSlide(); fundo(s, COR.AZUL_INSTITUCIONAL);
  texto(s, 1, 2.55, 11.3, 0.3, "MÁGIO CHOCOLATES", { tamanho: 14, negrito: true, cor: COR.AZUL_CLARO });
  texto(s, 1, 2.95, 11.3, 1.1, "MBR Executivo - Controle", { tamanho: 40, negrito: true, cor: COR.BRANCO });
  texto(s, 1, 3.8, 11.3, 0.5, "Inteligência e controle operacional · Atlas", { tamanho: 18, cor: COR.AZUL_CLARO });
  texto(s, 1, 6.55, 11.3, 0.4, `${mesLabel}  ·  Gerado automaticamente pelo Stock Savvy em ${geradoEm}`, { tamanho: 13, cor: COR.OFF_WHITE });
}
export function slideAberturaSecao(p: Pptx, mesLabel: string, pagina: number, n: number, total: number, titulo: string, descricao: string, itens: string[]) {
  const s = p.addSlide(); fundo(s, COR.AZUL_INSTITUCIONAL);
  texto(s, MARGEM, 0.32, 4, 0.3, `SEÇÃO ${n} DE ${total}`, { tamanho: 11, negrito: true, cor: COR.AZUL_CLARO });
  texto(s, LARGURA - 2.9, 0.32, 2.4, 0.3, mesLabel.toUpperCase(), { tamanho: 11, negrito: true, cor: COR.AZUL_CLARO, alinhamento: "right" });
  texto(s, MARGEM, 1.15, LARGURA - 2 * MARGEM, 1, titulo, { tamanho: 34, negrito: true, cor: COR.BRANCO });
  texto(s, MARGEM, 2.15, LARGURA - 2 * MARGEM, 0.6, descricao, { tamanho: 15, cor: COR.AZUL_CLARO });
  let y = 3.15;
  texto(s, MARGEM, y, 4, 0.28, "NESTA SEÇÃO", { tamanho: 11, negrito: true, cor: COR.AZUL_CLARO }); y += 0.4;
  for (const it of itens) {
    texto(s, MARGEM, y, 0.24, 0.3, "•", { tamanho: 14, negrito: true, cor: COR.AZUL_CLARO });
    texto(s, MARGEM + 0.28, y, LARGURA - 2 * MARGEM - 0.28, 0.3, it, { tamanho: 13, cor: COR.BRANCO }); y += 0.4;
  }
  texto(s, LARGURA - 2.9, ALTURA - 0.42, 2.4, 0.3, String(pagina).padStart(2, "0"), { tamanho: 10, cor: COR.AZUL_CLARO, alinhamento: "right" });
}
export const novoSlide = (p: Pptx) => { const s = p.addSlide(); fundo(s, COR.BRANCO); return s; };
