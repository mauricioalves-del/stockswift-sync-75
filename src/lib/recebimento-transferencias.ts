// Utilidades do Farol de Recebimento Pendente de Transferências (Suprimentos)
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "./xlsx-utils";
import { toDataISO } from "./dispersao";

export type RecebimentoRow = {
  linha: number;
  estado?: string;
  nr_nf: string;
  serie?: string;
  dt_emissao: string | null;
  empresa: string;
  almox: string;
  cod_prod: string;
  desc_produto?: string;
  qtd: number;
  vt_total_item: number;
  lote: string;
  nota_cancelada?: string;
  dt_recebimento: string | null;
  recebimento: string;
  status: "OK" | "ERRO";
  erros: string[];
};

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  return pickCI(r, ...keys);
}

function num(s: string | number | undefined | null): number {
  if (s === null || s === undefined || s === "") return 0;
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  const raw = String(s).trim();
  if (!raw) return 0;
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  let normalized = raw;
  if (hasDot && hasComma) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lê a planilha "Transferência" (Power Query / notas fiscais de transferência
 * vs. recebimento). Procura uma aba chamada "Transferência" ou "Transferencia"
 * (sem acento); se não achar, usa a primeira aba do arquivo.
 *
 * O extrator de origem às vezes repete a mesma linha várias vezes (mesma NF +
 * produto + lote, mesmos valores) — são duplicatas exatas, não quantidades
 * diferentes a somar. Por isso a importação deduplica por (nr_nf, cod_prod,
 * lote), mantendo a primeira ocorrência, em vez de acumular.
 */
export function parseRecebimentoPlanilha(file: ArrayBuffer): RecebimentoRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const nomeAba =
    wb.SheetNames.find((n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "transferencia") ??
    wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const rows = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: "" }));

  const vistos = new Set<string>();
  const resultado: RecebimentoRow[] = [];

  rows.forEach((r, i) => {
    const nr_nf = pick(r, "nr_nf", "Nr_NF", "NrNF", "numero_nf");
    const cod_prod = pick(r, "CodProd", "Cod_Prod", "codprod", "SKU");
    const lote = pick(r, "Lote", "lote");
    const dt_emissao = toDataISO(pick(r, "dt_emissao", "Dt_Emissao", "DtEmissao"));
    const empresa = pick(r, "Empresa", "empresa", "DE");
    const almox = pick(r, "Almox", "almox", "PARA", "Para");
    const recebimento = pick(r, "Recebimento", "recebimento");

    const erros: string[] = [];
    if (!nr_nf) erros.push("nr_nf vazio");
    if (!cod_prod) erros.push("CodProd vazio");
    if (!lote) erros.push("Lote vazio");
    if (!dt_emissao) erros.push("dt_emissao inválida ou vazia");
    if (!empresa) erros.push("Empresa (DE) vazia");
    if (!almox) erros.push("Almox (PARA) vazio");
    if (!recebimento) erros.push("Recebimento vazio");

    // Dedup de duplicatas exatas vindas do extrator de origem.
    const chave = `${nr_nf}|${cod_prod}|${lote}`;
    if (erros.length === 0) {
      if (vistos.has(chave)) return;
      vistos.add(chave);
    }

    resultado.push({
      linha: i + 2,
      estado: pick(r, "estado", "Estado") || undefined,
      nr_nf,
      serie: pick(r, "serie", "Serie") || undefined,
      dt_emissao,
      empresa,
      almox,
      cod_prod,
      desc_produto: pick(r, "Desc_Produto", "DescProduto", "desc_produto") || undefined,
      qtd: num(pick(r, "qtd", "Qtd", "Qtde")),
      vt_total_item: num(pick(r, "vt_total_item", "Vt_Total_Item", "ValorTotal", "Valor Total")),
      lote,
      nota_cancelada: pick(r, "Nota_Cancelada", "NotaCancelada", "Cancelado") || undefined,
      dt_recebimento: toDataISO(pick(r, "Dt_Recebimento", "DtRecebimento")),
      recebimento,
      status: erros.length ? "ERRO" : "OK",
      erros,
    });
  });

  return resultado;
}

export function gerarModeloRecebimento(): Blob {
  const aoa = [
    ["estado", "nr_nf", "serie", "dt_emissao", "Empresa", "Almox", "CodProd", "Desc_Produto", "qtd", "vt_total_item", "Lote", "Nota_Cancelada", "Dt_Recebimento", "Recebimento"],
    ["SP", "1848", "4", "30/09/2026", "Filial SP - Fabrica", "Eldorado", "5104096", "Bombom SF Castanha-do-Pará 10g", 30, 222.28, "050010406M000050326", "N", "", "Pendente"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Transferência");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Dias úteis (seg-sex) entre duas datas ISO, exclusive a data inicial. */
export function diasUteisEntre(inicioISO: string, fimISO: string): number {
  const inicio = new Date(`${inicioISO}T00:00:00`);
  const fim = new Date(`${fimISO}T00:00:00`);
  if (fim <= inicio) return 0;
  let dias = 0;
  const cursor = new Date(inicio);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= fim) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}
