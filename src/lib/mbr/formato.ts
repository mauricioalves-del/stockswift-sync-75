// MBR (Monthly Business Review) — paleta, formatação e regras de leitura (porte de atlas/backend/app/mbr_generator.py).

export const COR = {
  VERDE_AMAZONIA: "4E7F84", AZUL_INSTITUCIONAL: "34436C", AZUL_CLARO: "B1BFE2", OFF_WHITE: "E4E0D5", BRANCO: "FFFFFF",
  CINZA_TEXTO: "4A4A4A", CINZA_CLARO: "E2E4E8", CINZA_LINHA_PAR: "F4F5F7",
  SUCESSO: "2E7D32", ATENCAO: "F9A825", ERRO: "C62828", INFO: "1565C0", SEM_DADO: "9E9E9E",
} as const;

export const FONTE = "Arial";
export const LARGURA = 13.333;
export const ALTURA = 7.5;
export const MARGEM = 0.5;
/** Limiares de status: [bom, atenção] — maior é melhor para acurácia. */
export const LIMIAR_ACURACIA: [number, number] = [95, 85];
export const ALMOX_LOJA = "Almox_SP_Loja";
export const ALMOX_PATIO_PAULISTA = "Almox_SP_PatioPaulista";

export type Status = { label: string; cor: string };

