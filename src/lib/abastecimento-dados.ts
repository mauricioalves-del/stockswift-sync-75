// Camada de dados do módulo de Abastecimento v2 — monta, por loja, os itens de reposição a partir de:
//   faturamento carregado (historico_consumo por almoxarifado da loja) → CMD; consenso → meta mensal; estoque de lote ao vivo;
//   notas em trânsito + pedidos em aberto (sem duplicar pedido); cadastro de grupo/família; exposição e caixa. A sazonalidade vem só do consenso (malha linear × realização).
// Universo: produto ACABADO com meta no consenso para a loja (embalagem, em processo, local e revenda ficam de fora).
import { calcularItem2, alocarCD, PARAM2_PADRAO, type Item2, type Base2, type Param2 } from "./abastecimento-motor2";
import { resolverParam, type CoberturaRegra } from "./abastecimento-cobertura";
import { cmdPonderado, acompanhamentoMeta, type AcompMeta, type Denominador } from "./abastecimento-demanda";
import { consensoMedioNaJanela } from "./abastecimento-consenso";
import type { PeriodoSazonal } from "./sazonalidade";
import { fatorRealizacao } from "./abastecimento-realizacao";
import type { ClassePortfolio } from "./abastecimento-portfolio";
import { chaveSaldoBaixa, somarBaixasEmAberto, saldoLiquidoBaixas, type BaixaReposicao } from "./abastecimento-baixas";

export const nk = (s: unknown): string => String(s ?? "").trim().replace(/^0+/, "");
export const GRUPO_ACABADO = "Produto Acabado";
/** Famílias vendidas soltas, sem padrão de caixaria: pedido por consumo médio × cobertura (sem arredondar em caixa e sem aviso "sem caixa"). */
export const FAMILIAS_SEM_CAIXA = ["graneis"];
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const ehSolto = (familia: string) => FAMILIAS_SEM_CAIXA.includes(semAcento(familia));
/** Lojas abastecidas em quantidade fracionada: o pedido repõe até o ideal pela unidade, sem arredondar em caixa fechada. As demais seguem a caixaria. */
export const LOJAS_SEM_CAIXA = ["JESUINO"];
export const lojaSemCaixa = (loja: string | null | undefined) => LOJAS_SEM_CAIXA.includes(String(loja ?? "").toUpperCase());

export type Bruto = {
  lojas: { codigo: string; nome: string; almoxarifado: string }[];
  cd: string;
  params: Param2;
  coberturas?: CoberturaRegra[];          // regras de cobertura por loja/família (precedência: família > loja > padrão)
  consenso: { loja: string; id_produto: string; mes: string; unidades: number; tipo?: string | null; produto?: string | null; linha?: string | null }[];
  grupos: { grupo: string; codigo_produto: string }[];
  familias: { codigo_produto: string; familia: string }[];
  abc: { codigo_produto: string; classe: string }[];
  periodos: PeriodoSazonal[];
  consumo: { origem: string; sku: string; data_movimento: string; quantidade: number }[];
  estoque: { id_produto: string; descricao?: string | null; origem: string; quantidade: number; custo_unitario?: number | null }[];
  baixas?: BaixaReposicao[];
  notas: { cod_prod: string; almox: string; qtd: number; dt?: string | null; nf?: string | null; vt?: number; empresa?: string | null }[];
  pedidosAbertos: { loja: string; id_produto: string; qtd: number; status: string; separada?: number }[];
  produtos: { id_produto: string; full_case: number | null }[];
  exposicoes: { loja: string; id_produto: string; exposicao: number | null; ativo_sortimento?: boolean | null }[];
  /** Regra de exposição de cada loja: unidades em exposição por SKU quando o SKU não tem exposição própria cadastrada. */
  expoPadrao?: Record<string, number>;
  /** SKUs (sem zeros à esquerda) do último portfólio validado pelo gestor, por loja. Quando existe, substitui o universo da loja. */
  portfolioAprovado?: Record<string, string[]>;
  portfolioClasses?: Record<string, Record<string, ClassePortfolio>>;
  /** Descrição do produto conforme o portfólio aprovado/classificado (SKU sem zeros à esquerda). */
  portfolioDescricoes?: Record<string, string>;
  portfolioOrigem?: Record<string, { competencia: string; versao: number; aprovador: string }>;
};

