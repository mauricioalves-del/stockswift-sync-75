// Projeção de ruptura do CD a partir da meta (consenso) e plano de produção para evitá-la.
//
// Por SKU, dia a dia a partir de `inicioIso`:
//   necessidade acumulada das lojas = soma da demanda diária;
//   as lojas consomem primeiro o que já têm (estoque + trânsito); o resto sai do CD;
//   ruptura do CD = primeiro dia em que o que sai do CD passa do saldo do CD (+ produção já planejada).
export type EntradaProjecao = {
  sku: string; descricao?: string | null;
  estoqueCD: number; estoqueLojas: number; emTransito?: number;
  producao?: { data: string; qtd: number }[];   // produção já planejada (data AAAA-MM-DD)
  demandaDia: number[];                          // soma das lojas, um valor por dia a partir de inicioIso
};
export type Severidade = "critica" | "alta" | "media" | "baixa" | "ok";
export type ResultadoProjecao = {
  sku: string; descricao: string; estoqueCD: number; estoqueLojas: number; emTransito: number;
  demandaTotal: number; deficit: number; demandaMediaDia: number;
  dataRupturaCD: string | null; dataRupturaSistemica: string | null; diasAteRuptura: number | null; severidade: Severidade;
};

const somaDias = (iso: string, n: number): string => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

export function projetarCD(e: EntradaProjecao, inicioIso: string): ResultadoProjecao {
  const emTransito = e.emTransito ?? 0;
  const cobreLojas = e.estoqueLojas + emTransito;
  const prod = [...(e.producao ?? [])].sort((a, b) => a.data.localeCompare(b.data));
  let cum = 0, pi = 0, prodCum = 0;
  let rCD: number | null = null, rSis: number | null = null;
  for (let d = 0; d < e.demandaDia.length; d++) {
    cum += e.demandaDia[d];
    const dia = somaDias(inicioIso, d);
    while (pi < prod.length && prod[pi].data <= dia) { prodCum += prod[pi].qtd; pi++; }
    const saiDoCD = Math.max(0, cum - cobreLojas);
    if (rCD === null && saiDoCD > e.estoqueCD + prodCum) rCD = d;
    if (rSis === null && cum > e.estoqueCD + cobreLojas + prodCum) rSis = d;
  }
  const totalProd = prod.reduce((a, b) => a + b.qtd, 0);
  const saiTotal = Math.max(0, cum - cobreLojas);
  const deficit = Math.max(0, saiTotal - (e.estoqueCD + totalProd));
  const sev: Severidade = rCD === null ? "ok" : rCD <= 14 ? "critica" : rCD <= 30 ? "alta" : rCD <= 60 ? "media" : "baixa";
  return {
    sku: e.sku, descricao: e.descricao ?? "", estoqueCD: e.estoqueCD, estoqueLojas: e.estoqueLojas, emTransito,
    demandaTotal: cum, deficit, demandaMediaDia: e.demandaDia.length ? cum / e.demandaDia.length : 0,
    dataRupturaCD: rCD === null ? null : somaDias(inicioIso, rCD), dataRupturaSistemica: rSis === null ? null : somaDias(inicioIso, rSis),
    diasAteRuptura: rCD, severidade: sev,
  };
}

export type LinhaPlano = { sku: string; descricao: string; quantidade: number; produzirAte: string; dataRuptura: string; urgente: boolean; severidade: Severidade };
export function planoProducao(projs: ResultadoProjecao[], inicioIso: string, opts: { leadTimeDias?: number; diasSegurancaCD?: number; multiplo?: (sku: string) => number } = {}): LinhaPlano[] {
  const lead = opts.leadTimeDias ?? 7, seg = opts.diasSegurancaCD ?? 0;
  const out: LinhaPlano[] = [];
  for (const p of projs) {
    if (p.deficit <= 0 || p.dataRupturaCD === null) continue;
    const mult = Math.max(1, opts.multiplo ? opts.multiplo(p.sku) : 1);
    const qtd = Math.ceil((p.deficit + p.demandaMediaDia * seg) / mult) * mult;
    const alvo = somaDias(p.dataRupturaCD, -lead);
    const produzirAte = alvo < inicioIso ? inicioIso : alvo;
    out.push({ sku: p.sku, descricao: p.descricao, quantidade: qtd, produzirAte, dataRuptura: p.dataRupturaCD, urgente: alvo <= inicioIso, severidade: p.severidade });
  }
  return out.sort((a, b) => a.produzirAte.localeCompare(b.produzirAte) || b.quantidade - a.quantidade);
}

/** Formato de entrada do PCP (producao.pcp: LinhaSim) para checar matéria-prima com a ficha técnica. */
export function paraPcp(linhas: LinhaPlano[]): { id_produto: string; nome: string; quantidade: number; local: boolean }[] {
  return linhas.map((l) => ({ id_produto: l.sku, nome: l.descricao || l.sku, quantidade: l.quantidade, local: false }));
}
