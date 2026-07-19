// Motor de explosão de BOM para o módulo PCP.
// Percorre `ficha_tecnica_bom` recursivamente e retorna a lista consolidada
// de itens necessários (folhas + semiacabados intermediários com gera_oc).
import { supabase } from "@/integrations/supabase/client";

export type BomLinha = {
  id_produto: string;
  id_item: string;
  item: string | null;
  qtd: number;
  tem_filho: boolean | null;
  gera_oc: boolean | null;
  item_unidade: string | null;
};

export type NecessidadeItem = {
  id_item: string;
  item: string | null;
  um: string | null;
  qtd_necessaria: number;
  eh_semiacabado: boolean;
  caminho: { id: string; nome: string | null }[]; // do produto raiz até o item (inclusivo)
};

/** Explode uma BOM a partir de um produto raiz. Consolida por id_item somando quantidades. */
export function explodirBOM(
  idProduto: string,
  qtdPlanejada: number,
  bomRows: BomLinha[],
): NecessidadeItem[] {
  const porProduto = new Map<string, BomLinha[]>();
  for (const r of bomRows) {
    const arr = porProduto.get(r.id_produto) ?? [];
    arr.push(r);
    porProduto.set(r.id_produto, arr);
  }

  const out: NecessidadeItem[] = [];

  function walk(
    idPai: string,
    nomePai: string | null,
    mult: number,
    visitados: Set<string>,
    caminho: { id: string; nome: string | null }[],
  ) {
    if (visitados.has(idPai)) return; // proteção contra ciclo
    const filhos = porProduto.get(idPai);
    if (!filhos || filhos.length === 0) return;
    const next = new Set(visitados); next.add(idPai);
    const pathHere = [...caminho, { id: idPai, nome: nomePai }];
    for (const f of filhos) {
      const qtdTotal = (f.qtd || 0) * mult;
      const temFilho = !!f.tem_filho;
      const geraOc = !!f.gera_oc;
      const ehFolha = !temFilho;
      const ehSemi = temFilho && geraOc;

      if (ehFolha) {
        out.push({
          id_item: f.id_item,
          item: f.item,
          um: f.item_unidade,
          qtd_necessaria: qtdTotal,
          eh_semiacabado: false,
          caminho: [...pathHere, { id: f.id_item, nome: f.item }],
        });
      } else if (ehSemi) {
        out.push({
          id_item: f.id_item,
          item: f.item,
          um: f.item_unidade,
          qtd_necessaria: qtdTotal,
          eh_semiacabado: true,
          caminho: [...pathHere, { id: f.id_item, nome: f.item }],
        });
      }
      if (temFilho) walk(f.id_item, f.item, qtdTotal, next, pathHere);
    }
  }

  walk(idProduto, null, qtdPlanejada, new Set(), []);
  return out;
}

/** Carrega todas as linhas de BOM alcançáveis a partir do produto (busca ampla). */
export async function carregarBomCompleta(): Promise<BomLinha[]> {
  const all: BomLinha[] = [];
  let from = 0;
  const size = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("ficha_tecnica_bom" as any)
      .select("id_produto,id_item,item,qtd,tem_filho,gera_oc,item_unidade")
      .range(from, from + size - 1);
    if (error) throw error;
    const rows = (data as unknown as BomLinha[]) ?? [];
    all.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return all;
}

/** Gera um número de OP curto baseado em timestamp. */
export function gerarNumeroOP(): string {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `OP${y}${m}${dd}-${rnd}`;
}
