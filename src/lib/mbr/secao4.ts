// MBR — Seção 4: Metas Individuais (upload do .html) e Atlas (Impacto, Fechamento Mensal do Stock Savvy, Próximos Passos).
import { ALTURA, COR, LARGURA, MARGEM, fmtMoeda, fmtNum, fmtPct, nomeMes, r2 } from "./formato";
import { badge, cabecalho, caixaLeitura, graficoEmpilhado, linhaKpis, listaMarcadores, novoSlide, retangulo, slideAberturaSecao, tabela, texto, type Celula, type Pptx } from "./kit";
import type { DadosFechamento, DadosMetas, Meta } from "./dados3";
import { montarScorecard, type Consolidado } from "./secao1";

const LC = LARGURA - 2 * MARGEM;
const numBR = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const valGeral = (v: number, u: string) => (u === "R$" ? fmtMoeda(v, 2) : `${numBR(v)} ${u}`.trim());
const periodoBr = (ini: string, fim: string) => `${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}/${fim.slice(0, 4)}`;
const corte = (t: string | null | undefined, n: number) => { const s = String(t ?? "—"); return s.length > n ? s.slice(0, n) : s; };

// ---------- Metas Individuais ----------
const alertaMeta = (m: Meta) => m.sinalInconsistente || m.acumuladoSomado;
export function slideAberturaMetas(p: Pptx, mesLabel: string, pag: number, metas: DadosMetas | null) {
  slideAberturaSecao(p, mesLabel, pag, 4, 4, "Metas Individuais", "Metas individuais x resultados operacionais consolidados — filtrado pelo mês deste relatório",
    metas ? metas.metas.slice(0, 8).map((m) => m.descricao + (alertaMeta(m) ? " ⚠" : "")) : ["Metas Individuais (aguardando o .html do mês)"]);
}

