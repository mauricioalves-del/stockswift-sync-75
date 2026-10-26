// Ficha de inventário no layout da planilha "Ficha de inventário - Loja"
// (aba Almox Loja): Grupo, Código, Chave, Lote, Descricao, Unid., Contagem 1, Data de Validade.
import * as XLSX from "xlsx";

type Item = { id: string; codigo_produto: string; descricao: string | null; lote?: string | null; observacao?: string | null; quantidade_contada?: number | null };
type Linha = {
  lote: string | null; lote_manual_texto: string | null; eh_nao_relacionado: boolean;
  quantidade_contada: number | string | null; data_validade_manual?: string | null; observacao?: string | null;
};
type LoteSist = { lote: string; unidade: string; data_validade: string | null };

export type EntradaFicha = {
  titulo: string;
  itens: Item[];
  linhasPorItem: Map<string, Linha[]>;
  lotesPorSku: Map<string, LoteSist[]>;
  grupoPorSku: Map<string, string>;
};

const dataBR = (d: string | null | undefined) => {
  if (!d) return "";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : d;
};

export function baixarFichaInventario({ titulo, itens, linhasPorItem, lotesPorSku, grupoPorSku }: EntradaFicha) {
  const corpo: (string | number)[][] = [];
  for (const it of itens) {
    const lotes = lotesPorSku.get(it.codigo_produto) ?? [];
    const unidadeSku = lotes[0]?.unidade ?? "";
    const grupo = grupoPorSku.get(it.codigo_produto) ?? "";
    const linhas = linhasPorItem.get(it.id) ?? [];
    if (linhas.length === 0) {
      const ls = lotes.find((l) => l.lote === it.lote);
      corpo.push([grupo, it.codigo_produto, it.observacao ?? "", it.lote ?? "", it.descricao ?? "", ls?.unidade ?? unidadeSku,
        it.quantidade_contada != null ? Number(it.quantidade_contada) : "", dataBR(ls?.data_validade)]);
      continue;
    }
    for (const l of linhas) {
      const lote = l.eh_nao_relacionado ? (l.lote_manual_texto ?? "") : (l.lote ?? "");
      const ls = lotes.find((x) => x.lote === l.lote);
      const validade = l.eh_nao_relacionado ? l.data_validade_manual : ls?.data_validade;
      const q = l.quantidade_contada;
      corpo.push([grupo, it.codigo_produto, l.observacao ?? it.observacao ?? "", lote, it.descricao ?? "", ls?.unidade ?? unidadeSku,
        q === null || q === "" ? "" : Number(q), dataBR(validade)]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([
    ["Mercadoria de Revenda"],
    ["Grupo", "Código", "Chave", "Lote", "Descricao", "Unid.", "Contagem 1", "Data de Validade"],
    ...corpo,
  ]);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
  ws["!cols"] = [20, 14, 14, 24, 44, 8, 12, 16].map((wch) => ({ wch }));
  if (corpo.length) ws["!autofilter"] = { ref: `A2:H${corpo.length + 2}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Almox Loja");
  const nome = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60);
  XLSX.writeFile(wb, `Ficha_de_inventario_${nome}.xlsx`);
  return corpo.length;
}
