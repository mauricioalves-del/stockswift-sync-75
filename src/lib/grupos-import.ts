// Importação/cadastro de grupos de produto (tabela grupo_produtos).
// A planilha "Cadastro de Produto" do sistema traz "Cód. Produto" e "Grupo";
// alguns códigos vêm com o marcador de texto do Excel ("&apos;00104007").
import { pickCI } from "@/lib/xlsx-utils";

export const chaveCodigo = (s: string) => String(s ?? "").trim().replace(/^0+/, "");

/** Remove marcadores de texto do Excel (&apos; / ') e espaços. */
export function limparCodigo(v: unknown): string {
  return String(v ?? "")
    .replace(/&apos;|&#39;/gi, "")
    .replace(/^'+/, "")
    .trim();
}

export interface LinhaGrupo { codigo: string; grupo: string; linha: number }

const COLS_CODIGO = ["Cód. Produto", "Cod. Produto", "Cód Produto", "Código Produto", "Codigo Produto", "Codigo_Produto", "codigo_produto", "Código", "Id_Produto"];

export function lerPlanilhaGrupos(rows: Record<string, unknown>[], primeiraLinha = 2) {
  const erros: string[] = [];
  const semGrupo: number[] = [];
  const escolhidas = new Map<string, { l: LinhaGrupo; prio: number }>();
  let repetidos = 0;
  rows.forEach((r, i) => {
    const linha = i + primeiraLinha;
    const bruto = pickCI(r, ...COLS_CODIGO);
    const codigo = limparCodigo(bruto);
    const grupo = pickCI(r, "Grupo").replace(/\s+/g, " ").trim();
    if (!codigo) { if (grupo) erros.push(`Linha ${linha}: Cód. Produto vazio`); return; }
    if (!grupo) { semGrupo.push(linha); return; }
    const ativo = pickCI(r, "Ativo").toLowerCase();
    // Preferência em código repetido: cadastro ativo > código sem marcador de texto > linha mais abaixo.
    const prio = (ativo === "sim" ? 2 : 0) + (/&apos;|&#39;|^'/i.test(bruto) ? 0 : 1);
    const k = chaveCodigo(codigo);
    const atual = escolhidas.get(k);
    if (atual) repetidos++;
    if (!atual || prio >= atual.prio) escolhidas.set(k, { l: { codigo, grupo, linha }, prio });
  });
  return { linhas: [...escolhidas.values()].map((e) => e.l), erros, semGrupo, repetidos };
}

export type StatusGrupo = "novo" | "alterado" | "igual";
export interface ItemPlano { codigo: string; grupo: string; grupoAtual: string | null; status: StatusGrupo }

/**
 * Compara com o cadastro atual pelo código sem zeros à esquerda. Código já
 * cadastrado (em qualquer formato) é atualizado no próprio registro, sem criar duplicado.
 */
export function planejarGrupos(
  linhas: { codigo: string; grupo: string }[],
  existentes: { codigo_produto: string; grupo: string }[],
) {
  const porChave = new Map<string, { codigo_produto: string; grupo: string }[]>();
  for (const e of existentes) {
    const k = chaveCodigo(e.codigo_produto);
    porChave.set(k, [...(porChave.get(k) ?? []), e]);
  }
  const itens: ItemPlano[] = [];
  const gravar = new Map<string, { codigo_produto: string; grupo: string }>();
  for (const l of linhas) {
    const atuais = porChave.get(chaveCodigo(l.codigo)) ?? [];
    if (!atuais.length) {
      itens.push({ codigo: l.codigo, grupo: l.grupo, grupoAtual: null, status: "novo" });
      gravar.set(l.codigo, { codigo_produto: l.codigo, grupo: l.grupo });
      continue;
    }
    const mudou = atuais.some((a) => a.grupo !== l.grupo);
    itens.push({ codigo: atuais[0]!.codigo_produto, grupo: l.grupo, grupoAtual: atuais[0]!.grupo, status: mudou ? "alterado" : "igual" });
    if (mudou) for (const a of atuais) gravar.set(a.codigo_produto, { codigo_produto: a.codigo_produto, grupo: l.grupo });
  }
  return {
    itens,
    gravar: [...gravar.values()],
    novos: itens.filter((i) => i.status === "novo").length,
    alterados: itens.filter((i) => i.status === "alterado").length,
    iguais: itens.filter((i) => i.status === "igual").length,
  };
}