function tendenciaMeta(m: Meta, idx: number): { label: string; cor: string } {
  if (idx <= 0 || idx >= m.serie.length) return { label: "Sem histórico", cor: COR.CINZA_TEXTO };
  const a = m.serie[idx].realizado, b = m.serie[idx - 1].realizado;
  if (a == null || b == null || a === "" || b === "") return { label: "Sem histórico", cor: COR.CINZA_TEXTO };
  if (m.tipo === "booleano") {
    const ok = (x: unknown) => ["sim", "true", "1"].includes(String(x).trim().toLowerCase()), ao = ok(a), bo = ok(b);
    if (ao === bo) return ao ? { label: "Estável (em dia)", cor: COR.SUCESSO } : { label: "Estável (pendente)", cor: COR.ATENCAO };
    return ao ? { label: "Evolução", cor: COR.SUCESSO } : { label: "Involução", cor: COR.ERRO };
  }
  if (a === b) return { label: "Estável", cor: COR.CINZA_TEXTO };
  const melhorou = (m.direcao ?? "").toLowerCase() === "maior" ? (a as number) > (b as number) : (a as number) < (b as number);
  return melhorou ? { label: "Evolução", cor: COR.SUCESSO } : { label: "Involução", cor: COR.ERRO };
}
function valorMeta(m: Meta, v: number | null, texto: string | null) {
  if (m.tipo === "booleano") return texto || "—";
  if (v == null) return "—";
  const u = (m.unidade ?? "").toUpperCase();
  return u === "%" ? fmtPct(v) : ["R$", "RS", "REAIS"].includes(u) ? fmtMoeda(v, 2) : fmtNum(v, 1);
}
export function slideMetas(p: Pptx, mesLabel: string, pag: number, dado: DadosMetas | null, fech: DadosFechamento | null) {
  const s = novoSlide(p);
  cabecalho(s, "Metas Individuais", mesLabel, pag, "Metas individuais x resultados operacionais consolidados — filtrado pelo mês deste relatório");
  if (!dado) {
    caixaLeitura(s, MARGEM, 1.6, LC, 1.4, "Metas Individuais ainda não enviadas", "Suba o .html exportado da tela \"Minhas metas\" na tela do MBR (Atlas > MBR) para que as metas do mês apareçam neste relatório.", { corRotulo: COR.ATENCAO, tamanho: 13 });
    return;
  }
  const tend = dado.metas.map((m) => tendenciaMeta(m, dado.idxMes));
  const nEv = tend.filter((t) => t.label === "Evolução").length, nIn = tend.filter((t) => t.label === "Involução").length, nInc = dado.metas.filter(alertaMeta).length;
  texto(s, MARGEM, 1.28, LC, 0.24, `Responsável: ${dado.colaborador ?? "—"} · ${dado.metas.length} meta(s) monitorada(s)`, { tamanho: 10.5, italico: true });
  linhaKpis(s, 1.58, [
    { valor: dado.somaPesos != null ? fmtPct(dado.somaPesos) : "—", rotulo: "Soma dos Pesos (esperado: 100%)", cor: dado.pesosOk ? COR.SUCESSO : COR.ERRO },
    { valor: fmtNum(nEv), rotulo: "Metas em Evolução", cor: nEv ? COR.SUCESSO : COR.CINZA_TEXTO },
    { valor: fmtNum(nIn), rotulo: "Metas em Involução", cor: nIn ? COR.ERRO : COR.SUCESSO },
    { valor: fmtNum(nInc), rotulo: "Metas com Dado Inconsistente no Export", cor: nInc ? COR.ATENCAO : COR.SUCESSO },
  ]);
  const linhas: Celula[][] = dado.metas.map((m, i) => {
    let d = m.descricao; if (d.length > 38) d = d.slice(0, 38).replace(/\s+\S*$/, "").replace(/[,.;:—-]+$/, "") + "…";
    return [d + (alertaMeta(m) ? " ⚠" : ""), m.peso != null ? `${fmtNum(m.peso)}%` : "—", valorMeta(m, m.realizadoMes, m.realizadoTexto), valorMeta(m, m.metaMes, null), m.atingMes != null ? fmtPct(m.atingMes) : "—", { t: tend[i].label, cor: tend[i].cor, negrito: true }];
  });
  const hT = Math.min(2.7, 0.5 + 0.4 * linhas.length);
  tabela(s, MARGEM, 2.5, LC, hT, ["Meta", "Peso", "Realizado (mês)", "Meta (mês)", "Atingimento (mês)", "Tendência"], linhas, { larguras: [3.4, 0.7, 1.5, 1.5, 1.5, 1.4], tamanho: 10.5 });
  const y = 2.5 + hT + 0.25, lm = (LC - 0.3) / 2;
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const metaMp = dado.metas.find((m) => norm(m.descricao).includes("prejuizo") && norm(m.descricao).includes("materia prima"));
  const perdaReal = fech?.pnl?.perda_real;
  if (metaMp?.realizadoMes != null && perdaReal != null) {
    const div = (Math.abs(metaMp.realizadoMes - perdaReal) / Math.max(Math.abs(perdaReal), 1)) * 100, ok = div <= 15;
    caixaLeitura(s, MARGEM, y, lm, 1.35, "Cruzamento com Stock Savvy — Prejuízo de Matéria-Prima", `Meta individual (Realizado do mês): ${fmtMoeda(metaMp.realizadoMes, 2)} · Stock Savvy ("Perda real" do Fechamento Mensal): ${fmtMoeda(perdaReal, 2)} · Divergência: ${fmtPct(div)}. ${ok ? "Os dois números batem dentro da margem esperada." : "Divergência acima de 15% entre as duas fontes — vale conferir se medem exatamente o mesmo recorte de perda antes de reportar os dois lado a lado."}`, { corRotulo: ok ? COR.SUCESSO : COR.ATENCAO, tamanho: 10.5 });
  } else caixaLeitura(s, MARGEM, y, lm, 1.35, "Cruzamento com Stock Savvy — Prejuízo de Matéria-Prima", "Não foi possível cruzar esta meta com o Fechamento Mensal do Stock Savvy deste mês — confira se a meta \"% Prejuízo de Matéria prima e insumos\" existe no export e se o fechamento do mês tem perda real calculada.", { corRotulo: COR.ATENCAO, tamanho: 10.5 });
  const probs: string[] = [];
  if (dado.somaPesos != null && !dado.pesosOk) probs.push(`Soma dos pesos configurados = ${fmtPct(dado.somaPesos)} (esperado 100%) — os pesos das metas deste colaborador não estão configurados corretamente na ferramenta de origem.`);
  for (const m of dado.metas) {
    if (m.sinalInconsistente) probs.push(`"${m.descricao}": Meta e Realizado do mês têm sinais opostos no export de origem — o atingimento percentual mostrado (${fmtPct(m.atingMes)}) não é confiável.`);
    if (m.acumuladoSomado) probs.push(`"${m.descricao}": o acumulado do ano parece somar os meses em vez de tirar a média (métrica em %) — média real até ${mesLabel}: ${fmtPct(m.mediaAteMes)}.`);
  }
  caixaLeitura(s, MARGEM + lm + 0.3, y, lm, 1.35, "Validação dos Dados de Origem", probs.join(" ") || "Nenhuma inconsistência adicional identificada nos dados deste mês.", { corRotulo: probs.length ? COR.ATENCAO : COR.SUCESSO, tamanho: 10 });
  texto(s, MARGEM, ALTURA - 0.45, LC, 0.32, `Fonte: export "Minhas metas" enviado na tela do MBR${dado.enviadoEm ? ` em ${dado.enviadoEm}` : ""} — ⚠ na tabela indica meta com inconsistência de dados detectada no export de origem (ver caixa de validação).`, { tamanho: 9, italico: true });
}

