import { supabase } from "@/integrations/supabase/client";
import { listPendingCounts, removePendingCount, type PendingCount } from "./idb";
import { toast } from "sonner";

export async function syncPendingCounts(): Promise<{ ok: number; fail: number }> {
  const pending = await listPendingCounts();
  if (pending.length === 0) return { ok: 0, fail: 0 };
  let ok = 0;
  let fail = 0;
  for (const p of pending) {
    const { error } = await insertCount(p);
    if (error) {
      fail++;
      console.error("[sync] erro ao enviar contagem", p.localId, error);
    } else {
      ok++;
      await removePendingCount(p.localId);
    }
  }
  if (ok > 0) toast.success(`${ok} contagem(ns) sincronizada(s)`);
  if (fail > 0) toast.error(`${fail} falha(s) na sincronização`);
  return { ok, fail };
}

async function insertCount(p: PendingCount) {
  return supabase.from("inventario").insert({
    id_produto: p.id_produto,
    lote: p.lote,
    descricao: p.descricao,
    unidade: p.unidade,
    id_local: p.id_local,
    origem: p.origem ?? "",
    custo_unitario: p.custo_unitario,
    saldo_sistemico: p.saldo_sistemico,
    quantidade_contada: p.quantidade_contada,
    data_validade: p.data_validade,
    contagem_numero: p.contagem_numero,
    usuario: p.usuario,
    observacao: p.observacao ?? null,
    data_contagem: p.data_contagem,
    sincronizado: true,
  });
}
