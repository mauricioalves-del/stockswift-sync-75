// Indicador de Produção: volume produzido por mês e por dia, mix Produto Acabado (un) × Produto em Processo e
// subconjuntos (kg), top 10, MoM, capacidade demonstrada, aderência de consumo à ficha (base da Dispersão de Lote)
// e DOI — dias de suficiência do estoque produzido.
export type ConsumoLinha = { id_op: string | number; data_producao: string; produto: string; desc_produto?: string | null; qtd_produzida?: number | null; material?: string | null; qtd_consumo?: number | null; qtd_previsto?: number | null; impacto_rs_congelado?: number | null; um?: string | null; custo_unit_medio_congelado?: number | null };
export type Op = { op: string; data: string; mes: string; produto: string; descricao: string; qtd: number; tipo: "PA" | "PP"; custo: number };
const k0 = (s: unknown) => String(s ?? "").trim().replace(/^0+/, "");
const mesesAte = (mes: string, n: number) => { const out: string[] = []; let [a, m] = mes.split("-").map(Number); for (let i = 0; i < n; i++) { out.unshift(`${a}-${String(m).padStart(2, "0")}`); m--; if (!m) { m = 12; a--; } } return out; };
const diasNoMes = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
const var_ = (a: number, b: number) => (b ? (a - b) / b : null);

/**
 * Uma linha por OP. A quantidade produzida não vem preenchida no consumo, então é deduzida da ficha técnica:
 * para cada material previsto na OP, previsto ÷ quantidade por unidade da ficha (1º nível) = unidades produzidas;
 * a OP recebe a mediana dessas estimativas (robusta a um material com ficha errada). Se não houver ficha, usa a
 * quantidade produzida apontada (quando existir). PA = grupo "Produto Acabado" (un); demais = processo (kg).
 */
export function opsDeConsumo(linhas: ConsumoLinha[], grupoDe: (sku: string) => string | null, porUn: (produto: string, material: string) => number | null = () => null, apontada: Map<string, number> = new Map()): Op[] {
  const m = new Map<string, Op & { est: number[]; kg: number }>();
  for (const l of linhas) {
    // o mesmo número de OP pode existir em empresas diferentes: a chave é OP + produto
    const k = `${l.id_op}|${k0(l.produto)}`; if (!l.data_producao) continue;
    let e = m.get(k);
    if (!e) { const g = (grupoDe(l.produto) ?? "").toLowerCase(); e = { op: String(l.id_op), data: String(l.data_producao).slice(0, 10), mes: String(l.data_producao).slice(0, 7), produto: l.produto, descricao: l.desc_produto || l.produto, qtd: Number(l.qtd_produzida) || 0, tipo: g.includes("acabado") ? "PA" : "PP", custo: 0, est: [], kg: 0 }; m.set(k, e); }
    // custo da produção = consumo real × custo médio congelado do material
    e.custo += (Number(l.qtd_consumo) || 0) * (Number(l.custo_unit_medio_congelado) || 0);
    // balanço de massa: produto em processo (kg) ≈ soma do consumo dos materiais em kg (g convertido)
    const um = String(l.um ?? "").trim().toUpperCase(), cons = Number(l.qtd_consumo) || 0;
    if (um === "KG") e.kg += cons; else if (um === "G" || um === "GR") e.kg += cons / 1000;
    const pu = l.material ? porUn(l.produto, l.material) : null, prev = Number(l.qtd_previsto) || 0;
    if (pu && pu > 0 && prev > 0) e.est.push(prev / pu);
  }
  return [...m.values()].map(({ est, kg, ...o }) => {
    if (o.qtd > 0) return o;
    // processo em kg: a massa que entrou na OP é a medida mais fiel (a ficha do subconjunto mistura bases diferentes)
    if (o.tipo === "PP" && kg > 0) return { ...o, qtd: Math.round(kg * 1000) / 1000 };
    if (est.length) { const s = [...est].sort((a, b) => a - b), md = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return { ...o, qtd: Math.round(md * 1000) / 1000 }; }
    return { ...o, qtd: apontada.get(o.op) ?? 0 };
  }).filter((o) => o.qtd > 0);
}

export type Estoque = { id_produto: string; quantidade: number };
export type Venda = { sku: string; data_movimento: string; quantidade: number };