export type ItemRep = Item2 & {
  estoqueBruto: number; baixasPendentes: number; baixasCD: number;
  loja: string; grupo: string; familia: string; linha: string; tipo: string;
  cmd: number; tendencia: number; consensoDia: number | null; metaMes: number; realizadoMes: number; acomp: AcompMeta; refVendas: string | null; semExposicao: boolean; exposicaoOrigem: "sku" | "loja" | null; semCaixa: boolean; caixaCadastrada: boolean; solto: boolean; cdBruto: number; reservadoCD: number; param: Param2; paramOrigem: string;
};

export type Montagem = {
  itens: Record<string, ItemRep[]>;
  refPorLoja: Record<string, string | null>;
  excluidos: { semGrupo: number; naoAcabado: number };
  semFamilia: { loja: string; sku: string; descricao: string; linha: string }[];
};

export const destinoNota = (s: string): string | null => {
  const t = s.toLowerCase();
  return t.includes("eldorado") ? "ELDORADO" : t.includes("patio") || t.includes("paulista") ? "PATIO" : t.includes("itaim") || t.includes("sp_loja") ? "JESUINO" : t.includes("fabrica") ? "CD" : null;
};

export const GRUPO_REVENDA = "Mercadoria de Revenda";
const META_VAZIA = { porMes: {} as Record<string, number>, tipo: "", produto: "", linha: "" };
/** universo "meta" (padrão): produto acabado com meta no consenso (Reposição). "sortimento": sortimento ativo (abast_produto_loja.ativo_sortimento) de produto acabado + mercadoria de revenda (Dashboard de Disponibilidade). */
/** DE-PARA de saldo: produto acabado (chave normalizada) cujo saldo é o saldo oficial do produto local. */
export const ALMOX_PROCESSO = "Alm_SP_Processo";
export const SALDO_DE_PARA: Record<string, string> = { "5104132": "05304043" };

