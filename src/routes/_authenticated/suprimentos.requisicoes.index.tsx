import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, Loader2, Check, X, Trash2, PackageCheck, Printer, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { formatBRL } from "@/lib/inventory";
import { SepararRequisicaoDialog } from "@/components/suprimentos/SepararRequisicaoDialog";

export const Route = createFileRoute("/_authenticated/suprimentos/requisicoes/")({
  component: RequisicoesPage,
  head: () => ({ meta: [{ title: "Requisições" }] }),
});

type Req = {
  id: string; numero: string; origem_solicitante: string; origem_fornecedora: string;
  solicitante: string; tipo: string; status: string; valor_total: number;
  observacao: string | null; motivo_rejeicao: string | null; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: "bg-muted text-muted-foreground",
  ENVIADA: "bg-info/15 text-info",
  APROVADA: "bg-success/15 text-success",
  REJEITADA: "bg-destructive/15 text-destructive",
  AGUARDANDO_SEPARACAO: "bg-warning/20 text-warning-foreground",
  EM_SEPARACAO: "bg-warning/20 text-warning-foreground",
  SEPARADA_TOTAL: "bg-success/15 text-success",
  SEPARADA_PARCIAL: "bg-warning/20 text-warning-foreground",
  NAO_ATENDIDA: "bg-destructive/15 text-destructive",
  ATENDIDA: "bg-success/15 text-success",
  CANCELADA: "bg-muted text-muted-foreground",
};

const STATUS_SEPARAVEL = new Set(["ENVIADA", "APROVADA", "AGUARDANDO_SEPARACAO", "EM_SEPARACAO", "SEPARADA_PARCIAL"]);