export function indicadorProducao(ops: Op[], consumo: ConsumoLinha[], mes: string, o: { estoque: Estoque[]; vendas: Venda[]; hoje: string; nMeses?: number }) {
  const meses = mesesAte(mes, o.nMeses ?? 12);
  const doMes = (m: string) => ops.filter((x) => x.mes === m);
  const soma = (l: Op[], t: "PA" | "PP") => l.filter((x) => x.tipo === t).reduce((a, x) => a + x.qtd, 0);
  // capacidade demonstrada: melhor semana de Produto Acabado nos meses analisados
  const porSemana = new Map<string, number>();
  for (const x of ops) if (x.tipo === "PA" && meses.includes(x.mes)) { const d = new Date(`${x.data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const w = d.toISOString().slice(0, 10); porSemana.set(w, (porSemana.get(w) ?? 0) + x.qtd); }
  const capSemana = Math.max(0, ...porSemana.values());
  const aderencia = (m: string) => { const l = consumo.filter((c) => String(c.data_producao ?? "").slice(0, 7) === m && Number(c.qtd_previsto) > 0); return l.length ? l.filter((c) => Math.abs((Number(c.qtd_consumo) - Number(c.qtd_previsto)) / Number(c.qtd_previsto)) <= 0.05).length / l.length : null; };
  const perda = (m: string) => consumo.filter((c) => String(c.data_producao ?? "").slice(0, 7) === m && Number(c.qtd_previsto) > 0 && Number(c.impacto_rs_congelado) > 0).reduce((a, c) => a + Number(c.impacto_rs_congelado), 0);
  const serie0 = meses.map((m) => { const l = doMes(m); return { mes: m, paUn: soma(l, "PA"), ppKg: soma(l, "PP"), ops: l.length, skus: new Set(l.map((x) => k0(x.produto))).size, dias: new Set(l.map((x) => x.data)).size, aderencia: aderencia(m), perda: perda(m) }; });
  // só produção ativa: a série começa no primeiro mês com OP apontada
  const ini = serie0.findIndex((x) => x.ops > 0), serie = ini > 0 ? serie0.slice(ini) : serie0;
  const at = serie.at(-1)!, ant = serie.at(-2);
  const l = doMes(mes);
  const diario = Array.from({ length: diasNoMes(mes) }, (_, i) => { const d = `${mes}-${String(i + 1).padStart(2, "0")}`, x = l.filter((y) => y.data === d); return { dia: i + 1, data: d, paUn: soma(x, "PA"), ppKg: soma(x, "PP"), ops: x.length }; });
  const top = (t: "PA" | "PP") => { const m = new Map<string, { produto: string; descricao: string; qtd: number; ops: number }>(); for (const x of l.filter((y) => y.tipo === t)) { const e = m.get(k0(x.produto)) ?? { produto: x.produto, descricao: x.descricao, qtd: 0, ops: 0 }; e.qtd += x.qtd; e.ops++; m.set(k0(x.produto), e); } const tot = soma(l, t); return [...m.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 10).map((e) => ({ ...e, part: tot ? e.qtd / tot : 0 })); };
  const topPA = top("PA"), topPP = top("PP");
  const semanasMes = diasNoMes(mes) / 7;
  // DOI: estoque atual ÷ demanda média diária (PA: venda das lojas 90 d; PP: consumo em OP 90 d)
  const desde = new Date(Date.parse(`${o.hoje}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const est = new Map<string, number>(); for (const e of o.estoque) est.set(k0(e.id_produto), (est.get(k0(e.id_produto)) ?? 0) + (Number(e.quantidade) || 0));
  const venda = new Map<string, number>(); for (const v of o.vendas) if (String(v.data_movimento).slice(0, 10) >= desde) venda.set(k0(v.sku), (venda.get(k0(v.sku)) ?? 0) + Math.abs(Number(v.quantidade) || 0));
  const consPP = new Map<string, number>(); for (const c of consumo) if (String(c.data_producao ?? "").slice(0, 10) >= desde && c.material) consPP.set(k0(c.material), (consPP.get(k0(c.material)) ?? 0) + (Number(c.qtd_consumo) || 0));
  const produzidos = new Map<string, Op>(); for (const x of ops) if (x.data >= desde) produzidos.set(k0(x.produto), x);
  const doi = [...produzidos.values()].map((x) => { const k = k0(x.produto), s = est.get(k) ?? 0, dem = (x.tipo === "PA" ? venda.get(k) ?? 0 : consPP.get(k) ?? 0) / 90; const d = dem > 0 ? s / dem : null; return { produto: x.produto, descricao: x.descricao, tipo: x.tipo, estoque: s, demandaDia: dem, doi: d, faixa: d === null ? (s > 0 ? "Sem demanda" : "Sem estoque") : d < 7 ? "Crítico (< 7 d)" : d < 15 ? "Atenção (7–15 d)" : d <= 60 ? "Saudável (15–60 d)" : "Excesso (> 60 d)" }; });
  const faixas = ["Crítico (< 7 d)", "Atenção (7–15 d)", "Saudável (15–60 d)", "Excesso (> 60 d)", "Sem demanda", "Sem estoque"].map((f) => ({ faixa: f, pa: doi.filter((x) => x.faixa === f && x.tipo === "PA").length, pp: doi.filter((x) => x.faixa === f && x.tipo === "PP").length }));
  const doiPond = (t: "PA" | "PP") => { const l2 = doi.filter((x) => x.tipo === t && x.demandaDia > 0); const dem = l2.reduce((a, x) => a + x.demandaDia, 0); return dem ? l2.reduce((a, x) => a + x.estoque, 0) / dem : null; };
  const totPA = soma(l, "PA"), totPP = soma(l, "PP"), opsPA = l.filter((x) => x.tipo === "PA").length, opsPP = l.filter((x) => x.tipo === "PP").length;
  return {
    mes, meses, serie, diario, topPA, topPP, doi: doi.sort((a, b) => (a.doi ?? 1e9) - (b.doi ?? 1e9)), faixasDoi: faixas, capSemana,
    kpis: {
      paUn: totPA, ppKg: totPP, ops: l.length, skus: at.skus, dias: at.dias,
      momPA: ant ? var_(at.paUn, ant.paUn) : null, momPP: ant ? var_(at.ppKg, ant.ppKg) : null, momOps: ant ? var_(at.ops, ant.ops) : null,
      lotePA: opsPA ? totPA / opsPA : null, lotePP: opsPP ? totPP / opsPP : null,
      porDiaPA: at.dias ? totPA / at.dias : null,
      utilizacao: capSemana ? totPA / (capSemana * semanasMes) : null,
      aderencia: at.aderencia, aderenciaAnt: ant?.aderencia ?? null, perda: at.perda, perdaPorMilUn: totPA ? (at.perda / totPA) * 1000 : null,
      top10PA: totPA ? topPA.reduce((a, x) => a + x.qtd, 0) / totPA : null,
      doiPA: doiPond("PA"), doiPP: doiPond("PP"), criticos: doi.filter((x) => x.faixa.startsWith("Crítico")).length, excesso: doi.filter((x) => x.faixa.startsWith("Excesso")).length,
    },
  };
}
export type DadosIndicadorProducao = ReturnType<typeof indicadorProducao>;

/** Pareto das produções mais caras (custo de material consumido) por produto, no mês ou no período ativo. */
export function paretoCusto(ops: Op[], tipo: "PA" | "PP", filtro: (o: Op) => boolean, n: number) {
  const m = new Map<string, { produto: string; descricao: string; custo: number; qtd: number; ops: number }>();
  for (const o of ops) { if (o.tipo !== tipo || !filtro(o)) continue; const k = k0(o.produto), e = m.get(k) ?? { produto: o.produto, descricao: o.descricao, custo: 0, qtd: 0, ops: 0 }; e.custo += o.custo; e.qtd += o.qtd; e.ops++; m.set(k, e); }
  const l = [...m.values()].sort((a, b) => b.custo - a.custo), tot = l.reduce((a, x) => a + x.custo, 0);
  let ac = 0;
  return { total: tot, itens: l.slice(0, n).map((x) => { ac += x.custo; return { ...x, custoUn: x.qtd ? x.custo / x.qtd : null, part: tot ? x.custo / tot : 0, acum: tot ? ac / tot : 0 }; }) };
}

export type Disponibilidade = { id_produto: string; familia: string | null; data: string; loja: string; em_ruptura: boolean | null; venda_perdida_rs: number | null };
/**
 * Mais vendidos × produção: top N por venda das lojas (90 dias) na família escolhida, com produção do mesmo período,
 * cobertura (produção ÷ venda), estoque, DOI e rupturas nas lojas (dias-loja, dias distintos, venda perdida).
 */
export function maisVendidos(ops: Op[], vendas: Venda[], disp: Disponibilidade[], estoque: Estoque[], hoje: string, familia: string, n = 10) {
  const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const fam = new Map<string, string>(); for (const d of [...disp].sort((a, b) => a.data.localeCompare(b.data))) if (d.familia) fam.set(k0(d.id_produto), d.familia);
  const famDe = (sku: string) => fam.get(k0(sku)) ?? "Sem família";
  const venda = new Map<string, number>(); for (const v of vendas) if (String(v.data_movimento).slice(0, 10) >= desde) venda.set(k0(v.sku), (venda.get(k0(v.sku)) ?? 0) + Math.abs(Number(v.quantidade) || 0));
  const prod = new Map<string, { qtd: number; ops: number; desc: string }>(); for (const o of ops) if (o.tipo === "PA" && o.data >= desde) { const e = prod.get(k0(o.produto)) ?? { qtd: 0, ops: 0, desc: o.descricao }; e.qtd += o.qtd; e.ops++; prod.set(k0(o.produto), e); }
  const est = new Map<string, number>(); for (const e of estoque) est.set(k0(e.id_produto), (est.get(k0(e.id_produto)) ?? 0) + (Number(e.quantidade) || 0));
  const rup = new Map<string, { diasLoja: number; dias: Set<string>; perda: number; ultimo: string }>();
  for (const d of disp) if (d.em_ruptura) { const k = k0(d.id_produto), e = rup.get(k) ?? { diasLoja: 0, dias: new Set<string>(), perda: 0, ultimo: "" }; e.diasLoja++; e.dias.add(d.data); e.perda += Number(d.venda_perdida_rs) || 0; if (d.data > e.ultimo) e.ultimo = d.data; rup.set(k, e); }
  const desc = new Map<string, string>(); for (const d of disp) if (!desc.has(k0(d.id_produto))) desc.set(k0(d.id_produto), (d as any).descricao ?? "");
  const familias = [...new Set([...fam.values()])].sort((a, b) => (a === "Granéis" ? -1 : b === "Granéis" ? 1 : a.localeCompare(b)));
  const linha = (k: string) => { const v = venda.get(k) ?? 0, p = prod.get(k), r = rup.get(k), s = est.get(k) ?? 0, dia = v / 90; return { sku: k, descricao: p?.desc || desc.get(k) || k, familia: famDe(k), venda: v, vendaDia: dia, producao: p?.qtd ?? 0, ops: p?.ops ?? 0, cobertura: v ? (p?.qtd ?? 0) / v : null, estoque: s, doi: dia ? s / dia : null, diasLoja: r?.diasLoja ?? 0, diasRuptura: r?.dias.size ?? 0, perda: r?.perda ?? 0, ultimaRuptura: r?.ultimo || null }; };
  const candidatos = [...venda.keys()].filter((k) => fam.has(k) && (familia === "Todas" || famDe(k) === familia));
  const top = candidatos.map(linha).sort((a, b) => b.venda - a.venda).slice(0, n);
  const porFamilia = familias.map((f) => { const ks = [...venda.keys()].filter((k) => famDe(k) === f), l = ks.map(linha); const v = l.reduce((a, x) => a + x.venda, 0), pr = l.reduce((a, x) => a + x.producao, 0); return { familia: f, skus: ks.length, venda: v, producao: pr, cobertura: v ? pr / v : null, diasLoja: l.reduce((a, x) => a + x.diasLoja, 0), comRuptura: l.filter((x) => x.diasRuptura > 0).length, perda: l.reduce((a, x) => a + x.perda, 0) }; });
  const inicioRupturas = disp.length ? disp.reduce((a, d) => (d.data < a ? d.data : a), disp[0].data) : null;
  return { top, porFamilia, familias, inicioRupturas, desde };
}