// ---------- Atlas ----------
export const MODULOS_NATIVOS = ["Painel de Inventário — fechamento por almoxarifado", "Acurácia Ponderada por Valor (IAP)", "Mapeamento de Passivos e Baixas Operacionais", "Shelf Life — Farol de Validade", "Mapeamento de Risco de Obsolescência", "Controle de Movimentados — reconciliação diária"];
export const ITENS_ATLAS = ["Impacto do Atlas", "Fechamento Stock Savvy — Mapeamento por Módulo", "Fechamento Stock Savvy — Principais Ações", "Próximos Passos"];
export function slideAberturaAtlas(p: Pptx, mesLabel: string, pag: number) {
  slideAberturaSecao(p, mesLabel, pag, 4, 4, "Atlas", "Cobertura de processos hoje e melhorias esperadas com o uso contínuo da ferramenta.", ITENS_ATLAS);
}

export function slideImpacto(p: Pptx, mesLabel: string, pag: number, c: Consolidado, controlesIntegrados: number) {
  const s = novoSlide(p);
  cabecalho(s, "Impacto do Atlas", mesLabel, pag, "Mapeamento completo dos processos monitorados e ganhos mensuráveis com o uso contínuo da ferramenta");
  const mov = c.d.movimentados, pri = c.d.evolucaoMovimentados[0];
  const delta = pri?.pct != null && mov.pct != null ? r2(mov.pct - pri.pct) : null;
  const visibilidade = (c.pacotes?.passivosMes.valor ?? 0) + (c.farol?.valorTotal ?? 0) + (c.obsolescencia?.valorTotal ?? 0);
  linhaKpis(s, 1.55, [
    { valor: fmtNum(MODULOS_NATIVOS.length), rotulo: "Frentes Nativas Mapeadas pelo Atlas" },
    { valor: fmtNum(controlesIntegrados), rotulo: "Controles do Stock Savvy no MBR", cor: controlesIntegrados ? COR.SUCESSO : COR.CINZA_TEXTO },
    { valor: delta == null ? "—" : delta >= 0 ? `+${fmtPct(delta)}` : fmtPct(delta), rotulo: "Ganho de Acurácia (Movimentados)", cor: (delta ?? 0) >= 0 ? COR.SUCESSO : COR.ERRO },
    { valor: fmtMoeda(visibilidade), rotulo: "Valor sob Visibilidade Ativa" },
  ]);
  const le = 6.3;
  texto(s, MARGEM, 3.05, le, 0.28, "COBERTURA DE PROCESSOS HOJE", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  listaMarcadores(s, MARGEM, 3.4, le, 3, [...MODULOS_NATIVOS, controlesIntegrados ? `${controlesIntegrados} controle(s) do Stock Savvy lido(s) direto do banco — sem export manual de .html.` : "Nenhum controle do Stock Savvy com dado neste mês."], COR.VERDE_AMAZONIA, 12);
  const xd = MARGEM + le + 0.35;
  const t = delta != null && pri
    ? `Desde a implantação do Controle de Movimentados, em ${nomeMes(pri.mes)}, a acurácia da reconciliação diária avançou ${fmtPct(delta)} — mesma lógica de leitura contínua que hoje também sustenta Shelf Life, Mapeamento de Risco de Obsolescência e os controles do Stock Savvy integrados neste relatório. Quanto mais meses de uso contínuo, mais preciso o histórico e mais cedo cada divergência aparece — o próximo ganho esperado é reduzir o tempo entre a divergência ocorrer e ela ser tratada, hoje limitado pela cadência de conferência manual.`
    : "Ainda não há histórico suficiente pra medir o ganho de acurácia desde a implantação — a leitura aparece a partir do segundo mês de dados do Controle de Movimentados.";
  caixaLeitura(s, xd, 3.05, LARGURA - MARGEM - xd, 3.35, "Melhorias Previstas com o Uso Contínuo", t, { tamanho: 12 });
  texto(s, MARGEM, 6.55, LC, 0.5, "Cobertura e integrações medidas neste relatório — não é uma projeção genérica: cada número acima vem dos mesmos dados que alimentam as telas do Stock Savvy no dia a dia.", { tamanho: 9.5, italico: true });
}

const COR_STATUS_MODULO: Record<string, string> = { "sob controle": COR.SUCESSO, "atenção": COR.ATENCAO, atencao: COR.ATENCAO, "sem movimento": COR.CINZA_TEXTO };
function semFechamento(s: ReturnType<typeof novoSlide>, f: DadosFechamento | null) {
  if (f && f.resumo.length) return false;
  caixaLeitura(s, MARGEM, 1.6, LC, 1.4, f ? "Fechamento do mês sem ações registradas" : "Fechamento Mensal indisponível", f ? "As RPCs do Fechamento Mensal do Stock Savvy não trouxeram módulo com ação neste mês." : "Não foi possível ler o Fechamento Mensal do Stock Savvy agora — gere o MBR de novo em instantes.", { corRotulo: COR.ATENCAO, tamanho: 13 });
  return true;
}
export function slideFechamentoModulos(p: Pptx, mesLabel: string, pag: number, f: DadosFechamento | null) {
  const s = novoSlide(p);
  cabecalho(s, "Fechamento Stock Savvy", mesLabel, pag, "Mapeamento por módulo — concluídas x em aberto e status por frente monitorada");
  if (semFechamento(s, f)) return;
  const r = [...f!.resumo].sort((a, b) => a.ordem - b.ordem);
  graficoEmpilhado(p, s, MARGEM, 1.55, LC, 2.55, r.map((x) => x.modulo), [{ nome: "Concluídas", valores: r.map((x) => x.acoes_concluidas), cor: COR.AZUL_INSTITUCIONAL }, { nome: "Em aberto", valores: r.map((x) => x.acoes_em_aberto), cor: COR.ATENCAO }], { horizontal: true, rotulos: true, formato: "#,##0" });
  texto(s, MARGEM, 4.4, LC, 0.24, "STATUS POR MÓDULO", { tamanho: 11, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
  const linhas = [...f!.resumo].sort((a, b) => b.acoes_criadas - a.acoes_criadas || a.ordem - b.ordem).map((x): Celula[] => [x.modulo, fmtNum(x.acoes_criadas), fmtNum(x.acoes_concluidas), fmtNum(x.acoes_em_aberto), valGeral(x.valor_ou_quantidade, x.unidade_valor), { t: x.status_geral, cor: COR_STATUS_MODULO[x.status_geral.trim().toLowerCase()] ?? COR.CINZA_TEXTO, negrito: true }]);
  tabela(s, MARGEM, 4.7, LC, Math.min(0.34 * (linhas.length + 1), ALTURA - 0.55 - 4.7), ["Módulo", "Criadas", "Concluídas", "Em aberto", "Valor / Qtd.", "Status"], linhas, { larguras: [2.4, 1, 1, 1, 1.3, 1.1], tamanho: 10.5 });
  texto(s, MARGEM, ALTURA - 0.45, LC, 0.32, `Fonte: Fechamento Mensal do Stock Savvy — período: ${periodoBr(f!.inicio, f!.fim)}`, { tamanho: 9, italico: true });
}

type Categoria = { titulo: string; cab: string[]; larguras: number[]; linhas: Celula[][] };
export function categoriasAcoes(f: DadosFechamento): Categoria[] {
  const geral = (modulo: string) => f.topGeral.filter((r) => r.modulo === modulo).sort((a, b) => a.rnk - b.rnk).slice(0, 5).map((r): Celula[] => [String(r.rnk), r.item, r.detalhe, valGeral(Number(r.valor) || 0, r.unidade)]);
  return [
    { titulo: "Baixas Operacionais", cab: ["#", "Produto", "Lote / Almox.", "Motivo", "Solicitante", "Valor"], larguras: [0.3, 1.9, 1.7, 1.1, 1.1, 1], linhas: f.topBaixas.slice(0, 5).map((r, i) => [String(i + 1), `${r.codigo_produto} — ${r.descricao ?? ""}`, `${r.lote ?? "-"} / ${r.almoxarifado ?? "-"}`, r.motivo ?? "—", r.solicitante ?? "—", fmtMoeda(Number(r.valor_total) || 0, 2)]) },
    { titulo: "Dispersão de Lote (identificadas)", cab: ["#", "Item", "Detalhe", "Valor"], larguras: [0.3, 3, 1.6, 1.1], linhas: geral("Dispersão de Lote (identificadas)") },
    { titulo: "Ações de Lote (Shelf Life)", cab: ["#", "Produto (SKU)", "Lote / Almox.", "Tipo de ação", "Responsável", "Qtd", "Custo", "Saving"], larguras: [0.3, 1.8, 1.7, 1.1, 1.25, 0.5, 0.9, 0.9], linhas: f.topLote.slice(0, 5).map((r, i) => [String(i + 1), `${r.sku} — ${r.descricao ?? ""}`, `${r.lote ?? "-"} / ${r.almoxarifado ?? "-"}`, r.tipo_acao ?? "—", r.responsavel ?? "—", numBR(Number(r.quantidade) || 0), fmtMoeda(Number(r.custo_acao) || 0, 2), fmtMoeda(Number(r.saving) || 0, 2)]) },
    { titulo: "Controle de FEFO", cab: ["#", "Item", "Detalhe", "Valor"], larguras: [0.3, 2.6, 2.2, 0.9], linhas: geral("Controle de FEFO") },
  ].filter((c) => c.linhas.length);
}
export function slidesFechamentoAcoes(p: Pptx, mesLabel: string, proximaPagina: () => number, f: DadosFechamento | null) {
  const cats = f ? categoriasAcoes(f) : [];
  const sub = "Principais ações do período — as 5 maiores de cada frente monitorada pelo Stock Savvy";
  if (!cats.length) {
    const s = novoSlide(p); cabecalho(s, "Fechamento Stock Savvy", mesLabel, proximaPagina(), sub);
    if (!semFechamento(s, f)) caixaLeitura(s, MARGEM, 1.6, LC, 1.4, "Nenhuma ação individual neste fechamento", "Nenhuma das frentes (baixas, dispersão, ações de lote, FEFO) teve ação registrada no período.", { corRotulo: COR.ATENCAO, tamanho: 12 });
    return;
  }
  for (let i = 0; i < cats.length; i += 2) {
    const par = cats.slice(i, i + 2), s = novoSlide(p);
    cabecalho(s, "Fechamento Stock Savvy", mesLabel, proximaPagina(), sub);
    const w = par.length === 2 ? (LC - 0.3) / 2 : LC;
    par.forEach((c, j) => {
      const x = MARGEM + j * (w + 0.3), muitas = c.cab.length >= 6, tam = muitas ? 8.5 : 10;
      texto(s, x, 1.6, w, 0.28, c.titulo.toUpperCase(), { tamanho: 13, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
      tabela(s, x, 1.94, w, (muitas ? 0.62 : 0.42) * (c.linhas.length + 1), c.cab, c.linhas, { larguras: c.larguras, tamanho: tam, margemV: 0.03 });
    });
    texto(s, MARGEM, ALTURA - 0.45, LC, 0.32, `Fonte: Fechamento Mensal do Stock Savvy — 5 maiores ações por frente, já ordenadas por impacto · período: ${periodoBr(f!.inicio, f!.fim)}`, { tamanho: 9, italico: true });
  }
}

export function slideProximosPassos(p: Pptx, mesLabel: string, pag: number, c: Consolidado) {
  const s = novoSlide(p);
  cabecalho(s, "Próximos Passos", mesLabel, pag, "Ações priorizadas a partir dos pontos de atenção identificados acima");
  const acoes = montarScorecard(c).filter((l) => l.status.label !== "Em avanço");
  const y0 = 1.65, lim = ALTURA - 1.55;
  if (!acoes.length) caixaLeitura(s, MARGEM, y0, LC, 1.2, "Sem ação crítica pendente", "Todas as frentes monitoradas estão dentro da faixa de controle neste recorte — manter a cadência atual de fechamento, mapeamento e monitoramento de validade.");
  else {
    const n = acoes.length, gap = 0.16, h = Math.min(1.05, (lim - y0 - gap * (n - 1)) / n), grande = h >= 0.95;
    acoes.forEach((a, i) => {
      const y = y0 + i * (h + gap);
      retangulo(s, MARGEM, y, LC, h, { fill: COR.BRANCO, borda: COR.CINZA_CLARO, raio: 0.1 });
      texto(s, MARGEM + 0.22, y, 0.5, h, String(i + 1), { tamanho: grande ? 26 : Math.max(16, Math.floor((26 * h) / 1.05)), negrito: true, cor: COR.AZUL_CLARO, meio: true });
      texto(s, MARGEM + 0.85, y + h * 0.12, 6, h * 0.4, a.frente, { tamanho: grande ? 14 : 12, negrito: true, cor: COR.AZUL_INSTITUCIONAL });
      texto(s, MARGEM + 0.85, y + h * 0.48, LC - 3, h * 0.48, a.passo, { tamanho: grande ? 12 : 10.5 });
      badge(s, LARGURA - MARGEM - 1.6, y + (h - 0.38) / 2, 1.35, 0.38, a.status.label, a.status.cor);
    });
  }
  caixaLeitura(s, MARGEM, ALTURA - 1.35, LC, 0.9, "Mensagem", "Este relatório é gerado automaticamente a partir dos mesmos dados que alimentam as telas do Stock Savvy no dia a dia — qualquer ajuste em um fechamento, baixa ou lote se reflete aqui no próximo mês, sem retrabalho manual.", { tamanho: 11 });
}
