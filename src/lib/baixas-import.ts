import * as XLSX from "xlsx";

export type ParsedRow = {
  linha: number;
  categoria: string;
  subcategoria: string;
  produto: string;
  sku: string;
  quantidade: number;
  motivo: string;
  data: string; // ISO yyyy-mm-dd
  responsavel: string;
  status: "OK" | "ERRO";
  erros: string[];
  // resolvidos por SKU (catálogo)
  descricao?: string;
  unidade?: string;
  motivo_id?: string;
  // seleção de lote (feita na tela de prévia)
  lotes_disponiveis?: LoteDisponivel[];
  lote_selecionado_id?: string | null;
};

export type LoteDisponivel = {
  estoque_id: string;
  lote: string;
  data_validade: string | null;
  quantidade: number;
  custo_unitario: number;
};

export type CatalogoProduto = {
  sku: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  categoria: string;
  subcategoria: string;
};

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function toIsoDate(s: string): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const n = Number(s);
  if (!Number.isNaN(n) && n > 30000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return "";
}

export function gerarModeloBaixas(catalogo: CatalogoProduto[]): Blob {
  const wb = XLSX.utils.book_new();

  const baixaAOA: unknown[][] = [
    ["Modelo de Baixa Operacional — preencher a partir da linha 3. Almoxarifado e Lote são escolhidos no sistema."],
    ["Categoria", "Subcategoria", "Itens", "SKU", "QTD", "MOTIVO", "DATA", "RESPONSÁVEL"],
  ];
  const wsBaixa = XLSX.utils.aoa_to_sheet(baixaAOA);
  wsBaixa["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 40 }, { wch: 14 },
    { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBaixa, "BAIXA");

  const baseAOA: unknown[][] = [["Categoria", "Subcategoria", "SKU", "Produto"]];
  for (const p of catalogo) {
    baseAOA.push([p.categoria || "", p.subcategoria || "", p.sku, p.descricao]);
  }
  const wsBase = XLSX.utils.aoa_to_sheet(baseAOA);
  wsBase["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsBase, "BASE PRODUTOS");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/**
 * Ordena lotes por FEFO (data_validade crescente; nulls por último) e filtra saldo > 0.
 */
export function ordenarFEFO(lotes: LoteDisponivel[]): LoteDisponivel[] {
  return [...lotes]
    .filter((l) => l.quantidade > 0)
    .sort((a, b) => {
      const av = a.data_validade ?? "9999-12-31";
      const bv = b.data_validade ?? "9999-12-31";
      return av.localeCompare(bv);
    });
}

export async function parsePlanilhaBaixas(
  file: File,
  catalogo: CatalogoProduto[],
  motivos: Array<{ id: string; descricao: string }>,
  lotesPorSku: Map<string, LoteDisponivel[]>,
): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets["BAIXA"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Aba "BAIXA" não encontrada');

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 1,
    defval: "",
  });

  const catMap = new Map(catalogo.map((c) => [String(c.sku).trim(), c]));
  const motivoMap = new Map(motivos.map((m) => [m.descricao.toUpperCase().trim(), m]));

  const rows: ParsedRow[] = [];
  data.forEach((r, idx) => {
    const linha = idx + 3;
    const categoria = pick(r, "Categoria", "CATEGORIA");
    const subcategoria = pick(r, "Subcategoria", "SUBCATEGORIA");
    const produto = pick(r, "Itens", "ITENS", "Produto", "PRODUTO");
    const sku = pick(r, "SKU", "Sku", "sku");
    const qtdRaw = pick(r, "QTD", "Qtd", "qtd", "Quantidade");
    const motivo = pick(r, "MOTIVO", "Motivo", "motivo").toUpperCase();
    const dataRaw = pick(r, "DATA", "Data", "data");
    const responsavel = pick(r, "RESPONSÁVEL", "RESPONSAVEL", "Responsável", "Responsavel", "responsavel");

    if (!sku && !produto && !qtdRaw && !motivo && !dataRaw && !responsavel) return;

    const erros: string[] = [];
    const qtd = Number(String(qtdRaw).replace(",", "."));
    const dataIso = toIsoDate(dataRaw);

    if (!sku) erros.push("SKU vazio");
    const prod = sku ? catMap.get(sku) : undefined;
    if (sku && !prod) erros.push(`SKU ${sku} não encontrado no Cadastro`);
    if (!qtdRaw || Number.isNaN(qtd) || qtd <= 0) erros.push("Quantidade inválida");
    if (!dataIso) erros.push("Data inválida");
    if (!motivo) erros.push("Motivo vazio");
    const motivoObj = motivo ? motivoMap.get(motivo) : undefined;
    if (motivo && !motivoObj) erros.push(`Motivo "${motivo}" não cadastrado`);
    if (!responsavel) erros.push("Responsável vazio");

    const lotesOrd = ordenarFEFO(lotesPorSku.get(sku) ?? []);
    if (sku && prod && lotesOrd.length === 0) {
      erros.push("Sem saldo em nenhum lote para este almoxarifado");
    }
    const sugestao = lotesOrd[0];

    rows.push({
      linha,
      categoria: categoria || prod?.categoria || "",
      subcategoria: subcategoria || prod?.subcategoria || "",
      produto: produto || prod?.descricao || "",
      sku,
      quantidade: qtd,
      motivo,
      data: dataIso,
      responsavel,
      status: erros.length === 0 ? "OK" : "ERRO",
      erros,
      descricao: prod?.descricao,
      unidade: prod?.unidade,
      motivo_id: motivoObj?.id,
      lotes_disponiveis: lotesOrd,
      lote_selecionado_id: sugestao?.estoque_id ?? null,
    });
  });

  return rows;
}
