// Indicador do processo de inventário — mesma lógica da disponibilidade de estoque:
//   aderência = 1 − (missões que falharam ÷ missões programadas que já venceram); meta mensal ≥ 95%.
//   Falha = missão vencida e não concluída, ou concluída depois da data programada.
// Apoio: acuracidade de contagem (itens OK ÷ itens avaliados) e pendências por etapa do processo.

export const META_ADERENCIA = 0.95;
export const META_ACURACIDADE = 0.98;

export const ETAPAS = [
  { id: "PLANEJAMENTO", nome: "Planejamento", desc: "Missões programadas para o mês" },
  { id: "EXECUCAO", nome: "Execução", desc: "Contagens feitas no prazo" },
  { id: "DIVERGENCIA", nome: "Divergências", desc: "Itens com diferença na contagem" },
  { id: "AJUSTE", nome: "Ajuste e tratativa", desc: "Divergências justificadas e ajustadas" },
  { id: "ENCERRAMENTO", nome: "Encerramento", desc: "Missões fechadas por completo" },
] as const;
export type EtapaId = (typeof ETAPAS)[number]["id"];

export type MissaoLinha = {
  id: string; titulo: string; tipo: string; origem: string | null;
  data_execucao: string | null; status: string; concluida_em: string | null;
};
export type ItemLinha = {
  missao_id: string; status_item: string; observacao: string | null;
  id?: string; codigo_produto?: string | null; descricao?: string | null; lote?: string | null;
  quantidade_prevista?: number | null; quantidade_contada?: number | null;
};
export type Acao = {
  id: string; etapa: EtapaId; titulo: string; descricao: string | null; origem: string | null;
  missao_id: string | null; responsavel_nome: string | null; prazo: string | null;
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA"; concluida_em: string | null; created_at: string;
};

const ST_DIV = new Set(["DIVERGENTE", "DIVERGENCIA_NEGATIVA", "DIVERGENCIA_POSITIVA"]);
const ST_CONTAGEM = new Set(["PENDENTE", "CONTADO", "OK", "QUEBRA_FEFO", ...ST_DIV]);

const temQtd = (i: ItemLinha) => typeof i.quantidade_prevista === "number" && typeof i.quantidade_contada === "number";
/** Diferença contado − sistema (positiva = sobra, negativa = falta). */
const dif = (i: ItemLinha) => (i.quantidade_contada as number) - (i.quantidade_prevista as number);
/** Divergência pela quantidade (contado ≠ sistema); sem quantidades, cai para o status do item. */
export const itemDivergente = (i: ItemLinha) => (temQtd(i) ? Math.abs(dif(i)) > 1e-6 : ST_DIV.has(i.status_item));
/** Item entra na acuracidade quando tem quantidades ou um status de avaliação (OK/divergente). */
const avaliado = (i: ItemLinha) => temQtd(i) || i.status_item === "OK" || ST_DIV.has(i.status_item);

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export const diaBR = (d: Date | string): string =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export type Grupo = { chave: string; programadas: number; falhas: number; aderencia: number | null };
export type DiaSerie = { data: string; acumulada: number | null; acuracidade: number | null };
export type Resumo = {
  universo: number; noPrazo: number; comAtraso: number; atrasadasAbertas: MissaoLinha[]; futuras: number;
  aderencia: number | null; dentroDaMeta: boolean | null;
  itensOk: number; itensDiv: number; itensFefo: number; itensPendentes: number; itensSemAvaliacao: number;
  acuracidade: number | null; divSemJustificativa: number; encerradasIncompletas: MissaoLinha[];
  concluidasComAtraso: MissaoLinha[]; serie: DiaSerie[]; porTipo: Grupo[]; porOrigem: Grupo[];
};

type Classe = "NO_PRAZO" | "COM_ATRASO" | "ATRASADA_ABERTA" | "FUTURA";
function classificar(m: MissaoLinha, hoje: string): Classe {
  const data = m.data_execucao!;
  if (m.status === "CONCLUIDA") {
    const fim = m.concluida_em ? diaBR(m.concluida_em) : data;
    return fim <= data ? "NO_PRAZO" : "COM_ATRASO";
  }
  return data < hoje ? "ATRASADA_ABERTA" : "FUTURA";
}

function agrupar(ms: { m: MissaoLinha; c: Classe }[], chave: (m: MissaoLinha) => string): Grupo[] {
  const g = new Map<string, Grupo>();
  for (const { m, c } of ms) {
    if (c === "FUTURA") continue;
    const k = chave(m); const x = g.get(k) ?? { chave: k, programadas: 0, falhas: 0, aderencia: null };
    x.programadas++; if (c !== "NO_PRAZO") x.falhas++; g.set(k, x);
  }
  return [...g.values()]
    .map((x) => ({ ...x, aderencia: x.programadas ? 1 - x.falhas / x.programadas : null }))
    .sort((a, b) => (a.aderencia ?? 1) - (b.aderencia ?? 1));
}

