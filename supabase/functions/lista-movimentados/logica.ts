// Lista diária de Movimentados (contagem): mesma lógica das planilhas "Movimentação - Geral/Processo/Qualidade/Pará"
// (Power Query sobre a movimentação do ERP + saldo). Aqui a movimentação vem da planilha do ERP importada no
// Farol de Movimentados (movimentacoes_erp) e o saldo vem do estoque atual do sistema (estoque_sistemico).
//
// Regras (consultas Movimentados / Transf Saíde / Saída / Entrada / Entradas / Saídas):
//  * Só movimentos do dia.
//  * Transferência ("Origem --> Destino"): entrada no almox de destino e saída no almox de origem.
//  * Saída no próprio almox: Baixar Estoque (todas as variações), Baixa Estoque PDV ATIVACAO, Estorna Recebto,
//    Processo Producao Estorno, Estorna Producao (Para).
//  * Entrada no próprio almox: Entrada Recebto, Entrada Recebto (Para), Processo Producao, Entrada Producao (Para).
//  * Linhas repetidas (SKU + documento + movimento) contam uma vez.
//  * Uma linha por SKU movimentado no almox, com Grupo, Unid. (vazia = PC), Sistema (saldo atual; vazio = 0),
//    soma de Entradas e de Saídas do dia.
//  * Processo: descarta o SKU que entrou e saiu na mesma quantidade e está com saldo zero.
//  Diferença proposital: nas planilhas do Processo, Qualidade e Pará a coluna Saídas soma todos os movimentos do dia
//  (inclusive entradas) por falta do filtro de tipo; aqui Saídas soma só saídas em todas as listas, como na Geral.

export type AlmoxLista = "GERAL" | "PROCESSO" | "QUALIDADE" | "PARA";
export const LISTAS: { id: AlmoxLista; arquivo: string; saldo: string }[] = [
  { id: "GERAL", arquivo: "Geral", saldo: "Alm_SP_Fabrica" },
  { id: "PROCESSO", arquivo: "Processo", saldo: "Alm_SP_Processo" },
  { id: "QUALIDADE", arquivo: "Qualidade", saldo: "Alm_SP_Qualidade" },
  { id: "PARA", arquivo: "Pará", saldo: "Alm_Para" },
];

export type MovErp = { data: string; desc_almox: string; id_produto: string; descricao: string | null; doc: string | null; desc_movimento: string | null; qtd: number };
export type Saldo = { id_produto: string; almox: string; quantidade: number; unidade: string | null; custo: number | null };
export type LinhaLista = { grupo: string; data: string; sku: string; descricao: string; unid: string; sistema: number; entrada: number; saidas: number | null; custo: number | null };

const norm = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const chave = (s: string) => String(s ?? "").trim().replace(/^0+/, "");

/** Nome de almoxarifado (do ERP ou de um lado da transferência) → lista. */
export function almoxDaLista(nome: string | null | undefined): AlmoxLista | null {
  const s = norm(nome).replace(/[^A-Z0-9]+/g, " ");
  if (!s) return null;
  if (/PROCESSO/.test(s)) return "PROCESSO";
  if (/QUALIDADE/.test(s)) return /PARA\b/.test(s) && !/SP\b/.test(s) ? null : "QUALIDADE";
  if (/FABRICA|FRABICA/.test(s)) return "GERAL";
  if (/\bPARA\b/.test(s)) return "PARA";
  return null;
}

const SAIDAS = ["BAIXA ESTOQUE PDV ATIVACAO", "BAIXAR ESTOQUE", "BAIXAR ESTOQUE (DEGUSTACAO)", "BAIXAR ESTOQUE (SP LOJA)",
  "BAIXAR ESTOQUE - PDV PATIO PAULISTA", "ESTORNA RECEBTO", "PROCESSO PRODUCAO ESTORNO", "ESTORNA PRODUCAO (PARA)"];
const ENTRADAS = ["ENTRADA RECEBTO", "ENTRADA RECEBTO (PARA)", "PROCESSO PRODUCAO", "ENTRADA PRODUCAO (PARA)"];

/** Origem e destino de uma transferência ("Fabrica SP --> Processo", "Loja SP -> Fabrica SP"); null se não for. */
export function transferencia(desc: string | null | undefined): { origem: string; destino: string } | null {
  const t = String(desc ?? "");
  const m = t.match(/^(.*?)\s*-+>\s*(.*)$/);
  return m ? { origem: m[1].trim(), destino: m[2].trim() } : null;
}

type Mov = { almox: AlmoxLista; sku: string; descricao: string; tipo: "E" | "S"; qtd: number };

