// Disponibilidade acumulada do mês a partir da foto diária (estoque no fechamento) por loja e SKU.
//   disponibilidade = 1 − (dias-SKU com estoque 0) ÷ (dias-SKU do universo); meta mensal: ≥ 97% (ruptura ≤ 3%).
export const META_DISPONIBILIDADE = 0.97;

export type FotoLinha = {
  data: string; loja: string; id_produto: string; descricao: string | null; familia: string | null; classe: string | null;
  estoque: number; exposicao: number | null; demanda_dia: number | null; vendas_dia: number | null;
  em_ruptura: boolean; abaixo_exposicao: boolean; saldo_cd: number | null; a_caminho: number | null; causa: string | null;
  preco: number | null; venda_perdida_un: number | null; venda_perdida_rs: number | null;
};
export type DiaSerie = { data: string; skuDias: number; rupturas: number; disp: number; acumulada: number };
export type Grupo = { chave: string; skuDias: number; rupturas: number; disp: number; perdaRs: number };
export type Resumo = {
  mes: string; diasNoMes: number; diasColetados: number; skuDias: number; rupturaDias: number;
  disponibilidade: number | null; ponderada: number | null; vitrine: number | null;
  universoMedio: number; orcamento: number; consumidoPct: number | null; projecaoRupturaDias: number | null; projecaoDisp: number | null; dentroDaMeta: boolean | null;
  vendaPerdidaRs: number; vendaPerdidaUn: number; semPrecoDias: number;
  serie: DiaSerie[]; porLoja: Grupo[]; porClasse: Grupo[]; porFamilia: Grupo[];
  porCausa: { causa: string; dias: number; pct: number }[];
  topSkus: { loja: string; id_produto: string; descricao: string; dias: number; causa: string; perdaRs: number }[];
  ultimaFoto: { data: string | null; rupturas: FotoLinha[] };
};

export const diasDoMes = (mes: string): number => { const [a, m] = mes.split("-").map(Number); return new Date(a, m, 0).getDate(); };

function grupar(linhas: FotoLinha[], chaveDe: (l: FotoLinha) => string): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const l of linhas) {
    const k = chaveDe(l); const g = m.get(k) ?? { chave: k, skuDias: 0, rupturas: 0, disp: 1, perdaRs: 0 };
    g.skuDias++; if (l.em_ruptura) g.rupturas++; g.perdaRs += Number(l.venda_perdida_rs) || 0; m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, disp: g.skuDias ? 1 - g.rupturas / g.skuDias : 1 })).sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
}

/** Resume o mês. apenasComDemanda: ignora SKUs sem venda recente (demanda_dia = 0), que costumam ser itens fora de linha. */
export function resumirMes(todas: FotoLinha[], mes: string, apenasComDemanda = false, meta = META_DISPONIBILIDADE): Resumo {
  const noMes = todas.filter((l) => l.data.slice(0, 7) === mes);
  const linhas = apenasComDemanda ? noMes.filter((l) => (Number(l.demanda_dia) || 0) > 0) : noMes;
  const dias = [...new Set(noMes.map((l) => l.data))].sort();
  const nDias = diasDoMes(mes), skuDias = linhas.length, rupt = linhas.filter((l) => l.em_ruptura).length;
  const univ = dias.length ? skuDias / dias.length : 0;
  const orcamento = (1 - meta) * univ * nDias;
  const proj = dias.length ? (rupt / dias.length) * nDias : null;
  const dem = linhas.reduce((a, l) => a + (Number(l.demanda_dia) || 0), 0), demOk = linhas.reduce((a, l) => a + (l.em_ruptura ? 0 : (Number(l.demanda_dia) || 0)), 0);
  let acS = 0, acR = 0;
  const serie: DiaSerie[] = dias.map((d) => {
    const ls = linhas.filter((l) => l.data === d), r = ls.filter((l) => l.em_ruptura).length; acS += ls.length; acR += r;
    return { data: d, skuDias: ls.length, rupturas: r, disp: ls.length ? 1 - r / ls.length : 1, acumulada: acS ? 1 - acR / acS : 1 };
  });
  const porCausaMap = new Map<string, number>(); for (const l of linhas) if (l.em_ruptura) { const c = l.causa ?? "Sem causa"; porCausaMap.set(c, (porCausaMap.get(c) ?? 0) + 1); }
  const porCausa = [...porCausaMap.entries()].map(([causa, d]) => ({ causa, dias: d, pct: rupt ? d / rupt : 0 })).sort((a, b) => b.dias - a.dias);
  const sk = new Map<string, { loja: string; id_produto: string; descricao: string; dias: number; causas: Map<string, number>; perdaRs: number }>();
  for (const l of linhas) if (l.em_ruptura) {
    const k = `${l.loja}|${l.id_produto}`; const o = sk.get(k) ?? { loja: l.loja, id_produto: l.id_produto, descricao: l.descricao ?? "", dias: 0, causas: new Map(), perdaRs: 0 };
    o.dias++; o.perdaRs += Number(l.venda_perdida_rs) || 0; const c = l.causa ?? "Sem causa"; o.causas.set(c, (o.causas.get(c) ?? 0) + 1); sk.set(k, o);
  }
  const topSkus = [...sk.values()].map((o) => ({ loja: o.loja, id_produto: o.id_produto, descricao: o.descricao, dias: o.dias, causa: [...o.causas.entries()].sort((a, b) => b[1] - a[1])[0][0], perdaRs: o.perdaRs })).sort((a, b) => b.dias - a.dias || b.perdaRs - a.perdaRs).slice(0, 15);
  const ultima = dias.length ? dias[dias.length - 1] : null;
  return {
    mes, diasNoMes: nDias, diasColetados: dias.length, skuDias, rupturaDias: rupt,
    disponibilidade: skuDias ? 1 - rupt / skuDias : null, ponderada: dem > 0 ? demOk / dem : null,
    vitrine: skuDias ? 1 - linhas.filter((l) => l.abaixo_exposicao).length / skuDias : null,
    universoMedio: univ, orcamento, consumidoPct: orcamento > 0 ? rupt / orcamento : null, projecaoRupturaDias: proj,
    projecaoDisp: proj !== null && univ > 0 ? 1 - proj / (univ * nDias) : null, dentroDaMeta: proj !== null && orcamento > 0 ? proj <= orcamento : null,
    vendaPerdidaRs: linhas.reduce((a, l) => a + (Number(l.venda_perdida_rs) || 0), 0), vendaPerdidaUn: linhas.reduce((a, l) => a + (Number(l.venda_perdida_un) || 0), 0),
    semPrecoDias: linhas.filter((l) => l.em_ruptura && !(Number(l.preco) > 0)).length,
    serie, porLoja: grupar(linhas, (l) => l.loja), porClasse: grupar(linhas, (l) => l.classe ?? "(sem classe)"), porFamilia: grupar(linhas, (l) => l.familia ?? "(sem família)").sort((a, b) => b.rupturas - a.rupturas),
    porCausa, topSkus,
    ultimaFoto: { data: ultima, rupturas: ultima ? linhas.filter((l) => l.data === ultima && l.em_ruptura).sort((a, b) => (Number(b.demanda_dia) || 0) - (Number(a.demanda_dia) || 0)) : [] },
  };
}
