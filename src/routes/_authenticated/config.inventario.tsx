import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/config/inventario")({
  component: ConfigInventarioPage,
  head: () => ({ meta: [{ title: "Parâmetros de Inventário" }] }),
});

const SEM = "__SEM__";

function ConfigInventarioPage() {
  const qc = useQueryClient();
  const { isAdmin, role } = useRole();
  const podeGerir = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";

  const usuariosQ = useQuery({
    queryKey: ["config-inv-usuarios"],
    enabled: podeGerir,
    queryFn: async () => {
      const [profilesRes, rolesRes, paramsRes] = await Promise.all([
        supabase.from("profiles").select("id, nome, email").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
        (supabase as any).from("parametros_inventario").select("*")
          .eq("tipo_escopo", "Usuario").eq("ativo", true),
      ]);
      const roles = rolesRes.data ?? [];
      const params = (paramsRes.data ?? []) as Array<{ referencia_id: string; almoxarifado_id: string; id: string }>;
      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        role: roles.find((r) => r.user_id === p.id)?.role ?? null,
        almox: params.find((x) => x.referencia_id === p.id)?.almoxarifado_id ?? null,
      }));
    },
  });

  const origensQ = useQuery({
    queryKey: ["origens-ativas-config-inv"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem, descricao")
        .eq("ativo", true).order("codigo_origem");
      return data ?? [];
    },
  });

  async function salvar(userId: string, almox: string | null) {
    if (!almox) {
      const { error } = await (supabase as any).from("parametros_inventario")
        .delete().eq("tipo_escopo", "Usuario").eq("referencia_id", userId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await (supabase as any).from("parametros_inventario")
        .upsert({ tipo_escopo: "Usuario", referencia_id: userId, almoxarifado_id: almox, ativo: true },
          { onConflict: "tipo_escopo,referencia_id" });
      if (error) return toast.error(error.message);
    }
    toast.success("Almoxarifado padrão atualizado");
    qc.invalidateQueries({ queryKey: ["config-inv-usuarios"] });
    qc.invalidateQueries({ queryKey: ["almox-ativo"] });
  }

  if (!podeGerir) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Warehouse className="size-5" /> Parâmetros de Inventário</h1>
        <p className="text-sm text-muted-foreground">Almoxarifado padrão por usuário — usado no scanner de contagem quando a missão não define um.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Almoxarifado padrão por usuário</CardTitle>
          <CardDescription>Prioridade na leitura: (1) almoxarifado da missão em andamento; (2) padrão do usuário; (3) todos.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="w-72">Almoxarifado padrão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usuariosQ.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum usuário</TableCell></TableRow>
              )}
              {(usuariosQ.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-xs">{u.role ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={u.almox ?? SEM}
                      onValueChange={(v) => salvar(u.id, v === SEM ? null : v)}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Sem padrão" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM}>Sem padrão (todos)</SelectItem>
                        {(origensQ.data ?? []).map((o) => (
                          <SelectItem key={o.codigo_origem} value={o.codigo_origem}>
                            {o.descricao || o.codigo_origem}
                          </SelectItem>
                        ))}
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
