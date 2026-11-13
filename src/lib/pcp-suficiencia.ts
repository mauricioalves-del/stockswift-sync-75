// PCP · suficiência de estoque para produção.
// Para o plano mestre (só SKUs Linha/MTO), explode a ficha técnica em Produto em Processo (PP, subconjunto do 1º nível)
// e matéria-prima. O saldo de PP é consumido semana a semana; quando falta PP, sugere a OP do PP com antecedência
// (para não haver correria) e verifica se há matéria-prima para produzi-lo. Inclui a leitura da estrutura aplicada nas
// últimas OPs apontadas (consumo real por unidade × ficha técnica).
import { fichaPorUnidade, type LinhaBom } from "./pcp-ficha";

const k0 = (s: unknown) => String(s ?? "").trim().replace(/^0+/, "");
const DIA = 86400000;
const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * DIA).toISOString().slice(0, 10);

export type LinhaMpsSku = { sku: string; descricao: string; porSemana: number[] };
export type LinhaSuf = {
  id: string; item: string; um: string; tipo: "PP" | "MP"; saldo: number; necessidade: number[]; total: number; falta: number;
  semanaFalta: number | null; coberturaSemanas: number | null; usadoEm: string[];
  sugestao: { quantidade: number; semana: string; liberarAte: string; atrasada: boolean } | null;
  mpFaltantes: { id: string; item: string; falta: number; um: string }[];
};

export function suficienciaProducao(mps: LinhaMpsSku[], semanas: string[], bom: LinhaBom[], saldos: Record<string, number>, o: { prazoPPDias: number; hoje: string }) {
  const saldoDe = (id: string) => { const k = k0(id); let t = 0; for (const [s, v] of Object.entries(saldos)) if (k0(s) === k) t += Number(v) || 0; return t; };
  const pp = new Map<string, { id: string; item: string; um: string; nec: number[]; usadoEm: Set<string>; filhos: Map<string, { id: string; item: string; um: string; porUnPP: number }> }>();
  const mp = new Map<string, { id: string; item: string; um: string; nec: number[]; usadoEm: Set<string> }>();
  const semFicha: string[] = [];
  for (const l of mps) {
    if (!l.porSemana.some((q) => q > 0)) continue;
    const ficha = fichaPorUnidade(bom, l.sku);
    if (!ficha.length) { semFicha.push(l.sku); continue; }
    for (const c of ficha.filter((x) => x.nivel === 1)) {
      const alvo = c.tipo === "Subconjunto" ? pp : mp;
      const e: any = alvo.get(k0(c.id)) ?? { id: c.id, item: c.item, um: c.um, nec: semanas.map(() => 0), usadoEm: new Set<string>(), ...(c.tipo === "Subconjunto" ? { filhos: new Map() } : {}) };
      l.porSemana.forEach((q, i) => { e.nec[i] += q * c.porUn; });
      e.usadoEm.add(l.descricao || l.sku);
      if (c.tipo === "Subconjunto") for (const f of ficha.filter((x) => x.nivel === 2 && k0(x.pai) === k0(c.id))) e.filhos.set(k0(f.id), { id: f.id, item: f.item, um: f.um, porUnPP: c.porUn ? f.porUn / c.porUn : 0 });
      alvo.set(k0(c.id), e);
    }
  }
  // consome o saldo semana a semana
  const consumir = (nec: number[], saldo: number) => { let s = saldo, falta = 0, semFalta: number | null = null; const faltaSem = nec.map((n, i) => { const f = Math.max(0, n - s); s = Math.max(0, s - n); if (f > 1e-6 && semFalta === null) semFalta = i; falta += f; return f; }); return { falta, semFalta, faltaSem }; };
  // necessidade de MP gerada pelas OPs de PP sugeridas
  const necMpPP = new Map<string, { id: string; item: string; um: string; nec: number[] }>();
  const linhasPP: LinhaSuf[] = [...pp.values()].map((e) => {
    const saldo = saldoDe(e.id), c = consumir(e.nec, saldo);
    let sug: LinhaSuf["sugestao"] = null;
    if (c.falta > 1e-6 && c.semFalta !== null) {
      const lib = menosDias(semanas[c.semFalta], o.prazoPPDias);
      sug = { quantidade: Math.ceil(c.falta * 100) / 100, semana: semanas[c.semFalta], liberarAte: lib, atrasada: lib < o.hoje };
      for (const f of e.filhos.values()) { const x = necMpPP.get(k0(f.id)) ?? { id: f.id, item: f.item, um: f.um, nec: semanas.map(() => 0) }; c.faltaSem.forEach((q, i) => { x.nec[Math.max(0, i)] += q * f.porUnPP; }); necMpPP.set(k0(f.id), x); }
    }
    return { id: e.id, item: e.item, um: e.um, tipo: "PP", saldo, necessidade: e.nec, total: e.nec.reduce((a, b) => a + b, 0), falta: c.falta, semanaFalta: c.semFalta, coberturaSemanas: c.semFalta, usadoEm: [...e.usadoEm], sugestao: sug, mpFaltantes: [] };
  });
  // MP: direta do produto + a necessária para as OPs de PP; o saldo atende primeiro o que vem antes
  const todosMp = new Map<string, { id: string; item: string; um: string; nec: number[]; usadoEm: Set<string> }>();
  for (const [k, e] of mp) todosMp.set(k, { ...e, nec: [...e.nec] });
  for (const [k, e] of necMpPP) { const t = todosMp.get(k) ?? { id: e.id, item: e.item, um: e.um, nec: semanas.map(() => 0), usadoEm: new Set<string>() }; e.nec.forEach((q, i) => (t.nec[i] += q)); t.usadoEm.add("OP de Produto em Processo"); todosMp.set(k, t); }
  const linhasMP: LinhaSuf[] = [...todosMp.values()].map((e) => { const saldo = saldoDe(e.id), c = consumir(e.nec, saldo); return { id: e.id, item: e.item, um: e.um, tipo: "MP", saldo, necessidade: e.nec, total: e.nec.reduce((a, b) => a + b, 0), falta: c.falta, semanaFalta: c.semFalta, coberturaSemanas: c.semFalta, usadoEm: [...e.usadoEm], sugestao: null, mpFaltantes: [] }; });
  const faltaMp = new Map(linhasMP.filter((m) => m.falta > 1e-6).map((m) => [k0(m.id), m]));
  for (const l of linhasPP) if (l.sugestao) l.mpFaltantes = [...(pp.get(k0(l.id))?.filhos.values() ?? [])].filter((f) => faltaMp.has(k0(f.id))).map((f) => ({ id: f.id, item: f.item, um: f.um, falta: faltaMp.get(k0(f.id))!.falta }));
  linhasPP.sort((a, b) => (a.semanaFalta ?? 99) - (b.semanaFalta ?? 99) || b.falta - a.falta);
  linhasMP.sort((a, b) => (a.semanaFalta ?? 99) - (b.semanaFalta ?? 99) || b.falta - a.falta);
  return {
    pp: linhasPP, mp: linhasMP, semFicha,
    resumo: { pp: linhasPP.length, ppCobertos: linhasPP.filter((l) => !l.falta).length, opsPP: linhasPP.filter((l) => l.sugestao).length, opsAtrasadas: linhasPP.filter((l) => l.sugestao?.atrasada).length, mpFaltando: linhasMP.filter((l) => l.falta > 1e-6).length, ppSemMp: linhasPP.filter((l) => l.mpFaltantes.length).length },
  };
}

