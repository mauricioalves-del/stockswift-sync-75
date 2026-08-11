import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Todos os papéis atribuídos ao usuário logado (um usuário pode ter mais de um). */
export function useMyRoles() {
  const q = useQuery({
    queryKey: ["my-roles"],
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (error) {
        console.error(error);
        return [];
      }
      return ((data ?? []) as { role: string }[]).map((r) => r.role);
    },
  });

  const roles = q.data ?? [];
  return {
    roles,
    has: (r: string) => roles.includes(r),
    isAdmin: roles.includes("ADMINISTRADOR"),
    isDiretorOperacoes: roles.includes("DIRETOR_OPERACOES"),
    isCoordenadorFinanceiro: roles.includes("COORDENADOR_FINANCEIRO"),
    loading: q.isLoading,
  };
}
