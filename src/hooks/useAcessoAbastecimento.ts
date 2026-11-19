// Acesso às telas do pilar Abastecimento: gestores/Coordenador de Controle pelo papel,
// demais perfis pela matriz de permissões (ex.: Operador de Estoque na separação dos pedidos).
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";

export function useAcessoAbastecimento(rota: string) {
  const { isAdmin, role, loading: roleCarregando } = useRole();
  const perms = usePermissions();
  const porPapel = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const naMatriz = perms.isMapped(rota) && perms.canView(rota);
  const podeOperar = perms.isMapped(rota) && perms.canWrite(rota);
  return { pode: porPapel || naMatriz, podeOperar, carregando: roleCarregando || perms.loading };
}
