// MBR — Seção 2: Inventários e Movimentados (porte fiel dos slides do gerador do Atlas).
import { ALMOX_LOJA, ALMOX_PATIO_PAULISTA, ALTURA, COR, LARGURA, MARGEM, linhasEstimadas, fmtMoeda, fmtNum, fmtPct, fmtSinal, nomeMes, pontosTendencia, r2, rotuloMes, statusEvolucao, statusMaiorMelhor, tendenciaLinear, type Status } from "./formato";
import { alturaCaixaLeitura, cabecalho, caixaLeitura, graficoColunas, graficoComboDuplo, graficoMulti, linhaKpis, novoSlide, tabela, texto, type Celula, type Pptx, type Slide } from "./kit";
import { prejuizoPorAlmox, type DadosMbr, type ItemConc, type ItemScorecardAlmox } from "./dados";

const LC = LARGURA - 2 * MARGEM;          // largura cheia
const FIM = ALTURA - 0.42;                // fim da zona segura
const pctMom = (v: number | null | undefined) => fmtSinal(v, (x) => fmtPct(x));

/** Bloco "Resultado por almoxarifado" + Top faltas + Top sobras (3 colunas), sobre a lista de concentração de valor. */
function tabelasAlmoxTop(s: Slide, y: number, itens: ItemConc[], comp: DadosMbr["porAlmox"], campo: "item" | "iap" | "iaq", rotulo: string, porValor: boolean, rotuloQtd: string) {
  const lc = (LC - 2 * 0.28) / 3, xs = [MARGEM, MARGEM + lc + 0.28, MARGEM + 2 * (lc + 0.28)], at = 0.22, h = 1.35;
  const prej = prejuizoPorAlmox(itens);
  texto(s, xs[0], y, lc, at, `RESULTADO POR ALMOXARIFADO (${rotulo.toUpperCase()})`, { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  const ord = [...comp].sort((a, b) => (a[campo] ?? 999) - (b[campo] ?? 999));
  if (ord.length) tabela(s, xs[0], y + at, lc, h, ["Almox.", rotulo.slice(0, 8), "Result."], ord.slice(0, 5).map((c) => { const p = prej.get(c.chave) ?? 0; return [c.chave, fmtPct(c[campo]), { t: p < 0 ? `-${fmtMoeda(Math.abs(p))}` : fmtMoeda(p), cor: p < 0 ? COR.ERRO : COR.SUCESSO, negrito: true }]; }), { larguras: [1.5, 0.8, 1.1], tamanho: 9 });
  else caixaLeitura(s, xs[0], y + at, lc, h, "Almoxarifado", "Sem dado de fechamento por almoxarifado neste recorte.");
  const chave = (i: ItemConc) => (porValor ? i.valor : Math.abs(i.divergencia));
  const faltas = itens.filter((i) => i.divergencia < 0).sort((a, b) => chave(b) - chave(a)).slice(0, 5);
  const sobras = itens.filter((i) => i.divergencia > 0).sort((a, b) => chave(b) - chave(a)).slice(0, 5);
  const rot = (i: ItemConc) => (porValor ? fmtMoeda(i.valor) : `${fmtNum(Math.abs(i.divergencia))} un.`);
  ([["FALTAS", faltas, "-", COR.ERRO, "Faltas", "Sem falta calculável neste recorte."], ["SOBRAS", sobras, "+", COR.SUCESSO, "Sobras", "Sem sobra calculável neste recorte."]] as const).forEach(([tit, l, sinal, cor, vazio, msg], k) => {
    const x = xs[k + 1];
    texto(s, x, y, lc, at, `TOP ${tit} DO MÊS (${rotuloQtd.toUpperCase()})`, { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    if (l.length) tabela(s, x, y + at, lc, h, ["SKU", "Descrição", rotuloQtd.slice(0, 8)], l.map((i) => [i.sku, (i.descricao || "—").slice(0, 15), { t: `${sinal}${rot(i)}`, cor, negrito: true }]), { larguras: [1.1, 1.6, 1], tamanho: 9 });
    else caixaLeitura(s, x, y + at, lc, h, vazio, msg);
  });
  return { yFim: y + at + h, pior: ord[0] ?? null, faltas, sobras };
}

function resumoComRodape(s: Slide, y: number, rotulo: string, t: string, rodape: string | null, tam = 10, reservaRodape = 0.24) {
  const h = Math.min(Math.max(0.65, alturaCaixaLeitura(t, LC, tam)), Math.max(0.5, FIM - y - reservaRodape));
  caixaLeitura(s, MARGEM, y, LC, h, rotulo, t, { tamanho: tam });
  const yr = y + h + 0.04;
  if (rodape && yr < FIM) texto(s, MARGEM, yr, LC, 0.2, rodape, { tamanho: 8, italico: true });
}

/** Título da série + rótulo de tendência + colunas com reta de tendência. */
function serieComTendencia(p: Pptx, s: Slide, titulo: string, nome: string, meses: string[], valores: (number | null)[], cor: string, coresPontos?: (string | null)[]) {
  const t = tendenciaLinear(valores);
  texto(s, MARGEM, 2.78, LC - 3.2, 0.24, titulo, { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (t.rotulo) texto(s, MARGEM + LC - 3.2, 2.78, 3.2, 0.24, t.rotulo, { tamanho: 9, negrito: true, cor: t.cor, alinhamento: "right" });
  graficoColunas(p, s, MARGEM, 3.04, LC, 1, meses.map(rotuloMes), nome, valores.map((v) => v ?? 0), { cor, coresPontos, tendencia: pontosTendencia(valores), corTendencia: t.cor !== COR.SEM_DADO ? t.cor : COR.SUCESSO, rotuloDentro: true });
  return t;
}

export function slideIap(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Acurácia Ponderada — por Valor (IAP)", mesLabel, pag, "Leitura ponderada pelo valor financeiro do inventário, fechamento por almoxarifado e ranking financeiro");
  const c = d.comparativo, ev = d.evolucaoPonderada.slice(-6), ult = ev.at(-1), gap = c.gap, mom = ult?.varIap ?? null;
  linhaKpis(s, 1.55, [
    { valor: fmtPct(c.iap), rotulo: "IAP (por Valor)", cor: COR.VERDE_AMAZONIA },
    { valor: ult?.valorMod != null ? `R$ ${fmtNum(ult.valorMod, 2)}` : "—", rotulo: "Valor do Inventário em Jogo", contexto: "Valor Mod — sobra vs. falta" },
    { valor: gap != null ? fmtPct(Math.abs(gap)) : "—", rotulo: "Distorção (Item vs. IAP)", cor: gap != null && Math.abs(gap) >= 3 ? COR.ATENCAO : COR.SUCESSO },
    { valor: pctMom(mom), rotulo: "Variação do IAP (MoM)", cor: (mom ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO, contexto: (mom ?? 0) >= 0 ? "Melhora" : "Piora", corContexto: (mom ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO },
  ], 0.68);
  let t = tendenciaLinear([]), yT = 2.78 + 1.3 + 0.1;
  if (ev.length >= 2) { t = serieComTendencia(p, s, "EVOLUÇÃO MENSAL (MOM) — IAP", "IAP (por valor)", ev.map((e) => e.mes), ev.map((e) => e.iap), COR.AZUL_INSTITUCIONAL); yT = 3.04 + 1 + 0.1; }
  else caixaLeitura(s, MARGEM, 2.78, LC, 1.3, "Evolução do IAP", "Sem histórico suficiente de fechamentos ainda.");
  const { yFim, pior } = tabelasAlmoxTop(s, yT, d.concentracao.itens, d.porAlmox, "iap", "IAP", true, "Valor");
  let r = `O IAP fecha o mês em ${fmtPct(c.iap)}`;
  if (mom != null) r += `, com ${mom >= 0 ? "melhora" : "piora"} de ${fmtPct(Math.abs(mom))} frente ao mês anterior`;
  if (t.inclinacao != null && Math.abs(t.inclinacao) > 0.3) r += ` e tendência linear de ${fmtNum(Math.abs(t.inclinacao), 1)} p.p./mês no período`;
  if (ult?.valorMod != null) r += ` — há ${fmtMoeda(Math.abs(ult.valorMod))} em jogo entre sobra e falta (Valor Mod)`;
  r += ". O IAP pondera por valor financeiro — poucos itens de alto valor bastam pra manter o indicador alto mesmo com mais SKUs divergentes item a item.";
  if (pior) r += ` ${pior.chave} concentra o maior prejuízo ponderado por valor no período.`;
  resumoComRodape(s, yFim + 0.08, "Resumo da Acurácia Ponderada por Valor (IAP)", r, "IAP pondera cada divergência pelo valor financeiro do SKU. Ranking e resultado por almoxarifado cobrem só os itens da lista de concentração de valor (até 50 maiores por valor do mês).");
}

export function slideIaq(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Acurácia Ponderada — por Quantidade (IAQ)", mesLabel, pag, "Leitura ponderada pela quantidade de itens do inventário, fechamento por almoxarifado e ranking por unidades");
  const c = d.comparativo, ev = d.evolucaoPonderada.slice(-6), ult = ev.at(-1), mom = ult?.varIaq ?? null;
  const gap = c.item != null && c.iaq != null ? r2(c.item - c.iaq) : null;
  linhaKpis(s, 1.55, [
    { valor: fmtPct(c.iaq), rotulo: "IAQ (por Quantidade)" },
    { valor: fmtNum(d.kpis.divergentes), rotulo: "Itens Divergentes no Mês" },
    { valor: gap != null ? fmtPct(Math.abs(gap)) : "—", rotulo: "Distorção (Item vs. IAQ)", cor: gap != null && Math.abs(gap) >= 3 ? COR.ATENCAO : COR.SUCESSO },
    { valor: pctMom(mom), rotulo: "Variação do IAQ (MoM)", cor: (mom ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO, contexto: (mom ?? 0) >= 0 ? "Melhora" : "Piora", corContexto: (mom ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO },
  ], 0.68);
  let t = tendenciaLinear([]), yT = 2.78 + 1.3 + 0.1;
  if (ev.length >= 2) { t = serieComTendencia(p, s, "EVOLUÇÃO MENSAL (MOM) — IAQ", "IAQ (quantidade)", ev.map((e) => e.mes), ev.map((e) => e.iaq), COR.VERDE_AMAZONIA); yT = 3.04 + 1 + 0.1; }
  else caixaLeitura(s, MARGEM, 2.78, LC, 1.3, "Evolução do IAQ", "Sem histórico suficiente de fechamentos ainda.");
  const { yFim, pior } = tabelasAlmoxTop(s, yT, d.concentracao.itens, d.porAlmox, "iaq", "IAQ", false, "Qtd.");
  let r = `O IAQ fecha o mês em ${fmtPct(c.iaq)}`;
  if (mom != null) r += `, com ${mom >= 0 ? "melhora" : "piora"} de ${fmtPct(Math.abs(mom))} frente ao mês anterior`;
  if (t.inclinacao != null && Math.abs(t.inclinacao) > 0.3) r += ` — ${mom != null && mom < 0 && t.inclinacao > 0 ? "mesmo com" : "e"} tendência linear de ${fmtNum(Math.abs(t.inclinacao), 1)} p.p./mês no período`;
  r += ". Diferente do IAP, o IAQ pesa mais divergências em itens de giro alto e baixo valor unitário.";
  if (pior) r += ` ${pior.chave} concentra a maior perda em unidades no período.`;
  resumoComRodape(s, yFim + 0.08, "Resumo da Acurácia Ponderada por Quantidade (IAQ)", r, "IAQ pondera cada divergência pela quantidade de itens do SKU (não pelo valor). Ranking por unidades calculado sobre os 50 maiores itens POR VALOR do mês — pode omitir um item de alto volume e baixo valor unitário fora dessa lista.");
}

export function slideConcentracao(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Acurácia Ponderada — Concentração de Risco", mesLabel, pag, "Curva de Pareto — onde o valor em risco está concentrado neste mês");
  const c = d.concentracao, top = c.itens.slice(0, 20);
  if (top.length) {
    const cats = top.map((i) => i.sku), vb = top.map((i) => i.valor), vl = top.map((i) => i.pctAcum);
    const resto = c.totalDivergentes - top.length;
    if (resto > 0) { cats.push(`+${fmtNum(resto)} itens`); vb.push(Math.max(c.valorTotal - vb.reduce((a, b) => a + b, 0), 0)); vl.push(100); }
    texto(s, MARGEM, 1.65, LC, 0.24, `CONCENTRAÇÃO DE VALOR (CURVA DE PARETO) — TOP ${top.length} SKUS + CAUDA`, { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoComboDuplo(p, s, MARGEM, 1.93, LC, 1.85, cats, { nome: "Valor (R$)", valores: vb, cor: COR.VERDE_AMAZONIA, formato: "#,##0" }, { nome: "% acumulado do valor", valores: vl, cor: COR.ATENCAO, formato: '0"%"' });
    texto(s, MARGEM, 3.83, LC, 0.35, c.topNPct != null ? `Os ${c.topN} maiores SKUs divergentes concentram ${fmtPct(c.topNPct)} do valor em risco do mês (${fmtMoeda(c.valorTotal)} no total, ${fmtNum(c.totalDivergentes)} itens divergentes).` : "Concentração de valor não disponível neste recorte.", { tamanho: 10 });
  } else caixaLeitura(s, MARGEM, 1.65, LC, 2.4, "Curva de Pareto", "Sem item divergente com custo cadastrado neste recorte para montar a curva de concentração de valor.");
  const yt = 4.3;
  texto(s, MARGEM, yt, LC, 0.24, "TOP 10 MAIORES EXEMPLOS DO MÊS", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  const t10 = c.itens.slice(0, 10);
  if (t10.length) tabela(s, MARGEM, yt + 0.26, LC, FIM - (yt + 0.26), ["SKU", "Descrição", "Almox.", "Qtd. Sist.", "Qtd. Conf.", "Dif.", "Valor", "% Acum."],
    t10.map((i) => [i.sku, (i.descricao || "—").slice(0, 22), i.almoxarifado || "—", fmtNum(i.qtd_sistema), fmtNum(i.qtd_contagem), { t: fmtNum(i.divergencia), cor: i.divergencia < 0 ? COR.ERRO : COR.SUCESSO }, fmtMoeda(i.valor), fmtPct(i.pctAcum)]),
    { larguras: [1.05, 2.1, 1.3, 0.95, 0.95, 0.8, 1.1, 0.85], tamanho: 9.5 });
  else texto(s, MARGEM, yt + 0.3, LC, 0.4, "Sem exemplo disponível neste recorte.", { tamanho: 10.5 });
}

export function slideFaixas(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Acurácia Ponderada — Detalhamento por Faixa", mesLabel, pag, "Top 10 por valor dentro de cada faixa — onde o risco financeiro está dentro de cada grupo de tamanho");
  const m = d.magnitude, fx = m.faixas, y0 = 1.62;
  let yF: number;
  if (fx.length && m.total) {
    texto(s, MARGEM, y0, LC, 0.2, "DISTRIBUIÇÃO POR MAGNITUDE DA DIVERGÊNCIA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoComboDuplo(p, s, MARGEM, y0 + 0.22, LC, 0.9, fx.map((f) => f.faixa), { nome: "Nº de itens", valores: fx.map((f) => f.quantidade), cor: COR.AZUL_INSTITUCIONAL, formato: "0", rotulos: true }, { nome: "Valor total (R$)", valores: fx.map((f) => f.valor), cor: COR.ATENCAO, formato: '"R$" #,##0' });
    const mv = fx.reduce((a, b) => (b.valor > a.valor ? b : a));
    const tm = m.pctPequenas != null ? `${fmtPct(m.pctPequenas)} das divergências do mês são pequenas (0 a 5 unidades), mas a faixa "${mv.faixa}" — ${fmtNum(mv.quantidade)} item(ns) — concentra o maior valor em risco (${fmtMoeda(mv.valor)}). É esse contraste que a métrica item a item não mostra. Abaixo, o top 10 por valor dentro de cada faixa.` : "Sem divergência neste recorte para distribuir por magnitude.";
    const yc = y0 + 0.22 + 0.9 + 0.03;
    const hc = Math.max(0.22, linhasEstimadas(tm, LC, 9.5) * 0.17);
    texto(s, MARGEM, yc, LC, hc, tm, { tamanho: 9.5 });
    yF = yc + hc + 0.04;
  } else { caixaLeitura(s, MARGEM, y0, LC, 1.5, "Distribuição por magnitude", "Sem divergência neste recorte para distribuir por magnitude."); yF = y0 + 1.62; }
  if (!fx.some((f) => f.itens.length)) { caixaLeitura(s, MARGEM, yF, LC, FIM - yF, "Detalhamento por Faixa", "Sem divergência neste recorte para detalhar por faixa de magnitude."); return; }
  const mi = fx.reduce((a, b) => (b.quantidade > a.quantidade ? b : a)), mv = fx.reduce((a, b) => (b.valor > a.valor ? b : a));
  const t = mi.faixa === mv.faixa
    ? `A faixa "${mv.faixa}" concentra tanto o maior número de itens divergentes (${fmtNum(mv.quantidade)}) quanto o maior valor em risco (${fmtMoeda(mv.valor)}) neste recorte — sem o contraste de volume x valor que costuma aparecer entre faixas pequenas e grandes.`
    : `A faixa "${mv.faixa}" tem só ${fmtNum(mv.quantidade)} item(ns), mas concentra o maior valor em risco (${fmtMoeda(mv.valor)}) — poucos SKUs de giro alto puxando o financeiro sozinhos. Já "${mi.faixa}" tem ${fmtNum(mi.quantidade)} itens somando ${fmtMoeda(mi.valor)} — volume grande, mas diluído por item. É esse contraste que a leitura item a item não mostra.`;
  const cores = [COR.SUCESSO, COR.INFO, COR.ATENCAO, COR.ERRO], gap = 0.18, lc = (LC - gap * 3) / 4, acab = 0.42;
  const hRes = Math.max(0.65, alturaCaixaLeitura(t, LC, 9));
  const ht = Math.max(1.8, FIM - yF - acab - 0.06 - hRes - 0.22), hLinha = ht / 11;
  fx.forEach((f, i) => {
    const x = MARGEM + i * (lc + gap);
    texto(s, x, yF, lc, 0.24, f.faixa.toUpperCase(), { tamanho: 10, negrito: true, cor: cores[i % 4] });
    texto(s, x, yF + 0.24, lc, 0.22, `${fmtNum(f.quantidade)} itens · ${fmtMoeda(f.valor)} no total`, { tamanho: 9 });
    if (f.itens.length) tabela(s, x, yF + acab, lc, hLinha * (f.itens.length + 1), ["Descrição", "Valor"], f.itens.map((it) => [(it.descricao || it.sku || "—").slice(0, 22), fmtMoeda(it.valor)]), { larguras: [2, 1], tamanho: 9, margemV: 0.02 });
    else caixaLeitura(s, x, yF + acab, lc, ht, "Sem itens", "Nenhum item divergente nesta faixa neste recorte.", { tamanho: 9.5 });
  });
  resumoComRodape(s, yF + acab + ht + 0.06, "Resumo do Detalhamento por Faixa", t, "Top 10 por valor calculado dentro de cada faixa.", 9, 0.22);
}

function topFaltaSobra(s: Slide, y: number, fs: DadosMbr["faltaSobraLoja"]) {
  const gap = 0.3, lc = (LC - gap) / 2, at = 0.22, h = 1.35;
  ([["TOP 5 ITENS EM FALTA — sistema > físico", fs.falta, fs.valorFalta, COR.ERRO, MARGEM], ["TOP 5 ITENS EM SOBRA — físico > sistema", fs.sobra, fs.valorSobra, COR.ATENCAO, MARGEM + lc + gap]] as const).forEach(([tit, itens, total, cor, x]) => {
    texto(s, x, y, lc, at, tit, { tamanho: 9.5, negrito: true, cor });
    if (itens.length) {
      tabela(s, x, y + at, lc, h, ["Descrição", "Valor"], itens.map((i) => [(i.descricao || i.sku || "—").slice(0, 34), fmtMoeda(i.valor)]), { larguras: [2.4, 1], tamanho: 9 });
      texto(s, x, y + at + h + 0.04, lc, 0.2, `Valor de prejuízo (total do mês): ${fmtMoeda(total)}`, { tamanho: 8.5, negrito: true });
    } else caixaLeitura(s, x, y + at, lc, h, "Sem itens", "Nenhum item divergente nesta direção no mês.", { tamanho: 10 });
  });
  return y + at + h + 0.26;
}
const mediaOutros = (d: DadosMbr, almox: string) => { const o = d.porAlmox.filter((c) => c.chave !== almox && c.item != null).map((c) => c.item as number); return o.length ? r2(o.reduce((a, b) => a + b, 0) / o.length) : null; };

export function slideLoja(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, `Acompanhamento Individual — Loja (${ALMOX_LOJA})`, mesLabel, pag, "Evolução recente melhora, mas o resultado segue bem distante dos demais almoxarifados");
  const serie = d.evolucaoLoja, at = serie.at(-1), an = serie.at(-2), comp = d.porAlmox.find((c) => c.chave === ALMOX_LOJA);
  const item = comp ? comp.item : at?.item ?? null;
  const delta = at?.item != null && an?.item != null ? r2(at.item - an.item) : null;
  const media = mediaOutros(d, ALMOX_LOJA), dist = media != null && item != null ? r2(media - item) : null;
  linhaKpis(s, 1.55, [
    { valor: fmtPct(item), rotulo: "Item a item (mês)", cor: statusMaiorMelhor(item).cor },
    { valor: comp ? fmtPct(comp.iaq) : "—", rotulo: "IAQ (quantidade)" },
    { valor: comp ? fmtPct(comp.iap) : "—", rotulo: "IAP (valor)" },
    { valor: pctMom(delta), rotulo: "Variação vs. inventário anterior", cor: (delta ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO, contexto: dist != null ? `${fmtPct(Math.abs(dist))} abaixo da média dos demais` : null, corContexto: COR.ATENCAO },
  ], 0.68);
  let y: number;
  if (serie.length >= 2) {
    texto(s, MARGEM, 2.5, LC, 0.22, `EVOLUÇÃO DO ${ALMOX_LOJA.toUpperCase()} — OS 3 MODELOS, MÊS A MÊS`, { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoMulti(p, s, MARGEM, 2.74, LC, 1, serie.map((e) => rotuloMes(e.mes)), [
      { nome: "Item a item", valores: serie.map((e) => e.item), cor: COR.AZUL_INSTITUCIONAL },
      { nome: "IAQ (quantidade)", valores: serie.map((e) => e.iaq), cor: COR.VERDE_AMAZONIA },
      { nome: "IAP (valor)", valores: serie.map((e) => e.iap), cor: COR.ATENCAO },
    ], { formato: '0"%"', rotulos: false });
    y = 2.74 + 1 + 0.12;
  } else { caixaLeitura(s, MARGEM, 2.5, LC, 1, `Evolução do ${ALMOX_LOJA}`, "Sem histórico suficiente de fechamentos ainda."); y = 2.5 + 1 + 0.12; }
  const yr = topFaltaSobra(s, y, d.faltaSobraLoja);
  let r = delta != null && delta > 0 ? `${ALMOX_LOJA} melhora ${fmtPct(delta)} no item a item frente ao inventário anterior, fechando o mês em ${fmtPct(item)}` : `${ALMOX_LOJA} fecha o mês em ${fmtPct(item)} de acurácia item a item`;
  if (dist != null) r += `, ainda ${fmtPct(Math.abs(dist))} abaixo da média dos demais almoxarifados`;
  if (comp?.iap != null) r += `. Ponderado por valor (IAP), o resultado sobe para ${fmtPct(comp.iap)} — a maior parte do impacto financeiro já está concentrada em poucos itens, não espalhada por todo o estoque`;
  const inicio = serie[0]?.mes;
  r += `. Série em acompanhamento desde ${inicio ? `${rotuloMes(inicio).slice(0, 3)}/${inicio.slice(0, 4)}` : "o primeiro fechamento"} — ${delta != null && delta > 0 ? "a melhora é real, mas ainda não fecha a distância pro restante da rede." : "acompanhar o próximo fechamento."}`;
  caixaLeitura(s, MARGEM, yr, LC, Math.min(Math.max(0.6, alturaCaixaLeitura(r, LC, 10)), Math.max(0.5, FIM - yr)), `Leitura — ${ALMOX_LOJA}`, r, { tamanho: 10 });
}

export function slidePatio(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  const serie = d.evolucaoPatio, primeiro = serie.length <= 1;
  const temMes = d.porAlmox.some((c) => c.chave === ALMOX_PATIO_PAULISTA);
  cabecalho(s, `Acompanhamento Individual — ${ALMOX_PATIO_PAULISTA}`, mesLabel, pag, !temMes ? "Sem fechamento de inventário deste almoxarifado no mês" : primeiro ? "Primeiro inventário já realizado neste almoxarifado — resultado abaixo do ideal" : "Evolução do almoxarifado mês a mês nos três modelos de acurácia");
  const at = serie.at(-1), an = serie.at(-2), comp = d.porAlmox.find((c) => c.chave === ALMOX_PATIO_PAULISTA);
  const item = comp ? comp.item : at?.item ?? null;
  const gapIap = comp?.iap != null && item != null ? r2(comp.iap - item) : null;
  const media = mediaOutros(d, ALMOX_PATIO_PAULISTA), dist = media != null && item != null ? r2(media - item) : null;
  const delta = at?.item != null && an?.item != null ? r2(at.item - an.item) : null;
  linhaKpis(s, 1.55, [
    { valor: fmtPct(item), rotulo: primeiro && temMes ? "Item a item (1º inventário)" : "Item a item (mês)", cor: statusMaiorMelhor(item).cor },
    { valor: comp ? fmtPct(comp.iaq) : "—", rotulo: "IAQ (quantidade)" },
    { valor: comp ? fmtPct(comp.iap) : "—", rotulo: "IAP (valor)" },
    primeiro
      ? { valor: dist != null ? fmtPct(Math.abs(dist)) : "—", rotulo: "Distância da média dos demais", cor: COR.ERRO, contexto: (dist ?? 0) > 0 ? "Pior resultado do mês" : null, corContexto: COR.ERRO }
      : { valor: pctMom(delta), rotulo: "Variação vs. inventário anterior", cor: (delta ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO, contexto: dist != null ? `${fmtPct(Math.abs(dist))} ${dist > 0 ? "abaixo" : "acima"} da média dos demais` : null, corContexto: COR.ATENCAO },
  ], 0.68);
  let y: number;
  if (!comp) {
    const ts = `Não houve fechamento de inventário do ${ALMOX_PATIO_PAULISTA} em ${nomeMes(d.mes)}${serie.length ? ` — o último registrado foi em ${nomeMes(serie.at(-1)!.mes)}` : ""}. Os indicadores deste slide voltam a ser preenchidos no próximo fechamento do almoxarifado.`;
    const h = alturaCaixaLeitura(ts, LC, 13);
    caixaLeitura(s, MARGEM, 2.5, LC, h, "Sem fechamento no mês", ts); y = 2.5 + h + 0.12;
  } else if (primeiro) {
    const ts = `${rotuloMes(d.mes).slice(0, 3)}/${d.mes.slice(0, 4)} é o primeiro fechamento de inventário registrado para o ${ALMOX_PATIO_PAULISTA} — ainda não há mês anterior para comparar evolução. A partir do próximo inventário, este slide passa a mostrar a mesma evolução mês a mês dos demais almoxarifados.`;
    const h = alturaCaixaLeitura(ts, LC, 13);
    caixaLeitura(s, MARGEM, 2.5, LC, h, "Sem série histórica ainda", ts); y = 2.5 + h + 0.12;
  } else {
    texto(s, MARGEM, 2.5, LC, 0.22, `EVOLUÇÃO DO ${ALMOX_PATIO_PAULISTA.toUpperCase()} — OS 3 MODELOS, MÊS A MÊS`, { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoMulti(p, s, MARGEM, 2.74, LC, 1, serie.map((e) => rotuloMes(e.mes)), [
      { nome: "Item a item", valores: serie.map((e) => e.item), cor: COR.AZUL_INSTITUCIONAL },
      { nome: "IAQ (quantidade)", valores: serie.map((e) => e.iaq), cor: COR.VERDE_AMAZONIA },
      { nome: "IAP (valor)", valores: serie.map((e) => e.iap), cor: COR.ATENCAO },
    ], { formato: '0"%"', rotulos: false });
    y = 2.74 + 1 + 0.12;
  }
  const yr = topFaltaSobra(s, y, d.faltaSobraPatio);
  let r: string;
  if (!comp) r = `Sem fechamento do ${ALMOX_PATIO_PAULISTA} neste mês — nada a comparar com os demais almoxarifados.`;
  else if (primeiro) {
    r = `No primeiro inventário do ${ALMOX_PATIO_PAULISTA}, a acurácia item a item fecha em ${fmtPct(item)}`;
    if (dist != null) r += `, ${fmtPct(Math.abs(dist))} abaixo da média dos demais almoxarifados neste mês`;
    if (gapIap != null) r += `. Ponderado por valor (IAP), o resultado sobe para ${fmtPct(comp!.iap)} — distorção de ${fmtPct(Math.abs(gapIap))} entre os dois modelos, maior concentração de impacto financeiro em poucos itens`;
    r += ". Por ser o 1º ciclo neste almoxarifado, o indicado é acompanhar se o próximo inventário confirma melhora (curva de aprendizado operacional, mesmo padrão já visto em outros almoxarifados) ou se o resultado se repete.";
  } else {
    r = `${ALMOX_PATIO_PAULISTA} fecha o mês em ${fmtPct(item)} de acurácia item a item${delta != null ? ` (${delta >= 0 ? "+" : ""}${fmtPct(delta)} vs. o inventário anterior)` : ""}`;
    if (dist != null) r += `, ${fmtPct(Math.abs(dist))} ${dist > 0 ? "abaixo" : "acima"} da média dos demais almoxarifados`;
    if (comp?.iap != null) r += `. Ponderado por valor (IAP), o resultado fica em ${fmtPct(comp.iap)}`;
    r += ".";
  }
  caixaLeitura(s, MARGEM, yr, LC, Math.min(Math.max(0.6, alturaCaixaLeitura(r, LC, 10)), Math.max(0.5, FIM - yr)), `Leitura — ${ALMOX_PATIO_PAULISTA}`, r, { tamanho: 10 });
}

export function slideItemAItem(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Inventário Item a Item", mesLabel, pag, "Acurácia geral, evolução mensal com tendência, resultado por almoxarifado e ranking financeiro — leitura item a item, apenas para conhecimento (a leitura ponderada IAP/IAQ é a referência do mês)");
  const k = d.kpis, st = statusMaiorMelhor(k.acuracia);
  linhaKpis(s, 1.55, [
    { valor: fmtPct(k.acuracia), rotulo: "Acurácia Geral", contexto: st.label, corContexto: st.cor },
    { valor: fmtNum(k.total), rotulo: "Itens Avaliados" },
    { valor: fmtNum(k.divergentes), rotulo: "Itens Divergentes" },
    { valor: fmtMoeda(k.resultado), rotulo: "Resultado Líquido", cor: (k.resultado ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO },
  ], 0.68);
  const ev = d.evolucaoInventario.slice(-6), vals = ev.map((e) => e.acuracia);
  let t = tendenciaLinear(vals), yT = 2.78 + 1.3 + 0.1;
  if (ev.length >= 2) { t = serieComTendencia(p, s, "EVOLUÇÃO MENSAL (MOM) — ACURÁCIA E TENDÊNCIA", "Acurácia geral", ev.map((e) => e.mes), vals, COR.ATENCAO, vals.map((v) => ((v ?? 0) < 50 ? COR.ERRO : COR.ATENCAO))); yT = 3.04 + 1 + 0.1; }
  else caixaLeitura(s, MARGEM, 2.78, LC, 1.3, "Evolução", "Sem histórico suficiente de fechamentos para montar a série mensal ainda.");
  const { yFim, pior, faltas } = tabelasAlmoxTop(s, yT, d.concentracao.itens, d.porAlmox, "item", "Acur.", true, "Valor");
  let r: string;
  if (pior && faltas.length) {
    const dir = t.inclinacao != null && Math.abs(t.inclinacao) > 0.3 ? `, em trajetória de ${t.inclinacao > 0 ? "melhora" : "queda"} no período (tendência de ${fmtNum(Math.abs(t.inclinacao), 1)} p.p./mês)` : "";
    r = `O mês fecha com acurácia geral de ${fmtPct(k.acuracia)} (${st.label.toLowerCase()})${dir}. ${pior.chave} tem a menor acurácia item a item do mês (${fmtPct(pior.item)}) — maior prioridade de reconferência. O maior exemplo de falta é ${faltas[0].sku} (${(faltas[0].descricao || "—").slice(0, 30)}, -${fmtMoeda(faltas[0].valor)}).`;
  } else r = "Sem dado suficiente neste recorte para fechar a leitura do ciclo.";
  resumoComRodape(s, yFim + 0.08, "Resumo do Inventário Item a Item", r, "\"Resultado\" por almoxarifado e os dois rankings cobrem só os itens da lista de concentração de valor (até 50 maiores por valor do mês).");
}

export function slideMovimentados(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Controle de Movimentados", mesLabel, pag, "Reconciliação diária (sistema x físico) — impacto na acurácia desde a implantação");
  const r = d.movimentados, ev = d.evolucaoMovimentados, st = statusMaiorMelhor(r.pct), pri = ev[0];
  const ganho = pri?.pct != null && r.pct != null ? r2(r.pct - pri.pct) : null;
  linhaKpis(s, 1.55, [
    { valor: fmtNum(r.itens_analisados), rotulo: "Itens Analisados no Mês" },
    { valor: fmtPct(r.pct), rotulo: "Acurácia da Reconciliação", contexto: st.label, corContexto: st.cor },
    { valor: fmtNum(r.itens_com_divergencia), rotulo: "Itens com Divergência", cor: r.itens_com_divergencia ? COR.ATENCAO : COR.SUCESSO },
    { valor: pctMom(ganho), rotulo: "Ganho desde a Implantação", cor: (ganho ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO },
  ], 0.68);
  const hTopo = 2.1, le = 7.5;
  if (ev.length >= 2) {
    texto(s, MARGEM, 3.05, le, 0.28, "ACURÁCIA DA RECONCILIAÇÃO — DESDE A IMPLANTAÇÃO", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoColunas(p, s, MARGEM, 3.35, le, hTopo, ev.map((e) => rotuloMes(e.mes)), "Acurácia", ev.map((e) => e.pct ?? 0), { cor: COR.VERDE_AMAZONIA });
  } else caixaLeitura(s, MARGEM, 3.05, le, hTopo + 0.3, "Evolução", "Ainda só há um mês de histórico monitorado - a série de evolução aparece a partir do segundo mês de dados.");
  const xd = MARGEM + le + 0.35;
  const ti = pri && ganho != null
    ? ganho > 0
      ? `Desde a implantação do Controle de Movimentados, em ${nomeMes(pri.mes)}, a acurácia da reconciliação diária subiu de ${fmtPct(pri.pct)} para ${fmtPct(r.pct)} — um ganho de ${fmtPct(ganho)}. Esse é o efeito direto de passar a reconciliar o livro-caixa bruto todo dia, em vez de só no fechamento periódico.`
      : `Desde a implantação, em ${nomeMes(pri.mes)}, a acurácia da reconciliação diária está em ${fmtPct(r.pct)}, ainda sem ganho consistente frente ao ponto de partida (${fmtPct(pri.pct)}) — vale olhar os itens com divergência recorrente antes do próximo fechamento.`
    : "Ainda não há dado suficiente pra comparar com o ponto de partida da implantação.";
  caixaLeitura(s, xd, 3.05, LARGURA - MARGEM - xd, hTopo + 0.3, "Impacto da Implantação", ti, { tamanho: 12 });
  const yt = 3.35 + hTopo + 0.16;
  texto(s, MARGEM, yt, LC, 0.22, "RESULTADO POR ALMOXARIFADO (MOVIMENTADOS)", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  const pa = [...d.movimentadosPorAlmox].sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999)).slice(0, 7);
  if (pa.length) tabela(s, MARGEM, yt + 0.24, LC, Math.max(0.5, FIM - (yt + 0.24)), ["Almoxarifado", "Itens Analisados", "Itens c/ Divergência", "Acurácia"],
    pa.map((i) => [i.almoxarifado, fmtNum(i.itens_analisados), fmtNum(i.itens_analisados - i.itens_sem_divergencia), { t: fmtPct(i.pct), cor: statusMaiorMelhor(i.pct).cor, negrito: true }]), { larguras: [2, 1.3, 1.3, 1], tamanho: 9.5 });
  else texto(s, MARGEM, yt + 0.28, LC, 0.3, "Sem quebra por almoxarifado neste recorte.", { tamanho: 10 });
}

const ORDEM_EVOL: Record<string, number> = { "Involução": 0, "Sem histórico": 1, "Estável": 2, "Evolução": 3 };
export function linhaScorecardAlmox(i: ItemScorecardAlmox) {
  const sf = statusEvolucao(i.deltaAcuracia);
  const sm: Status | null = i.movAplicavel ? statusEvolucao(i.deltaMov) : null;
  const status = sm && ORDEM_EVOL[sm.label] < ORDEM_EVOL[sf.label] ? sm : sf;
  const partes = [`Acurácia ${fmtPct(i.acuracia)}`];
  if (i.deltaAcuracia != null) partes.push(`(${i.deltaAcuracia >= 0 ? "+" : ""}${fmtPct(i.deltaAcuracia)} vs. mês anterior)`);
  if (i.movAplicavel) { partes.push(`· Movimentados ${fmtPct(i.mov)}`); if (i.deltaMov != null) partes.push(`(${i.deltaMov >= 0 ? "+" : ""}${fmtPct(i.deltaMov)})`); }
  else partes.push("· Movimentados: não aplicável a este almoxarifado");
  if (i.iap != null) partes.push(`· IAP ${fmtPct(i.iap)}`);
  const critica = i.acuracia != null && i.acuracia < 85;
  const passo = sf.label === "Involução" && sm?.label === "Involução" ? "Reconferência prioritária: acurácia e conciliação de movimentados pioraram juntas neste almoxarifado."
    : sf.label === "Involução" ? "Investigar causa raiz das divergências recorrentes de fechamento neste almoxarifado."
    : sm?.label === "Involução" ? "Reforçar a conciliação diária de movimentados — reconciliação piorou vs. o mês anterior."
    : critica ? "Intensificar a cadência de conferência até a acurácia voltar pra faixa saudável."
    : sf.label === "Sem histórico" && (!sm || sm.label === "Sem histórico") ? "Sem histórico suficiente ainda — acompanhar a partir do próximo fechamento."
    : "Manter a cadência atual de fechamento e conciliação — sem sinal de piora no mês.";
  return { frente: i.nome, status, leitura: partes.join(" "), passo };
}

export function slideScorecardAlmox(p: Pptx, mesLabel: string, pag: number, d: DadosMbr) {
  const s = novoSlide(p);
  cabecalho(s, "Scorecard de Inventário — por Almoxarifado", mesLabel, pag, "Evolução vs. o mês anterior e plano de ação por almoxarifado, cruzando fechamento e Controle de Movimentados");
  if (!d.scorecardAlmox.length) { caixaLeitura(s, MARGEM, 1.6, LC, 1.4, "Sem almoxarifado cadastrado", "Nenhum almoxarifado ativo encontrado no Cadastro — sem base para montar o scorecard por setor.", { corRotulo: COR.ATENCAO }); return; }
  const linhas = d.scorecardAlmox.map(linhaScorecardAlmox).map((l, i) => ({ ...l, i })).sort((a, b) => ORDEM_EVOL[a.status.label] - ORDEM_EVOL[b.status.label] || a.i - b.i);
  const n = linhas.length, tam = n <= 8 ? 11.5 : n <= 11 ? 10.5 : 9.5;
  tabela(s, MARGEM, 1.65, LC, Math.min(5.35, ALTURA - 1.95), ["Almoxarifado", "Status", "Leitura Executiva", "Próximo Passo"],
    linhas.map((l): Celula[] => [{ t: l.frente, cor: COR.AZUL_INSTITUCIONAL, negrito: true }, { t: l.status.label, cor: l.status.cor, negrito: true }, l.leitura, l.passo]), { larguras: [1.6, 1, 3.6, 3.3], tamanho: tam });
}

export const ITENS_SECAO2 = ["Acurácia Ponderada (IAP)", "Acurácia Ponderada (IAQ)", "Acurácia Ponderada — Concentração de Risco", "Acurácia Ponderada — Detalhamento por Faixa", "Acompanhamento Individual — Loja", "Acompanhamento Individual — Pátio Paulista", "Inventário Item a Item", "Controle de Movimentados", "Scorecard de Inventário por Almoxarifado"];
