import { linearRegression, linearRegressionLine } from "simple-statistics";

type Dia = { data: string; acuracia: number | null };
export type PontoTendencia = { data: string; rotulo: string; acuracia: number | null; tendencia: number | null; projecao: number | null };
const DIA_MS = 86400000;
const limitar = (valor: number) => Math.max(0, Math.min(100, valor));

/** Least-squares regression over the selected observations using actual calendar-day distances. */
export function tendenciaAcuracia(dias: Dia[]) {
  const validos = dias.filter((d) => d.acuracia != null && Number.isFinite(d.acuracia) && Number.isFinite(Date.parse(d.data)))
    .slice().sort((a, b) => a.data.localeCompare(b.data));
  const pontos: PontoTendencia[] = validos.map((d) => ({ data: d.data, rotulo: d.data.slice(0, 10).split("-").reverse().slice(0, 2).join("/"), acuracia: d.acuracia, tendencia: null, projecao: null }));
  const primeiro = validos[0];
  const ultimo = validos.at(-1);
  if (!primeiro || !ultimo || primeiro.data === ultimo.data) return { pontos, inclinacao: null, projecao5: null };
  const inicio = Date.parse(primeiro.data);
  const x = (data: string) => (Date.parse(data) - inicio) / DIA_MS;
  const amostras: number[][] = [];
  for (const d of validos) if (d.acuracia != null) amostras.push([x(d.data), d.acuracia]);
  const modelo = linearRegression(amostras);
  const prever = linearRegressionLine(modelo);
  for (const ponto of pontos) ponto.tendencia = limitar(prever(x(ponto.data)));
  const ancora = pontos.at(-1);
  if (ancora) ancora.projecao = limitar(prever(x(ultimo.data)));
  for (let i = 1; i <= 5; i++) {
    const data = new Date(Date.parse(ultimo.data) + i * DIA_MS).toISOString().slice(0, 10);
    pontos.push({ data, rotulo: `+${i}`, acuracia: null, tendencia: null, projecao: limitar(prever(x(data))) });
  }
  return { pontos, inclinacao: modelo.m, projecao5: pontos.at(-1)?.projecao ?? null };
}