export function resumir(missoes: MissaoLinha[], itens: ItemLinha[], mes: string, hoje = diaBR(new Date())): Resumo {
  const doMes = missoes.filter((m) => m.status !== "CANCELADA" && m.data_execucao?.startsWith(mes));
  const cls = doMes.map((m) => ({ m, c: classificar(m, hoje) }));
  const de = (c: Classe) => cls.filter((x) => x.c === c).map((x) => x.m);
  const noPrazo = de("NO_PRAZO").length, comAtraso = de("COM_ATRASO"), atrasadasAbertas = de("ATRASADA_ABERTA");
  const universo = noPrazo + comAtraso.length + atrasadasAbertas.length;
  const aderencia = universo ? noPrazo / universo : null;

  const idsMes = new Set(doMes.map((m) => m.id));
  const its = itens.filter((i) => idsMes.has(i.missao_id) && ST_CONTAGEM.has(i.status_item));

  // Série acumulada: para cada dia do mês até hoje, aderência das missões programadas até aquele dia
  // e acuracidade dos itens contados nas missões até aquele dia.
  const dataDaMissao = new Map(doMes.map((m) => [m.id, m.data_execucao!]));
  const [a, mm] = mes.split("-").map(Number);
  const nDias = new Date(a, mm, 0).getDate();
  const serie: DiaSerie[] = [];
  for (let d = 1; d <= nDias; d++) {
    const data = `${mes}-${String(d).padStart(2, "0")}`;
    if (data > hoje) break;
    const ate = cls.filter((x) => x.c !== "FUTURA" && x.m.data_execucao! <= data);
    let ok = 0, dv = 0;
    for (const i of its) {
      if ((dataDaMissao.get(i.missao_id) ?? "9999") > data) continue;
      if (!avaliado(i)) continue;
      if (itemDivergente(i)) dv++; else ok++;
    }
    serie.push({
      data,
      acumulada: ate.length ? ate.filter((x) => x.c === "NO_PRAZO").length / ate.length : null,
      acuracidade: ok + dv ? ok / (ok + dv) : null,
    });
  }

  const idsConcluidas = new Set(doMes.filter((m) => m.status === "CONCLUIDA").map((m) => m.id));
  const aval = its.filter(avaliado);
  const div = aval.filter(itemDivergente);
  const itensOk = aval.length - div.length;
  const pendentesPorMissao = new Map<string, number>();
  for (const i of its) if (i.status_item === "PENDENTE") pendentesPorMissao.set(i.missao_id, (pendentesPorMissao.get(i.missao_id) ?? 0) + 1);

  return {
    universo, noPrazo, comAtraso: comAtraso.length, atrasadasAbertas, futuras: de("FUTURA").length,
    aderencia, dentroDaMeta: aderencia === null ? null : aderencia >= META_ADERENCIA,
    itensOk, itensDiv: div.length,
    itensFefo: its.filter((i) => i.status_item === "QUEBRA_FEFO").length,
    itensPendentes: its.filter((i) => i.status_item === "PENDENTE").length,
    itensSemAvaliacao: its.filter((i) => i.status_item === "CONTADO").length,
    acuracidade: itensOk + div.length ? itensOk / (itensOk + div.length) : null,
    divSemJustificativa: div.filter((i) => !i.observacao?.trim()).length,
    encerradasIncompletas: doMes.filter((m) => idsConcluidas.has(m.id) && pendentesPorMissao.has(m.id)),
    concluidasComAtraso: comAtraso,
    serie,
    porTipo: agrupar(cls, (m) => m.tipo),
    porOrigem: agrupar(cls, (m) => m.origem ?? "Sem almoxarifado"),
  };
}

export const acaoVencida = (a: Acao, hoje = diaBR(new Date())) =>
  !!a.prazo && a.prazo < hoje && (a.status === "ABERTA" || a.status === "EM_ANDAMENTO");
export const acaoAberta = (a: Acao) => a.status === "ABERTA" || a.status === "EM_ANDAMENTO";

// ---------- Acuracidade da contagem diária (mesmas definições do Atlas: item a item, IAQ e IAP) ----------
// Item a item = itens sem divergência ÷ itens contados.
// IAQ = 1 − Σ|contado − sistema| ÷ Σ|sistema| (ponderada por quantidade).
// IAP = 1 − Σ|contado − sistema| × custo ÷ Σ sistema × custo (ponderada por valor; só itens com custo contábil).
// Impacto contábil = (contado − sistema) × custo unitário: negativo = falta, positivo = sobra.