export function montarItens(b: Bruto, o: { base: Base2; denominador: Denominador; hojeIso: string; manuais?: Record<string, number | null>; universo?: "meta" | "sortimento"; considerarBaixas?: boolean }): Montagem {
  const pendentes = o.considerarBaixas ? b.baixas ?? [] : [];
  const baixas = somarBaixasEmAberto(pendentes, (sku) => SALDO_DE_PARA[nk(sku)] ?? sku);
  const baixasCd = somarBaixasEmAberto(pendentes.filter((baixa) => baixa.id_local === (SALDO_DE_PARA[nk(baixa.codigo_produto)] ? ALMOX_PROCESSO : b.cd)).map((baixa) => ({ ...baixa, id_local: b.cd })), (sku) => SALDO_DE_PARA[nk(sku)] ?? sku);
  const grupoDe = new Map<string, string>(); for (const g of b.grupos) grupoDe.set(nk(g.codigo_produto), g.grupo);
  const famDe = new Map<string, string>(); for (const f of b.familias) famDe.set(nk(f.codigo_produto), f.familia);
  const abcDe = new Map<string, string>(); for (const a of b.abc) abcDe.set(nk(a.codigo_produto), a.classe);
  const fcDe = new Map<string, number>(); for (const p of b.produtos) fcDe.set(nk(p.id_produto), Number(p.full_case) || 1);
  const expoDe = new Map<string, number | null>(); for (const e of b.exposicoes) expoDe.set(`${e.loja}|${nk(e.id_produto)}`, e.exposicao == null ? null : Number(e.exposicao));
  const sortimento = new Set<string>(); for (const e of b.exposicoes) if (e.ativo_sortimento) sortimento.add(`${e.loja}|${nk(e.id_produto)}`);
  const almoxDe = new Map(b.lojas.map((l) => [l.codigo, l.almoxarifado])); const lojaDoAlmox = new Map(b.lojas.map((l) => [l.almoxarifado, l.codigo]));

  // estoque ao vivo
  const est = new Map<string, { lojas: Record<string, number>; cd: number; desc: string; custo: number; canon: string }>();
  // Produtos locais que consomem o saldo de um produto acabado: o saldo do acabado vira o saldo oficial do local.
  for (const e of b.estoque) {
    const q = Number(e.quantidade) || 0;
    const alvo = SALDO_DE_PARA[nk(e.id_produto)];
    const id = alvo ?? String(e.id_produto);
    const k = nk(id);
    const x = est.get(k) ?? { lojas: {}, cd: 0, desc: "", custo: 0, canon: id };
    // Produto local do DE-PARA: o saldo "do CD" é sempre o do almoxarifado de Processo (fica na produção, nunca no CD).
    const deProcesso = !!alvo;
    if (deProcesso ? e.origem === ALMOX_PROCESSO : e.origem === b.cd) x.cd += q;
    else if (deProcesso && e.origem === b.cd) { /* ignorado: saldo oficial vem do Processo */ } else { const l = lojaDoAlmox.get(e.origem); if (l) x.lojas[l] = (x.lojas[l] ?? 0) + q; }
    if (!alvo && !x.desc && e.descricao) x.desc = e.descricao;
    if (!x.custo && Number(e.custo_unitario) > 0) x.custo = Number(e.custo_unitario);
    if (id.length > x.canon.length) x.canon = id;
    est.set(k, x);
  }
  // trânsito (notas) e pedidos em aberto
  const transito = new Map<string, number>(); for (const n of b.notas) { const d = destinoNota(String(n.almox ?? "")); if (d && d !== "CD") { const k = `${d}|${nk(n.cod_prod)}`; transito.set(k, (transito.get(k) ?? 0) + (Number(n.qtd) || 0)); } }
  const pedAb = new Map<string, number>(); for (const p of b.pedidosAbertos) { const k = `${p.loja}|${nk(p.id_produto)}`; pedAb.set(k, (pedAb.get(k) ?? 0) + (Number(p.qtd) || 0)); }
  // Reservam saldo do CD os pedidos ABERTO e EM_SEPARACAO, só pelo que ainda NÃO foi separado: a separação (tela Requisições) já baixa o estoque do CD.
  // SEPARADO e ENVIADO já saíram do estoque do CD, então não reservam.
  const reservado = new Map<string, number>(); for (const p of b.pedidosAbertos) if (p.status === "ABERTO" || p.status === "EM_SEPARACAO") { const k = nk(p.id_produto); reservado.set(k, (reservado.get(k) ?? 0) + Math.max(0, (Number(p.qtd) || 0) - (Number(p.separada) || 0))); }
  // vendas por loja e SKU (por dia) e referência = último dia faturado de cada loja
  const vendas = new Map<string, Map<string, number>>(); const refPorLoja: Record<string, string | null> = {}; const inicioPorLoja: Record<string, string | null> = {}; for (const l of b.lojas) { refPorLoja[l.codigo] = null; inicioPorLoja[l.codigo] = null; }
  // Mesmo SKU escrito de dois jeitos (com e sem zero à esquerda) no mesmo dia é a MESMA venda: vale o maior valor, nunca a soma.
  const porFormato = new Map<string, Map<string, number>>();
  for (const c of b.consumo) {
    const loja = lojaDoAlmox.get(c.origem); if (!loja) continue;
    const dia = String(c.data_movimento).slice(0, 10);
    if (!refPorLoja[loja] || dia > (refPorLoja[loja] as string)) refPorLoja[loja] = dia;
    if (!inicioPorLoja[loja] || dia < (inicioPorLoja[loja] as string)) inicioPorLoja[loja] = dia;
    const k = `${loja}|${nk(c.sku)}|${dia}`; const f = porFormato.get(k) ?? new Map<string, number>();
    f.set(String(c.sku), (f.get(String(c.sku)) ?? 0) + (Number(c.quantidade) || 0)); porFormato.set(k, f);
  }
  for (const [k, f] of porFormato) {
    const i = k.lastIndexOf("|"); const dia = k.slice(i + 1), chave = k.slice(0, i);
    const m = vendas.get(chave) ?? new Map<string, number>(); m.set(dia, Math.max(...f.values())); vendas.set(chave, m);
  }
  // meta por loja e SKU
  const metas = new Map<string, { porMes: Record<string, number>; tipo: string; produto: string; linha: string }>();
  for (const c of b.consenso) { const k = `${c.loja}|${nk(c.id_produto)}`; const m = metas.get(k) ?? { porMes: {}, tipo: c.tipo ?? "", produto: c.produto ?? "", linha: c.linha ?? "" }; m.porMes[c.mes] = (m.porMes[c.mes] ?? 0) + (Number(c.unidades) || 0); if (!m.linha && c.linha) m.linha = c.linha; metas.set(k, m); }

  const itens: Record<string, ItemRep[]> = {}; const ex = { semGrupo: 0, naoAcabado: 0 }; const semFamilia: Montagem["semFamilia"] = [];
  const mesAtual = o.hojeIso.slice(0, 7);
  for (const l of b.lojas) {
    const lista: ItemRep[] = [];
    const porSortimento = o.universo === "sortimento";
    const aprovado = b.portfolioAprovado?.[l.codigo];   // último portfólio aprovado (validado ou herdado); sem aprovação = lista operacional padrão
    const chaves: [string, typeof META_VAZIA][] = aprovado
      ? aprovado.map((sku) => { const k = `${l.codigo}|${nk(sku)}`; return [k, metas.get(k) ?? META_VAZIA] as [string, typeof META_VAZIA]; })
      : porSortimento
      ? [...sortimento].filter((k) => k.startsWith(l.codigo + "|")).map((k) => [k, metas.get(k) ?? META_VAZIA] as [string, typeof META_VAZIA])
      : [...metas].filter(([k]) => k.startsWith(l.codigo + "|"));
    for (const [k, m] of chaves) {
      if (!aprovado && !porSortimento && !Object.values(m.porMes).some((v) => v > 0)) continue;       // só o que o consenso estima para vendas
      const sku = k.slice(l.codigo.length + 1);
      const grupo = grupoDe.get(sku) ?? "";
      if (!grupo && !aprovado) { ex.semGrupo++; continue; }
      if (!aprovado && grupo !== GRUPO_ACABADO && !(porSortimento && grupo === GRUPO_REVENDA)) { ex.naoAcabado++; continue; }      // embalagem, em processo, local, revenda (fora do sortimento)...
      const familia = famDe.get(sku) ?? "";
      const solto = ehSolto(familia);
      const fracionada = lojaSemCaixa(l.codigo);   // Jesuíno: sem caixa fechada no pedido
      const rp = resolverParam(b.params, b.coberturas ?? [], l.codigo, familia);   // cobertura em dias deste item (padrão / loja / família)
      const e = est.get(sku);
      const ref = refPorLoja[l.codigo] ?? o.hojeIso;
      const r = cmdPonderado(vendas.get(k) ?? new Map(), ref, { denominador: o.denominador, inicioHistorico: inicioPorLoja[l.codigo] });
      const fr = fatorRealizacao(vendas.get(k) ?? new Map<string, number>(), m.porMes, ref, { inicioHistorico: inicioPorLoja[l.codigo], piso: 0.25, teto: 2 });   // venda real ÷ malha do consenso (sem índice sazonal)
      const cons = consensoMedioNaJanela(m.porMes, o.hojeIso, Math.max(1, rp.p.diasIdeal));
      // Exposição: cadastro do SKU na loja (exceção) > regra da loja > sem exposição
      const expoSku = expoDe.get(`${l.codigo}|${sku}`) ?? null;
      const expoRegra = b.expoPadrao?.[l.codigo] ?? null;
      const expo = expoSku ?? expoRegra;
      const mesAt = m.porMes[mesAtual] ?? 0;
      let realizado = 0; const vm = vendas.get(k); if (vm) for (const [d, q] of vm) if (d.startsWith(mesAtual) && d <= ref) realizado += q;
      const manual = o.manuais?.[`${l.codigo}|${sku}`];
      // Sem registro de estoque o código vem sem zeros (consenso): completa pelo padrão (8 dígitos; 9 viram 10).
      const idCanon = e?.canon ?? (sku.length < 8 ? sku.padStart(8, "0") : sku.length === 9 ? sku.padStart(10, "0") : sku);
      const estoqueBruto = e?.lojas[l.codigo] ?? 0;
      const baixasPendentes = baixas.get(chaveSaldoBaixa(sku, l.almoxarifado)) ?? 0;
      const baixasCD = baixasCd.get(chaveSaldoBaixa(sku, b.cd)) ?? 0;
      const it = calcularItem2({
        sku: idCanon, descricao: b.portfolioDescricoes?.[sku] || e?.desc || m.produto || idCanon, categoria: familia, ativo: true, masterPresente: true,
        estoque: saldoLiquidoBaixas(estoqueBruto, baixasPendentes), exposicao: expo ?? 0, vendaDiaReal: r.cmd, consensoDia: cons, fatorRealizacao: fr ? fr.fator : null,
        classeAbc: abcDe.get(sku) ?? null, fullCase: fracionada ? 1 : fcDe.get(sku) ?? 1, custo: e?.custo ?? null, saldoCD: saldoLiquidoBaixas(e?.cd ?? 0, baixasCD),
        emTransito: transito.get(`${l.codigo}|${sku}`) ?? 0, pedidoAberto: pedAb.get(`${l.codigo}|${sku}`) ?? 0, pedidoManual: manual ?? null,
      }, rp.p, o.base);
      if (!familia) semFamilia.push({ loja: l.codigo, sku: it.sku, descricao: it.descricao, linha: m.linha || m.tipo });
      lista.push({ ...it, estoqueBruto, baixasPendentes, baixasCD, loja: l.codigo, grupo, familia, linha: m.linha, tipo: m.tipo, cmd: r.cmd, tendencia: r.tendencia, consensoDia: cons, metaMes: mesAt, realizadoMes: realizado,
        acomp: acompanhamentoMeta(mesAt, realizado, ref), refVendas: refPorLoja[l.codigo], semExposicao: expo == null, exposicaoOrigem: expoSku != null ? "sku" : expoRegra != null ? "loja" : null, semCaixa: !fcDe.has(sku) && !solto && !fracionada, caixaCadastrada: fcDe.has(sku), solto, cdBruto: e?.cd ?? 0, reservadoCD: reservado.get(sku) ?? 0, param: rp.p, paramOrigem: rp.origem });
    }
    itens[l.codigo] = lista;
  }
  // limite pelo saldo do CD, entre todas as lojas
  const cdPorSku = new Map<string, number>(); for (const [k, v] of est) cdPorSku.set(v.canon, Math.max(0, v.cd - (baixasCd.get(chaveSaldoBaixa(k, b.cd)) ?? 0) - (reservado.get(k) ?? 0)));
  alocarCD(Object.values(itens).flat(), cdPorSku);
  return { itens, refPorLoja, excluidos: ex, semFamilia };
}
export { PARAM2_PADRAO };