/** Movimentos do dia classificados por almox (entrada/saída), sem repetições de SKU + documento + movimento. */
export function classificar(linhas: MovErp[], dia: string): Mov[] {
  const out: Mov[] = []; const vistos = new Set<string>();
  for (const l of linhas) {
    if (String(l.data).slice(0, 10) !== dia) continue;
    const sku = String(l.id_produto ?? "").trim(); if (!sku) continue;
    const desc = norm(l.desc_movimento); const qtd = Math.abs(Number(l.qtd) || 0);
    const k = `${sku}|${l.doc ?? ""}|${desc}`;
    if (vistos.has(k)) continue; vistos.add(k);
    const base = { sku, descricao: String(l.descricao ?? "") };
    const tr = transferencia(l.desc_movimento);
    if (tr) {
      const o = almoxDaLista(tr.origem), d = almoxDaLista(tr.destino);
      if (d) out.push({ ...base, almox: d, tipo: "E", qtd });
      if (o) out.push({ ...base, almox: o, tipo: "S", qtd });
      continue;
    }
    const a = almoxDaLista(l.desc_almox); if (!a) continue;
    if (SAIDAS.includes(desc)) out.push({ ...base, almox: a, tipo: "S", qtd });
    else if (ENTRADAS.includes(desc)) {
      out.push({ ...base, almox: a, tipo: "E", qtd });
    }
  }
  return out;
}

/** Monta a lista de contagem de um almox para o dia. */
export function montarLista(almox: AlmoxLista, dia: string, linhas: MovErp[], saldos: Saldo[], grupos: Map<string, string>): LinhaLista[] {
  const cfg = LISTAS.find((l) => l.id === almox)!;
  const movs = classificar(linhas, dia).filter((m) => m.almox === almox);
  const saldo = new Map<string, { q: number; un: string | null; custo: number | null }>();
  for (const s of saldos) {
    if (s.almox !== cfg.saldo) continue;
    const k = chave(s.id_produto); const o = saldo.get(k) ?? { q: 0, un: null, custo: null };
    o.q += Number(s.quantidade) || 0; o.un = o.un ?? s.unidade; o.custo = o.custo ?? s.custo; saldo.set(k, o);
  }
  const porSku = new Map<string, LinhaLista>();
  for (const m of movs) {
    const k = chave(m.sku);
    const l = porSku.get(k) ?? (() => {
      const s = saldo.get(k);
      return { grupo: grupos.get(k) ?? "", data: dia, sku: m.sku, descricao: m.descricao, unid: s?.un || "PC", sistema: s?.q ?? 0, entrada: 0, saidas: null, custo: s?.custo ?? null };
    })();
    if (m.tipo === "E") l.entrada += m.qtd; else l.saidas = (l.saidas ?? 0) + m.qtd;
    porSku.set(k, l);
  }
  let out = [...porSku.values()].map((l) => ({ ...l, sistema: arred(l.sistema), entrada: arred(l.entrada), saidas: l.saidas === null ? null : arred(l.saidas) }));
  if (almox === "PROCESSO") out = out.filter((l) => !(l.entrada === (l.saidas ?? 0) && l.sistema === 0));
  return out.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.sku.localeCompare(b.sku));
}
const arred = (n: number) => Math.round(n * 10000) / 10000;

/** Nome do arquivo, como hoje: "Movimentação - Geral 05.11.xlsx". */
export const nomeArquivo = (almox: AlmoxLista, dia: string) => `Movimentação - ${LISTAS.find((l) => l.id === almox)!.arquivo} ${dia.slice(8, 10)}.${dia.slice(5, 7)}.xlsx`;

/** Linhas da aba "Movimentados" no layout das planilhas (Teste e Dif como fórmulas; custo em coluna oculta). */
export function planilha(linhas: LinhaLista[]): { cabecalho: string[]; linhas: (string | number | null | { f: string })[][] } {
  const cabecalho = ["Grupo", "Data", "Id_Produto", "descricao", "Unid.", "Sistema", "Entrada", "Saídas", "Contagem", "Teste", "Dif", "Obs", "Prejuízo", "Custo"];
  return {
    cabecalho,
    linhas: linhas.map((l, i) => {
      const r = i + 2;
      return [l.grupo, l.data, l.sku, l.descricao, l.unid, l.sistema, l.entrada, l.saidas, null,
        { f: `IF(I${r}="","",I${r}=F${r})` }, { f: `IFERROR(IF(I${r}="","",(F${r}-I${r})*N${r}),0)` }, null, null, l.custo ?? 0];
    }),
  };
}