export type Acur = {
  itens: number; divergentes: number; item: number | null; iaq: number | null; iap: number | null; cobertura: number | null;
  falta: number; sobra: number; liquido: number; missoes: number;
};
export type DiaAcur = Acur & { data: string };
export type LinhaDivergencia = {
  id: string; data: string; missao_id: string; missao: string; origem: string | null;
  sku: string; descricao: string | null; lote: string | null;
  sistema: number; contado: number; diferenca: number; acuracidadeItem: number;
  custo: number | null; impacto: number | null; status: string; observacao: string | null; okComDiferenca: boolean;
};

export function calcAcur(linhas: { it: ItemLinha; missao: string }[], custos: Map<string, number>): Acur {
  const its = linhas.filter((l) => temQtd(l.it));
  let qs = 0, qd = 0, port = 0, vd = 0, falta = 0, sobra = 0, comCusto = 0, divergentes = 0;
  for (const { it } of its) {
    const d = dif(it), p = it.quantidade_prevista as number;
    if (Math.abs(d) > 1e-6) divergentes++;
    qs += Math.abs(p); qd += Math.abs(d);
    const c = custos.get(String(it.codigo_produto ?? "").trim());
    if (c != null) {
      comCusto++; port += Math.abs(p) * c; vd += Math.abs(d) * c;
      if (d < 0) falta += -d * c; else sobra += d * c;
    }
  }
  const n = its.length;
  return {
    itens: n, divergentes, missoes: new Set(linhas.map((l) => l.missao)).size,
    item: n ? (n - divergentes) / n : null,
    iaq: qs ? Math.max(0, 1 - qd / qs) : null,
    iap: port ? Math.max(0, 1 - vd / port) : null,
    cobertura: n ? comCusto / n : null,
    falta, sobra, liquido: sobra - falta,
  };
}

export function acuracidadeContagem(missoes: MissaoLinha[], itens: ItemLinha[], custos: Map<string, number>, mes: string) {
  const doMes = new Map(missoes.filter((m) => m.status !== "CANCELADA" && m.data_execucao?.startsWith(mes)).map((m) => [m.id, m]));
  const linhas = itens
    .filter((i) => doMes.has(i.missao_id) && ST_CONTAGEM.has(i.status_item) && temQtd(i))
    .map((it) => ({ it, missao: it.missao_id, data: doMes.get(it.missao_id)!.data_execucao!.slice(0, 10) }));

  const porDia = new Map<string, typeof linhas>();
  for (const l of linhas) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);
  const dias: DiaAcur[] = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, ls]) => ({ data, ...calcAcur(ls, custos) }));

  const divergencias: LinhaDivergencia[] = linhas.filter((l) => itemDivergente(l.it)).map(({ it, data }) => {
    const m = doMes.get(it.missao_id)!;
    const p = it.quantidade_prevista as number, d = dif(it);
    const sku = String(it.codigo_produto ?? "").trim();
    const custo = custos.get(sku) ?? null;
    return {
      id: it.id ?? `${it.missao_id}-${sku}-${it.lote ?? ""}`, data, missao_id: m.id, missao: m.titulo, origem: m.origem,
      sku, descricao: it.descricao ?? null, lote: it.lote ?? null,
      sistema: p, contado: it.quantidade_contada as number, diferenca: d,
      acuracidadeItem: p ? Math.max(0, 1 - Math.abs(d) / Math.abs(p)) : 0,
      custo, impacto: custo == null ? null : d * custo,
      status: it.status_item, observacao: it.observacao ?? null, okComDiferenca: it.status_item === "OK",
    };
  }).sort((a, b) => Math.abs(b.impacto ?? 0) - Math.abs(a.impacto ?? 0) || Math.abs(b.diferenca) - Math.abs(a.diferenca));

  return { mes: calcAcur(linhas, custos), dias, divergencias, skus: [...new Set(linhas.map((l) => String(l.it.codigo_produto ?? "").trim()))] };
}

export function csvDivergencias(ls: LinhaDivergencia[]): string {
  const n = (v: number | null, c = 2) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: c }));
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cab = ["Data", "Missão", "Almoxarifado", "SKU", "Descrição", "Lote", "Sistema", "Contado", "Diferença", "Acuracidade do item %", "Custo unitário", "Impacto R$", "Status", "Observação"];
  const corpo = ls.map((l) => [l.data.split("-").reverse().join("/"), l.missao, l.origem ?? "", l.sku, l.descricao ?? "", l.lote ?? "", n(l.sistema, 4), n(l.contado, 4), n(l.diferenca, 4), n(l.acuracidadeItem * 100, 1), n(l.custo), n(l.impacto), l.okComDiferenca ? "OK com diferença" : l.status, l.observacao ?? ""].map((v) => esc(String(v))).join(";"));
  return "\ufeff" + [cab.join(";"), ...corpo].join("\n");
}
