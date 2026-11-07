// PCP do CD: plano mestre de produção (MPS) por semana, MRP de matéria-prima por semana (plano de compras)
// e recomendações de decisão. Funções puras, alimentadas pelo motor de reabastecimento do CD
// (abastecimento-cd-motor) e pela ficha técnica (pcp-bom).
import { explodirSimulacao, type BomLinha } from "./pcp-bom";
import { semanaDeProducao } from "./abastecimento-cd-motor";

export type OrdemMps = { sku: string; descricao: string; quantidade: number; liberar: string; urgente?: boolean };

const DIA = 86400000;
const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const somaDias = (iso: string, n: number) => new Date(ms(iso) + n * DIA).toISOString().slice(0, 10);
/** Segunda-feira da semana que contém o dia. */
export const segundaDe = (iso: string) => { const d = new Date(ms(iso)); return new Date(ms(iso) - ((d.getUTCDay() + 6) % 7) * DIA).toISOString().slice(0, 10); };

/** Próximas n semanas (segundas-feiras) a partir da semana de `inicio`. */
export function proximasSemanas(inicio: string, n: number): string[] {
  const s0 = segundaDe(inicio);
  return Array.from({ length: n }, (_, i) => somaDias(s0, 7 * i));
}

/** Plano mestre: quantidade por SKU e semana de produção, com totais por semana. */
export function matrizMps(ordens: OrdemMps[], semanas: string[]) {
  const idx = new Map(semanas.map((s, i) => [s, i]));
  const ultima = semanas[semanas.length - 1];
  const linhas = new Map<string, { sku: string; descricao: string; porSemana: number[]; depois: number; total: number; urgente: boolean }>();
  const totais = new Array(semanas.length).fill(0); let depois = 0;
  for (const o of ordens) {
    const s = semanaDeProducao(o.liberar);
    const l = linhas.get(o.sku) ?? { sku: o.sku, descricao: o.descricao, porSemana: new Array(semanas.length).fill(0), depois: 0, total: 0, urgente: false };
    // ordem atrasada (semana anterior à primeira) entra na primeira semana: precisa ser produzida já
    const i = s < semanas[0] ? 0 : idx.get(s);
    if (i === undefined) { if (s > ultima) { l.depois += o.quantidade; depois += o.quantidade; } }
    else { l.porSemana[i] += o.quantidade; totais[i] += o.quantidade; }
    l.total += o.quantidade; l.urgente = l.urgente || !!o.urgente;
    linhas.set(o.sku, l);
  }
  const lista = [...linhas.values()].sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.porSemana[0] - a.porSemana[0] || b.total - a.total);
  return { linhas: lista, totais, depois };
}

export type ItemCompra = {
  id: string; item: string; um: string; custo: number; saldoInicial: number;
  necessidade: number; falta: number; valorFalta: number;
  porSemana: Record<string, { necessidade: number; falta: number }>;
  primeiraFalta: string | null; comprarAte: string | null; atrasado: boolean; usadoEm: string[];
};

/**
 * MRP de matéria-prima por semana: explode as ordens de cada semana na ficha técnica, em ordem cronológica,
 * consumindo o saldo (Fábrica + Processo + Qualidade) semana a semana. Subconjuntos com saldo são netados antes de
 * descer para os componentes. Falta = necessidade que o saldo projetado não cobre. Comprar até = semana da primeira
 * falta − lead time de compra.
 */
