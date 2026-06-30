// IndexedDB wrapper para operação offline
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "inventario-cloud";
const DB_VERSION = 1;

export interface PendingCount {
  localId: string;
  id_produto: string;
  lote: string;
  descricao: string;
  unidade: string;
  id_local: string;
  origem?: string;
  custo_unitario: number;
  saldo_sistemico: number;
  quantidade_contada: number;
  data_validade: string | null;
  contagem_numero: number;
  usuario: string;
  observacao?: string | null;
  data_contagem: string;
  createdAt: number;
}

export interface EstoqueCache {
  id_produto: string;
  lote: string;
  descricao: string;
  unidade: string;
  id_local: string;
  quantidade: number;
  custo_unitario: number;
  data_validade: string | null;
}

let _db: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (typeof window === "undefined") return null as unknown as Promise<IDBPDatabase>;
  if (!_db) {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pending_counts")) {
          db.createObjectStore("pending_counts", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("estoque_cache")) {
          const s = db.createObjectStore("estoque_cache", { keyPath: ["id_produto", "lote"] });
          s.createIndex("by_produto", "id_produto");
        }
      },
    });
  }
  return _db;
}

export async function addPendingCount(p: PendingCount) {
  const db = await getDB();
  if (!db) return;
  await db.put("pending_counts", p);
}

export async function listPendingCounts(): Promise<PendingCount[]> {
  const db = await getDB();
  if (!db) return [];
  return (await db.getAll("pending_counts")) as PendingCount[];
}

export async function removePendingCount(localId: string) {
  const db = await getDB();
  if (!db) return;
  await db.delete("pending_counts", localId);
}

export async function clearPendingCounts() {
  const db = await getDB();
  if (!db) return;
  await db.clear("pending_counts");
}

export async function cacheEstoque(rows: EstoqueCache[]) {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction("estoque_cache", "readwrite");
  await Promise.all(rows.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function findEstoqueLocal(id_produto: string): Promise<EstoqueCache[]> {
  const db = await getDB();
  if (!db) return [];
  const idx = db.transaction("estoque_cache").store.index("by_produto");
  return (await idx.getAll(id_produto)) as EstoqueCache[];
}
