import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UsuarioSistema = { id: string; nome: string; email: string };

/** Usuários aprovados do sistema (para atribuição de responsáveis/tarefas). */
export function useUsuariosSistema() {
  return useQuery({
    queryKey: ["usuarios-sistema"],
    staleTime: 300_000,
    queryFn: async (): Promise<UsuarioSistema[]> => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, nome, email, aprovado")
        .order("nome");
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((p) => p.aprovado !== false)
        .map((p) => ({ id: p.id, nome: p.nome || p.email || p.id, email: p.email ?? "" }));
    },
  });
}
