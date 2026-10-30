import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PAPEIS_ASSINATURA } from "@/lib/atlas-fechamento";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sb = supabase as any;
const TODOS = "__todos__";
type Resp = { id: number; papel: string; almoxarifado: string | null; user_id: string; ativo: boolean };
type Perfil = { id: string; nome: string; email: string };
type Pend = { fechamento_id: number; almoxarifado: string | null; papel: string; papel_nome: string; dias_aberto: number; origem_responsavel: string | null; user_id: string | null; nome: string | null; email: string | null };
type Envio = { id: number; enviado_em: string; email: string; tipo: string; fechamentos: number[]; ok: boolean; erro: string | null };

export function ResponsaveisAssinatura({ open, onOpenChange, almoxarifados }: { open: boolean; onOpenChange: (v: boolean) => void; almoxarifados: string[] }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ papel: "Responsavel_Departamento", almox: TODOS, user: "" });
  const [salvando, setSalvando] = useState(false);

  const q = useQuery({
    enabled: open,
    queryKey: ["atlas-resp-assinatura"],
    queryFn: async () => {
      const [r, p, pend, env] = await Promise.all([
        sb.from("atlas_responsaveis_assinatura").select("id, papel, almoxarifado, user_id, ativo").order("papel").order("almoxarifado", { nullsFirst: true }),
        sb.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
        sb.rpc("pendencias_assinatura_inventario"),
        sb.from("alertas_assinatura_envios").select("id, enviado_em, email, tipo, fechamentos, ok, erro").order("enviado_em", { ascending: false }).limit(15),
      ]);
      for (const x of [r, p, pend]) if (x.error) throw x.error;
      return { resp: r.data as Resp[], perfis: p.data as Perfil[], pend: pend.data as Pend[], envios: (env.data ?? []) as Envio[] };
    },
  });
  const nomes = useMemo(() => new Map((q.data?.perfis ?? []).map((p) => [p.id, p])), [q.data]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["atlas-resp-assinatura"] });

  async function adicionar() {
    if (!novo.user) return toast.error("Escolha o usuário.");
    setSalvando(true);
    const { error } = await sb.from("atlas_responsaveis_assinatura").insert({ papel: novo.papel, almoxarifado: novo.almox === TODOS ? null : novo.almox, user_id: novo.user });
    setSalvando(false);
    if (error) return toast.error(error.code === "23505" ? "Esse usuário já é responsável por esse papel e almoxarifado." : "Não consegui salvar: " + error.message);
    toast.success("Responsável cadastrado."); setNovo({ ...novo, user: "" }); recarregar();
  }
  async function alternar(r: Resp) {
    const { error } = await sb.from("atlas_responsaveis_assinatura").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    recarregar();
  }
  async function remover(r: Resp) {
    if (!confirm("Remover este responsável? Ele deixa de receber o alerta diário.")) return;
    const { error } = await sb.from("atlas_responsaveis_assinatura").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    recarregar();
  }

  const semResp = (q.data?.pend ?? []).filter((p) => !p.user_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="size-5" /> Responsáveis pelas assinaturas</DialogTitle>
          <DialogDescription>
            Todo dia às 12h, cada responsável recebe um e-mail e uma tarefa no sino com os fechamentos que ainda dependem da assinatura dele, até assinar.
            Ordem de definição: responsável do almoxarifado → responsável de todos os almoxarifados → usuários com o perfil do papel. Sem ninguém, o alerta vai aos administradores.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</div>}
        {q.error && <div className="text-sm text-red-600">Erro: {(q.error as Error).message}</div>}
        {q.data && (
          <div className="space-y-6">
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
              <div className="space-y-1"><Label className="text-xs">Papel</Label>
                <Select value={novo.papel} onValueChange={(v) => setNovo({ ...novo, papel: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PAPEIS_ASSINATURA).map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Almoxarifado</Label>
                <Select value={novo.almox} onValueChange={(v) => setNovo({ ...novo, almox: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={TODOS}>Todos os almoxarifados</SelectItem>{almoxarifados.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Usuário (e-mail do cadastro)</Label>
                <Select value={novo.user} onValueChange={(v) => setNovo({ ...novo, user: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o usuário" /></SelectTrigger>
                  <SelectContent>{q.data.perfis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {p.email}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="h-9 gap-1" onClick={adicionar} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Adicionar</Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Cadastro atual</h3>
              {q.data.resp.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum responsável cadastrado ainda.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Papel</TableHead><TableHead>Almoxarifado</TableHead><TableHead>Usuário</TableHead><TableHead>Ativo</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {q.data.resp.map((r) => {
                      const p = nomes.get(r.user_id);
                      return (
                        <TableRow key={r.id} className={r.ativo ? "" : "opacity-50"}>
                          <TableCell className="text-xs">{PAPEIS_ASSINATURA[r.papel] ?? r.papel}</TableCell>
                          <TableCell className="text-xs">{r.almoxarifado ?? <i>Todos</i>}</TableCell>
                          <TableCell className="text-xs">{p ? <>{p.nome} <span className="text-muted-foreground">· {p.email}</span></> : <span className="text-red-600">usuário não aprovado</span>}</TableCell>
                          <TableCell><Switch checked={r.ativo} onCheckedChange={() => alternar(r)} /></TableCell>
                          <TableCell><Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => remover(r)} aria-label="Remover"><Trash2 className="size-4" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="mb-1 text-sm font-semibold">Quem recebe o alerta hoje</h3>
              {semResp.length > 0 && <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">{semResp.length} assinatura(s) pendente(s) sem responsável: o alerta delas vai aos administradores até alguém ser cadastrado.</p>}
              {q.data.pend.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma assinatura pendente.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Almoxarifado</TableHead><TableHead>Papel</TableHead><TableHead className="text-right">Dias</TableHead><TableHead>Recebe</TableHead><TableHead>Definido por</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {q.data.pend.map((p, i) => (
                      <TableRow key={`${p.fechamento_id}-${p.papel}-${p.user_id ?? i}`}>
                        <TableCell className="text-xs font-semibold">{p.fechamento_id}</TableCell>
                        <TableCell className="text-xs">{p.almoxarifado}</TableCell>
                        <TableCell className="text-xs">{p.papel_nome}</TableCell>
                        <TableCell className={`text-right text-xs font-semibold tabular-nums ${p.dias_aberto >= 5 ? "text-red-600" : p.dias_aberto >= 2 ? "text-amber-600" : ""}`}>{p.dias_aberto}</TableCell>
                        <TableCell className="text-xs">{p.user_id ? <>{p.nome} <span className="text-muted-foreground">· {p.email}</span></> : <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-300">Sem responsável → administradores</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.origem_responsavel ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Últimos envios</h3>
              {q.data.envios.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum envio ainda. O primeiro sai no próximo 12h.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Para</TableHead><TableHead>Fechamentos</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {q.data.envios.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(e.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</TableCell>
                        <TableCell className="text-xs">{e.email}{e.tipo === "SEM_RESPONSAVEL" && <span className="text-muted-foreground"> (sem responsável)</span>}</TableCell>
                        <TableCell className="text-xs">{e.fechamentos.map((f) => `#${f}`).join(", ")}</TableCell>
                        <TableCell className="text-xs">{e.ok ? <span className="text-emerald-600">Enviado</span> : <span className="text-red-600" title={e.erro ?? ""}>Falhou</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