export function statusMaiorMelhor(v: number | null | undefined, bom = LIMIAR_ACURACIA[0], atencao = LIMIAR_ACURACIA[1]): Status {
  if (v == null) return { label: "Sem dado", cor: COR.SEM_DADO };
  if (v >= bom) return { label: "Em avanço", cor: COR.SUCESSO };
  if (v >= atencao) return { label: "Atenção", cor: COR.ATENCAO };
  return { label: "Crítico", cor: COR.ERRO };
}
export function statusMenorMelhor(v: number | null | undefined, bom: number, atencao: number): Status {
  if (v == null) return { label: "Sem dado", cor: COR.SEM_DADO };
  if (v <= bom) return { label: "Em avanço", cor: COR.SUCESSO };
  if (v <= atencao) return { label: "Atenção", cor: COR.ATENCAO };
  return { label: "Crítico", cor: COR.ERRO };
}
/** Acima de 95% a frente é "Em avanço" independentemente da regra da linha. */
export const avancoOperacional = (pct: number | null | undefined, s: Status): Status => (pct != null && pct >= 95 ? { label: "Em avanço", cor: COR.SUCESSO } : s);
/** Classifica uma VARIAÇÃO (não um nível) em Evolução / Estável / Involução / Sem histórico. */
export function statusEvolucao(delta: number | null | undefined, menorMelhor = false, limiar = 0.5): Status {
  if (delta == null) return { label: "Sem histórico", cor: COR.SEM_DADO };
  const d = menorMelhor ? -delta : delta;
  if (d >= limiar) return { label: "Evolução", cor: COR.SUCESSO };
  if (d <= -limiar) return { label: "Involução", cor: COR.ERRO };
  return { label: "Estável", cor: COR.INFO };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
/** Formata como o Python (`f"{v:,.Nf}"`): arredonda pelo valor binário exato e, só em empate exato, para o par. */
function fixo(v: number, casas: number) {
  const a = Math.abs(v), exato = a.toFixed(casas + 25), cauda = exato.slice(-25);
  if (cauda !== "5" + "0".repeat(24)) return a.toFixed(casas);
  const base = exato.slice(0, exato.length - 25).replace(/\.$/, ""), ult = Number(base.at(-1));
  return ult % 2 === 0 ? base : (a + 10 ** -casas / 2).toFixed(casas);
}
export function fmtNum(v: number | null | undefined, casas = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  const t = fixo(v, casas), [int, dec] = t.split(".");
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 && Number(t) !== 0 ? "-" : "") + milhar + (dec ? "," + dec : "");
}
export const fmtPct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${fmtNum(v, casas)}%`);
export const fmtMoeda = (v: number | null | undefined, casas = 0) => (v == null ? "—" : `${v < 0 ? "-" : ""}R$ ${fmtNum(Math.abs(v), casas)}`);
export const fmtSinal = (v: number | null | undefined, fmt: (x: number) => string) => (v == null ? "—" : v >= 0 ? `+${fmt(v)}` : fmt(v));

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
/** "Set/26" */
export const rotuloMes = (mes: string) => `${nomeMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`;
export const mesAnterior = (mes: string) => { const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

export type Tendencia = { inclinacao: number | null; rotulo: string | null; cor: string };
export function tendenciaLinear(valores: (number | null | undefined)[]): Tendencia {
  const p = valores.filter((v): v is number => v != null); const n = p.length;
  if (n < 2) return { inclinacao: null, rotulo: null, cor: COR.SEM_DADO };
  const mx = (n - 1) / 2, my = p.reduce((a, b) => a + b, 0) / n;
  const num = p.reduce((s, v, i) => s + (i - mx) * (v - my), 0);
  const den = p.reduce((s, _v, i) => s + (i - mx) ** 2, 0);
  const inc = den ? r2(num / den) : 0;
  if (inc > 0.3) return { inclinacao: inc, rotulo: `▲ Tendência de melhora: +${fmtNum(inc, 1)} p.p./mês`, cor: COR.SUCESSO };
  if (inc < -0.3) return { inclinacao: inc, rotulo: `▼ Tendência de piora: -${fmtNum(Math.abs(inc), 1)} p.p./mês`, cor: COR.ERRO };
  return { inclinacao: inc, rotulo: "▬ Tendência estável no período", cor: COR.SEM_DADO };
}
/** Pontos da reta de regressão nas mesmas posições dos valores (null onde não há valor). */
export function pontosTendencia(valores: (number | null | undefined)[]): (number | null)[] | null {
  const idx = valores.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const p = idx.map((i) => valores[i] as number); const n = p.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2, my = p.reduce((a, b) => a + b, 0) / n;
  const num = p.reduce((s, v, k) => s + (k - mx) * (v - my), 0);
  const den = p.reduce((s, _v, k) => s + (k - mx) ** 2, 0);
  const inc = den ? num / den : 0, ic = my - inc * mx;
  const out: (number | null)[] = valores.map(() => null);
  idx.forEach((i, k) => { out[i] = ic + inc * k; });
  return out;
}

// ---------- estimativas de texto (mesma heurística do gerador Python, calibrada para Arial) ----------
export function caberNoEspaco(texto: string, larguraIn: number, alturaIn: number, pt: number, esp = 1.12) {
  if (!texto) return "";
  const cpl = Math.max(10, Math.floor(larguraIn / ((pt / 72) * 0.52)));
  const linhas = Math.max(1, Math.floor(alturaIn / ((pt / 72) * esp * 1.22)));
  const max = Math.floor(cpl * linhas * 0.82);
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max); const i = corte.lastIndexOf(" ");
  return (i > 0 ? corte.slice(0, i) : corte).replace(/[,.;:—-]+$/, "") + "…";
}
export function alturaCaixaLeitura(texto: string, largura: number, pt: number, alturaRotulo = 0.26, pad = 0.2, esp = 1.12) {
  if (!texto) return alturaRotulo + pad * 1.1;
  const cpl = Math.max(10, Math.floor((largura - 2 * pad) / ((pt / 72) * 0.52)));
  const maxLinha = Math.max(1, Math.floor(cpl * 0.82));
  const linhas = Math.max(1, Math.ceil(texto.length / maxLinha));
  return pad * 0.6 + alturaRotulo + linhas * ((pt / 72) * esp * 1.22) + pad * 0.5 + 0.03;
}
export const linhasEstimadas = (texto: string, larguraIn: number, pt: number) => Math.max(1, Math.ceil(texto.length / Math.max(10, Math.floor(larguraIn / ((pt / 72) * 0.52)))));
