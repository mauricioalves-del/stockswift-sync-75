// Ficha do item no PCP: história de consumo (mapa de calor), cobertura por lote e prazo de entrega pela capacidade.
// Funções puras usadas pela tela PCP · Projeção do CD (decisões recomendadas e plano mestre).

const DIA = 86400000;
const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDias = (d: string, n: number) => iso(ms(d) + n * DIA);
export const difDias = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DIA);

export type Ponto = { data: string; qtd: number };

/** Grade do mapa de calor: semanas (colunas, segunda a domingo) × dias, dos últimos `dias` até `fim`. */
export function mapaCalor(pontos: Ponto[], fim: string, dias = 91) {
  const porDia = new Map<string, number>();
  for (const p of pontos) { const d = String(p.data).slice(0, 10); porDia.set(d, (porDia.get(d) ?? 0) + Math.abs(Number(p.qtd) || 0)); }
  const inicio = addDias(fim, -(dias - 1));
  const seg = addDias(inicio, -((new Date(ms(inicio)).getUTCDay() + 6) % 7));
  const semanas: { inicio: string; dias: { data: string; qtd: number; fora: boolean }[] }[] = [];
  for (let s = seg; s <= fim; s = addDias(s, 7)) {
    semanas.push({ inicio: s, dias: Array.from({ length: 7 }, (_, i) => { const d = addDias(s, i); return { data: d, qtd: porDia.get(d) ?? 0, fora: d < inicio || d > fim }; }) });
  }
  const valores = semanas.flatMap((w) => w.dias.filter((d) => !d.fora && d.qtd > 0).map((d) => d.qtd)).sort((a, b) => a - b);
  const q = (p: number) => (valores.length ? valores[Math.min(valores.length - 1, Math.floor(p * valores.length))] : 0);
  return { semanas, limites: [q(0.25), q(0.5), q(0.75), q(0.9)], max: valores[valores.length - 1] ?? 0 };
}
/** Nível de intensidade (0 = sem movimento … 4 = acima do percentil 90). */
export const nivel = (qtd: number, limites: number[]) => (qtd <= 0 ? 0 : qtd <= limites[0] ? 1 : qtd <= limites[1] ? 2 : qtd <= limites[2] ? 3 : 4);

/** Resumo do consumo de 90 dias: total, média diária, tendência do último mês e dias sem movimento. */
export function resumoConsumo(pontos: Ponto[], fim: string, dias = 91) {
  const inicio = addDias(fim, -(dias - 1)), corte30 = addDias(fim, -29);
  let total = 0, ult30 = 0; const ativos = new Set<string>(); const porMes = new Map<string, number>();
  let pico = { data: "", qtd: 0 }; const porDia = new Map<string, number>();
  for (const p of pontos) {
    const d = String(p.data).slice(0, 10); if (d < inicio || d > fim) continue;
    const q = Math.abs(Number(p.qtd) || 0); total += q; if (d >= corte30) ult30 += q;
    if (q > 0) ativos.add(d); porMes.set(d.slice(0, 7), (porMes.get(d.slice(0, 7)) ?? 0) + q); porDia.set(d, (porDia.get(d) ?? 0) + q);
  }
  for (const [d, q] of porDia) if (q > pico.qtd) pico = { data: d, qtd: q };
  const media = total / dias, media30 = ult30 / 30;
  const tendencia = media > 0 ? media30 / media - 1 : null;
  return { total, media, media30, tendencia, diasComMovimento: ativos.size, diasSemMovimento: dias - ativos.size, pico, porMes: [...porMes].sort(([a], [b]) => a.localeCompare(b)) };
}

export type Lote = { lote: string | null; validade: string | null; qtd: number; almox?: string };
/**
 * Cobertura por lote (FEFO): cada lote é consumido depois dos que vencem antes. Para cada um, dias de cobertura
 * (início e fim, pela demanda diária), dias até vencer e quanto deve vencer antes de ser consumido.
 */
