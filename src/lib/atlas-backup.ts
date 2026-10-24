// Importação do backup do Atlas Operações BI (zip gerado pelo backup_atlas.py: manifesto.json, schema.sql e dados/<tabela>.csv)
// para as tabelas atlas_<tabela> do Stock Savvy. Tudo roda no navegador: lê o zip, converte cada coluna para o tipo do
// schema e grava em lotes com upsert pela chave primária (reimportar o mesmo backup não duplica nada).
import { supabase } from "@/integrations/supabase/client";
import { ATLAS_TABELAS, type AtlasColuna } from "./atlas-tabelas";

export type Manifesto = { gerado_em: string; total_tabelas: number; total_linhas: number; linhas_por_tabela: Record<string, number> };

// ---------- zip (sem dependências: diretório central + DecompressionStream) ----------
async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([dados as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/** Lê os arquivos de um zip. `filtro` decide quais entradas descompactar (o dump binário, por exemplo, fica de fora). */
export async function lerZip(arquivo: ArrayBuffer, filtro: (nome: string) => boolean = () => true): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(arquivo); const dv = new DataView(arquivo);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo não é um zip válido.");
  const total = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Zip corrompido (diretório central).");
    const metodo = dv.getUint16(p + 10, true), comprimido = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + nLen));
    p += 46 + nLen + eLen + cLen;
    if (nome.endsWith("/") || !filtro(nome)) continue;
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const bruto = u8.subarray(ini, ini + comprimido);
    if (metodo === 0) out.set(nome, bruto);
    else if (metodo === 8) out.set(nome, await inflar(bruto));
    else throw new Error(`Compressão não suportada em ${nome} (método ${metodo}).`);
  }
  return out;
}

// ---------- CSV (RFC 4180: aspas, aspas duplicadas, quebras de linha dentro de campo) ----------
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []; let campo = ""; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (!(linha.length === 1 && linha[0] === "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// ---------- conversão de tipos ----------
function converter(v: string, tipo: AtlasColuna): unknown {
  if (v === "") return tipo === "txt!" ? "" : null;
  switch (tipo) {
    case "int": { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
    case "num": { const n = Number(v); return Number.isFinite(n) ? n : null; }
    case "bool": return /^(t|true|1|s|sim)$/i.test(v);
    case "json": try { return JSON.parse(v); } catch { return v; }
    default: return v;   // texto, datas e bytea (\x…) vão como texto; o banco converte
  }
}

/** Converte as linhas do CSV de uma tabela em objetos prontos para gravar. Colunas fora do schema (segredos) são ignoradas. */
export function linhasDaTabela(tabela: string, csv: string[][]): Record<string, unknown>[] {
  const meta = ATLAS_TABELAS[tabela];
  if (!meta || csv.length === 0) return [];
  const cab = csv[0];
  const idx = cab.map((c) => (meta.cols[c] ? c : null));
  return csv.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    idx.forEach((c, j) => { if (c) o[c] = converter(r[j] ?? "", meta.cols[c]); });
    return o;
  });
}

export type ConteudoBackup = { manifesto: Manifesto; tabelas: Map<string, Record<string, unknown>[]> };

/** Abre o zip do backup e devolve o manifesto e as linhas convertidas de cada tabela conhecida. */
export async function abrirBackup(arquivo: ArrayBuffer): Promise<ConteudoBackup> {
  const arqs = await lerZip(arquivo, (n) => n === "manifesto.json" || (n.startsWith("dados/") && n.endsWith(".csv")));
  const dec = new TextDecoder("utf-8");
  const man = arqs.get("manifesto.json");
  if (!man) throw new Error("O zip não tem manifesto.json — confirme que é o backup gerado pelo Atlas.");
  const manifesto = JSON.parse(dec.decode(man)) as Manifesto;
  const tabelas = new Map<string, Record<string, unknown>[]>();
  for (const [nome, dados] of arqs) {
    const t = nome.replace(/^dados\//, "").replace(/\.csv$/, "");
    if (!ATLAS_TABELAS[t]) continue;
    tabelas.set(t, linhasDaTabela(t, lerCsv(dec.decode(dados).replace(/^\uFEFF/, ""))));
  }
  return { manifesto, tabelas };
}

/** Tamanho do lote: tabelas com arquivo binário (bytea) vão uma linha por vez. */
export const loteDe = (tabela: string) => (Object.values(ATLAS_TABELAS[tabela]?.cols ?? {}).includes("bytea") ? 1 : 500);

/** Ordem de importação: tabelas pequenas primeiro, as grandes por último (o progresso fica mais legível). */
export const ordemImportacao = (tabelas: string[]) => [...tabelas].sort((a, b) => (ATLAS_TABELAS[a]?.linhas ?? 0) - (ATLAS_TABELAS[b]?.linhas ?? 0));

/** Contagem atual de cada tabela atlas_* no banco (null = tabela ainda não existe ou sem permissão). */
export async function contarTabelasAtlas(tabelas: string[]): Promise<Record<string, number | null>> {
  const sb = supabase as any;
  const r = await Promise.all(tabelas.map(async (t) => {
    const { count, error } = await sb.from(`atlas_${t}`).select("*", { count: "exact", head: true });
    return [t, error ? null : count ?? 0] as const;
  }));
  return Object.fromEntries(r);
}
