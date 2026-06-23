import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";

type Role = "ADMINISTRADOR" | "INVENTARIANTE" | "CONSULTA";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuários" }] }),
});

function UsuariosPage() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["usuarios"],
    enabled: isAdmin,
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
    await supabase.from("audit_logs").insert({ usuario: me, acao: "ALTERAR_PERFIL", entidade: "user_roles", entidade_id: userId, payload: { role: newRole } });
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Usuários & Perfis</h1>
        <p className="text-sm text-muted-foreground">Defina o nível de acesso de cada usuário</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{data?.length ?? 0} usuário(s)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role ?? ""} onValueChange={(v) => changeRole(u.id, v as Role)}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                        <SelectItem value="INVENTARIANTE">Inventariante</SelectItem>
                        <SelectItem value="CONSULTA">Consulta</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
