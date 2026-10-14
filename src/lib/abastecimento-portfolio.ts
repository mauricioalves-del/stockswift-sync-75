import { pickCI } from "@/lib/xlsx-utils";

export const CLASSES_PORTFOLIO = { LINHA: "Linha", MTO: "MTO", INOVACAO: "Inovação", DECOMPLEX: "Decomplex" } as const;
export type ClassePortfolio = keyof typeof CLASSES_PORTFOLIO;
export type ClassificacaoPortfolio = { id: string; sku: string; descricao: string; classe: ClassePortfolio; vigencia: string; inicio_inovacao: string | null; registrado_em: string; autor_id: string; classe_anterior: string | null; arquivo: string | null };
export type ProdutoPortfolio = { sku: string; descricao: string };
export type PreviaPortfolio = { linha: number; sku: string; descricao: string; classe: ClassePortfolio | null; vigencia: string; inicio_inovacao: string; versao_anterior: string; anterior: string; erros: string[] };
export const chaveSkuPortfolio = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
export function normalizarClassePortfolio(v: string): ClassePortfolio | null {
  const n = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  if (n === "REGULAR" || n === "LINHA") return "LINHA";
  if (n === "DECONPLEX" || n === "DECOMPLEX") return "DECOMPLEX";
  return n === "MTO" || n === "INOVACAO" ? n : null;
}
export function elegivelPortfolio(classe: ClassePortfolio, inicio: string | null, data: string): boolean {
  if (classe === "LINHA") return true;
  if (classe !== "INOVACAO" || !inicio) return false;
  const [a, m, d] = inicio.split("-").map(Number);
  const fimMes = new Date(Date.UTC(a, m + 3, 0)).getUTCDate();
  const fim = new Date(Date.UTC(a, m - 1 + 3, Math.min(d, fimMes))).toISOString().slice(0, 10);
  return data >= fim;
}
export function ultimasClassificacoes(rows: ClassificacaoPortfolio[]): Map<string, ClassificacaoPortfolio> {
  const m = new Map<string, ClassificacaoPortfolio>();
  for (const r of [...rows].sort((a,b) => b.vigencia.localeCompare(a.vigencia) || b.registrado_em.localeCompare(a.registrado_em))) if (!m.has(r.sku)) m.set(r.sku,r);
  return m;
}
const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
export function prepararPortfolio(rows: Record<string, unknown>[], produtos: ProdutoPortfolio[], historico: ClassificacaoPortfolio[], vigencia: string, hoje: string): PreviaPortfolio[] {
  const conhecidos = new Map(produtos.map(p => [chaveSkuPortfolio(p.sku),p]));
  const atual = ultimasClassificacoes(historico); const vistos = new Set<string>();
  return rows.map((r,i) => {
    const sku = chaveSkuPortfolio(pickCI(r,"SKU Sistema","SKU","Código"));
    const produto = conhecidos.get(sku); const anterior = atual.get(sku);
    const classe = normalizarClassePortfolio(pickCI(r,"Cluster","Classificação","Classe"));
    const descricao = pickCI(r,"Produto","Descrição","Descricao") || produto?.descricao || "";
    const inicio = pickCI(r,"Início Inovação","Inicio Inovacao","inicio_inovacao");
    const de = pickCI(r,"Vigência","Vigencia") || vigencia; const erros: string[] = [];
    if (!/^\d+$/.test(sku)) erros.push("SKU inválido");
    if (!produto) erros.push("SKU não encontrado no cadastro");
    if (vistos.has(sku)) erros.push("SKU duplicado"); vistos.add(sku);
    if (!classe) erros.push("Classe inválida");
    if (!descricao) erros.push("Produto sem descrição");
    if (!dataValida(de) || de < hoje) erros.push("Vigência inválida ou anterior a hoje");
    if (classe === "INOVACAO" && (!dataValida(inicio) || inicio > de)) erros.push("Informe início da Inovação válido, até a vigência");
    return { linha:i+2, sku:produto?.sku ?? sku, descricao, classe, vigencia:de, inicio_inovacao:inicio, versao_anterior:anterior?.id ?? "", anterior:anterior ? CLASSES_PORTFOLIO[anterior.classe] : "Sem classificação", erros };
  });
}