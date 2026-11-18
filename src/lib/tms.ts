// Gestão de transportes (TMS) do pilar Controle Logístico: zonas de entrega, embalagem térmica, cotação automática
// pelas tabelas de serviço dos prestadores e oportunidades de redução de custo.
import type { Envio } from "./logistica";

export type Zona = "grande_sp" | "interior_sp" | "fora_estado" | "para_sp" | "sp_para";
export const ZONA_ROTULO: Record<Zona, string> = { grande_sp: "Grande São Paulo", interior_sp: "Interior e litoral de SP", fora_estado: "Fora do estado", para_sp: "Pará → SP", sp_para: "SP → Pará" };

/** Zona pelo CEP: 01000-09999 = capital e região metropolitana; 11000-19999 = interior/litoral de SP; demais = fora do estado. */
export function zonaPorCep(cep: string | null | undefined, uf?: string | null): Zona | null {
  const d = String(cep ?? "").replace(/\D/g, "");
  if (d.length >= 5) { const p = Number(d.slice(0, 5)); if (p >= 1000 && p <= 9999) return "grande_sp"; if (p >= 11000 && p <= 19999) return "interior_sp"; if (p >= 66000 && p <= 68899) return "sp_para"; return "fora_estado"; }
  if (uf) return uf.toUpperCase() === "SP" ? "grande_sp" : uf.toUpperCase() === "PA" ? "sp_para" : "fora_estado";
  return null;
}
/** Zona de um envio do histórico (sem CEP): usa a zona gravada, a transferência (kg) e o par UF + "fora de SP capital". */
export function zonaEnvio(e: Pick<Envio, "uf" | "fora_sp" | "kg" | "origem_destino"> & { zona?: string | null }): Zona {
  if (e.zona) return e.zona as Zona;
  const od = String(e.origem_destino ?? "").toUpperCase();
  if (e.kg && /^BEL/.test(od)) return "para_sp";
  if (e.kg && /BEL$/.test(od)) return "sp_para";
  const uf = String(e.uf ?? "SP").toUpperCase();
  if (uf === "PA") return "para_sp";
  if (uf !== "SP") return "fora_estado";
  return e.fora_sp ? "interior_sp" : "grande_sp";
}

export type Embalagem = { nome: string; tipo: string; capacidade_kg: number | null; custo: number };
/** Proteção térmica: menor isopor que comporta o peso (ou vários GG) + 1 gelox M a cada 2 kg (mín. 2). */
export function embalagemTermica(pesoKg: number, emb: Embalagem[]) {
  const iso = emb.filter((e) => e.tipo === "isopor" && e.capacidade_kg).sort((a, b) => a.capacidade_kg! - b.capacidade_kg!);
  const gel = emb.filter((e) => e.tipo === "gelox").sort((a, b) => b.custo - a.custo)[0];
  if (!iso.length || pesoKg <= 0) return { custo: 0, itens: [] as string[] };
  const cabe = iso.find((e) => e.capacidade_kg! >= pesoKg); const maior = iso[iso.length - 1];
  const caixas = cabe ? [cabe] : Array.from({ length: Math.ceil(pesoKg / maior.capacidade_kg!) }, () => maior);
  const ng = gel ? Math.max(2, Math.ceil(pesoKg / 2)) : 0;
  const custo = caixas.reduce((s, c) => s + c.custo, 0) + (gel ? ng * gel.custo : 0);
  return { custo: Math.round(custo * 100) / 100, itens: [`${caixas.length}× ${caixas[0].nome}`, ...(ng ? [`${ng}× ${gel!.nome}`] : [])] };
}

export type Prestador = { id: string; nome: string; tipo: string; ativo: boolean };
export type TabelaFrete = { id: string; prestador_id: string; modal: string; zona: Zona; valor_fixo: number; valor_km: number; valor_kg: number; minimo: number; prazo_dias: number | null; termico: boolean; ativo: boolean; observacao?: string | null };
export type Pedido = { zona: Zona; peso_kg: number; km_estimado: number | null; termico: boolean; tipo?: string; dias_ate_limite?: number | null };
export type Opcao = { prestador_id: string; prestador: string; modal: string; frete: number; embalagem: number; total: number; prazo_dias: number | null; detalhe: string[]; atendePrazo: boolean };

