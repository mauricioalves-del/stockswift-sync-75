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
      // Perfil do usuário (profiles.perfil_id), válido só se casar com o papel atual;
      // senão, o primeiro perfil ativo com o mesmo papel.
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { data: prof } = uid
        ? await (supabase as any).from("profiles").select("perfil_id").eq("id", uid).maybeSingle()
        : { data: null };
      const { data: candidatos } = await (supabase as any)
        .from("perfis")
        .select("id, created_at")
        .eq("role_key", role)
        .order("created_at");
      const lista = (candidatos ?? []) as { id: string }[];
      const perfil = lista.find((p) => p.id === prof?.perfil_id) ?? lista[0] ?? null;

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
