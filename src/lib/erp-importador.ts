// Importador das bases do ERP (planilha GrPCP_Conexoes_ERP.xlsx, abas ligadas às procedures do banco).
// Cada aba é reconhecida pelo nome ou pelo cabeçalho; a carga é integral: apaga a tabela e regrava.
import * as XLSX from "xlsx";

export type BaseErp = "producao_op" | "producao_mes" | "faturamento" | "faturamento_pendente" | "saldo_estoque";
type Def = { tabela: string; abas: string[]; chave: string[]; titulo: string; mapear: (r: Record<string, unknown>) => Record<string, unknown> | null };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const txt = (v: unknown) => (v == null || v === "" ? null : String(v).trim());
const num = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null; const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const data = (v: unknown) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const s = String(v).trim(), br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export const BASES_ERP: Record<BaseErp, Def> = {
  producao_op: {
    tabela: "erp_producao_op", titulo: "Produção por OP (Producao_Diaria)", abas: ["BASE PRODUCAO DIA"], chave: ["Id_Op", "Qtd_Prod", "Qtd_Prevista"],
    mapear: (r) => (txt(r.Id_Op) && txt(r.Id_produto) ? { empresa: txt(r.Empresa), id_op: txt(r.Id_Op), id_seq: num(r.id_seq), tipo_material: txt(r.TipoMaterial), id_produto: txt(r.Id_produto), descricao: txt(r.Descricao), um: txt(r.UM), status: txt(r.Status), dt_prevista: data(r.Dt_Prevista), qtd_prevista: num(r.Qtd_Prevista), qtd_prod: num(r.Qtd_Prod), qtd_saldo: num(r.Qtd_Saldo), dt_producao: data(r.Dt_Producao), dt_registro: data(r.Dt_Registro), custo_contabil: num(r.Custo_Contabil) } : null),
  },
  producao_mes: {
    tabela: "erp_producao_mes", titulo: "Produção mensal (Producao)", abas: ["BASE PRODUCAO MES"], chave: ["Anomes", "Qtd_Produzir", "Qtd_Ja_Produzida"],
    mapear: (r) => (txt(r.Id_produto) ? { tipo_material: txt(r.TipoMaterial), id_produto: txt(r.Id_produto), descricao: txt(r.Descricao), um: txt(r.UM), anomes: txt(r.Anomes), qtd_produzir: num(r.Qtd_Produzir), qtd_ja_produzida: num(r.Qtd_Ja_Produzida), status: txt(r.Status), empresa: txt(r.Empresa) } : null),
  },
  faturamento: {
    tabela: "erp_faturamento", titulo: "Faturamento — todos os canais (Faturamento)", abas: ["BASE VENDAS"], chave: ["nr_nf", "CodProd", "Vt_Fat_Liquido"],
    // razão social e CPF/CNPJ do cliente ficam fora (não são necessários para o PCP)
    mapear: (r) => (txt(r.CodProd) ? { empresa: txt(r.Empresa), ano: num(r.Ano), anomes: txt(r.AnoMes), dt_emissao: data(r.dt_emissao), mes: txt(r.Mes), semana: txt(r.Semana), nr_nf: txt(r.nr_nf), serie: txt(r.serie), tipo_documento: txt(r.tipo_documento), cidade: txt(r.Cidade), estado: txt(r.estado), cod_prod: txt(r.CodProd), desc_produto: txt(r.Desc_Produto), qtd: num(r.qtd), vt_total_item: num(r.vt_total_item), id_cfo: txt(r.Id_cfo), natureza: txt(r.Natureza), grupo: txt(r.Grupo), linha: txt(r.linha), vendedor: txt(r.Vendedor), orig_ped: txt(r.origPed), tipo_produto: txt(r.tipoProduto), dt_inclusao: data(r.Dt_Inclusao), dt_faturado: data(r.Dt_Faturado), pedido_cancelado: txt(r.Pedido_Cancelado), dias_para_faturar: num(r.Dias_para_faturar), nota_cancelada: txt(r.Nota_Cancelada), dt_cancelamento_nota: data(r.Dt_Cancelamento_Nota), grupo1: txt(r.Grupo1), grupo2: txt(r.Grupo2), vt_frete: num(r.Vt_Frete), cont_ped: num(r.Cont_Ped), canal_venda: txt(r.CanalVenda), vt_desc: num(r.vt_desc), vt_fat_liquido: num(r.Vt_Fat_Liquido), meio_pgto: txt(r.Meio_Pgto), cond_pgto: txt(r.Cond_Pgto), operacao: txt(r.Operacao), lote: txt(r.Lote), custo_unitario_estoque: num(r.Custo_unitario_Estoque) } : null),
  },
  faturamento_pendente: {
    tabela: "erp_faturamento_pendente", titulo: "Faturamento pendente (Consistencia 'F')", abas: ["FATURAMENTO PENDENTE"], chave: ["Comentario", "id_pedido", "produto"],
    mapear: (r) => (txt(r.produto) && txt(r.id_pedido) ? { comentario: txt(r.Comentario), descricao: txt(r.Descricao), id_pedido: txt(r.id_pedido), cliente: txt(r.cliente), produto: txt(r.produto), qtd: num(r.qtd) } : null),
  },
  saldo_estoque: {
    tabela: "erp_saldo_estoque", titulo: "Saldo de estoque (Produto_Saldo)", abas: ["SALDO ESTOQUE SISTEMA"], chave: ["Id_produto", "Alm_SP_Fabrica", "Validade_Meses"],
    mapear: (r) => {
      if (!txt(r.Id_produto)) return null;
      const saldos: Record<string, number> = {}, kg: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) { const n = num(v); if (n == null) continue; if (/^alm_/i.test(k)) saldos[k] = n; else if (/^kg_/i.test(k)) kg[k] = n; }
      return { id_produto: txt(r.Id_produto), descricao: txt(r.descricao), um: txt(r.um), ativo: txt(r.Ativo), tipo_material: txt(r.TipoMaterial), grupo: txt(r.Grupo), linha: txt(r.linha), cod_barras: txt(r.cod_barras), tipo_produto: txt(r.tipoProduto), prod_ref1: txt(r.Prod_ref1), estoque_minimo: num(r.Estoque_Minimo), estoque_maximo: num(r.Estoque_Maximo), validade_meses: num(r.Validade_Meses), custo_vlr: num(r.Custo_Vlr), custo_contabil: num(r.Custo_Contabil), saldos, saldos_kg: kg };
    },
  },
};

