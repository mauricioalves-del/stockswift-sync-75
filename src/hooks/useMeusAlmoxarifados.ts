import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";

/**
 * Lista de almoxarifados (codigo_origem) que o usuário logado pode enxergar.
 * - `almoxes === null` → sem restrição (todos)
 * - `almoxes === []`   → nenhum liberado (não deve mostrar nada)
 * - `almoxes: string[]` → filtre `.in("origem", almoxes)`
 *
 * Administrador e Coordenador de Controle sempre têm acesso irrestrito.
 */
export function useMeusAlmoxarifados() {
  const { isAdmin, role, loading: roleLoading } = useRole();
  const irrestrito = isAdmin || role === "COORDENADOR_CONTROLE";

  const q = useQuery({
    queryKey: ["meus-almox"],
    enabled: !roleLoading && !irrestrito,
    staleTime: 60_000,
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return null;
      const { data } = await (supabase as any)
        .from("usuario_almoxarifados")
        .select("codigo_origem")
        .eq("user_id", uid);
      if (!data || data.length === 0) return null; // sem restrição
      return (data as { codigo_origem: string }[]).map((r) => r.codigo_origem);
    },
  });

  return {
    almoxes: irrestrito ? null : (q.data ?? null),
    loading: roleLoading || (!irrestrito && q.isLoading),
    irrestrito,
  };
}

/** Aplica filtro `.in("origem", almoxes)` quando houver restrição. */
export function filtrarPorAlmox<T extends { in: (col: string, vals: any[]) => T }>(
  query: T,
  almoxes: string[] | null,
  coluna: string = "origem",
): T {
  if (!almoxes) return query;
  if (almoxes.length === 0) return query.in(coluna, ["__nenhum__"]);
  return query.in(coluna, almoxes);
}