export function mrpPorSemana(ordens: OrdemMps[], bom: BomLinha[], saldos: Record<string, number>, custos: Record<string, number>, opts: { leadCompraDias: number; hoje: string }) {
  const porSemana = new Map<string, Map<string, { nome: string; q: number }>>();
  for (const o of ordens) {
    const s = semanaDeProducao(o.liberar);
    const m = porSemana.get(s) ?? new Map(); const a = m.get(o.sku) ?? { nome: o.descricao || o.sku, q: 0 }; a.q += o.quantidade; m.set(o.sku, a); porSemana.set(s, m);
  }
  const semanas = [...porSemana.keys()].sort();
  const saldo: Record<string, number> = { ...saldos };
  const itens = new Map<string, ItemCompra>();
  const semBom = new Set<string>();
  for (const s of semanas) {
    const linhas = [...porSemana.get(s)!].map(([sku, a]) => ({ id_produto: sku, nome: a.nome, quantidade: a.q, local: false }));
    const res = explodirSimulacao(linhas, bom, saldo);
    const comBom = new Set<string>();
    const mp = new Map<string, { item: string; um: string; nec: number; usados: Set<string> }>();
    for (const r of res) {
      for (const c of r.contribs) comBom.add(c.id_produto);
      if (r.tipo === "Subconjunto") { const disp = Math.max(0, saldo[r.id_item] ?? 0); saldo[r.id_item] = disp - Math.min(disp, r.necessidade); continue; }
      const a = mp.get(r.id_item) ?? { item: r.item ?? r.id_item, um: r.um ?? "", nec: 0, usados: new Set<string>() };
      a.nec += r.necessidade; for (const c of r.contribs) a.usados.add(c.id_produto); mp.set(r.id_item, a);
    }
    for (const l of linhas) if (!comBom.has(l.id_produto)) semBom.add(l.id_produto);
    for (const [id, a] of mp) {
      const it = itens.get(id) ?? { id, item: a.item, um: a.um, custo: custos[id] ?? 0, saldoInicial: saldos[id] ?? 0, necessidade: 0, falta: 0, valorFalta: 0, porSemana: {}, primeiraFalta: null, comprarAte: null, atrasado: false, usadoEm: [] };
      const disp = saldo[id] ?? 0;
      const bruta = a.nec - Math.max(0, disp);
      // faltas irrelevantes (até 0,05 unidade ou até 1% da necessidade: resíduo de arredondamento) não viram compra
      const falta = bruta > 0.05 && bruta > a.nec * 0.01 ? bruta : 0;
      saldo[id] = disp - a.nec;
      it.necessidade += a.nec; it.falta += falta;
      it.porSemana[s] = { necessidade: a.nec, falta };
      if (falta > 0 && !it.primeiraFalta) it.primeiraFalta = s;
      it.usadoEm = [...new Set([...it.usadoEm, ...a.usados])];
      itens.set(id, it);
    }
  }
  for (const it of itens.values()) {
    it.valorFalta = it.falta * it.custo;
    if (it.primeiraFalta) { it.comprarAte = somaDias(it.primeiraFalta, -Math.max(0, opts.leadCompraDias)); it.atrasado = it.comprarAte < opts.hoje; }
  }
  const lista = [...itens.values()].sort((a, b) => Number(b.falta > 0) - Number(a.falta > 0) || (a.comprarAte ?? "9999").localeCompare(b.comprarAte ?? "9999") || b.valorFalta - a.valorFalta);
  return { itens: lista, semanas, semBom: [...semBom] };
}

export type Acao = { prioridade: "alta" | "media" | "baixa"; area: "Produção" | "Compras" | "Capacidade" | "Estoque" | "Demanda"; titulo: string; detalhe: string };

