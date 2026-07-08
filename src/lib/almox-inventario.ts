import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";

export type AlmoxAtivo = {
  almox: string | null;
  source: "Missao" | "Usuario" | null;
  missaoTitulo?: string;
};

/**
 * Resolve o almoxarifado a ser considerado na contagem, seguindo prioridade:
 *   1) Missão em andamento (responsavel = usuário logado) com `origem` definida
 *   2) Almoxarifado padrão do usuário (parametros_inventario tipo_escopo='Usuario')
 *   3) Nenhum — mantém comportamento atual (todos os almoxarifados)
 *
 * Origens que não estejam na lista de almoxarifados permitidos do usuário
 * são ignoradas (cai para o próximo nível).
 */
export function useAlmoxAtivo() {
  const { almoxes } = useMeusAlmoxarifados();
  const permitido = (codigo: string) => !almoxes || almoxes.includes(codigo);

  return useQuery<AlmoxAtivo>({
    queryKey: ["almox-ativo", almoxes?.join(",") ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) return { almox: null, source: null };

      const { data: missoes } = await (supabase as any)
        .from("missoes")
        .select("id, titulo, origem, status, responsavel_id, updated_at")
        .eq("responsavel_id", userId)
        .eq("status", "EM_ANDAMENTO")
        .not("origem", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      const m = missoes?.[0];
      if (m?.origem && permitido(m.origem as string)) {
        return { almox: m.origem as string, source: "Missao", missaoTitulo: m.titulo };
      }

      const { data: param } = await (supabase as any)
        .from("parametros_inventario")
        .select("almoxarifado_id")
        .eq("tipo_escopo", "Usuario")
        .eq("referencia_id", userId)
        .eq("ativo", true)
        .maybeSingle();
      if (param?.almoxarifado_id && permitido(param.almoxarifado_id as string)) {
        return { almox: param.almoxarifado_id as string, source: "Usuario" };
      }

      return { almox: null, source: null };
    },
  });
}
