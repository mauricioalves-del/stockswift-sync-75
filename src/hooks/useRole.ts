import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function useRole() {
  const q = useQuery({
    queryKey: ["my-role"],
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase.rpc("get_my_role");
      if (error) { console.error(error); return null; }
      return (data as AppRole | null) ?? null;
    },
    staleTime: 60_000,
  });
  const role = q.data ?? null;
  return {
    role,
    isAdmin: role === "ADMINISTRADOR",
    isInventariante: role === "INVENTARIANTE" || role === "ADMINISTRADOR",
    isConsulta: role === "CONSULTA",
    canWrite: role === "ADMINISTRADOR" || role === "INVENTARIANTE",
    loading: q.isLoading,
  };
}
