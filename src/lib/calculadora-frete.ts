// Calculadora própria de custo real da carga: peso taxável (cubagem), referência histórica R$/kg da Mágio,
// componentes de frete (ad valorem, GRIS, pedágio, coleta/entrega, proteção térmica, ICMS) e custo-alvo com faixa.
export type Volume = { qtd: number; c: number; l: number; a: number }; // cm
export const FATOR_CUBAGEM: Record<string, number> = { rodoviario: 300, aereo: 167, correios: 167, aplicativo: 300, veiculo_proprio: 300 }; // kg/m³

export function cubagemM3(vols: Volume[]) { return Math.round(vols.reduce((s, v) => s + (v.qtd || 0) * (v.c * v.l * v.a) / 1e6, 0) * 1e4) / 1e4; }
export function pesoTaxavel(pesoReal: number, m3: number, modal: string) { const cubado = m3 * (FATOR_CUBAGEM[modal] ?? 300); return { cubado: Math.round(cubado * 10) / 10, taxavel: Math.round(Math.max(pesoReal, cubado) * 10) / 10 }; }

const quantil = (xs: number[], q: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), p = (s.length - 1) * q, b = Math.floor(p); return s[b] + (s[Math.min(b + 1, s.length - 1)] - s[b]) * (p - b); };
/** Referência do histórico real (envios com peso): R$/kg por quantis e custo médio por envio. */
export function referenciaHistorica(envios: { data: string; kg: number | null; total: number }[]) {
  const comKg = envios.filter((e) => (e.kg ?? 0) > 0 && e.total > 0), porKg = comKg.map((e) => e.total / e.kg!);
  return { n: envios.length, nComKg: comKg.length, rkgMediana: quantil(porKg, 0.5), rkgP25: quantil(porKg, 0.25), rkgP75: quantil(porKg, 0.75), custoMedioEnvio: envios.length ? envios.reduce((s, e) => s + e.total, 0) / envios.length : null };
}

export type ParamsCalc = { pesoReal: number; volumes: Volume[]; modal: string; valorNF: number; tarifaKg: number; minimo: number; adValoremPct: number; grisPct: number; pedagio: number; coletaEntrega: number; termica: number; icmsPct: number; tolerancia: number };
export function calcularCustoAlvo(p: ParamsCalc) {
  const m3 = cubagemM3(p.volumes), { cubado, taxavel } = pesoTaxavel(p.pesoReal, m3, p.modal);
  const fretePeso = Math.max(taxavel * p.tarifaKg, p.minimo);
  const adValorem = p.valorNF * p.adValoremPct / 100, gris = p.valorNF * p.grisPct / 100;
  const base = fretePeso + adValorem + gris + p.pedagio + p.coletaEntrega + p.termica;
  const total = p.icmsPct > 0 ? base / (1 - p.icmsPct / 100) : base; // ICMS "por dentro"
  const r = (v: number) => Math.round(v * 100) / 100;
  return { m3, cubado, taxavel, componentes: [
    { nome: "Frete peso (peso taxável × tarifa)", valor: r(fretePeso) }, { nome: "Ad valorem (seguro)", valor: r(adValorem) }, { nome: "GRIS", valor: r(gris) },
    { nome: "Pedágio", valor: r(p.pedagio) }, { nome: "Coleta / entrega", valor: r(p.coletaEntrega) }, { nome: "Proteção térmica (isopor + gelox)", valor: r(p.termica) },
    ...(p.icmsPct > 0 ? [{ nome: `ICMS (${p.icmsPct}% por dentro)`, valor: r(total - base) }] : []),
  ], alvo: r(total), teto: r(total * (1 + p.tolerancia / 100)), piso: r(total * (1 - p.tolerancia / 100)), rkgAlvo: taxavel ? r(total / taxavel) : null, pctNF: p.valorNF ? Math.round((total / p.valorNF) * 1000) / 10 : null };
}

export type CotacaoAval = { id: string; prestador: string; modal: string; total: number; prazo: number | null };
/** Avalia cada cotação contra o custo-alvo: desvio, R$/kg, % do pedido e nota (custo 60 · prazo 25 · térmica 15). */
export function avaliarCotacoes(cots: CotacaoAval[], alvo: number, teto: number, taxavel: number, valorNF: number, prazoLimite: number | null, exigeTermica: boolean) {
  const menorPrazo = Math.min(...cots.map((c) => c.prazo ?? 99));
  const out = cots.map((c) => {
    const desvio = alvo ? ((c.total - alvo) / alvo) * 100 : 0;
    const notaCusto = Math.max(0, Math.min(100, 100 - Math.max(0, desvio) * 2 + Math.max(0, -desvio) * 0.5));
    const notaPrazo = c.prazo == null ? 50 : prazoLimite != null && c.prazo > prazoLimite ? 0 : Math.max(0, 100 - (c.prazo - menorPrazo) * 15);
    const notaTermica = !exigeTermica ? 100 : c.modal === "aereo" || c.modal === "aplicativo" || c.modal === "veiculo_proprio" ? 85 : 55; // trânsito curto protege melhor sem refrigeração
    const nota = Math.round(notaCusto * 0.6 + notaPrazo * 0.25 + notaTermica * 0.15);
    return { ...c, desvio: Math.round(desvio * 10) / 10, rkg: taxavel ? Math.round((c.total / taxavel) * 100) / 100 : null, pctNF: valorNF ? Math.round((c.total / valorNF) * 1000) / 10 : null, dentroTeto: c.total <= teto, atendePrazo: prazoLimite == null || c.prazo == null || c.prazo <= prazoLimite, nota };
  });
  const recomendada = [...out].filter((c) => c.atendePrazo).sort((a, b) => b.nota - a.nota)[0] ?? null;
  return { cotacoes: out.sort((a, b) => a.total - b.total), recomendada };
}
