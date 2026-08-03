import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { chaveSku, PERCENTUAL_DESCONTO_PADRAO, type PrecoVendaRow } from "@/lib/precos-venda";

export function usePrecosVenda() {
  return useQuery({
    queryKey: ["precos-venda"],
    staleTime: 60_000,
    queryFn: async (): Promise<PrecoVendaRow[]> => {
      const rows = await fetchAll<any>((from, to) =>
        (supabase as any).from("precos_venda").select("*").order("sku").range(from, to),
      );
      return rows as PrecoVendaRow[];
    },
  });
}

/** Mapa SKU (normalizado) → preço de venda vigente. */
export function usePrecoVendaPorSku() {
  const q = usePrecosVenda();
  const map = new Map<string, PrecoVendaRow>();
  for (const r of q.data ?? []) map.set(chaveSku(r.sku), r);
  return { ...q, map };
}

export function useParametroDesconto() {
  return useQuery({
    queryKey: ["parametro-desconto-colaborador"],
    staleTime: 300_000,
    queryFn: async (): Promise<{ id: string | null; percentual_desconto: number; ativo: boolean }> => {
      const { data, error } = await (supabase as any)
        .from("parametros_desconto_colaborador")
        .select("*")
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { id: null, percentual_desconto: PERCENTUAL_DESCONTO_PADRAO, ativo: true };
      return {
        id: data.id,
        percentual_desconto: Number(data.percentual_desconto) || PERCENTUAL_DESCONTO_PADRAO,
        ativo: !!data.ativo,
      };
    },
  });
}