/** Localiza a linha de cabeçalho (até a 10ª) que contém as colunas-chave da base e devolve as linhas como objetos. */
function linhasDaAba(ws: XLSX.WorkSheet, chave: string[]) {
  const m = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const alvo = chave.map(sem);
  const iCab = m.slice(0, 10).findIndex((l) => { const s = new Set((l ?? []).map(sem)); return alvo.every((c) => s.has(c)); });
  if (iCab < 0) return null;
  const cab = (m[iCab] ?? []).map((c) => (c == null ? "" : String(c).trim()));
  const out: Record<string, unknown>[] = [];
  for (const l of m.slice(iCab + 1)) {
    if (!l || l.every((c) => c == null || c === "")) continue;
    const o: Record<string, unknown> = {}; cab.forEach((c, i) => { if (c) o[c] = l[i]; }); out.push(o);
  }
  return out;
}

export type LeituraBase = { base: BaseErp; titulo: string; tabela: string; aba: string; linhas: Record<string, unknown>[]; ignoradas: number };
export function lerPlanilhaErp(buf: ArrayBuffer): { lidas: LeituraBase[]; faltando: BaseErp[] } {
  const wb = XLSX.read(buf, { type: "array", cellDates: true, dense: true });
  const lidas: LeituraBase[] = [], faltando: BaseErp[] = [];
  for (const [base, d] of Object.entries(BASES_ERP) as [BaseErp, Def][]) {
    const nomes = [...wb.SheetNames.filter((n) => d.abas.includes(sem(n))), ...wb.SheetNames.filter((n) => !d.abas.includes(sem(n)))];
    let achou = false;
    for (const n of nomes) {
      const brutas = linhasDaAba(wb.Sheets[n], d.chave); if (!brutas) continue;
      const linhas = brutas.map(d.mapear).filter((x): x is Record<string, unknown> => !!x);
      lidas.push({ base, titulo: d.titulo, tabela: d.tabela, aba: n, linhas, ignoradas: brutas.length - linhas.length }); achou = true; break;
    }
    if (!achou) faltando.push(base);
  }
  return { lidas, faltando };
}

/** Carga integral de uma base: apaga a tabela, grava em lotes e registra a importação. */
export async function gravarBaseErp(sb: any, l: LeituraBase, arquivo: string, usuario: string | null, progresso?: (feito: number, total: number) => void) {
  const del = await sb.from(l.tabela).delete().gte("id", 0); if (del.error) throw new Error(`${l.titulo}: ${del.error.message}`);
  const lote = 1000;
  for (let i = 0; i < l.linhas.length; i += lote) {
    const r = await sb.from(l.tabela).insert(l.linhas.slice(i, i + lote)); if (r.error) throw new Error(`${l.titulo} (linhas ${i + 1}–${i + lote}): ${r.error.message}`);
    progresso?.(Math.min(i + lote, l.linhas.length), l.linhas.length);
  }
  await sb.from("erp_importacoes").insert({ base: l.base, linhas: l.linhas.length, arquivo, importado_por: usuario });
}
