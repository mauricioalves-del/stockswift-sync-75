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
export type ItemLinha = { missao_id: string; status_item: string; observacao: string | null };
export type Acao = {
  id: string; etapa: EtapaId; titulo: string; descricao: string | null; origem: string | null;
  missao_id: string | null; responsavel_nome: string | null; prazo: string | null;
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA"; concluida_em: string | null; created_at: string;
};

const ST_DIV = new Set(["DIVERGENTE", "DIVERGENCIA_NEGATIVA", "DIVERGENCIA_POSITIVA"]);
const ST_CONTAGEM = new Set(["PENDENTE", "CONTADO", "OK", "QUEBRA_FEFO", ...ST_DIV]);

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
      if (i.status_item === "OK") ok++; else if (ST_DIV.has(i.status_item)) dv++;
    }
    serie.push({
      data,
      acumulada: ate.length ? ate.filter((x) => x.c === "NO_PRAZO").length / ate.length : null,
      acuracidade: ok + dv ? ok / (ok + dv) : null,
    });
  }

  const idsConcluidas = new Set(doMes.filter((m) => m.status === "CONCLUIDA").map((m) => m.id));
  const itensOk = its.filter((i) => i.status_item === "OK").length;
  const div = its.filter((i) => ST_DIV.has(i.status_item));
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
