// Inventário sistêmico — planilha OFICIAL de ajustes de inventário ("Ace4", aba "Estoque" da planilha "Inventários").
// Porte de ajustes_inventario_router.py do Atlas: alimenta o "Resultado de Inventário" (Entradas − Saídas) do Mapeamento
// de Passivos e do MBR. Diferente do fechamento bruto (atlas_itens_fechamento), aqui só entra o que foi de fato
// conciliado e processado no sistema.
//
// Regras (confirmadas com o Maurício no Atlas — não mudam sem confirmar de novo):
// - coluna "Inventário": "Sim" = ajuste de inventário real; "Não" = baixa de passivo que só passou pelo módulo de
//   inventário (já contada em Baixas) → fica de fora; ano legado ("2025"/"2026", antes da separação) → fica de fora;
// - a partir de jul/2026 (baixa fiscal padronizada, passivos só por nota fiscal) todo lançamento conta como ajuste,
//   entrada e saída igualmente, qualquer que seja a coluna;
// - linha 100% idêntica (no arquivo ou numa importação anterior) é pulada — o export do sistema às vezes repete linhas;
// - mesmo lançamento com só o Custo/Valor diferente = custo recalculado na origem → atualiza o registro existente
//   (a importação mais recente vale) em vez de somar as duas versões.
import { supabase } from "@/integrations/supabase/client";
import { limparTexto, normalizarAlmoxarifado, parseData, parseDecimal, parseSku, type Contexto, type Planilha } from "./atlas-importar";

const sb = supabase as any;

export const ABA_PADRAO_AJUSTES = "Estoque";
export const PADRONIZACAO_NOTA_FISCAL_DESDE = "2026-07-01";
export const COLUNAS_AJUSTE = {
  sku: "Id_Produto", status: "Status", id_invent: "Id_Invent", data: "Dt_Invent", almoxarifado: "Almox", descricao: "Descricao",
  id_lote: "Id_Lote", qtd_sistema: "Qtd", qtd_contagem: "Cont1", ajuste: "Ajuste", custo: "Custo", valor_total: "Vlr_Total",
  grupo: "Grupo", obs: "Obs", inventario_flag: "Inventário",
} as const;
type Campo = keyof typeof COLUNAS_AJUSTE;

export function contaComoAjusteInventario(dtInvent: string | null, flagBruto: unknown): boolean {
  if (dtInvent && dtInvent >= PADRONIZACAO_NOTA_FISCAL_DESDE) return true;
  return flagBruto != null && String(flagBruto).trim().toLowerCase() === "sim";
}