/** Recomendações de decisão a partir do plano: o que liberar, comprar, antecipar ou frear. */
export function acoesRecomendadas(p: {
  ordensHoje: { sku: string; descricao: string; quantidade: number }[];
  carga: { semana: string; unidades: number; pct: number | null }[];
  capacidade: number;
  compras: ItemCompra[];
  perdaValidade: { sku: string; descricao: string; un: number }[];
  semRegistro: number;
  realizacao: number | null;
  semBom: number;
}): Acao[] {
  const out: Acao[] = [];
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const n0 = (v: number) => (Math.abs(v) < 10 ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : Math.round(v).toLocaleString("pt-BR"));
  if (p.ordensHoje.length) {
    const un = p.ordensHoje.reduce((a, o) => a + o.quantidade, 0);
    out.push({ prioridade: "alta", area: "Produção", titulo: `Liberar hoje ${p.ordensHoje.length} ordem(ns) de produção (${n0(un)} un)`, detalhe: p.ordensHoje.slice(0, 4).map((o) => `${o.descricao || o.sku} (${n0(o.quantidade)})`).join(", ") + (p.ordensHoje.length > 4 ? "…" : "") + ". Sem liberar agora, o item chega ao CD depois da ruptura prevista." });
  }
  const atrasadas = p.compras.filter((c) => c.falta > 0 && c.atrasado);
  if (atrasadas.length) out.push({ prioridade: "alta", area: "Compras", titulo: `Comprar com urgência ${atrasadas.length} matéria(s)-prima(s): o prazo de compra já passou`, detalhe: atrasadas.slice(0, 4).map((c) => `${c.item} (faltam ${n0(c.falta)} ${c.um}, necessário na semana de ${dm(c.primeiraFalta!)})`).join("; ") + ". Negociar entrega expressa ou reprogramar as ordens que dependem delas." });
  const proximas = p.compras.filter((c) => c.falta > 0 && !c.atrasado);
  if (proximas.length) out.push({ prioridade: "media", area: "Compras", titulo: `Emitir pedido de compra de ${proximas.length} matéria(s)-prima(s) dentro do lead time`, detalhe: proximas.slice(0, 4).map((c) => `${c.item} até ${dm(c.comprarAte!)}`).join("; ") + "." });
  const sobre = p.carga.filter((c) => c.pct !== null && c.pct > 100);
  if (sobre.length) {
    const folga = p.carga.filter((c) => c.pct !== null && c.pct < 80);
    out.push({ prioridade: "alta", area: "Capacidade", titulo: `Sobrecarga em ${sobre.length} semana(s) de produção`, detalhe: sobre.map((c) => `semana de ${dm(c.semana)}: ${n0(c.unidades)} un (${Math.round(c.pct!)}% da capacidade)`).join("; ") + (folga.length ? `. Antecipar parte do volume para ${folga.slice(0, 2).map((c) => `a semana de ${dm(c.semana)} (${Math.round(c.pct!)}%)`).join(" ou ")}, ou planejar hora extra/turno adicional.` : ". Avaliar hora extra/turno adicional ou priorizar os SKUs críticos.") });
  }
  const ocioso = p.carga.filter((c) => c.pct !== null && c.pct < 50);
  if (ocioso.length && p.capacidade > 0) out.push({ prioridade: "baixa", area: "Capacidade", titulo: `Capacidade ociosa em ${ocioso.length} semana(s)`, detalhe: ocioso.map((c) => `semana de ${dm(c.semana)} (${Math.round(c.pct!)}%)`).join(", ") + ": oportunidade para antecipar campanhas, formar estoque de itens sazonais ou manutenção preventiva." });
  if (p.perdaValidade.length) {
    const un = p.perdaValidade.reduce((a, x) => a + x.un, 0);
    out.push({ prioridade: "media", area: "Estoque", titulo: `${n0(un)} un com risco de vencer antes do consumo`, detalhe: p.perdaValidade.slice(0, 4).map((x) => `${x.descricao || x.sku} (${n0(x.un)})`).join(", ") + ". Segurar novas ordens desses SKUs e acionar ação comercial (giro/promoção)." });
  }
  if (p.realizacao !== null && (p.realizacao < 0.85 || p.realizacao > 1.15)) out.push({ prioridade: "media", area: "Demanda", titulo: `Venda real ${p.realizacao > 1 ? "acima" : "abaixo"} do consenso: ${Math.round(p.realizacao * 100)}% da meta`, detalhe: p.realizacao > 1 ? "O motor já corrige a demanda pela realização, mas o consenso subestima a venda: alinhar revisão da meta com comercial para não faltar capacidade e insumos." : "O consenso está otimista: revisar a meta com comercial para não produzir e comprar além do necessário." });
  if (p.semBom) out.push({ prioridade: "baixa", area: "Produção", titulo: `${p.semBom} SKU(s) do plano sem ficha técnica`, detalhe: "Sem ficha técnica a necessidade de matéria-prima desses itens não entra no plano de compras. Cadastrar em Produção › Auditoria de Ficha Técnica." });
  if (p.semRegistro) out.push({ prioridade: "baixa", area: "Estoque", titulo: `${p.semRegistro} SKU(s) com meta e sem registro de estoque`, detalhe: "Itens novos ou sem saldo no sistema: confirmar se o portfólio está correto e se o cadastro no ERP existe." });
  const ordem = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}