function RequisicoesPage() {
  const { isAdmin, canWrite } = useRole();
  const qc = useQueryClient();
  const [statusF, setStatusF] = useState<string>("__all");
  const [novoOpen, setNovoOpen] = useState(false);
  const [rejeitarOpen, setRejeitarOpen] = useState<Req | null>(null);
  const [motivoRej, setMotivoRej] = useState("");
  const [separarOpen, setSepararOpen] = useState<Req | null>(null);

  const q = useQuery({
    queryKey: ["requisicoes", statusF],
    queryFn: async () => {
      let query = supabase.from("requisicoes" as never).select("*").order("created_at", { ascending: false });
      if (statusF !== "__all") query = query.eq("status", statusF);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Req[];
    },
  });

  const kpis = useMemo(() => {
    const list = q.data ?? [];
    return {
      total: list.length,
      pendentes: list.filter((r) => r.status === "ENVIADA").length,
      aprovadas: list.filter((r) => r.status === "APROVADA").length,
      valor: list.reduce((s, r) => s + Number(r.valor_total ?? 0), 0),
    };
  }, [q.data]);

  const aprovar = useMutation({
    mutationFn: async (r: Req) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("requisicoes" as never).update({
        status: "APROVADA", aprovador: u.user?.id, data_aprovacao: new Date().toISOString(),
      } as never).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisição aprovada"); qc.invalidateQueries({ queryKey: ["requisicoes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejeitar = useMutation({
    mutationFn: async ({ r, motivo }: { r: Req; motivo: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("requisicoes" as never).update({
        status: "REJEITADA", aprovador: u.user?.id, data_aprovacao: new Date().toISOString(),
        motivo_rejeicao: motivo,
      } as never).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Requisição rejeitada");
      setRejeitarOpen(null); setMotivoRej("");
      qc.invalidateQueries({ queryKey: ["requisicoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (r: Req) => {
      const { error } = await supabase.from("requisicoes" as never).update({ status: "CANCELADA" } as never).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisição cancelada"); qc.invalidateQueries({ queryKey: ["requisicoes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="size-6" /> Requisições</h1>
          <p className="text-sm text-muted-foreground">Solicitações de transferência entre almox.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)}><Plus className="size-4 mr-1" /> Nova requisição</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Total" value={String(kpis.total)} />
        <KPI label="Pendentes" value={String(kpis.pendentes)} />
        <KPI label="Aprovadas" value={String(kpis.aprovadas)} />
        <KPI label="Valor total" value={formatBRL(kpis.valor)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtro</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {Object.keys(STATUS_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(q.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-xs">{r.origem_fornecedora}</TableCell>
                      <TableCell className="text-xs">{r.origem_solicitante}</TableCell>
                      <TableCell className="text-xs">{r.tipo}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(Number(r.valor_total ?? 0))}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isAdmin && r.status === "ENVIADA" && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => aprovar.mutate(r)} title="Aprovar">
                                <Check className="size-4 text-success" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejeitarOpen(r)} title="Rejeitar">
                                <X className="size-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {canWrite && STATUS_SEPARAVEL.has(r.status) && (
                            <Button size="sm" variant="ghost" onClick={() => setSepararOpen(r)} title="Separar (FEFO)">
                              <PackageCheck className="size-4 text-info" />
                            </Button>
                          )}
                          {STATUS_SEPARAVEL.has(r.status) && (
                            <Button
                              size="sm" variant="ghost" title="Imprimir ficha de separação"
                              onClick={() => window.open(`/suprimentos/requisicoes/${r.id}/ficha`, "_blank")}
                            >
                              <Printer className="size-4 text-muted-foreground" />
                            </Button>
                          )}
                          {(r.status === "RASCUNHO" || r.status === "ENVIADA") && (
                            <Button size="sm" variant="ghost" onClick={() => cancelar.mutate(r)} title="Cancelar">
                              <Trash2 className="size-4 text-muted-foreground" />
                            </Button>
                          )}
                          <Button asChild size="sm" variant="link">
                            <Link to="/suprimentos/requisicoes/$id" params={{ id: r.id }}>Ver</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(q.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-6">Nenhuma requisição.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NovaRequisicaoDialog open={novoOpen} onClose={() => setNovoOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["requisicoes"] })} />

      <SepararRequisicaoDialog
        requisicao={separarOpen}
        open={!!separarOpen}
        onClose={() => setSepararOpen(null)}
      />



      <Dialog open={!!rejeitarOpen} onOpenChange={(o) => { if (!o) { setRejeitarOpen(null); setMotivoRej(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar requisição {rejeitarOpen?.numero}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo</Label>
            <Textarea value={motivoRej} onChange={(e) => setMotivoRej(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejeitarOpen(null); setMotivoRej(""); }}>Cancelar</Button>
            <Button variant="destructive" disabled={!motivoRej.trim()} onClick={() => rejeitarOpen && rejeitar.mutate({ r: rejeitarOpen, motivo: motivoRej })}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaRequisicaoDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const nav = useNavigate();
  const [origemSolic, setOrigemSolic] = useState("");
  const [origemForn, setOrigemForn] = useState("");
  const [tipo, setTipo] = useState("NORMAL");
  const [obs, setObs] = useState("");

  const origensQ = useQuery({
    queryKey: ["origens_req"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem").eq("ativo", true).order("codigo_origem");
      return (data ?? []).map((o) => o.codigo_origem as string);
    },
    enabled: open,
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const numero = `REQ-${Date.now().toString().slice(-8)}`;
      const { data, error } = await supabase.from("requisicoes" as never).insert({
        numero, origem_solicitante: origemSolic, origem_fornecedora: origemForn,
        solicitante: u.user?.id, tipo, status: "RASCUNHO", observacao: obs || null,
      } as never).select("id").single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: (row) => {
      toast.success("Requisição criada — adicione os itens");
      setOrigemSolic(""); setOrigemForn(""); setObs("");
      onCreated(); onClose();
      if (row?.id) nav({ to: "/suprimentos/requisicoes/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova requisição</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Almox solicitante (destino)</Label>
            <Select value={origemSolic} onValueChange={setOrigemSolic}>
              <SelectTrigger><SelectValue placeholder="selecionar…" /></SelectTrigger>
              <SelectContent>
                {(origensQ.data ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Almox fornecedor (origem)</Label>
            <Select value={origemForn} onValueChange={setOrigemForn}>
              <SelectTrigger><SelectValue placeholder="selecionar…" /></SelectTrigger>
              <SelectContent>
                {(origensQ.data ?? []).filter((c) => c !== origemSolic).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="URGENTE">Urgente</SelectItem>
                <SelectItem value="EXTRA">Extra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Após criar, abra a requisição para adicionar itens e enviar para aprovação.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!origemSolic || !origemForn || criar.isPending} onClick={() => criar.mutate()}>
            {criar.isPending && <Loader2 className="size-4 mr-1 animate-spin" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