export function coberturaLotes(lotes: Lote[], demandaDia: number, hoje: string) {
  const ord = lotes.filter((l) => l.qtd > 0).sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
  let acum = 0;
  const linhas = ord.map((l) => {
    const ini = demandaDia > 0 ? acum / demandaDia : null;
    acum += l.qtd;
    const fimCob = demandaDia > 0 ? acum / demandaDia : null;
    const vence = l.validade ? difDias(hoje, l.validade.slice(0, 10)) : null;
    let emRisco = 0;
    if (vence !== null) {
      if (vence <= 0) emRisco = l.qtd;
      else if (ini !== null && fimCob !== null && fimCob > vence) emRisco = Math.min(l.qtd, (fimCob - Math.max(ini, vence)) * demandaDia);
      else if (demandaDia <= 0) emRisco = l.qtd;
    }
    return { ...l, diasInicio: ini, diasFim: fimCob, diasAteVencer: vence, emRisco: Math.max(0, emRisco), ateData: fimCob === null ? null : addDias(hoje, Math.floor(fimCob)) };
  });
  const total = acum;
  return { linhas, total, diasCobertura: demandaDia > 0 ? total / demandaDia : null, emRisco: linhas.reduce((a, l) => a + l.emRisco, 0) };
}

/**
 * Prazo estimado para entregar a demanda de um SKU com a capacidade livre: a cada semana usa a capacidade que sobra
 * depois das demais ordens do plano; a entrega no CD = fim da semana em que a quantidade fecha + qualidade + processo.
 */
export function prazoEntrega(p: { semanas: string[]; cargaOutros: number[]; capacidade: number; quantidade: number; diasQualidade: number; diasProcesso: number; hoje: string }) {
  if (p.quantidade <= 0) return { semana: null as string | null, entrega: null as string | null, dias: 0, porSemana: [] as number[] };
  let falta = p.quantidade; const porSemana: number[] = [];
  for (let i = 0; i < p.semanas.length; i++) {
    const livre = Math.max(0, p.capacidade - (p.cargaOutros[i] ?? 0));
    const usa = Math.min(livre, falta); porSemana.push(usa); falta -= usa;
    if (falta <= 1e-9) {
      const fimSemana = addDias(p.semanas[i], 4); // sexta-feira
      const entrega = addDias(fimSemana, p.diasQualidade + p.diasProcesso);
      return { semana: p.semanas[i], entrega, dias: Math.max(0, difDias(p.hoje, entrega)), porSemana };
    }
  }
  return { semana: null, entrega: null, dias: null as number | null, porSemana };
}

export type LinhaBom = { id_produto: string; id_subconjunto: string; id_item: string; item: string | null; qtd: number | null; tem_filho: boolean; item_unidade?: string | null };
export type ComponenteFicha = { id: string; item: string; tipo: "Subconjunto" | "Matéria-Prima"; um: string; nivel: number; pai: string; porUn: number };
/**
 * Ficha técnica de um produto, em todos os níveis, por unidade produzida. Usa só a árvore achatada do próprio produto
 * (linhas com id_produto = produto), percorrida pelo pai real (id_subconjunto), com proteção contra ciclos.
 */
export function fichaPorUnidade(bom: LinhaBom[], produto: string, maxLinhas = 500): ComponenteFicha[] {
  const k0 = (s: string) => String(s ?? "").trim().replace(/^0+/, "");
  const alvo = k0(produto);
  const linhas = bom.filter((r) => k0(r.id_produto) === alvo);
  const filhos = new Map<string, LinhaBom[]>();
  for (const r of linhas) { const p = k0(r.id_subconjunto); filhos.set(p, [...(filhos.get(p) ?? []), r]); }
  const out: ComponenteFicha[] = [];
  const visita = (pai: string, fator: number, nivel: number, caminho: Set<string>) => {
    for (const f of (filhos.get(pai) ?? []).slice().sort((a, b) => Number(b.tem_filho) - Number(a.tem_filho) || String(a.item ?? "").localeCompare(String(b.item ?? "")))) {
      if (out.length >= maxLinhas) return;
      const id = k0(f.id_item), q = (Number(f.qtd) || 0) * fator;
      if (q <= 0 || caminho.has(id)) continue;
      out.push({ id: f.id_item, item: f.item ?? f.id_item, tipo: f.tem_filho ? "Subconjunto" : "Matéria-Prima", um: f.item_unidade ?? "", nivel, pai: f.id_subconjunto, porUn: q });
      if (f.tem_filho && nivel < 12) visita(id, q, nivel + 1, new Set([...caminho, id]));
    }
  };
  visita(alvo, 1, 1, new Set([alvo]));
  return out;
}
