// Modelo estatístico do Atlas (ml/train.py + ml/predict.py), agora treinado no próprio navegador.
// Mesmo desenho do Atlas: Random Forest com class_weight="balanced", profundidade máxima 12, variáveis almoxarifado e
// categoria (one-hot) + quantidade, valor, dia da semana e os 8 sinais de contexto. Treina com os casos históricos
// categorizados (movimentações com hipótese confirmada) + os casos que a equipe confirmou (atlas_casos_ml_feedback).
// Como roda a cada carregamento, o "Retreinar agora" do Atlas deixa de ser necessário: o modelo sempre usa os casos atuais.
import type { Base, Div } from "./atlas-investigacao";
import { sinaisContexto } from "./atlas-investigacao";

export const SINAIS = ["tem_transferencia_pendente", "tem_pedido_compra_pendente", "tem_op_aberta", "tem_consumo_divergente_bom", "e_item_de_ficha_tecnica", "item_gera_oc", "tem_faturamento_proximo", "tem_faturamento_mesmo_almoxarifado"] as const;

export type Caso = { sku: string; almoxarifado: string; categoria: string | null; data: string | null; qtd: number; valor: number; hipotese: string };
type No = { f: number; t: number; l: No; r: No } | { p: number[] };
export type Modelo = { classes: string[]; almox: string[]; categorias: string[]; arvores: No[]; casos: number; acuraciaHoldout: number | null };

// ---------- vetor de variáveis ----------
const diaSemana = (d: string | null) => { if (!d) return -1; const x = new Date(d.slice(0, 10) + "T12:00:00Z"); const w = x.getUTCDay(); return isNaN(w) ? -1 : (w + 6) % 7; }; // segunda = 0, como no pandas
function vetor(m: Pick<Modelo, "almox" | "categorias">, c: { almoxarifado: string; categoria: string | null; qtd: number; valor: number; data: string | null }, sinais: Record<string, boolean>): number[] {
  const v: number[] = [];
  for (const a of m.almox) v.push((c.almoxarifado || "Desconhecido") === a ? 1 : 0);
  for (const k of m.categorias) v.push((c.categoria || "Desconhecido") === k ? 1 : 0);
  v.push(c.qtd || 0, c.valor || 0, diaSemana(c.data));
  for (const s of SINAIS) v.push(sinais[s] ? 1 : 0);
  return v;
}
const sinaisDe = (base: Base, c: Caso) => sinaisContexto(base, { id: -1, sku: c.sku, almoxarifado: c.almoxarifado, categoria_produto: c.categoria, data_deteccao: c.data ?? "", saldo_sistema: null, divergencia_qtd: c.qtd, valor_estimado: c.valor, status: "Aberta", observacao_origem: null }) as unknown as Record<string, boolean>;

// ---------- floresta ----------
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function arvore(X: number[][], y: number[], w: number[], idx: number[], nClasses: number, maxProf: number, maxFeat: number, rand: () => number): No {
  const folha = (ids: number[]): No => { const p = new Array(nClasses).fill(0); let s = 0; for (const i of ids) { p[y[i]] += w[i]; s += w[i]; } return { p: s ? p.map((x) => x / s) : p }; };
  const gini = (cont: number[], tot: number) => { if (!tot) return 0; let s = 0; for (const c of cont) s += (c / tot) ** 2; return 1 - s; };
  const construir = (ids: number[], prof: number): No => {
    const cont = new Array(nClasses).fill(0); let tot = 0;
    for (const i of ids) { cont[y[i]] += w[i]; tot += w[i]; }
    if (prof >= maxProf || ids.length < 2 || cont.filter((c) => c > 0).length <= 1) return folha(ids);
    const g0 = gini(cont, tot); const nF = X[0].length;
    // sorteia maxFeat variáveis (como o max_features="sqrt" do scikit-learn); tenta todas se nenhuma separar
    const ordem = Array.from({ length: nF }, (_, k) => k);
    for (let k = nF - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [ordem[k], ordem[j]] = [ordem[j], ordem[k]]; }
    let melhor: { f: number; t: number; ganho: number } | null = null;
    for (let fi = 0; fi < nF && (fi < maxFeat || !melhor); fi++) {
      const f = ordem[fi];
      const ord = [...ids].sort((a, b) => X[a][f] - X[b][f]);
      const esq = new Array(nClasses).fill(0); let te = 0;
      for (let k = 0; k < ord.length - 1; k++) {
        const i = ord[k]; esq[y[i]] += w[i]; te += w[i];
        const a = X[i][f], b = X[ord[k + 1]][f];
        if (a === b) continue;
        const dir = cont.map((c, j) => c - esq[j]); const td = tot - te;
        const ganho = g0 - (te / tot) * gini(esq, te) - (td / tot) * gini(dir, td);
        if (!melhor || ganho > melhor.ganho + 1e-12) melhor = { f, t: (a + b) / 2, ganho };
      }
    }
    if (!melhor || melhor.ganho <= 1e-12) return folha(ids);
    const l: number[] = [], r: number[] = [];
    for (const i of ids) (X[i][melhor.f] <= melhor.t ? l : r).push(i);
    return { f: melhor.f, t: melhor.t, l: construir(l, prof + 1), r: construir(r, prof + 1) };
  };
  return construir(idx, 0);
}
function probaArvore(n: No, v: number[]): number[] { let x = n; while (!("p" in x)) x = v[x.f] <= x.t ? x.l : x.r; return x.p; }

