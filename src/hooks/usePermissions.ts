import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";

type Modulo = { id: string; rota: string | null };
type Perm = {
  modulo_id: string;
  pode_visualizar: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_aprovar: boolean;
  pode_excluir: boolean;
};

export function usePermissions() {
  const { role, isAdmin, loading: roleLoading } = useRole();

  const q = useQuery({
    queryKey: ["my-permissions", role],
    enabled: !!role,
    staleTime: 60_000,
    queryFn: async () => {
      // perfil_id via role_key
      const { data: perfil } = await (supabase as any)
        .from("perfis")
        .select("id")
        .eq("role_key", role)
        .maybeSingle();

      const [modsRes, permsRes] = await Promise.all([
        (supabase as any).from("modulos_sistema").select("id, rota"),
        perfil?.id
          ? (supabase as any).from("permissoes").select("*").eq("perfil_id", perfil.id)
          : Promise.resolve({ data: [] as Perm[] }),
      ]);

      const modulos = (modsRes.data ?? []) as Modulo[];
      const perms = (permsRes.data ?? []) as Perm[];

      const rotaToModId = new Map<string, string>();
      modulos.forEach((m) => { if (m.rota) rotaToModId.set(m.rota, m.id); });
      const byMod = new Map<string, Perm>();
      perms.forEach((p) => byMod.set(p.modulo_id, p));
      return { rotaToModId, byMod };
    },
  });

  function getPerm(rota: string): Perm | undefined {
    const modId = q.data?.rotaToModId.get(rota);
    if (!modId) return undefined;
    return q.data?.byMod.get(modId);
  }

  function isMapped(rota: string): boolean {
    return !!q.data?.rotaToModId.get(rota);
  }

  function canView(rota: string): boolean {
    if (isAdmin) return true;
    if (!isMapped(rota)) return true; // módulo fora da matriz — fallback por papel no AppShell
    const p = getPerm(rota);
    return p?.pode_visualizar === true;
  }

  function canWrite(rota: string): boolean {
    if (isAdmin) return true;
    if (!isMapped(rota)) return true;
    const p = getPerm(rota);
    return !!(p && (p.pode_criar || p.pode_editar));
  }

  return {
    canView,
    canWrite,
    isMapped,
    isAdmin,
    loading: roleLoading || q.isLoading,
  };
}
