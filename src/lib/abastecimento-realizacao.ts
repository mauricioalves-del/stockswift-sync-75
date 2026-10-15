// Malha linear de vendas: a meta (consenso) do mês espalhada por igual nos dias do mês (meta ÷ dias do mês).
// A sazonalidade já está na meta de cada mês; a demanda não recebe nenhum índice sazonal por cima.
// Fator de realização = venda real ÷ malha, nos mesmos dias: quanto a loja está vendendo em relação ao que o consenso previu.
import { diasDoMesIso } from "./abastecimento-consenso";

type VendaDia = Map<string, number> | Record<string, number>;
const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const somaDias = (iso: string, n: number) => new Date(ms(iso) + n * 86400000).toISOString().slice(0, 10);
const vendaDe = (v: VendaDia, d: string): number => (v instanceof Map ? v.get(d) : v[d]) ?? 0;

/** Meta diária da malha linear num dia: meta do mês ÷ dias do mês. */
export function malhaDoDia(porMes: Record<string, number>, iso: string): number {
  const mes = iso.slice(0, 7); return (porMes[mes] ?? 0) / diasDoMesIso(mes);
}
export type SomasRealizacao = { real: number; malha: number; dias: number };
/** Soma, nos últimos `janela` dias até `refIso`, a venda real e a malha — só nos dias em que há consenso e histórico de venda. */
export function somasRealizacao(venda: VendaDia, porMes: Record<string, number>, refIso: string, o: { janela?: number; inicioHistorico?: string | null } = {}): SomasRealizacao {
  const janela = o.janela ?? 30; let real = 0, malha = 0, dias = 0;
  for (let k = janela - 1; k >= 0; k--) {
    const d = somaDias(refIso, -k); if (o.inicioHistorico && d < o.inicioHistorico) continue;
    const m = malhaDoDia(porMes, d); if (m <= 0) continue;
    malha += m; real += vendaDe(venda, d); dias++;
  }
  return { real, malha, dias };
}
export type Realizacao = { fator: number; bruto: number; real: number; malha: number; dias: number };
/** Fator de realização (venda real ÷ malha), limitado a [piso, teto]. null = sem base para comparar (poucos dias com consenso e venda). */
export function fatorRealizacao(venda: VendaDia, porMes: Record<string, number>, refIso: string, o: { janela?: number; minDias?: number; inicioHistorico?: string | null; piso?: number; teto?: number } = {}): Realizacao | null {
  const s = somasRealizacao(venda, porMes, refIso, o); if (s.dias < (o.minDias ?? 7) || s.malha <= 0) return null;
  const bruto = s.real / s.malha; return { fator: Math.min(o.teto ?? 1.5, Math.max(o.piso ?? 0.5, bruto)), bruto, ...s };
}