export type ConsumoOp = { id_op: string; data_producao: string; produto: string; desc_produto?: string | null; material: string; desc_material?: string | null; qtd_consumo: number; qtd_produzida: number | null; um?: string | null };
/** Estrutura aplicada nas últimas OPs (até `nOps` por produto): consumo real por unidade produzida × ficha técnica. */
export function estruturaAplicada(consumos: ConsumoOp[], bom: LinhaBom[], skus: string[], nOps = 3, tolerancia = 10) {
  const alvo = new Set(skus.map(k0)), out: { produto: string; descricao: string; ops: string[]; linhas: { id: string; item: string; ficha: number | null; real: number | null; desvio: number | null; leitura: string }[] }[] = [];
  const porProd = new Map<string, ConsumoOp[]>();
  for (const c of consumos) if (alvo.has(k0(c.produto))) porProd.set(k0(c.produto), [...(porProd.get(k0(c.produto)) ?? []), c]);
  for (const [k, l] of porProd) {
    const ops = [...new Set([...l].sort((a, b) => String(b.data_producao).localeCompare(String(a.data_producao))).map((c) => c.id_op))].slice(0, nOps);
    const sel = l.filter((c) => ops.includes(c.id_op));
    const produzida = ops.reduce((t, op) => t + Math.max(...sel.filter((c) => c.id_op === op).map((c) => Number(c.qtd_produzida) || 0), 0), 0);
    if (!produzida) continue;
    const real = new Map<string, { item: string; q: number }>();
    for (const c of sel) { const e = real.get(k0(c.material)) ?? { item: c.desc_material || c.material, q: 0 }; e.q += Number(c.qtd_consumo) || 0; real.set(k0(c.material), e); }
    const ficha = new Map(fichaPorUnidade(bom, k).filter((x) => x.tipo === "Matéria-Prima" || x.nivel === 1).map((x) => [k0(x.id), x]));
    const linhas: { id: string; item: string; ficha: number | null; real: number | null; desvio: number | null; leitura: string }[] = [];
    for (const [m, r] of real) { const f = ficha.get(m), ru = r.q / produzida; const dv = f && f.porUn ? ((ru - f.porUn) / f.porUn) * 100 : null;
      if (!f) linhas.push({ id: m, item: r.item, ficha: null, real: ru, desvio: null, leitura: "Consumido sem estar na ficha: incluir ou corrigir o apontamento" });
      else if (dv !== null && Math.abs(dv) > tolerancia) linhas.push({ id: m, item: r.item, ficha: f.porUn, real: ru, desvio: dv, leitura: dv > 0 ? "Consome acima da ficha: revisar quantidade ou perda de processo" : "Consome abaixo da ficha: revisar quantidade da ficha" }); }
    for (const [m, f] of ficha) if (!real.has(m) && f.nivel === 1) linhas.push({ id: f.id, item: f.item, ficha: f.porUn, real: 0, desvio: -100, leitura: f.tipo === "Subconjunto" ? "PP da ficha não apontado nas OPs: produzido junto ou estrutura diferente" : "Na ficha e não apontado: material substituído ou apontamento faltando" });
    out.push({ produto: l[0].produto, descricao: l[0].desc_produto || l[0].produto, ops, linhas });
  }
  return out.sort((a, b) => b.linhas.length - a.linhas.length);
}
