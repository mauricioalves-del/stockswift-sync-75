import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Shield, ExternalLink } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuários" }] }),
});

// Nível de acesso por role_key — apenas indicativo (matriz real fica em Config > Perfis)
const NIVEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  ADMINISTRADOR: { label: "Acesso Total", variant: "default" },
  COORDENADOR_CONTROLE: { label: "Acesso Total", variant: "default" },
  GERENTE: { label: "Acesso Parcial", variant: "secondary" },
  OPERADOR_ESTOQUE: { label: "Pontos Específicos", variant: "outline" },
  VENDEDOR: { label: "Pontos Específicos", variant: "outline" },
  INVENTARIANTE: { label: "Pontos Específicos", variant: "outline" },
  CONSULTA: { label: "Somente Leitura", variant: "outline" },
  AUDITOR: { label: "Somente Leitura", variant: "outline" },
};

function UsuariosPage() {
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();

  const perfisQ = useQuery({
    queryKey: ["perfis-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("perfis").select("id, nome, role_key, descricao").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; role_key: Role; descricao: string | null }[];
    },
  });

  const usuariosQ = useQuery({
    queryKey: ["usuarios"],
    enabled: podeGerir,
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("*"),
      ]);
      const profiles = profilesRes.data ?? [];
      const roles = rolesRes.data ?? [];
      return profiles.map((p) => ({
        ...p,
        role: (roles.find((r) => r.user_id === p.id)?.role ?? null) as Role | null,
      }));
    },
  });

  async function changeRole(userId: string, newRole: Role) {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("audit_logs").insert({
      usuario: me, acao: "ALTERAR_PERFIL", entidade: "user_roles",
      entidade_id: userId, payload: { role: newRole },
    });
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  if (!podeGerir) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  const perfis = perfisQ.data ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Usuários & Perfis</h1>
          <p className="text-sm text-muted-foreground">
            Atribua um perfil a cada usuário. A matriz de permissões é gerenciada em Configurações.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/config/perfis">
            <Shield className="size-4 mr-1.5" /> Matriz de Permissões <ExternalLink className="size-3 ml-1" />
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{usuariosQ.data?.length ?? 0} usuário(s)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-56">Perfil</TableHead>
                <TableHead>Nível</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuariosQ.data?.map((u) => {
                const nivel = u.role ? NIVEL[u.role] : null;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.role ?? ""} onValueChange={(v) => changeRole(u.id, v as Role)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {perfis.map((p) => (
                            <SelectItem key={p.id} value={p.role_key}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {nivel ? <Badge variant={nivel.variant} className="text-[10px]">{nivel.label}</Badge>
                             : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        As permissões finais de cada perfil (visualizar, criar, editar, aprovar, excluir por módulo)
        ficam na <Link to="/config/perfis" className="underline">matriz de permissões</Link>.
      </p>
    </div>
  );
}
