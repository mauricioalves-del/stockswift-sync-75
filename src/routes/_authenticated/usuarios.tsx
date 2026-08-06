import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Shield, ExternalLink, UserCheck, Trash2, Clock } from "lucide-react";
import { deleteUsuario } from "@/lib/usuarios.functions";
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
  const deleteFn = useServerFn(deleteUsuario);
  const [toDelete, setToDelete] = useState<{ id: string; nome: string } | null>(null);

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
      const profiles = (profilesRes.data ?? []) as any[];
      const roles = rolesRes.data ?? [];
      const almox = (almoxRes.data ?? []) as { user_id: string; codigo_origem: string }[];
      return profiles.map((p) => ({
        ...p,
        aprovado: Boolean(p.aprovado),
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

  async function aprovar(userId: string, perfilRole: Role) {
    // 1) atribui perfil
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error: rErr } = await supabase.from("user_roles").insert({ user_id: userId, role: perfilRole });
    if (rErr) return toast.error(rErr.message);
    // 2) marca como aprovado
    const { error: pErr } = await (supabase as any).from("profiles").update({ aprovado: true }).eq("id", userId);
    if (pErr) return toast.error(pErr.message);
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("audit_logs").insert({
      usuario: me, acao: "APROVAR_USUARIO", entidade: "profiles",
      entidade_id: userId, payload: { role: perfilRole },
    });
    toast.success("Usuário aprovado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteFn({ data: { userId: toDelete.id } });
      toast.success(`Usuário ${toDelete.nome} excluído`);
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir usuário");
    }
  }

  if (!podeGerir) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  const perfis = perfisQ.data ?? [];
  const origensOpts = (origensQ.data ?? []).map((o) => ({
    value: o.codigo_origem, label: o.descricao || o.codigo_origem,
  }));

  const pendentes = (usuariosQ.data ?? []).filter((u) => !u.aprovado);
  const ativos = (usuariosQ.data ?? []).filter((u) => u.aprovado);
  const perfilPadrao: Role = (perfis.find((p) => p.role_key === "INVENTARIANTE")?.role_key
    ?? perfis[0]?.role_key ?? "INVENTARIANTE") as Role;

  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Usuários & Perfis</h1>
          <p className="text-sm text-muted-foreground">
            Aprove novos cadastros, atribua um perfil e defina quais almoxarifados cada usuário pode acessar.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/config/perfis">
            <Shield className="size-4 mr-1.5" /> Matriz de Permissões <ExternalLink className="size-3 ml-1" />
          </Link>
        </Button>
      </div>

      {/* Aguardando aprovação */}
      <Card className={pendentes.length > 0 ? "border-warning" : ""}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="size-4 text-warning-foreground" />
            Aguardando aprovação
            <Badge variant="secondary">{pendentes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p>
          ) : (
            <PendingTable
              rows={pendentes}
              perfis={perfis}
              perfilPadrao={perfilPadrao}
              onApprove={aprovar}
              onDelete={(u) => setToDelete({ id: u.id, nome: u.nome || u.email || u.id })}
            />
          )}
        </CardContent>
      </Card>

      {/* Ativos */}
      <Card>
        <CardHeader><CardTitle className="text-base">{ativos.length} usuário(s) ativos</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-44">Perfil</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead className="w-72">Almoxarifados</TableHead>
                <TableHead className="w-20 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ativos.map((u) => {
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setToDelete({ id: u.id, nome: u.nome || u.email || u.id })}
                        title="Excluir usuário"
                      >
                        <Trash2 className="size-4" />
                      </Button>
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

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário <strong>{toDelete?.nome}</strong> será removido permanentemente do sistema,
              incluindo perfis e vínculos de almoxarifado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PendingTable({
  rows, perfis, perfilPadrao, onApprove, onDelete,
}: {
  rows: any[];
  perfis: { id: string; nome: string; role_key: Role }[];
  perfilPadrao: Role;
  onApprove: (userId: string, role: Role) => void;
  onDelete: (u: any) => void;
}) {
  const [sel, setSel] = useState<Record<string, Role>>({});
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead className="w-56">Perfil a atribuir</TableHead>
          <TableHead className="w-56 text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => {
          const perfilSel = sel[u.id] ?? perfilPadrao;
          return (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.nome || "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Select value={perfilSel} onValueChange={(v) => setSel((s) => ({ ...s, [u.id]: v as Role }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {perfis.map((p) => (
                      <SelectItem key={p.id} value={p.role_key}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="sm" onClick={() => onApprove(u.id, perfilSel)}>
                  <UserCheck className="size-4 mr-1" /> Aprovar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(u)}
                  title="Recusar e excluir"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
