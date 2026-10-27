// MBR — Seção 3: Mapeamento de Riscos e Passivos, lida direto dos dashboards do Stock Savvy (sem export .html).
// Geometria e textos do modelo final aprovado (MBR - Controle - Setembro).
import { ALTURA, COR, LARGURA, MARGEM, fmtMoeda, fmtNum, fmtPct, fmtSinal, rotuloMes, statusMenorMelhor } from "./formato";
import { cabecalho, caixaLeitura, funil, graficoBarrasH, graficoEmpilhado, graficoMulti, graficoRosca, linhaKpis, novoSlide, tabela, texto, type Pptx, type Slide } from "./kit";
import { FAIXAS_PARADO, STATUS_FAROL, type DadosBaixas, type DadosDispersao, type DadosFarol, type DadosFefo, type DadosInvestimento, type DadosPacotes, type DadosRecuperacao, type DadosSemMov, type DadosTestes } from "./dados3";

const LC = LARGURA - 2 * MARGEM;
export const COR_FAROL = { Vencido: "7B3B2E", Urgente: "F1704B", Perigo: "F2C14E", "Atenção": "2CC5A8" } as const;
const COR_PARADO = { "30-60": COR_FAROL["Atenção"], "61-90": COR_FAROL.Perigo, "+90": COR_FAROL.Urgente } as const;
export const PALETA_INV: Record<string, string> = { Cortesia: "4FC3F7", "Degustação": "81C784", "Sensorial/Inovações": "BA68C8", "Uso e Consumo": "FFB74D" };
export const CORES_FUNIL = ["4FC3F7", "81C784", "BA68C8", "FFB74D", "F06292", "90A4AE"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const corte = (t: string | null | undefined, n: number) => { const s = String(t ?? "—"); return s.length > n ? s.slice(0, n) : s; };

/** Caixa "sem dados" quando a fonte não pôde ser lida ou está vazia no mês. Devolve true quando desenhou o aviso. */
function semDados(s: Slide, dado: unknown, titulo: string, msg: string) {
  if (dado) return false;
  caixaLeitura(s, MARGEM, 1.6, LC, 1.4, titulo, msg, { corRotulo: COR.ATENCAO, tamanho: 13 });
  return true;
}
const erroFonte = (nome: string) => `Não foi possível ler os dados de ${nome} no Stock Savvy agora — confira o acesso à tela e gere o MBR de novo.`;

export const ITENS_SECAO3 = ["Pacote de Baixas – Operações", "Pacote de Baixas – Investimento Operacional", "Controle de Pacotes de Baixa", "Farol de Shelf-Life", "Risco de Obsolescência de Materiais", "Recuperação de Shelf", "Dispersão de Ficha Técnica", "Testes Industriais", "Controle de FEFO"];
export const DESCRICAO_SECAO3 = "Passivos e baixas, validade de lotes, estoque parado, recuperação de shelf, dispersão de ficha técnica, Testes Industriais e FEFO — lidos direto do Stock Savvy.";

// ---------- Dashboard Baixas Operacionais ----------
export function slideBaixas(p: Pptx, mesLabel: string, pag: number, d: DadosBaixas | null, mes: string) {
  const s = novoSlide(p);
  cabecalho(s, "Dashboard Baixas Operacionais", mesLabel, pag, "Retrato do mês — fonte oficial de Baixas/Passivos no MBR (Dashboard de Baixas Operacionais do Stock Savvy)");
  if (semDados(s, d, "Baixas Operacionais indisponíveis", erroFonte("Baixas Operacionais"))) return;
  const b = d!;
  linhaKpis(s, 1.55, [
    { valor: fmtMoeda(b.total), rotulo: "Prejuízo Total no Período", cor: COR.ERRO },
    { valor: fmtPct(b.pctDestaque), rotulo: `Concentrado em ${b.motivoDestaque ?? "—"}` },
    { valor: b.setorTop ?? "—", rotulo: "Setor de Maior Impacto" },
    { valor: b.grupoTop ?? "—", rotulo: "Grupo de Maior Impacto" },
  ], 0.65, 0.383, 20);
  const paleta = [COR.ERRO, COR.ATENCAO, COR.AZUL_INSTITUCIONAL, COR.VERDE_AMAZONIA, COR.INFO, COR_FAROL.Urgente, COR_FAROL.Perigo, COR.AZUL_CLARO, COR.SEM_DADO];
  if (b.meses.length && b.series.length) {
    const cats = b.meses.map((m) => MESES_LONGOS[Number(m.slice(5, 7)) - 1]);
    const totais = b.meses.map((_, i) => b.series.reduce((a, x) => a + (x.valores[i] ?? 0), 0));
    graficoEmpilhado(p, s, MARGEM, 2.32, LC, 1.95, cats, b.series.map((x, i) => ({ nome: x.nome, valores: x.valores, cor: paleta[i % paleta.length] })), { formato: '"R$ "#,##0', totais });
  } else caixaLeitura(s, MARGEM, 2.32, LC, 1.95, "Evolução mensal", "Sem baixa aprovada nos últimos 12 meses.", { corRotulo: COR.ATENCAO, tamanho: 12 });
  const lc = (LC - 0.35) / 2, x2 = MARGEM + lc + 0.35, yt = 4.37, ht = 2.05;
  texto(s, MARGEM, yt, lc, 0.24, "TOP BAIXAS POR SKU", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (b.rankingSku.length) tabela(s, MARGEM, yt + 0.24, lc, ht, ["Ranking", "Descrição", "Total Baixas", "Classif."], b.rankingSku.slice(0, 6).map((r, i) => [String(i + 1), corte(`${r.sku} - ${r.descricao}`, 24), fmtMoeda(r.total, 2), { t: r.classif, cor: r.classif === "Investigar" ? COR.ERRO : COR.SUCESSO }]), { larguras: [1, 2.2, 1.1, 1.1], tamanho: 9.5 });
  else caixaLeitura(s, MARGEM, yt + 0.24, lc, ht, "Top baixas por SKU", "Nenhuma baixa aprovada no mês.");
  texto(s, x2, yt, lc, 0.24, "BAIXAS POR MOTIVO", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (b.tabelaMotivo.length) tabela(s, x2, yt + 0.24, lc, ht, ["Motivo", "Total por Motivo", "%", "Classif. Prejuízo"], b.tabelaMotivo.slice(0, 6).map((r) => [corte(r.motivo, 22), fmtMoeda(r.total, 2), `${r.pct.toFixed(2)}%`, r.classif ?? "—"]), { larguras: [1.8, 1.2, 0.7, 1.2], tamanho: 9.5 });
  else caixaLeitura(s, x2, yt + 0.24, lc, ht, "Baixas por motivo", "Nenhuma baixa aprovada no mês.");
  texto(s, MARGEM, 6.7, LC, 0.35, `Cartões e tabelas: baixas aprovadas de ${dataBr(`${mes}-01`)} a ${dataBr(`${mes}-${String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate())}`)} no Relatório de Baixa do Stock Savvy, sem Cortesia, Degustação, Uso e Consumo e Sensorial/Inovações (Investimento Operacional). Gráfico: até 12 meses até o mês deste relatório — cobre uma janela maior que os cartões, então os totais não batem entre si.`, { tamanho: 9, italico: true });
}

// ---------- Investimento Operacional ----------
export function slideInvestimento(p: Pptx, mesLabel: string, pag: number, d: DadosInvestimento | null) {
  const s = novoSlide(p);
  cabecalho(s, "Investimento Operacional", mesLabel, pag, "Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo — fonte oficial do indicador");
  if (semDados(s, d, "Investimento Operacional indisponível", erroFonte("Investimento Operacional"))) return;
  const v = d!;
  if (!v.qtd) { caixaLeitura(s, MARGEM, 1.6, LC, 1.4, `Sem lançamentos até ${mesLabel}`, "Nenhuma baixa de Cortesia, Degustação, Sensorial/Inovações ou Uso e Consumo no ano até o mês deste relatório.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  linhaKpis(s, 1.55, [
    { valor: fmtMoeda(v.total, 2), rotulo: "Total Investido no Período", cor: COR.ERRO, contexto: `${fmtNum(v.qtd)} lançamentos` },
    ...v.porMotivo.map((m) => ({ valor: fmtMoeda(m.valor, 2), rotulo: m.nome, contexto: `${fmtNum(m.qtd)} lançamentos` })),
  ], 0.68, 0.383, 20);
  const yT = 1.55 + 0.68 + 0.14, hT = 1.3;
  texto(s, MARGEM, yT, LC, 0.22, "TENDÊNCIA MENSAL POR MOTIVO", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  const totais = v.meses.map((_, i) => v.serie.reduce((a, x) => a + (x.valores[i] ?? 0), 0));
  graficoEmpilhado(p, s, MARGEM, yT + 0.26, LC, hT - 0.26, v.meses.map(mesCurto), v.serie.map((x) => ({ nome: x.nome, valores: x.valores, cor: PALETA_INV[x.nome] })), { formato: '"R$ "#,##0', totais, corTotais: COR.AZUL_INSTITUCIONAL, tamEixo: 8 });
  const yW = yT + hT + 0.2, hW = 1.58, gap = 0.2, wW = (LC - 2 * gap) / 3, xs = [MARGEM, MARGEM + wW + gap, MARGEM + 2 * (wW + gap)];
  texto(s, xs[0], yW, wW, 0.2, "VALOR POR MOTIVO", { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  graficoBarrasH(p, s, xs[0], yW + 0.22, wW, hW - 0.22, v.porMotivo.map((m) => m.nome), "Valor", v.porMotivo.map((m) => m.valor), { cores: v.porMotivo.map((m) => PALETA_INV[m.nome]), formato: '"R$ "#,##0' });
  const rotCampo = (c: "contexto" | "almox", ctx: string) => (c === "contexto" ? ctx : "Por Almoxarifado");
  if (v.rosca.grupos.length) {
    texto(s, xs[1], yW, wW, 0.2, `CORTESIA — ${rotCampo(v.rosca.campo, "Área que Solicitou")}`.toUpperCase(), { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoRosca(p, s, xs[1], yW + 0.22, wW, hW - 0.22, v.rosca.grupos.map((g) => g.nome), v.rosca.grupos.map((g) => g.valor), CORES_FUNIL, { formato: '"R$ "#,##0' });
  }
  if (v.funil.grupos.length) {
    texto(s, xs[2], yW, wW, 0.2, `DEGUSTAÇÃO — ${rotCampo(v.funil.campo, "Operação")}`.toUpperCase(), { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    funil(s, xs[2], yW + 0.22, wW, hW - 0.22, v.funil.grupos.slice(0, 6), CORES_FUNIL, (x) => fmtMoeda(x));
  }
  const yTab = yW + hW + 0.14, hTab = ALTURA - yTab - 0.4, gT = 0.15, wT = (LC - 3 * gT) / 4;
  v.porMotivo.forEach((m, i) => {
    const x = MARGEM + i * (wT + gT), top = v.tops[m.nome] ?? [];
    texto(s, x, yTab, wT, 0.2, `TOP 3 — ${m.nome}`.toUpperCase(), { tamanho: 9.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    if (top.length) tabela(s, x, yTab + 0.22, wT, hTab - 0.22, ["SKU", "Produto", "Valor"], top.map((r) => [r.sku, corte(r.descricao || "—", 20), fmtMoeda(r.valor, 2)]), { larguras: [1.2, 1.3, 1], tamanho: 8.5, margemV: 0.02 });
  });
  texto(s, MARGEM, ALTURA - 0.32, LC, 0.24, `Fonte: Relatório de Baixa do Stock Savvy (baixas não reprovadas) com motivo de investimento operacional, de ${dataBr(v.inicio)} a ${dataBr(v.fim)}.`, { tamanho: 8.5, italico: true });
}

// ---------- Controle de Pacotes de Baixa ----------
export function slidePacotes(p: Pptx, mesLabel: string, pag: number, d: DadosPacotes | null, mes: string) {
  const s = novoSlide(p);
  cabecalho(s, "Controle de Pacotes de Baixa", mesLabel, pag, "Evolução mensal (MoM) desde janeiro — a partir de julho a baixa fiscal passou a ser padronizada");
  if (semDados(s, d, "Pacotes de Baixa indisponíveis", erroFonte("Mapeamento de Passivos"))) return;
  const v = d!, ano = mes.slice(0, 4), pa = v.passivosAcum, ri = v.inventarioAcum;
  if (!pa.quantidade && !ri.entradas_qtd && !ri.saidas_qtd) {
    caixaLeitura(s, MARGEM, 1.6, LC, 1.4, `Sem dados desde julho até ${mesLabel}`, "Não há baixa operacional aprovada nem ajuste de inventário oficial nesta janela (desde julho até o mês deste relatório) para montar a evolução MoM e o impacto por almoxarifado.", { corRotulo: COR.ATENCAO, tamanho: 13 });
    return;
  }
  const dif = v.diferenca;
  const [corDif, ctxDif] = Math.abs(dif) < 1 ? [COR.SUCESSO, "perda e baixa quase batem"] : dif > 0 ? [COR.ATENCAO, "perda física acima da baixa"] : [COR.INFO, "baixa acima da perda física"];
  const fechRot = v.mesFechamento ? rotuloMes(v.mesFechamento) : "—";
  linhaKpis(s, 1.52, [
    { valor: fmtMoeda(pa.valor), rotulo: "Passivo Acumulado (desde Jul.)", contexto: `${fmtNum(pa.quantidade)} baixa(s) aprovada(s)` },
    { valor: fmtMoeda(Math.abs(ri.resultado_valor)), rotulo: "Resultado Inventário Acumulado", cor: ri.resultado_valor >= 0 ? COR.SUCESSO : COR.ERRO, contexto: `${fmtNum(ri.entradas_qtd)} entrada(s) · ${fmtNum(ri.saidas_qtd)} saída(s)` },
    { valor: fmtMoeda(Math.abs(dif)), rotulo: "Diferença Acumulada", cor: corDif, contexto: ctxDif },
    { valor: fmtMoeda(v.resultadoFechamento), rotulo: `Resultado Invent. — ${fechRot}`, cor: v.resultadoFechamento >= 0 ? COR.SUCESSO : COR.ERRO, contexto: `Passivo no mês: ${fmtMoeda(v.passivoFechamento)}` },
  ], 0.68, 0.383, 20);
  const le = 7.15, xd = MARGEM + le + 0.35, ld = LC - le - 0.35, yTit = 2.26, yG = 2.48, hG = 1.62;
  texto(s, MARGEM, yTit, le, 0.22, "EVOLUÇÃO MENSAL (MoM) — PASSIVOS × RESULTADO DE INVENTÁRIO", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (v.evolucao.length) {
    const cats = v.evolucao.map((e) => rotuloMes(e.mes)), pas = v.evolucao.map((e) => e.valor), inv = v.evolucao.map((e) => Math.abs(e.resultado));
    graficoEmpilhado(p, s, MARGEM, yG, le, hG, cats, [{ nome: "Passivos do Mês", valores: pas, cor: COR.ERRO }, { nome: "Resultado de Inventário (abs.)", valores: inv, cor: COR.AZUL_INSTITUCIONAL }], { formato: '"R$ "#,##0', totais: pas.map((x, i) => x + inv[i]), tamEixo: 8 });
    texto(s, MARGEM, yG + hG + 0.02, le, 0.16, `Padronização da baixa fiscal a partir de Jul/${ano.slice(2)} — meses anteriores servem de referência.`, { tamanho: 8, italico: true });
  } else caixaLeitura(s, MARGEM, yG, le, hG, "Evolução não disponível", `Nenhuma baixa aprovada nem ajuste de inventário desde janeiro de ${ano}.`, { corRotulo: COR.ATENCAO, tamanho: 12 });
  texto(s, xd, yTit, ld, 0.22, "IMPACTO POR ALMOXARIFADO", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (v.porAlmox.length) graficoEmpilhado(p, s, xd, yG, ld, hG, v.porAlmox.map((a) => a.almox), [{ nome: "Passivos (R$)", valores: v.porAlmox.map((a) => a.passivos), cor: COR.ERRO }, { nome: "Resultado Inventário (abs., R$)", valores: v.porAlmox.map((a) => a.inventarioAbs), cor: COR.AZUL_INSTITUCIONAL }], { horizontal: true, formato: '"R$ "#,##0', tamEixo: 8 });
  else caixaLeitura(s, xd, yG, ld, hG, "Impacto por almoxarifado", "Sem passivo aprovado nem ajuste de inventário nesta janela.");
  const yTt = 4.4, yTb = 4.62, lt = (LC - 0.35) / 2, xt2 = MARGEM + lt + 0.35;
  texto(s, MARGEM, yTt, lt, 0.2, "TOP 10 BAIXAS DO PERÍODO (POR SKU)", { tamanho: 10, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (v.topBaixas.length) tabela(s, MARGEM, yTb, lt, Math.min(1.72, 0.32 + 0.26 * v.topBaixas.length), ["SKU", "Produto", "Qtd.", "Valor"], v.topBaixas.map((t) => [t.sku || "—", corte(t.descricao || "—", 38), fmtNum(t.quantidade), fmtMoeda(t.valor)]), { larguras: [1, 2.4, 0.7, 1.2], tamanho: 9.5 });
  else caixaLeitura(s, MARGEM, yTb, lt, 1.72, "Top 10 Baixas do Período", "Nenhuma baixa aprovada nesta janela.");
  texto(s, xt2, yTt, lt, 0.2, "TOP 10 JUSTIFICATIVAS — AJUSTE DE PROCESSO", { tamanho: 10, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (v.justificativas.length) tabela(s, xt2, yTb, lt, Math.min(1.72, 0.32 + 0.26 * Math.min(6, v.justificativas.length)), ["SKU", "Almox.", "Justificativa", "Valor"], v.justificativas.slice(0, 6).map((j) => [j.sku || "—", corte(j.almox, 14), j.justificativa, fmtMoeda(j.valor)]), { larguras: [0.85, 0.9, 2.6, 1.05], tamanho: 9.5 });
  else caixaLeitura(s, xt2, yTb, lt, 1.72, "Top 10 Justificativas", "Nenhuma divergência resolvida como ajuste de processo nesta janela.");
  const ap = v.ajusteProcesso;
  const trecho = Math.abs(dif) < 1 ? " A baixa aprovada bate com a perda física medida pelo inventário neste recorte."
    : dif > 0 ? ` A perda física acumulada (Resultado de Inventário) segue ${fmtMoeda(Math.abs(dif))} acima do que já foi decidido como baixa — sinal de que ainda há passivo a ser formalizado.`
    : ` A baixa já aprovada segue ${fmtMoeda(Math.abs(dif))} acima da perda física medida pelo inventário — o controle está à frente do fechamento físico.`;
  texto(s, MARGEM, 6.38, LC, 0.32, `Desde julho, o controle já evitou registrar ${fmtMoeda(ap.valor)} como perda real — ${fmtNum(ap.quantidade)} baixa(s) reclassificada(s) como ajuste de processo (erro de cadastro/contagem, timing de nota fiscal ou produção não encerrada, entre outros).${trecho}`, { tamanho: 9.5, negrito: true, cor: COR.SUCESSO });
  texto(s, MARGEM, 6.74, LC, 0.32, `Fonte: baixas operacionais aprovadas, ajustes de inventário oficiais e divergências resolvidas (Mapeamento de Passivos do Atlas no Stock Savvy) — janela de julho de ${ano} até ${mesLabel.toLowerCase()}.`, { tamanho: 9, italico: true });
}

// ---------- Farol de Shelf-Life ----------
function tresTabelas(s: Slide, colunas: { titulo: string; cor: string; itens: { descricao: string; valor: number }[]; total: number }[], rotuloValor: string, vazio: string) {
  const gap = 0.3, lc = (LC - 2 * gap) / 3, yT = 4.902, yTb = 5.142, hTb = 1.891;
  colunas.forEach((c, i) => {
    const x = MARGEM + i * (lc + gap);
    texto(s, x, yT, lc, 0.24, c.titulo, { tamanho: 10, negrito: true, cor: c.cor });
    if (c.itens.length) {
      tabela(s, x, yTb, lc, hTb, ["Descrição", rotuloValor], c.itens.map((it) => [corte(it.descricao, 26), fmtMoeda(it.valor)]), { larguras: [2.2, 1], tamanho: 9 });
      texto(s, x, yTb + hTb + 0.06, lc, 0.22, `Total: ${fmtMoeda(c.total)}`, { tamanho: 9, negrito: true });
    } else caixaLeitura(s, x, yTb, lc, hTb, "Sem itens", vazio, { tamanho: 10 });
  });
}
export function slideFarol(p: Pptx, mesLabel: string, pag: number, d: DadosFarol | null, geradoEm: Date) {
  const s = novoSlide(p);
  cabecalho(s, "Farol de Shelf-Life", mesLabel, pag, `Retrato do estoque em risco de validade em ${geradoEm.toLocaleDateString("pt-BR")} — estoque sistêmico do Stock Savvy (Farol de Shelf)`);
  if (semDados(s, d, "Farol de Shelf-Life indisponível", erroFonte("Farol de Shelf-Life"))) return;
  const f = d!, st = f.status;
  linhaKpis(s, 1.55, [
    { valor: fmtNum(st.Vencido.qtd), rotulo: "Lotes Já Vencidos", cor: COR_FAROL.Vencido, contexto: fmtMoeda(st.Vencido.valor), corContexto: COR_FAROL.Vencido },
    { valor: fmtNum(st.Urgente.qtd), rotulo: "0-30 Dias (Urgente)", cor: COR_FAROL.Urgente, contexto: fmtMoeda(st.Urgente.valor), corContexto: COR_FAROL.Urgente },
    { valor: fmtNum(st.Perigo.qtd), rotulo: "31-60 Dias (Perigo)", cor: COR_FAROL.Perigo, contexto: fmtMoeda(st.Perigo.valor), corContexto: COR_FAROL.Perigo },
    { valor: fmtNum(st["Atenção"].qtd), rotulo: "61-90 Dias (Atenção)", cor: COR_FAROL["Atenção"], contexto: fmtMoeda(st["Atenção"].valor), corContexto: COR_FAROL["Atenção"] },
  ], 0.68);
  const lg = (LC - 0.4) / 2, x2 = MARGEM + lg + 0.4, yG = 2.5, hG = 2.4;
  const series = (l: DadosFarol["porAlmox"]) => STATUS_FAROL.map((st) => ({ nome: st, valores: l.map((a) => a[st]), cor: COR_FAROL[st] })).filter((x) => x.valores.some((v) => v));
  if (f.porAlmox.length) graficoEmpilhado(p, s, MARGEM, yG, lg, hG, f.porAlmox.slice(0, 12).map((a) => a.nome), series(f.porAlmox.slice(0, 12)), { formato: '"R$ "#,##0', rotacao: -45, tamEixo: 8 });
  else caixaLeitura(s, MARGEM, yG, lg, hG, "Sem dados", "Nenhum lote em risco de validade por almoxarifado.", { tamanho: 11 });
  if (f.porGrupo.length) graficoEmpilhado(p, s, x2, yG, lg, hG, f.porGrupo.map((g) => g.nome), series(f.porGrupo), { horizontal: true, percentual: true, tamEixo: 8 });
  else caixaLeitura(s, x2, yG, lg, hG, "Sem dados", "Nenhum lote em risco de validade por grupo.", { tamanho: 11 });
  tresTabelas(s, (["Urgente", "Perigo", "Atenção"] as const).map((k, i) => ({ titulo: ["0-30 DIAS — URGENTE", "31-60 DIAS — PERIGO", "61-90 DIAS — ATENÇÃO"][i], cor: COR_FAROL[k], itens: st[k].top.map((t) => ({ descricao: t.descricao, valor: t.custo })), total: st[k].valor })), "Custo", "Nenhum lote nesta faixa.");
}

// ---------- Materiais sem movimentação (Risco de Obsolescência) ----------
export function slideSemMovimentacao(p: Pptx, mesLabel: string, pag: number, d: DadosSemMov | null, geradoEm: Date) {
  const s = novoSlide(p);
  cabecalho(s, "Materiais sem movimentação", mesLabel, pag, `Retrato do estoque parado sem movimento em ${geradoEm.toLocaleDateString("pt-BR")} — Risco de Obsolescência do Stock Savvy`);
  if (semDados(s, d, "Risco de Obsolescência indisponível", erroFonte("Risco de Obsolescência"))) return;
  const o = d!, pf = o.porFaixa;
  linhaKpis(s, 1.55, FAIXAS_PARADO.map((f) => ({ valor: fmtNum(pf[f].qtd), rotulo: `${f} Dias Parado`, cor: COR_PARADO[f], contexto: fmtMoeda(pf[f].valor), corContexto: COR_PARADO[f], borda: f === "+90" && pf[f].qtd ? COR_PARADO[f] : null })), 0.68);
  const lg = (LC - 0.4) / 2, x2 = MARGEM + lg + 0.4, yG = 2.5, hG = 2.4;
  const series = (l: DadosSemMov["porAlmox"]) => FAIXAS_PARADO.map((f) => ({ nome: f, valores: l.map((a) => a[f]), cor: COR_PARADO[f] })).filter((x) => x.valores.some((v) => v));
  if (o.porAlmox.length) graficoEmpilhado(p, s, MARGEM, yG, lg, hG, o.porAlmox.slice(0, 8).map((a) => a.nome), series(o.porAlmox.slice(0, 8)), { formato: '"R$ "#,##0', rotacao: -45, tamEixo: 8 });
  else caixaLeitura(s, MARGEM, yG, lg, hG, "Sem dados", "Nenhum material parado por almoxarifado.", { tamanho: 11 });
  if (o.porGrupo.length) graficoEmpilhado(p, s, x2, yG, lg, hG, o.porGrupo.map((g) => g.nome), series(o.porGrupo), { horizontal: true, percentual: true, tamEixo: 8 });
  else caixaLeitura(s, x2, yG, lg, hG, "Sem dados", "Nenhum material parado por grupo.", { tamanho: 11 });
  tresTabelas(s, FAIXAS_PARADO.map((f) => ({ titulo: `${f} DIAS`, cor: COR_PARADO[f], itens: pf[f].itens, total: pf[f].valor })), "Valor", "Nenhum lote nesta faixa.");
}

// ---------- Recuperação de Shelf ----------
export function slideRecuperacao(p: Pptx, mesLabel: string, pag: number, d: DadosRecuperacao | null) {
  const s = novoSlide(p);
  cabecalho(s, "Recuperação de Shelf", mesLabel, pag, "Ano até o mês — perda por vencimento × recuperação por ações de lote (Dashboard Shelf Life do Stock Savvy)");
  if (semDados(s, d, "Recuperação de Shelf indisponível", erroFonte("Recuperação de Shelf"))) return;
  const r = d!;
  linhaKpis(s, 1.55, [
    { valor: fmtMoeda(r.receitaRecuperada), rotulo: "Receita Recuperada", cor: COR.SUCESSO },
    { valor: fmtMoeda(r.perdaEvitada), rotulo: "Perda Evitada", cor: COR.SUCESSO },
    { valor: fmtMoeda(r.perdaReal), rotulo: "Perda Real", cor: COR.ERRO },
    { valor: fmtMoeda(r.savingRecuperado), rotulo: "Saving Recuperado" },
  ], 0.65, 0.383, 20);
  if (r.mensal.length) graficoMulti(p, s, MARGEM, 2.185, LC, 2.231, r.mensal.map((m) => mesCurto(m.mes)), [
    { nome: "Perda", valores: r.mensal.map((m) => Math.round(m.perda * 100) / 100), cor: COR.ERRO },
    { nome: "Receita Recuperada", valores: r.mensal.map((m) => Math.round(m.receita * 100) / 100), cor: COR.SUCESSO },
    { nome: "Saving Recuperado", valores: r.mensal.map((m) => Math.round(m.saving * 100) / 100), cor: COR.VERDE_AMAZONIA },
  ], { formato: '"R$ "#,##0' });
  else caixaLeitura(s, MARGEM, 2.185, LC, 2.231, "Evolução mensal", "Sem perda por vencimento nem ação de lote concluída no ano até este mês.", { corRotulo: COR.ATENCAO, tamanho: 12 });
  const lc = (LC - 0.35) / 2, x2 = MARGEM + lc + 0.35, y = 4.403;
  texto(s, MARGEM, y, lc, 0.26, "TOP 10 RECUPERADOS — AÇÃO E RESULTADO", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (r.topRecuperados.length) tabela(s, MARGEM, y + 0.26, lc, Math.min(2.43, 0.42 * (Math.min(6, r.topRecuperados.length) + 1)), ["Produto", "Ação", "Ações", "Custo", "Saving", "Recuperado"], r.topRecuperados.slice(0, 6).map((t) => [corte(t.nome, 22), corte(t.acao, 22), fmtNum(t.qtd), fmtMoeda(t.custo, 2), fmtMoeda(t.saving, 2), fmtMoeda(t.valor, 2)]), { larguras: [1.6, 1, 0.6, 1, 1, 1], tamanho: 9 });
  else caixaLeitura(s, MARGEM, y + 0.26, lc, 2.43, "Recuperados", "Nenhuma ação de lote concluída no período.");
  texto(s, x2, y, lc, 0.26, "TOP 10 PERDA — MOTIVO E RESULTADO", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (r.topPerda.length) tabela(s, x2, y + 0.26, lc, Math.min(2.43, 0.38 * (Math.min(6, r.topPerda.length) + 1)), ["Produto", "Motivo", "Baixas", "Qtd.", "Perda"], r.topPerda.slice(0, 6).map((t) => [corte(t.nome, 22), corte(t.motivo, 22), fmtNum(t.ocorrencias), fmtNum(t.quantidade, Number.isInteger(t.quantidade) ? 0 : 3), fmtMoeda(t.valor, 2)]), { larguras: [1.6, 1, 0.7, 0.7, 1.1], tamanho: 9 });
  else caixaLeitura(s, x2, y + 0.26, lc, 2.43, "Perda", "Nenhuma perda por vencimento sem cobertura no período.");
}

// ---------- Dispersão de Ficha Técnica ----------
export function slideDispersao(p: Pptx, mesLabel: string, pag: number, d: DadosDispersao | null) {
  const s = novoSlide(p);
  cabecalho(s, "Dispersão de Ficha Técnica", mesLabel, pag, "Ficha Técnica × Consumo real por Ordem de Produção — filtrado pelo mês deste relatório");
  if (semDados(s, d, "Dispersão de Ficha Técnica indisponível", erroFonte("Dispersão de Ficha Técnica"))) return;
  const x = d!;
  if (!x.ops) { caixaLeitura(s, MARGEM, 1.6, LC, 1.4, `Sem OPs analisadas em ${mesLabel}`, "Não há Ordem de Produção com consumo importado neste mês na Dispersão de Lote do Stock Savvy.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  linhaKpis(s, 1.55, [
    { valor: fmtNum(x.ops), rotulo: "OPs Analisadas no Mês" },
    { valor: fmtPct(x.taxaFuro), rotulo: "Taxa de Furo", cor: x.taxaFuro > 0 ? COR.ATENCAO : COR.SUCESSO },
    { valor: fmtMoeda(x.liquido), rotulo: "Impacto Líquido (Perda − Economia)", cor: x.liquido > 0 ? COR.ERRO : COR.SUCESSO },
    { valor: fmtNum(x.opsCriticas), rotulo: "OPs Críticas", cor: x.opsCriticas ? COR.ERRO : COR.SUCESSO },
  ]);
  let yS = 2.36;
  if (x.serie.length >= 2) {
    texto(s, MARGEM, 2.36, LC, 0.24, "TENDÊNCIA FINANCEIRA — PERDA × ECONOMIA × IMPACTO LÍQUIDO (R$/MÊS)", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoMulti(p, s, MARGEM, 2.6, LC, 2, x.serie.map((m) => rotuloMes(m.mes)), [
      { nome: "Perda", valores: x.serie.map((m) => m.perda), cor: COR.ERRO }, { nome: "Economia", valores: x.serie.map((m) => m.economia), cor: COR.SUCESSO }, { nome: "Impacto Líquido", valores: x.serie.map((m) => m.liquido), cor: COR.AZUL_INSTITUCIONAL },
    ], { formato: "#,##0" });
    yS = 4.78;
  }
  const hS = 6.35 - yS, xd = MARGEM + 6.3 + 0.35, ld = LARGURA - MARGEM - xd;
  texto(s, MARGEM, yS, 6.3, 0.24, "MATERIAIS COM MAIOR PERDA NO MÊS (R$)", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (x.topPerda.length) graficoBarrasH(p, s, MARGEM, yS + 0.28, 6.3, hS - 0.28, x.topPerda.map((t) => corte(t.descricao, 26)), "Perda", x.topPerda.map((t) => Math.round(t.liq * 100) / 100), { cor: COR.ERRO, formato: "#,##0" });
  else caixaLeitura(s, MARGEM, yS + 0.28, 6.3, hS - 0.28, "Materiais com maior perda", "Nenhum material com perda líquida neste mês.");
  texto(s, xd, yS, ld, 0.24, "MATERIAIS COM MAIOR ECONOMIA", { tamanho: 10.5, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (x.topEconomia.length) tabela(s, xd, yS + 0.28, ld, hS - 0.28, ["Material", "OPs", "Economia"], x.topEconomia.map((t) => [corte(t.descricao, 24), fmtNum(t.freq), fmtMoeda(-t.liq)]), { larguras: [2.4, 0.8, 1.4], tamanho: 10, margemV: 0.02 });
  else caixaLeitura(s, xd, yS + 0.28, ld, hS - 0.28, "Economia", "Sem economia líquida registrada neste mês.");
  texto(s, MARGEM, 6.45, LC, 0.4, `Fonte: Dispersão de Lote (Produção) do Stock Savvy — Materiais crônicos (≥ ${x.limFreq} OPs): ${fmtNum(x.cronicos)} · Concentração Top 20: ${fmtPct(x.pctTop20)} do impacto absoluto.`, { tamanho: 10 });
}

// ---------- Testes Industriais ----------
export function slideTestes(p: Pptx, mesLabel: string, pag: number, d: DadosTestes | null) {
  const s = novoSlide(p);
  cabecalho(s, "Testes Industriais", mesLabel, pag, "Controle de Testes Industriais (custo de inovação) do Stock Savvy — filtrado pelo mês deste relatório");
  if (semDados(s, d, "Testes Industriais indisponíveis", erroFonte("Testes Industriais"))) return;
  const t = d!;
  if (!t.itens && !t.semCusto) { caixaLeitura(s, MARGEM, 1.6, LC, 1.4, `Sem testes registrados em ${mesLabel}`, "Nenhum material consumido nas OPs de Teste Industrial neste mês.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  linhaKpis(s, 1.55, [
    { valor: fmtNum(t.itens), rotulo: "Itens Consumidos no Mês" }, { valor: fmtMoeda(t.gasto), rotulo: "Gasto Total no Mês", cor: COR.ATENCAO },
    { valor: fmtNum(t.ops), rotulo: "OPs Testadas" }, { valor: fmtMoeda(t.custoMedio), rotulo: "Custo Médio por OP" },
  ]);
  if (t.semCusto) texto(s, MARGEM, 2.55, LC, 0.26, `Obs.: ${fmtNum(t.semCusto)} item(ns) consumido(s) no mês sem custo cadastrado foram excluídos deste total — confira o cadastro de custo desses materiais.`, { tamanho: 10, negrito: true, cor: COR.ATENCAO });
  if (t.top.length) {
    texto(s, MARGEM, 3.05, LC, 0.26, "MATÉRIAS-PRIMAS COM MAIOR CUSTO NO MÊS (R$)", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
    graficoBarrasH(p, s, MARGEM, 3.35, LC, 3, t.top.map((x) => corte(x.nome, 26)), "Custo", t.top.map((x) => x.custo), { cor: COR.ATENCAO, formato: "#,##0" });
  } else caixaLeitura(s, MARGEM, 3.05, LC, 3, "Matérias-primas", "Nenhuma matéria-prima com custo consumida neste mês.");
  texto(s, MARGEM, 6.55, LC, 0.4, "Fonte: Testes Industriais (Produção) do Stock Savvy — consumo das OPs do SKU de teste industrial × custo médio do material.", { tamanho: 10 });
}

// ---------- Controle de FEFO ----------
export function slideFefo(p: Pptx, mesLabel: string, pag: number, d: DadosFefo | null) {
  const s = novoSlide(p);
  cabecalho(s, "FEFO", mesLabel, pag, "Controle de FEFO — transferências auditadas, quebras e top produtos (fonte oficial do indicador)");
  if (semDados(s, d, "Controle de FEFO indisponível", erroFonte("Controle de FEFO"))) return;
  const f = d!;
  if (!f.total) { caixaLeitura(s, MARGEM, 1.6, LC, 1.4, `Sem transferências auditadas em ${mesLabel}`, "A checagem automática de FEFO não registrou transferências auditáveis neste mês.", { corRotulo: COR.ATENCAO, tamanho: 13 }); return; }
  const st = statusMenorMelhor(f.taxa, 5, 20);
  const ctxInc = !f.inconclusivos ? "nenhum inconclusivo no mês" : f.motivosInconc.length === 1 ? `${fmtNum(f.inconclusivos)} ${f.motivosInconc[0].motivo.toLowerCase()}` : `${fmtNum(f.inconclusivos)} sem validade ou almox não mapeado`;
  linhaKpis(s, 1.55, [
    { valor: fmtNum(f.total), rotulo: "Transferências Auditadas", contexto: `${fmtNum(f.total)} transferência(s) no mês` },
    { valor: fmtNum(f.quebras), rotulo: "Quebras de FEFO", cor: f.quebras ? COR.ERRO : COR.SUCESSO, contexto: f.deltaQuebras == null ? `${fmtNum(f.produtosQuebra)} produto(s) afetado(s)` : `${f.deltaQuebras >= 0 ? "+" : ""}${fmtNum(f.deltaQuebras)} vs. mês anterior`, borda: f.quebras ? COR.ERRO : null },
    { valor: fmtPct(f.taxa), rotulo: "Taxa de Quebra", cor: st.cor, contexto: f.deltaTaxa == null ? st.label : `${fmtSinal(f.deltaTaxa, (x) => fmtNum(x, 1))} p.p. vs. mês anterior`, corContexto: st.cor, borda: st.cor },
    { valor: `${fmtNum(f.oks)} / ${fmtNum(f.inconclusivos)}`, rotulo: "OK / Inconclusivo", contexto: ctxInc },
  ], 0.68);
  const y2 = 1.55 + 0.68 + 0.14, h2 = 2.35;
  texto(s, MARGEM, y2, LC, 0.22, "TRANSFERÊNCIAS E QUEBRAS POR DIA", { tamanho: 12, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  graficoMulti(p, s, MARGEM, y2 + 0.26, LC, h2 - 0.26, f.porDia.map((x) => x.dia), [{ nome: "Transferências", valores: f.porDia.map((x) => x.total), cor: COR.VERDE_AMAZONIA }, { nome: "Quebras", valores: f.porDia.map((x) => x.quebras), cor: COR.ERRO }], { formato: "0" });
  const y3 = y2 + h2 + 0.14, h3 = 2.26, g = 0.25, wp = (LC - 2 * g) * 0.27, wb = LC - 2 * wp - 2 * g, xp = MARGEM, xr = xp + wp + g, xb = xr + wp + g;
  texto(s, xp, y3, wp, 0.22, "TRANSFERÊNCIAS POR DESTINO", { tamanho: 10, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  graficoRosca(p, s, xp, y3 + 0.24, wp, h3 - 0.24, f.porDestino.map((x) => x.nome), f.porDestino.map((x) => x.total), [COR.VERDE_AMAZONIA, COR.AZUL_INSTITUCIONAL, COR.AZUL_CLARO, COR_FAROL.Perigo, COR.INFO, COR.CINZA_CLARO], { pizza: true, formato: "0" });
  texto(s, xr, y3, wp, 0.22, "TRANSFERÊNCIAS POR GRUPO", { tamanho: 10, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  graficoRosca(p, s, xr, y3 + 0.24, wp, h3 - 0.24, f.porGrupo.map((x) => x.nome), f.porGrupo.map((x) => x.total), [...CORES_FUNIL, COR.CINZA_CLARO], { formato: "0" });
  texto(s, xb, y3, wb, 0.22, "TOP PRODUTOS COM MAIS QUEBRAS", { tamanho: 10, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  if (f.topProdutos.length) graficoBarrasH(p, s, xb, y3 + 0.24, wb, h3 - 0.24, f.topProdutos.map((t) => corte(t.nome, 40)), "Quebras", f.topProdutos.map((t) => t.qtd), { cor: COR.ERRO, formato: "0", tamEixo: 7 });
  else caixaLeitura(s, xb, y3 + 0.24, wb, h3 - 0.24, "Produtos com mais quebras", "Nenhuma quebra registrada neste mês.");
}
