// Parâmetros de COBERTURA da Reposição: dias de mínimo (ponto de pedido), ideal (até onde repõe), máximo (acima = excesso) e segurança.
// Precedência por campo: PADRÃO (abast_config) < LOJA < FAMÍLIA. Campo vazio (null) herda do nível acima.
import type { Param2 } from "./abastecimento-motor2";

export type EscopoCobertura = "LOJA" | "FAMILIA";
export type CoberturaRegra = { escopo: EscopoCobertura; valor: string; dias_min: number | null; dias_ideal: number | null; dias_max: number | null; dias_seguranca: number | null };
export const PARAM_SISTEMA: Param2 = { diasMin: 5, diasIdeal: 10, diasMax: 15, diasSeguranca: 0 };

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Garante coerência: segurança ≥ 0, ideal ≥ 1, 0 ≤ mínimo ≤ ideal ≤ máximo. */
export function normalizarParam(p: Param2): Param2 {
  const ideal = Math.max(1, p.diasIdeal);
  return { diasMin: Math.min(Math.max(0, p.diasMin), ideal), diasIdeal: ideal, diasMax: Math.max(p.diasMax, ideal), diasSeguranca: Math.max(0, p.diasSeguranca) };
}

function aplicar(base: Param2, r: CoberturaRegra | undefined): Param2 {
  if (!r) return base;
  return { diasMin: num(r.dias_min) ?? base.diasMin, diasIdeal: num(r.dias_ideal) ?? base.diasIdeal, diasMax: num(r.dias_max) ?? base.diasMax, diasSeguranca: num(r.dias_seguranca) ?? base.diasSeguranca };
}
const temValor = (r: CoberturaRegra | undefined) => !!r && [r.dias_min, r.dias_ideal, r.dias_max, r.dias_seguranca].some((v) => num(v) !== null);

export type Resolvido = { p: Param2; origem: "padrao" | "loja" | "familia" | "loja+familia" };

/** Parâmetros de cobertura aplicáveis a um item (loja + família). */
export function resolverParam(padrao: Param2, regras: CoberturaRegra[], loja: string, familia: string): Resolvido {
  const rl = regras.find((r) => r.escopo === "LOJA" && r.valor === loja);
  const fk = semAcento(familia);
  const rf = fk ? regras.find((r) => r.escopo === "FAMILIA" && semAcento(r.valor) === fk) : undefined;
  const usouLoja = temValor(rl), usouFam = temValor(rf);
  const p = normalizarParam(aplicar(aplicar(normalizarParam(padrao), usouLoja ? rl : undefined), usouFam ? rf : undefined));
  return { p, origem: usouLoja && usouFam ? "loja+familia" : usouFam ? "familia" : usouLoja ? "loja" : "padrao" };
}

/** Valida o que o usuário digitou (campos vazios são permitidos nas regras; o padrão é obrigatório). Devolve mensagens. */
export function validarCampos(rotulo: string, c: { min: number | null; ideal: number | null; max: number | null; seg: number | null }, obrigatorio: boolean): string[] {
  const e: string[] = [];
  if (obrigatorio && (c.min === null || c.ideal === null || c.max === null || c.seg === null)) e.push(`${rotulo}: preencha mínimo, ideal, máximo e segurança.`);
  for (const [n, v] of [["mínimo", c.min], ["ideal", c.ideal], ["máximo", c.max], ["segurança", c.seg]] as const) if (v !== null && v < 0) e.push(`${rotulo}: ${n} não pode ser negativo.`);
  if (c.ideal !== null && c.ideal < 1) e.push(`${rotulo}: o ideal precisa ser de pelo menos 1 dia.`);
  if (obrigatorio && c.min !== null && c.ideal !== null && c.min > c.ideal) e.push(`${rotulo}: o mínimo não pode ser maior que o ideal.`);
  if (obrigatorio && c.ideal !== null && c.max !== null && c.ideal > c.max) e.push(`${rotulo}: o ideal não pode ser maior que o máximo.`);
  return e;
}
