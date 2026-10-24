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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Shield, ExternalLink, UserCheck, Trash2, Clock, UserPlus, ShieldPlus } from "lucide-react";
import { deleteUsuario, createUsuario } from "@/lib/usuarios.functions";
import type { Database } from "@/integrations/supabase/types";
import { AtlasUsuariosMapa } from "@/components/atlas/AtlasUsuariosMapa";

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
  const createFn = useServerFn(createUsuario);
  const [toDelete, setToDelete] = useState<{ id: string; nome: string } | null>(null);
  const [novoUsuarioOpen, setNovoUsuarioOpen] = useState(false);
  const [novoPerfilOpen, setNovoPerfilOpen] = useState(false);

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

  async function changeRole(userId: string, newRole: Role, perfilId?: string) {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    if (perfilId) {
      const { error: pErr } = await (supabase as any).from("profiles").update({ perfil_id: perfilId }).eq("id", userId);
      if (pErr) return toast.error(pErr.message);
    }
    toast.success("Perfil atualizado");
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("audit_logs").insert({
      usuario: me, acao: "ALTERAR_PERFIL", entidade: "user_roles",
      entidade_id: userId, payload: { role: newRole, perfil_id: perfilId ?? null },
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

  async function criarPerfil(d: { nome: string; role_key: Role; descricao: string }) {
    const { error } = await (supabase as any).from("perfis")
      .insert({ nome: d.nome, role_key: d.role_key, descricao: d.descricao || null, ativo: true });
    if (error) return toast.error(error.message);
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("audit_logs").insert({
      usuario: me, acao: "CRIAR_PERFIL", entidade: "perfis",
      entidade_id: d.nome, payload: { role_key: d.role_key },
    });
    toast.success("Perfil criado");
    setNovoPerfilOpen(false);
    qc.invalidateQueries({ queryKey: ["perfis-ativos"] });
    qc.invalidateQueries({ queryKey: ["perfis"] });
  }

  async function criarUsuario(d: { nome: string; email: string; senha: string; role: Role; almoxes: string[] }) {
    try {
      await createFn({ data: d });
      toast.success("Usuário criado e aprovado");
      setNovoUsuarioOpen(false);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar usuário");
    }
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setNovoUsuarioOpen(true)}>
            <UserPlus className="size-4 mr-1.5" /> Novo usuário
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNovoPerfilOpen(true)}>
            <ShieldPlus className="size-4 mr-1.5" /> Novo perfil
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/config/perfis">
              <Shield className="size-4 mr-1.5" /> Matriz de Permissões <ExternalLink className="size-3 ml-1" />
            </Link>
          </Button>
        </div>
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
                      <Select
                        value={(perfis.find((p) => p.id === u.perfil_id && p.role_key === u.role) ?? perfis.find((p) => p.role_key === u.role))?.id ?? ""}
                        onValueChange={(id) => { const p = perfis.find((x) => x.id === id); if (p) changeRole(u.id, p.role_key, p.id); }}
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {perfis.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
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

      <AtlasUsuariosMapa />

      <NovoPerfilDialog open={novoPerfilOpen} onOpenChange={setNovoPerfilOpen} onSave={criarPerfil} />
      <NovoUsuarioDialog
        open={novoUsuarioOpen}
        onOpenChange={setNovoUsuarioOpen}
        perfis={perfis}
        origensOpts={origensOpts}
        onSave={criarUsuario}
      />
    </div>
  );
}

const ROLE_OPCOES: { value: Role; label: string }[] = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "COORDENADOR_CONTROLE", label: "Coordenador de Controle" },
  { value: "GERENTE", label: "Gerente" },
  { value: "DIRETOR_OPERACOES", label: "Diretor de Operações" },
  { value: "COORDENADOR_FINANCEIRO", label: "Coordenador Financeiro" },
  { value: "AUDITOR", label: "Auditor" },
  { value: "OPERADOR_ESTOQUE", label: "Operador de Estoque" },
  { value: "VENDEDOR", label: "Vendedor" },
  { value: "INVENTARIANTE", label: "Inventariante" },
  { value: "CONSULTA", label: "Consulta" },
];

function NovoPerfilDialog({
  open, onOpenChange, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (d: { nome: string; role_key: Role; descricao: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [roleKey, setRoleKey] = useState<Role>("CONSULTA");
  const [descricao, setDescricao] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo perfil de acesso</DialogTitle>
          <DialogDescription>
            O perfil passa a aparecer na lista de perfis atribuíveis aos usuários.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="np-nome">Nome do perfil</Label>
            <Input id="np-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Supervisor de Loja" />
          </div>
          <div className="space-y-1.5">
            <Label>Nível de acesso base</Label>
            <Select value={roleKey} onValueChange={(v) => setRoleKey(v as Role)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPCOES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-desc">Descrição (opcional)</Label>
            <Textarea id="np-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!nome.trim()} onClick={() => onSave({ nome: nome.trim(), role_key: roleKey, descricao: descricao.trim() })}>
            Criar perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoUsuarioDialog({
  open, onOpenChange, perfis, origensOpts, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  perfis: { id: string; nome: string; role_key: Role }[];
  origensOpts: { value: string; label: string }[];
  onSave: (d: { nome: string; email: string; senha: string; role: Role; almoxes: string[] }) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [almoxes, setAlmoxes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const perfilSel = (role || perfis[0]?.role_key || "") as Role | "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valido = nome.trim().length > 0 && emailOk && senha.length >= 6 && !!perfilSel;

  async function salvar() {
    if (!valido || !perfilSel) return;
    setSaving(true);
    await onSave({ nome: nome.trim(), email: email.trim(), senha, role: perfilSel, almoxes });
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cadastra a pessoa direto no sistema, já aprovada e com perfil — sem precisar de auto-registro.
            Ela entra com o e-mail e a senha definidos aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nu-nome">Nome</Label>
            <Input id="nu-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-email">E-mail</Label>
            <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@magiochocolates.com.br" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-senha">Senha inicial</Label>
            <Input id="nu-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={perfilSel} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
              <SelectContent>
                {perfis.map((p) => (
                  <SelectItem key={p.id} value={p.role_key}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Almoxarifados</Label>
            <MultiSelect
              options={origensOpts}
              value={almoxes}
              onChange={setAlmoxes}
              placeholder="Buscar almoxarifado…"
              allLabel="Todos"
            />
            <p className="text-xs text-muted-foreground">Vazio = acesso a todos os almoxarifados.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valido || saving} onClick={salvar}>
            {saving ? "Criando..." : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
