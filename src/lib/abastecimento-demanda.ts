// Demanda diária (CMD) e acompanhamento de meta — lógica do planejamento de Suprimentos aplicada às lojas.
//
// CMD ponderado por janelas 7/30/90 dias (pesos 0,5/0,3/0,2), só com janelas que tiveram venda, mais o fator de
// tendência (30d ÷ 90d, limitado a 0,75–1,3, só com ≥45 dias de movimento em 90). A referência é a ÚLTIMA data de
// faturamento carregada, para que uma base atrasada não dilua o CMD com dias sem dado.
//
// Denominador:
//   "calendario"     (padrão) = dias da janela. É o que bate com o "Linear Real" do Excel (235/235 SKUs).
//   "dias_com_venda" = comportamento do planejamento de Suprimentos; superestima SKUs de giro lento.
export const JANELAS_PADRAO = [{ dias: 7, peso: 0.5 }, { dias: 30, peso: 0.3 }, { dias: 90, peso: 0.2 }];
export type Denominador = "calendario" | "dias_com_venda";
export type ResultadoCMD = { cmd: number; cmdBase: number; cmd7: number; cmd30: number; cmd90: number; tendencia: number; diasComVenda90: number; semBase: boolean };

const somaDias = (iso: string, n: number): string => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

/** `vendas`: mapa data (AAAA-MM-DD) → unidades do SKU naquela loja. `refIso`: último dia de faturamento. */
export function cmdPonderado(vendas: Map<string, number>, refIso: string, opts: { janelas?: { dias: number; peso: number }[]; denominador?: Denominador; inicioHistorico?: string | null } = {}): ResultadoCMD {
  const janelas = opts.janelas ?? JANELAS_PADRAO;
  const den = opts.denominador ?? "calendario";
  // Loja nova: a janela não pode ser maior que o histórico (senão os dias antes da abertura entram como "zero venda").
  const histDias = opts.inicioHistorico ? Math.max(1, Math.round((Date.UTC(+refIso.slice(0, 4), +refIso.slice(5, 7) - 1, +refIso.slice(8, 10)) - Date.UTC(+opts.inicioHistorico.slice(0, 4), +opts.inicioHistorico.slice(5, 7) - 1, +opts.inicioHistorico.slice(8, 10))) / 86400000) + 1) : Infinity;
  const diasEf = janelas.map((j) => Math.min(j.dias, histDias));
  const cortes = janelas.map((_, i) => somaDias(refIso, -diasEf[i])); // dia > corte  e  dia <= ref
  const total = janelas.map(() => 0), comVenda = janelas.map(() => new Set<string>());
  for (const [dia, q] of vendas) {
    if (q <= 0 || dia > refIso) continue;
    janelas.forEach((_, i) => { if (dia > cortes[i]) { total[i] += q; comVenda[i].add(dia); } });
  }
  const cmdJ = janelas.map((j, i) => {
    const d = den === "calendario" ? diasEf[i] : comVenda[i].size;
    return d > 0 && total[i] > 0 ? total[i] / d : 0;
  });
  let pesoTotal = 0, soma = 0;
  janelas.forEach((j, i) => { if (cmdJ[i] > 0) { pesoTotal += j.peso; soma += cmdJ[i] * j.peso; } });
  const cmdBase = pesoTotal > 0 ? soma / pesoTotal : 0;
  const i30 = janelas.findIndex((j) => j.dias === 30), i90 = janelas.findIndex((j) => j.dias === 90);
  const dias90 = i90 >= 0 ? comVenda[i90].size : 0;
  const c30 = i30 >= 0 ? cmdJ[i30] : 0, c90 = i90 >= 0 ? cmdJ[i90] : 0;
  const tendencia = dias90 >= 45 && c90 > 0 ? Math.min(1.3, Math.max(0.75, c30 / c90)) : 1;
  const idx7 = janelas.findIndex((j) => j.dias === 7);
  return { cmd: cmdBase * tendencia, cmdBase, cmd7: idx7 >= 0 ? cmdJ[idx7] : 0, cmd30: c30, cmd90: c90, tendencia, diasComVenda90: dias90, semBase: cmdBase === 0 };
}

export type AcompMeta = {
  diasMes: number; diaRef: number; diasRestantes: number;
  meta: number; realizado: number; metaDia: number; esperadoAteHoje: number;
  atingimentoParcial: number | null;   // realizado ÷ esperado até a data
  atingimentoMes: number | null;       // realizado ÷ meta do mês
  projecaoMes: number;                 // ritmo atual projetado para o fim do mês
  desvioProjecao: number;              // projeção − meta
  falta: number;                       // quanto falta para a meta
  ritmoNecessario: number | null;      // un/dia necessárias nos dias restantes
  situacao: "sem_meta" | "adiantado" | "no_ritmo" | "atrasado" | "critico";
};

/** Meta mensal × realizado do mês até `refIso` (último dia faturado). */
export function acompanhamentoMeta(metaMes: number, realizadoMes: number, refIso: string): AcompMeta {
  const ano = +refIso.slice(0, 4), mes = +refIso.slice(5, 7);
  const diasMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaRef = Math.min(diasMes, +refIso.slice(8, 10));
  const diasRestantes = diasMes - diaRef;
  const metaDia = metaMes / diasMes;
  const esperado = metaDia * diaRef;
  const projecao = diaRef > 0 ? (realizadoMes / diaRef) * diasMes : 0;
  const falta = Math.max(0, metaMes - realizadoMes);
  const parcial = esperado > 0 ? realizadoMes / esperado : null;
  let situacao: AcompMeta["situacao"] = "sem_meta";
  if (metaMes > 0) situacao = parcial! >= 1.05 ? "adiantado" : parcial! >= 0.9 ? "no_ritmo" : parcial! >= 0.7 ? "atrasado" : "critico";
  return {
    diasMes, diaRef, diasRestantes, meta: metaMes, realizado: realizadoMes, metaDia, esperadoAteHoje: esperado,
    atingimentoParcial: parcial, atingimentoMes: metaMes > 0 ? realizadoMes / metaMes : null,
    projecaoMes: projecao, desvioProjecao: projecao - metaMes, falta,
    ritmoNecessario: diasRestantes > 0 ? falta / diasRestantes : null, situacao,
  };
}
