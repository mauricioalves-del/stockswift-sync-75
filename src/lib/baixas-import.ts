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
  // resolvidos
  descricao?: string;
  unidade?: string;
  custo_unitario?: number;
  motivo_id?: string;
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

  // Aba BAIXA (cabeçalho na linha 2, dados a partir da linha 3)
  const baixaAOA: unknown[][] = [
    ["Modelo de Baixa Operacional — preencher a partir da linha 3"],
    ["Categoria", "Subcategoria", "Itens", "SKU", "QTD", "MOTIVO", "DATA", "RESPONSÁVEL"],
  ];
  const wsBaixa = XLSX.utils.aoa_to_sheet(baixaAOA);
  wsBaixa["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 40 }, { wch: 14 },
    { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBaixa, "BAIXA");

  // Aba BASE PRODUTOS
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

export async function parsePlanilhaBaixas(
  file: File,
  catalogo: CatalogoProduto[],
  motivos: Array<{ id: string; descricao: string }>,
): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets["BAIXA"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Aba "BAIXA" não encontrada');

  // Cabeçalho na linha 2 → range começa em A2
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 1,
    defval: "",
  });

  const catMap = new Map(catalogo.map((c) => [String(c.sku).trim(), c]));
  const motivoMap = new Map(motivos.map((m) => [m.descricao.toUpperCase().trim(), m]));

  const rows: ParsedRow[] = [];
  data.forEach((r, idx) => {
    const linha = idx + 3; // linha real na planilha (cabeçalho na 2)
    const categoria = pick(r, "Categoria", "CATEGORIA");
    const subcategoria = pick(r, "Subcategoria", "SUBCATEGORIA");
    const produto = pick(r, "Itens", "ITENS", "Produto", "PRODUTO");
    const sku = pick(r, "SKU", "Sku", "sku");
    const qtdRaw = pick(r, "QTD", "Qtd", "qtd", "Quantidade");
    const motivo = pick(r, "MOTIVO", "Motivo", "motivo").toUpperCase();
    const dataRaw = pick(r, "DATA", "Data", "data");
    const responsavel = pick(r, "RESPONSÁVEL", "RESPONSAVEL", "Responsável", "Responsavel", "responsavel");

    // Linha totalmente vazia → ignorar
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
      custo_unitario: prod?.custo_unitario,
      motivo_id: motivoObj?.id,
    });
  });

  return rows;
}