/** Cotação automática: aplica cada tabela ativa da zona (fixo + km + kg, respeitando o mínimo) e soma a embalagem térmica. */
export function cotarPorTabelas(p: Pedido, tabelas: TabelaFrete[], prestadores: Prestador[], emb: Embalagem[]): Opcao[] {
  const nome = new Map(prestadores.filter((x) => x.ativo).map((x) => [x.id, x]));
  const termica = p.termico ? embalagemTermica(p.peso_kg, emb) : { custo: 0, itens: [] };
  // coleta fixa (ex.: motorista em Belém) entra somada às opções aéreas da mesma zona
  const coletas = tabelas.filter((t) => t.ativo && t.zona === p.zona && nome.get(t.prestador_id)?.tipo === "motorista");
  const coleta = coletas.reduce((s, t) => s + Math.max(t.minimo, t.valor_fixo), 0);
  const out: Opcao[] = [];
  for (const t of tabelas) {
    const pr = nome.get(t.prestador_id); if (!t.ativo || t.zona !== p.zona || !pr || pr.tipo === "motorista") continue;
    const km = p.km_estimado ?? 0;
    if (t.valor_km > 0 && !km) continue; // sem distância não dá para cotar tabela por km
    let frete = t.valor_fixo + t.valor_km * km + t.valor_kg * p.peso_kg; frete = Math.max(frete, t.minimo);
    const extra = t.modal === "aereo" && coleta ? coleta : 0;
    const emb_ = t.termico ? 0 : termica.custo; // tabela "térmica" já inclui a proteção
    const total = Math.round((frete + extra + emb_) * 100) / 100;
    const detalhe = [`${t.valor_fixo ? `fixo R$ ${t.valor_fixo}` : ""}${t.valor_km ? ` + R$ ${t.valor_km}/km × ${km} km` : ""}${t.valor_kg ? ` + R$ ${t.valor_kg}/kg × ${p.peso_kg} kg` : ""}`.replace(/^ \+ /, "").trim()];
    if (frete === t.minimo && t.minimo) detalhe.push(`mínimo R$ ${t.minimo}`);
    if (extra) detalhe.push(`coleta R$ ${extra}`);
    if (emb_) detalhe.push(`térmica R$ ${emb_} (${termica.itens.join(" + ")})`);
    out.push({ prestador_id: pr.id, prestador: pr.nome, modal: t.modal, frete: Math.round((frete + extra) * 100) / 100, embalagem: emb_, total, prazo_dias: t.prazo_dias, detalhe, atendePrazo: p.dias_ate_limite == null || t.prazo_dias == null || t.prazo_dias <= p.dias_ate_limite });
  }
  // uma opção por prestador (a mais barata), ordenadas: atende o prazo primeiro, depois menor custo
  const melhor = new Map<string, Opcao>(); for (const o of out) { const m = melhor.get(o.prestador_id); if (!m || o.total < m.total) melhor.set(o.prestador_id, o); }
  return [...melhor.values()].sort((a, b) => Number(b.atendePrazo) - Number(a.atendePrazo) || a.total - b.total);
}

/** Oportunidades de redução de custo a partir do histórico do período. */
export function oportunidades(envios: Envio[], kmResidencia: number) {
  const tot = (e: Envio) => e.frete + e.isopor + e.gelox + e.seguro;
  const out: { titulo: string; valor: number; acao: string }[] = [];
  const lala = envios.filter((e) => /LALAMOVE/i.test(e.modal ?? ""));
  if (lala.length) { const v = lala.reduce((s, e) => s + tot(e), 0); out.push({ titulo: `Lalamove: ${lala.length} entregas, média ${brl(v / lala.length)}`, valor: v * 0.15, acao: "Cotar 3 opções por destino e consolidar entregas da mesma região no mesmo dia (meta: −15%)." }); }
  const transf = envios.filter((e) => e.kg && e.kg > 0);
  const pequenas = transf.filter((e) => (e.kg ?? 0) < 50);
  if (pequenas.length) { const v = pequenas.reduce((s, e) => s + tot(e), 0); out.push({ titulo: `${pequenas.length} transferências Pará ↔ SP abaixo de 50 kg`, valor: v * 0.4, acao: "Consolidar remessas: a coleta fixa em Belém pesa mais que o frete em envios pequenos. Programar envio mínimo de 50 kg." }); }
  const term = envios.filter((e) => e.isopor + e.gelox > 0); const vt = term.reduce((s, e) => s + e.isopor + e.gelox, 0);
  if (term.length) out.push({ titulo: `Embalagem térmica: ${brl(vt)} em ${term.length} envios`, valor: vt * 0.3, acao: "Reaproveitar isopor GG nas transferências de retorno e padronizar tamanho pelo peso (cotação já calcula)." });
  if (kmResidencia > 0) out.push({ titulo: `Km do PJ saindo da residência: ${brl(kmResidencia)}`, valor: kmResidencia, acao: "Contar km a partir da fábrica ou fixar teto por trajeto." });
  const cort = envios.filter((e) => /CORTESIA/i.test(`${e.operacao} ${e.cliente}`)); const vc = cort.reduce((s, e) => s + tot(e), 0);
  if (cort.length) out.push({ titulo: `Cortesias: ${cort.length} envios, ${brl(vc)} de frete`, valor: vc * 0.5, acao: "Agrupar cortesias em rotas semanais ou repassar o frete ao centro de custo solicitante com aprovação." });
  return out.sort((a, b) => b.valor - a.valor);
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Fluxo de status da ordem de serviço (follow-up). */
export const STATUS_ORDEM = ["programada", "coletada", "em_transito", "entregue", "ocorrencia", "cancelada"] as const;
export const PROXIMOS: Record<string, string[]> = { programada: ["coletada", "cancelada"], coletada: ["em_transito", "entregue", "ocorrencia"], em_transito: ["entregue", "ocorrencia"], ocorrencia: ["em_transito", "entregue", "cancelada"], entregue: [], cancelada: [] };
