// Cadastro de caixaria (unidades por caixa) e exposição por loja — monta a lista de itens que o módulo mostra.
// Universo: produto ACABADO com meta no consenso (o mesmo da Reposição) + qualquer item que já tenha caixa cadastrada.
import { nk, GRUPO_ACABADO, ehSolto, type Bruto } from "./abastecimento-dados";

export type LinhaCaixaria = {
  chave: string;                      // código sem zeros (identifica o item em qualquer formato)
  id: string;                         // código canônico (como o estoque escreve)
  idCaixaDb: string | null;           // código como está gravado em abast_produto (null = sem caixa cadastrada)
  descricao: string; familia: string; grupo: string;
  caixa: number | null;               // unidades por caixa (null = sem cadastro)
  expo: Record<string, { valor: number | null; idDb: string | null }>;   // por loja
  saldoCD: number;
  noUniverso: boolean;                // false = tem caixa cadastrada, mas não é produto acabado com meta
  solto: boolean;                     // família vendida solta (granéis): não tem padrão de caixa
};

/** Código canônico: o do estoque quando existe; senão, completa com zeros (8 dígitos; 9 viram 10). */
export function idCanonico(sku: string, doEstoque: string | undefined): string {
  if (doEstoque) return doEstoque;
  const s = sku.trim();
  if (!/^\d+$/.test(s)) return s;
  const k = s.replace(/^0+/, "");
  return k.length < 8 ? k.padStart(8, "0") : k.length === 9 ? k.padStart(10, "0") : s;
}

export function montarCaixaria(b: Bruto): LinhaCaixaria[] {
  const est = new Map<string, { canon: string; desc: string; cd: number }>();
  for (const e of b.estoque) {
    const k = nk(e.id_produto);
    const x = est.get(k) ?? { canon: String(e.id_produto), desc: "", cd: 0 };
    if (String(e.id_produto).length > x.canon.length) x.canon = String(e.id_produto);
    if (!x.desc && e.descricao) x.desc = e.descricao;
    if (e.origem === b.cd) x.cd += Number(e.quantidade) || 0;
    est.set(k, x);
  }
  const grupoDe = new Map<string, string>(); for (const g of b.grupos) grupoDe.set(nk(g.codigo_produto), g.grupo);
  const famDe = new Map<string, string>(); for (const f of b.familias) famDe.set(nk(f.codigo_produto), f.familia);
  const caixaDe = new Map<string, { id: string; fc: number | null }>(); for (const p of b.produtos) caixaDe.set(nk(p.id_produto), { id: p.id_produto, fc: p.full_case == null ? null : Number(p.full_case) });
  const expoDe = new Map<string, { valor: number | null; idDb: string }>(); for (const e of b.exposicoes) expoDe.set(`${e.loja}|${nk(e.id_produto)}`, { valor: e.exposicao == null ? null : Number(e.exposicao), idDb: e.id_produto });
  const nomeConsenso = new Map<string, string>();
  const universo = new Set<string>();
  for (const c of b.consenso) {
    const k = nk(c.id_produto);
    if (!nomeConsenso.has(k) && c.produto) nomeConsenso.set(k, c.produto);
    if (Number(c.unidades) > 0 && grupoDe.get(k) === GRUPO_ACABADO) universo.add(k);
  }
  const chaves = new Set<string>([...universo, ...caixaDe.keys()]);
  const linhas: LinhaCaixaria[] = [];
  for (const k of chaves) {
    const e = est.get(k), cx = caixaDe.get(k);
    const expo: LinhaCaixaria["expo"] = {};
    for (const l of b.lojas) { const x = expoDe.get(`${l.codigo}|${k}`); expo[l.codigo] = { valor: x ? x.valor : null, idDb: x ? x.idDb : null }; }
    linhas.push({
      chave: k, id: idCanonico(k, e?.canon), idCaixaDb: cx ? cx.id : null,
      descricao: e?.desc || nomeConsenso.get(k) || "", familia: famDe.get(k) ?? "", grupo: grupoDe.get(k) ?? "",
      caixa: cx ? cx.fc : null, expo, saldoCD: e?.cd ?? 0, noUniverso: universo.has(k), solto: ehSolto(famDe.get(k) ?? ""),
    });
  }
  return linhas.sort((a, c) => a.descricao.localeCompare(c.descricao, "pt-BR", { sensitivity: "base" }) || a.chave.localeCompare(c.chave));
}