function treinarFloresta(X: number[][], y: number[], nClasses: number, nArvores: number, seed: number): No[] {
  const rand = rng(seed);
  // class_weight="balanced": peso = n / (nClasses × casos da classe)
  const cont = new Array(nClasses).fill(0); for (const c of y) cont[c]++;
  const presentes = cont.filter((c) => c > 0).length;
  const pesoClasse = cont.map((c) => (c ? y.length / (presentes * c) : 0));
  const maxFeat = Math.max(1, Math.floor(Math.sqrt(X[0].length)));
  const arvores: No[] = [];
  for (let t = 0; t < nArvores; t++) {
    const mult = new Array(y.length).fill(0);
    for (let k = 0; k < y.length; k++) mult[Math.floor(rand() * y.length)]++;   // bootstrap (amostragem com reposição)
    const idx: number[] = []; const w = new Array(y.length).fill(0);
    for (let i = 0; i < y.length; i++) if (mult[i]) { idx.push(i); w[i] = mult[i] * pesoClasse[y[i]]; }
    arvores.push(arvore(X, y, w, idx, nClasses, 12, maxFeat, rand));
  }
  return arvores;
}

/** Treina o modelo com os casos confirmados. `holdout` separa 20% para medir a acurácia (o modelo final usa 100%). */
export function treinarModelo(base: Base, casos: Caso[], opcoes: { arvores?: number; seed?: number; holdout?: boolean } = {}): Modelo | null {
  const validos = casos.filter((c) => c.hipotese);
  if (validos.length < 20) return null;
  const classes = [...new Set(validos.map((c) => c.hipotese))].sort();
  const almox = [...new Set(validos.map((c) => c.almoxarifado || "Desconhecido"))].sort();
  const categorias = [...new Set(validos.map((c) => c.categoria || "Desconhecido"))].sort();
  const esq = { almox, categorias };
  const X = validos.map((c) => vetor(esq, c, sinaisDe(base, c)));
  const y = validos.map((c) => classes.indexOf(c.hipotese));
  const nArv = opcoes.arvores ?? 100, seed = opcoes.seed ?? 42;
  let acuraciaHoldout: number | null = null;
  if (opcoes.holdout !== false && validos.length >= 50) {
    const r = rng(seed + 1); const teste = new Set<number>();
    const porClasse = new Map<number, number[]>(); y.forEach((c, i) => (porClasse.get(c) ?? porClasse.set(c, []).get(c)!).push(i));
    for (const ids of porClasse.values()) { const emb = [...ids]; for (let k = emb.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [emb[k], emb[j]] = [emb[j], emb[k]]; } emb.slice(0, Math.round(ids.length * 0.2)).forEach((i) => teste.add(i)); }
    const tr = y.map((_, i) => i).filter((i) => !teste.has(i));
    const arvs = treinarFloresta(tr.map((i) => X[i]), tr.map((i) => y[i]), classes.length, nArv, seed);
    let ok = 0; for (const i of teste) { const p = mediaProba(arvs, X[i], classes.length); if (p.indexOf(Math.max(...p)) === y[i]) ok++; }
    acuraciaHoldout = teste.size ? Math.round((ok / teste.size) * 1000) / 10 : null;
  }
  return { classes, almox, categorias, arvores: treinarFloresta(X, y, classes.length, nArv, seed), casos: validos.length, acuraciaHoldout };
}
function mediaProba(arvs: No[], v: number[], n: number) { const p = new Array(n).fill(0); for (const a of arvs) probaArvore(a, v).forEach((x, i) => (p[i] += x)); return p.map((x) => x / arvs.length); }

/** Previsão para uma divergência (mesmo formato do Atlas: hipótese, confiança e distribuição acima de 1%). */
export function prever(m: Modelo, base: Base, d: Div) {
  const s = sinaisContexto(base, d) as unknown as Record<string, boolean>;
  const p = mediaProba(m.arvores, vetor(m, { almoxarifado: d.almoxarifado, categoria: d.categoria_produto, qtd: d.divergencia_qtd, valor: d.valor_estimado ?? 0, data: d.data_deteccao }, s), m.classes.length);
  const rank = m.classes.map((c, i) => ({ hipotese: c, confianca: Math.round(p[i] * 1000) / 10 })).sort((a, b) => b.confianca - a.confianca);
  return { hipotese: rank[0].hipotese, confianca: rank[0].confianca, distribuicao: rank.filter((x) => x.confianca > 1) };
}