/** Cabeçalho comparado sem acento/caixa ("Inventario" = "Inventário"). */
const norm = (s: unknown) => String(s ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Aba "Estoque"; senão, a primeira aba cujo cabeçalho tem Id_Produto e Ajuste. */
export function escolherAbaAjustes(p: Planilha, abaEscolhida?: string | null): string {
  if (abaEscolhida && p.abas.includes(abaEscolhida)) return abaEscolhida;
  if (p.abas.includes(ABA_PADRAO_AJUSTES)) return ABA_PADRAO_AJUSTES;
  for (const aba of p.abas) {
    const cab = new Set((p.ler(aba)[0] ?? []).map(norm));
    if (cab.has(norm(COLUNAS_AJUSTE.sku)) && cab.has(norm(COLUNAS_AJUSTE.ajuste))) return aba;
  }
  throw new Error(`Não encontrei a aba '${ABA_PADRAO_AJUSTES}' (nem outra com as colunas Id_Produto e Ajuste). Abas: ${p.abas.join(", ")}`);
}

export type AjusteExistente = {
  id: number; sku: string | null; status: string | null; id_invent: number | null; dt_invent: string | null; almoxarifado_origem: string | null;
  id_lote: string | null; qtd_sistema: number | null; qtd_contagem: number | null; ajuste_qtd: number | null; custo_unitario: number | null; valor_total: number | null;
  lote_id: number | null; conta_como_ajuste_inventario?: boolean | null;
};
export type NovoAjuste = Record<string, any> & { conta_como_ajuste_inventario: boolean; valor_total: number; custo_unitario: number };
export type PlanoAjustes = {
  total: number; novas: NovoAjuste[]; correcoes: { id: number; lote_id: number | null; custo_unitario: number; valor_total: number }[];
  contadas: number; ignoradasNao: number; ignoradasLegado: number; duplicadasArquivo: number; duplicadasAnteriores: number;
  custosCorrigidos: number; valorCorrecaoCusto: number; idsInventRepetidos: number[]; erros: string[];
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const dia = (v: unknown) => (v == null ? null : String(v).slice(0, 10));
const chaveMov = (r: { sku: unknown; status: unknown; id_invent: unknown; dt_invent: unknown; almoxarifado_origem: unknown; id_lote: unknown; qtd_sistema: unknown; qtd_contagem: unknown; ajuste_qtd: unknown }) =>
  JSON.stringify([r.sku ?? null, r.status ?? null, r.id_invent ?? null, dia(r.dt_invent), r.almoxarifado_origem ?? null, r.id_lote ?? null, n(r.qtd_sistema), n(r.qtd_contagem), n(r.ajuste_qtd)]);
const chaveCompleta = (mov: string, custo: unknown, valor: unknown) => `${mov}|${n(custo)}|${n(valor)}`;

/** Lê as linhas da aba e decide o que entra, o que é duplicata e o que é só correção de custo — sem tocar no banco. */
export function planejarAjustes(linhas: unknown[][], existentes: AjusteExistente[], arquivo: string, usuario: string): PlanoAjustes {
  if (!linhas.length) throw new Error("Planilha vazia.");
  const cab = linhas[0].map(norm);
  const idx = Object.fromEntries((Object.keys(COLUNAS_AJUSTE) as Campo[]).map((c) => [c, cab.indexOf(norm(COLUNAS_AJUSTE[c]))])) as Record<Campo, number>;
  const faltando = (["sku", "data", "ajuste"] as Campo[]).filter((c) => idx[c] < 0).map((c) => COLUNAS_AJUSTE[c]);
  if (faltando.length) throw new Error(`Colunas esperadas não encontradas: ${faltando.join(", ")}. Cabeçalho: ${linhas[0].map((c) => String(c ?? "")).join(", ")}`);
  const val = (l: unknown[], c: Campo) => (idx[c] >= 0 ? l[idx[c]] ?? null : null);

  const idsExistentes = new Set(existentes.map((r) => r.id_invent).filter((x): x is number => x != null));
  const completasBanco = new Set<string>();
  const porMovimento = new Map<string, { tipo: "banco"; reg: AjusteExistente } | { tipo: "novo"; reg: NovoAjuste }>();
  for (const r of existentes) { const k = chaveMov(r); completasBanco.add(chaveCompleta(k, r.custo_unitario, r.valor_total)); porMovimento.set(k, { tipo: "banco", reg: r }); }

  const p: PlanoAjustes = { total: 0, novas: [], correcoes: [], contadas: 0, ignoradasNao: 0, ignoradasLegado: 0, duplicadasArquivo: 0, duplicadasAnteriores: 0, custosCorrigidos: 0, valorCorrecaoCusto: 0, idsInventRepetidos: [], erros: [] };
  const vistasArquivo = new Set<string>(), repetidos = new Set<number>(), correcaoPorId = new Map<number, PlanoAjustes["correcoes"][number]>();
  const agora = new Date().toISOString();

  linhas.slice(1).forEach((l, i) => {
    const skuBruto = val(l, "sku");
    if (skuBruto == null || String(skuBruto).trim() === "") return;
    p.total++;
    try {
      const sku = parseSku(skuBruto);
      const dt = parseData(val(l, "data"));
      const almoxOrigemBruto = val(l, "almoxarifado");
      const idBruto = val(l, "id_invent");
      let idInvent: number | null = null;
      if (idBruto != null && String(idBruto).trim() !== "") { idInvent = Math.trunc(Number(String(idBruto).trim())); if (!Number.isFinite(idInvent)) throw new Error(`Id_Invent inválido: '${idBruto}'`); }
      const mov = {
        sku, status: limparTexto(val(l, "status")), id_invent: idInvent, dt_invent: dt, almoxarifado_origem: limparTexto(almoxOrigemBruto), id_lote: limparTexto(val(l, "id_lote")),
        qtd_sistema: parseDecimal(val(l, "qtd_sistema")), qtd_contagem: parseDecimal(val(l, "qtd_contagem")), ajuste_qtd: parseDecimal(val(l, "ajuste")),
      };
      const custo = parseDecimal(val(l, "custo")), valor = parseDecimal(val(l, "valor_total"));
      const km = chaveMov(mov), kc = chaveCompleta(km, custo, valor);
      if (vistasArquivo.has(kc)) { p.duplicadasArquivo++; return; }
      if (completasBanco.has(kc)) { p.duplicadasAnteriores++; return; }
      vistasArquivo.add(kc);

      const ja = porMovimento.get(km);
      if (ja) {   // mesmo lançamento, só o custo/valor mudou → a importação mais recente vale
        p.valorCorrecaoCusto += valor - n(ja.reg.valor_total);
        ja.reg.custo_unitario = custo; ja.reg.valor_total = valor;
        if (ja.tipo === "banco") {
          const c = correcaoPorId.get(ja.reg.id) ?? { id: ja.reg.id, lote_id: ja.reg.lote_id, custo_unitario: custo, valor_total: valor };
          c.custo_unitario = custo; c.valor_total = valor; correcaoPorId.set(ja.reg.id, c);
        }
        p.custosCorrigidos++;
        return;
      }
      if (idInvent != null && idsExistentes.has(idInvent)) repetidos.add(idInvent);

      const flag = val(l, "inventario_flag");
      const conta = contaComoAjusteInventario(dt, flag);
      const reg: NovoAjuste = {
        ...mov, almoxarifado: normalizarAlmoxarifado(almoxOrigemBruto), descricao_produto: limparTexto(val(l, "descricao")),
        custo_unitario: custo, valor_total: valor, categoria_produto: limparTexto(val(l, "grupo")), observacao: limparTexto(val(l, "obs")),
        inventario_flag_bruto: flag == null ? null : limparTexto(String(flag)), conta_como_ajuste_inventario: conta,
        arquivo_origem: arquivo, criado_por: usuario, criado_em: agora,
      };
      p.novas.push(reg);
      porMovimento.set(km, { tipo: "novo", reg });
      if (conta) p.contadas++;
      else if (flag != null && String(flag).trim().toLowerCase() === "não") p.ignoradasNao++;
      else p.ignoradasLegado++;
    } catch (e: any) {
      p.erros.push(`Linha ${i + 2} (SKU ${String(skuBruto)}): ${e?.message ?? e}`);
    }
  });
  p.correcoes = [...correcaoPorId.values()];
  p.idsInventRepetidos = [...repetidos].sort((a, b) => a - b);
  p.valorCorrecaoCusto = Math.round(p.valorCorrecaoCusto * 100) / 100;
  return p;
}

export const valorContado = (linhas: { conta_como_ajuste_inventario?: boolean | null; valor_total?: number | null }[]) =>
  Math.round(linhas.reduce((a, r) => a + (r.conta_como_ajuste_inventario ? n(r.valor_total) : 0), 0) * 100) / 100;

async function lerExistentes(): Promise<AjusteExistente[]> {
  const out: AjusteExistente[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("atlas_ajustes_inventario_oficial")
      .select("id, sku, status, id_invent, dt_invent, almoxarifado_origem, id_lote, qtd_sistema, qtd_contagem, ajuste_qtd, custo_unitario, valor_total, lote_id, conta_como_ajuste_inventario")
      .order("id").range(de, de + 999);
    if (error) throw new Error("Ajustes de inventário já importados: " + error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function recalcularLote(loteId: number) {
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("atlas_ajustes_inventario_oficial").select("valor_total, conta_como_ajuste_inventario").eq("lote_id", loteId).order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  await sb.from("atlas_lotes_ajuste_inventario").update({ valor_total_ajustes_contados: valorContado(linhas) }).eq("id", loteId);
}

export type ResultadoAjustes = Omit<PlanoAjustes, "novas" | "correcoes"> & { loteId: number | null; aba: string; importadas: number; valorContado: number };

export async function importarAjustesInventario(pl: Planilha, arquivo: string, abaEscolhida: string | null, ctx: Contexto, progresso?: (txt: string) => void): Promise<ResultadoAjustes> {
  const aba = escolherAbaAjustes(pl, abaEscolhida);
  progresso?.("lendo os ajustes já importados…");
  const plano = planejarAjustes(pl.ler(aba), await lerExistentes(), arquivo, ctx.usuario);
  const { novas, correcoes, ...resto } = plano;
  const valor = valorContado(novas);
  let loteId: number | null = null;

  if (novas.length) {
    const { data: lote, error } = await sb.from("atlas_lotes_ajuste_inventario").insert({
      arquivo_origem: arquivo, aba_usada: aba, criado_por: ctx.usuario, criado_em: new Date().toISOString(), total_linhas: plano.total, importadas: novas.length,
      contadas_como_ajuste_inventario: plano.contadas, ignoradas_flag_nao: plano.ignoradasNao, ignoradas_legado_pre_separacao: plano.ignoradasLegado, valor_total_ajustes_contados: valor,
    }).select("id").single();
    if (error) throw new Error("Registrando a importação: " + error.message);
    loteId = lote.id as number;
    try {
      for (let i = 0; i < novas.length; i += 1000) {
        const { error: e } = await sb.from("atlas_ajustes_inventario_oficial").insert(novas.slice(i, i + 1000).map((r) => ({ ...r, lote_id: loteId })));
        if (e) throw new Error(`gravando linhas ${i + 1}–${Math.min(i + 1000, novas.length)}: ${e.message}`);
        progresso?.(`gravando… ${Math.min(i + 1000, novas.length)}/${novas.length}`);
      }
    } catch (e: any) {   // desfaz o que entrou, para não ficar meia importação
      await sb.from("atlas_ajustes_inventario_oficial").delete().eq("lote_id", loteId);
      await sb.from("atlas_lotes_ajuste_inventario").delete().eq("id", loteId);
      throw new Error("Importação cancelada, nada foi gravado — " + (e?.message ?? e));
    }
  }
  if (correcoes.length) {
    progresso?.(`atualizando o custo de ${correcoes.length} lançamento(s)…`);
    for (let i = 0; i < correcoes.length; i += 25) {
      const res = await Promise.all(correcoes.slice(i, i + 25).map((c) => sb.from("atlas_ajustes_inventario_oficial").update({ custo_unitario: c.custo_unitario, valor_total: c.valor_total, arquivo_origem: arquivo }).eq("id", c.id)));
      const falha = res.find((r: any) => r.error);
      if (falha) throw new Error("Atualizando custos corrigidos: " + falha.error.message);
    }
    for (const id of new Set(correcoes.map((c) => c.lote_id).filter((x): x is number => x != null))) await recalcularLote(id);
  }
  await sb.from("atlas_log_auditoria").insert({ username: ctx.usuario, acao: "importar_ajustes_inventario", entidade: "atlas_lotes_ajuste_inventario", entidade_id: loteId == null ? null : String(loteId), detalhes: { arquivo, aba, importadas: novas.length, contadas: plano.contadas, valor, duplicadas: plano.duplicadasArquivo + plano.duplicadasAnteriores, custos_corrigidos: plano.custosCorrigidos }, criado_em: new Date().toISOString() });
  return { ...resto, loteId, aba, importadas: novas.length, valorContado: valor };
}

export async function excluirLoteAjuste(loteId: number): Promise<number> {
  const { count, error } = await sb.from("atlas_ajustes_inventario_oficial").delete({ count: "exact" }).eq("lote_id", loteId);
  if (error) throw new Error(error.message);
  const r = await sb.from("atlas_lotes_ajuste_inventario").delete().eq("id", loteId);
  if (r.error) throw new Error(r.error.message);
  return count ?? 0;
}
