import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Shield, ExternalLink } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuários" }] }),
});

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

  const origensQ = useQuery({
    queryKey: ["origens-ativas-usuarios"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem, descricao")
        .eq("ativo", true).order("codigo_origem");
      return data ?? [];
    },
  });

  const usuariosQ = useQuery({
    queryKey: ["usuarios"],
    enabled: podeGerir,
    queryFn: async () => {
      const [profilesRes, rolesRes, almoxRes] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("*"),
        (supabase as any).from("usuario_almoxarifados").select("user_id, codigo_origem"),
      ]);
      const profiles = profilesRes.data ?? [];
      const roles = rolesRes.data ?? [];
      const almox = (almoxRes.data ?? []) as { user_id: string; codigo_origem: string }[];
      return profiles.map((p) => ({
        ...p,
        role: (roles.find((r) => r.user_id === p.id)?.role ?? null) as Role | null,
        almoxes: almox.filter((a) => a.user_id === p.id).map((a) => a.codigo_origem),
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

  async function changeAlmoxes(userId: string, next: string[]) {
    const del = await (supabase as any).from("usuario_almoxarifados").delete().eq("user_id", userId);
    if (del.error) return toast.error(del.error.message);
    if (next.length > 0) {
      const ins = await (supabase as any).from("usuario_almoxarifados").insert(
        next.map((codigo_origem) => ({ user_id: userId, codigo_origem })),
      );
      if (ins.error) return toast.error(ins.error.message);
    }
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("audit_logs").insert({
      usuario: me, acao: "ALTERAR_ALMOX", entidade: "usuario_almoxarifados",
      entidade_id: userId, payload: { almoxes: next },
    });
    toast.success(next.length === 0 ? "Acesso liberado a todos os almoxarifados" : `Acesso restrito a ${next.length} almoxarifado(s)`);
    qc.invalidateQueries({ queryKey: ["usuarios"] });
    qc.invalidateQueries({ queryKey: ["meus-almox"] });
  }

  if (!podeGerir) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  const perfis = perfisQ.data ?? [];
  const origensOpts = (origensQ.data ?? []).map((o) => ({
    value: o.codigo_origem, label: o.descricao || o.codigo_origem,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Usuários & Perfis</h1>
          <p className="text-sm text-muted-foreground">
            Atribua um perfil e defina quais almoxarifados cada usuário pode acessar.
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
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-44">Perfil</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead className="w-72">Almoxarifados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuariosQ.data?.map((u) => {
                const nivel = u.role ? NIVEL[u.role] : null;
                const irrestrito = u.role === "ADMINISTRADOR" || u.role === "COORDENADOR_CONTROLE";
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
                    <TableCell>
                      {irrestrito ? (
                        <Badge variant="default" className="text-[10px]">Todos (irrestrito)</Badge>
                      ) : (
                        <MultiSelect
                          options={origensOpts}
                          value={u.almoxes}
                          onChange={(v) => changeAlmoxes(u.id, v)}
                          placeholder="Buscar almoxarifado…"
                          allLabel="Todos"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Vazio = acesso a todos os almoxarifados. Uma ou mais seleções = acesso restrito a esses.
        Administrador e Coordenador de Controle sempre têm acesso irrestrito.
      </p>
    </div>
  );
}
