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

// ============================================================================
// NOVO MOTOR — Explosão com netting por nível (ver ANÁLISE DE RUPTURA)
// ============================================================================
// Regra: antes de quebrar um subconjunto na sua própria composição, verificar
// o saldo desse subconjunto nos almoxarifados de produção. Se o saldo cobrir
// a necessidade, PARA — não desdobra. Se cobrir parcialmente, só a diferença
// (falta) é explodida em componentes. Isso evita superdimensionar compras de
// matéria-prima quando o semiacabado já está pronto em estoque.

export type LinhaSim = {
  id_produto: string;
  nome: string;
  quantidade: number;
  local?: boolean;
};

export type Contribuicao = {
  id_produto: string;
  nome: string;
  qtd: number;
  caminho: { id: string; nome: string | null }[];
};

export type ItemResultado = {
  id_item: string;
  item: string | null;
  um: string | null;
  tipo: "Subconjunto" | "Matéria-Prima";
  origem_estoque: "Fábrica" | "Loja";
  necessidade: number;
  /** Saldo de referência do item (só preenchido para subconjuntos). */
  saldo_producao: number;
  /** true quando é subconjunto e o saldo cobriu 100% da necessidade → não desdobrou. */
  suficiente_por_saldo: boolean;
  /** true quando desdobrou nos componentes da composição. */
  descendeu: boolean;
  contribs: Contribuicao[];
};

/**
 * Explode uma lista de produtos-raiz em necessidades reais, aplicando netting
 * por nível: em cada subconjunto, o saldo em almoxarifados de produção é
 * abatido da necessidade antes de descer para os componentes.
 *
 * @param linhas produtos-raiz a simular (com quantidade e flag `local`).
 * @param bomRows todas as linhas de ficha_tecnica_bom.
 * @param saldoProducao saldo por id_item, somado nos almoxes de produção.
 */
export function explodirSimulacao(
  linhas: LinhaSim[],
  bomRows: BomLinha[],
  saldoProducao: Record<string, number>,
): ItemResultado[] {
  const porProduto = new Map<string, BomLinha[]>();
  for (const r of bomRows) {
    const arr = porProduto.get(r.id_produto) ?? [];
    arr.push(r);
    porProduto.set(r.id_produto, arr);
  }

  type Pending = {
    id_item: string;
    item: string | null;
    um: string | null;
    tem_filho: boolean;
    origem: "Fábrica" | "Loja";
    qtd: number;
    contribs: Contribuicao[];
  };

  const saldosMut: Record<string, number> = { ...saldoProducao };
  const results: ItemResultado[] = [];

  // Nível 0 → filhos dos produtos-raiz. Raízes NÃO são netadas contra saldo
  // (estamos planejando produzi-las).
  let pending = new Map<string, Pending>();
  for (const root of linhas) {
    if (!root.quantidade || root.quantidade <= 0) continue;
    const filhos = porProduto.get(root.id_produto) ?? [];
    if (!filhos.length) continue;
    const rootPath = [{ id: root.id_produto, nome: root.nome }];
    for (const f of filhos) {
      const qtd = (f.qtd || 0) * root.quantidade;
      if (qtd <= 0) continue;
      const isLeaf = !f.tem_filho;
      // Produto Local: folhas diretas do produto acabado consomem estoque de Loja;
      // subconjuntos e tudo abaixo deles consomem estoque de Fábrica.
      const origem: "Fábrica" | "Loja" = root.local && isLeaf ? "Loja" : "Fábrica";
      const key = `${f.id_item}|${origem}`;
      const cur = pending.get(key) ?? {
        id_item: f.id_item,
        item: f.item,
        um: f.item_unidade,
        tem_filho: !!f.tem_filho,
        origem,
        qtd: 0,
        contribs: [],
      };
      cur.qtd += qtd;
      cur.contribs.push({
        id_produto: root.id_produto,
        nome: root.nome,
        qtd,
        caminho: [...rootPath, { id: f.id_item, nome: f.item }],
      });
      pending.set(key, cur);
    }
  }

  const visitados = new Set<string>(); // proteção contra ciclos em subs
  let iter = 0;
  while (pending.size && iter++ < 40) {
    const next = new Map<string, Pending>();
    for (const [key, p] of pending) {
      if (!p.tem_filho) {
        results.push({
          id_item: p.id_item,
          item: p.item,
          um: p.um,
          tipo: "Matéria-Prima",
          origem_estoque: p.origem,
          necessidade: p.qtd,
          saldo_producao: 0,
          suficiente_por_saldo: false,
          descendeu: false,
          contribs: p.contribs,
        });
        continue;
      }
      // Subconjunto — netting contra saldo de produção.
      const saldoOrig = saldoProducao[p.id_item] ?? 0;
      const disp = saldosMut[p.id_item] ?? 0;
      let falta = 0;
      let suficiente = false;
      if (disp >= p.qtd) {
        saldosMut[p.id_item] = disp - p.qtd;
        suficiente = true;
      } else {
        falta = p.qtd - disp;
        saldosMut[p.id_item] = 0;
      }
      results.push({
        id_item: p.id_item,
        item: p.item,
        um: p.um,
        tipo: "Subconjunto",
        origem_estoque: p.origem,
        necessidade: p.qtd,
        saldo_producao: saldoOrig,
        suficiente_por_saldo: suficiente,
        descendeu: !suficiente,
        contribs: p.contribs,
      });
      if (suficiente) continue;
      if (visitados.has(p.id_item)) continue;
      visitados.add(p.id_item);
      const filhos = porProduto.get(p.id_item) ?? [];
      for (const f of filhos) {
        const qtdChild = (f.qtd || 0) * falta;
        if (qtdChild <= 0) continue;
        // Dentro de um sub, sempre Fábrica.
        const origem: "Fábrica" | "Loja" = "Fábrica";
        const nk = `${f.id_item}|${origem}`;
        const np = next.get(nk) ?? {
          id_item: f.id_item,
          item: f.item,
          um: f.item_unidade,
          tem_filho: !!f.tem_filho,
          origem,
          qtd: 0,
          contribs: [],
        };
        np.qtd += qtdChild;
        // Distribui a contribuição proporcionalmente aos "puxadores" do sub.
        for (const c of p.contribs) {
          const share = p.qtd > 0 ? c.qtd / p.qtd : 0;
          np.contribs.push({
            id_produto: c.id_produto,
            nome: c.nome,
            qtd: qtdChild * share,
            caminho: [...c.caminho, { id: f.id_item, nome: f.item }],
          });
        }
        next.set(nk, np);
      }
    }
    pending = next;
  }

  return results;
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
