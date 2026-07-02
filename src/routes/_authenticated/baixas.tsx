import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL, formatNum } from "@/lib/inventory";
import { CheckCircle2, XCircle, MessageSquareWarning, PackageMinus, Loader2, ScanBarcode } from "lucide-react";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";


export const Route = createFileRoute("/_authenticated/baixas")({
  component: BaixasPage,
  head: () => ({ meta: [{ title: "Baixas Operacionais" }] }),
});

const MAX_BYTES = 10 * 1024 * 1024;
const STATUS_TONES: Record<string, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  ANALISE: "bg-info/15 text-info",
  APROVADA: "bg-success/15 text-success",
  REPROVADA: "bg-destructive/15 text-destructive",
  AJUSTE_SOLICITADO: "bg-warning/20 text-warning-foreground",
  EXECUTADA: "bg-primary/15 text-primary",
};

function BaixasPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Baixas Operacionais</h1>
        <p className="text-sm text-muted-foreground">
          Solicitação, aprovação e execução de baixas de estoque com rastreabilidade.
        </p>
      </div>

      <Tabs defaultValue="nova">
        <TabsList>
          <TabsTrigger value="nova">Nova Solicitação</TabsTrigger>
          <TabsTrigger value="fila">Fila de Aprovação</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="nova"><NovaBaixaForm /></TabsContent>
        <TabsContent value="fila"><FilaAprovacao /></TabsContent>
        <TabsContent value="historico"><Historico /></TabsContent>
      </Tabs>
    </div>
  );
}

function NovaBaixaForm() {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    codigo_produto: "", descricao: "", lote: "", unidade: "UN", id_local: "",
    quantidade: "", custo_unitario: "", motivo_baixa_id: "", observacao: "",
  });
  const [foto, setFoto] = useState<File | null>(null);

  const motivosQ = useQuery({
    queryKey: ["motivo_baixa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa").select("*").eq("ativo", true).order("descricao");
      if (error) throw error;
      return data as Array<{ id: string; descricao: string }>;
    },
  });

  const qtd = Number(form.quantidade || 0);
  const custo = Number(form.custo_unitario || 0);
  const valorTotal = qtd * custo;

  async function buscarProduto() {
    if (!form.codigo_produto) return;
    const q = (supabase as any)
      .from("estoque_sistemico")
      .select("descricao, unidade, id_local, custo_unitario, lote")
      .eq("id_produto", form.codigo_produto);
    if (form.lote) q.eq("lote", form.lote);
    const { data } = await q.limit(1).maybeSingle();
    if (data) {
      setForm((f) => ({
        ...f,
        descricao: data.descricao ?? f.descricao,
        unidade: data.unidade ?? f.unidade,
        id_local: data.id_local ?? f.id_local,
        custo_unitario: data.custo_unitario != null ? String(data.custo_unitario) : f.custo_unitario,
      }));
    } else {
      toast.message("Produto não encontrado no estoque sistêmico — preencha manualmente.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foto) return toast.error("Foto é obrigatória");
    if (!["image/jpeg", "image/png", "image/jpg"].includes(foto.type)) return toast.error("Use JPG ou PNG");
    if (foto.size > MAX_BYTES) return toast.error("Foto excede 10MB");
    if (!form.codigo_produto || !form.descricao || !qtd) return toast.error("Preencha código, descrição e quantidade");
    if (!form.motivo_baixa_id) return toast.error("Selecione o motivo");

    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      // bloqueia estoque negativo
      const { data: saldo } = await (supabase as any)
        .from("estoque_sistemico")
        .select("quantidade")
        .eq("id_produto", form.codigo_produto)
        .eq("lote", form.lote || "")
        .maybeSingle();
      if (saldo && Number(saldo.quantidade) < qtd) {
        setSubmitting(false);
        return toast.error(`Estoque insuficiente. Saldo atual: ${saldo.quantidade}`);
      }

      // upload foto
      const ext = foto.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("baixas-fotos").upload(path, foto, { contentType: foto.type });
      if (up.error) throw up.error;

      const { error } = await (supabase as any).from("baixa_operacional").insert({
        codigo_produto: form.codigo_produto,
        descricao: form.descricao,
        lote: form.lote || null,
        unidade: form.unidade || null,
        id_local: form.id_local || null,
        quantidade: qtd,
        custo_unitario: custo,
        motivo_baixa_id: form.motivo_baixa_id,
        observacao: form.observacao || null,
        foto_url: path,
        solicitante_id: user.id,
        status_fluxo: "PENDENTE",
      });
      if (error) throw error;

      await (supabase as any).from("audit_logs").insert({
        usuario: user.id, acao: "CRIAR_BAIXA", entidade: "baixa_operacional",
        payload: { codigo_produto: form.codigo_produto, lote: form.lote, quantidade: qtd, valor_total: valorTotal },
      });

      toast.success("Solicitação de baixa criada");
      setForm({ codigo_produto: "", descricao: "", lote: "", unidade: "UN", id_local: "", quantidade: "", custo_unitario: "", motivo_baixa_id: "", observacao: "" });
      setFoto(null);
      qc.invalidateQueries({ queryKey: ["baixas"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao registrar baixa");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Nova Solicitação de Baixa</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Código do Produto *</Label>
            <div className="flex gap-2">
              <Input value={form.codigo_produto} onChange={(e) => setForm({ ...form, codigo_produto: e.target.value })} onBlur={buscarProduto} />
              <Button type="button" variant="outline" onClick={buscarProduto}>Buscar</Button>
            </div>
          </div>
          <div>
            <Label>Lote</Label>
            <Input value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} onBlur={buscarProduto} />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição *</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
          </div>
          <div>
            <Label>Local</Label>
            <Input value={form.id_local} onChange={(e) => setForm({ ...form, id_local: e.target.value })} />
          </div>
          <div>
            <Label>Quantidade *</Label>
            <Input type="number" step="0.001" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
          </div>
          <div>
            <Label>Custo Unitário</Label>
            <Input type="number" step="0.01" value={form.custo_unitario} onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })} />
          </div>
          <div>
            <Label>Motivo *</Label>
            <Select value={form.motivo_baixa_id} onValueChange={(v) => setForm({ ...form, motivo_baixa_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(motivosQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.descricao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor Total (calculado)</Label>
            <Input value={formatBRL(valorTotal)} readOnly className="bg-muted" />
          </div>
          <div className="md:col-span-2">
            <Label>Observação</Label>
            <Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Foto * (JPG/PNG, máx 10MB)</Label>
            <Input type="file" accept="image/jpeg,image/png,image/jpg" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            {foto && <div className="mt-2 text-xs text-muted-foreground">{foto.name} — {(foto.size / 1024).toFixed(0)} KB</div>}
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <PackageMinus className="size-4" />}
              Solicitar Baixa
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function useBaixas(statuses: string[]) {
  return useQuery({
    queryKey: ["baixas", statuses],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("baixa_operacional")
        .select("*, motivo:motivo_baixa(descricao)")
        .in("status_fluxo", statuses)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

function FilaAprovacao() {
  const { isAdmin, role } = useRole();
  const podeAprovar = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const { data } = useBaixas(["PENDENTE", "ANALISE", "AJUSTE_SOLICITADO"]);

  async function decidir(b: any, acao: "APROVADA" | "REPROVADA" | "AJUSTE_SOLICITADO") {
    const comentario = window.prompt(
      acao === "APROVADA" ? "Comentário (opcional):" : "Informe o motivo:"
    );
    if (acao !== "APROVADA" && !comentario) return;
    const user = (await supabase.auth.getUser()).data.user!;
    const { error } = await (supabase as any).from("baixa_operacional").update({
      status_fluxo: acao,
      aprovador_id: user.id,
      data_aprovacao: new Date().toISOString(),
      comentario_aprovacao: comentario,
    }).eq("id", b.id);
    if (error) return toast.error(error.message);
    await (supabase as any).from("audit_logs").insert({
      usuario: user.id, acao: `BAIXA_${acao}`, entidade: "baixa_operacional", entidade_id: b.id,
      payload: { codigo_produto: b.codigo_produto, lote: b.lote, quantidade: b.quantidade, comentario },
    });
    toast.success(`Baixa ${acao.toLowerCase()}`);
    qc.invalidateQueries({ queryKey: ["baixas"] });
  }

  async function executar(b: any) {
    if (!confirm(`Executar baixa de ${b.quantidade} ${b.unidade ?? ""} do produto ${b.codigo_produto}?`)) return;
    const user = (await supabase.auth.getUser()).data.user!;

    // Re-checa estoque e atualiza
    const { data: est } = await (supabase as any)
      .from("estoque_sistemico")
      .select("id, quantidade")
      .eq("id_produto", b.codigo_produto)
      .eq("lote", b.lote ?? "")
      .maybeSingle();
    if (!est) return toast.error("Estoque do produto/lote não encontrado");
    const novo = Number(est.quantidade) - Number(b.quantidade);
    if (novo < 0) return toast.error("Estoque negativo bloqueado");

    const upd = await (supabase as any).from("estoque_sistemico")
      .update({ quantidade: novo }).eq("id", est.id);
    if (upd.error) return toast.error(upd.error.message);

    const { error } = await (supabase as any).from("baixa_operacional").update({
      status_fluxo: "EXECUTADA",
      data_execucao: new Date().toISOString(),
    }).eq("id", b.id);
    if (error) return toast.error(error.message);

    await (supabase as any).from("audit_logs").insert({
      usuario: user.id, acao: "BAIXA_EXECUTADA", entidade: "baixa_operacional", entidade_id: b.id,
      payload: { codigo_produto: b.codigo_produto, lote: b.lote, quantidade: b.quantidade, saldo_anterior: est.quantidade, saldo_novo: novo },
    });
    toast.success("Baixa executada e estoque atualizado");
    qc.invalidateQueries({ queryKey: ["baixas"] });
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhuma baixa pendente</TableCell></TableRow>
            )}
            {(data ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                <TableCell className="max-w-xs truncate">{b.descricao}</TableCell>
                <TableCell className="font-mono text-xs">{b.lote || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNum(Number(b.quantidade))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(Number(b.valor_total))}</TableCell>
                <TableCell className="text-xs">{b.motivo?.descricao ?? "—"}</TableCell>
                <TableCell>
                  <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${STATUS_TONES[b.status_fluxo]}`}>{b.status_fluxo}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    {podeAprovar && b.status_fluxo !== "APROVADA" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => decidir(b, "AJUSTE_SOLICITADO")}>
                          <MessageSquareWarning className="size-3.5 mr-1" /> Ajuste
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decidir(b, "REPROVADA")}>
                          <XCircle className="size-3.5 mr-1" /> Reprovar
                        </Button>
                        <Button size="sm" onClick={() => decidir(b, "APROVADA")}>
                          <CheckCircle2 className="size-3.5 mr-1" /> Aprovar
                        </Button>
                      </>
                    )}
                    {podeAprovar && b.status_fluxo === "APROVADA" && (
                      <Button size="sm" onClick={() => executar(b)}>
                        <PackageMinus className="size-3.5 mr-1" /> Executar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Historico() {
  const { data } = useBaixas(["APROVADA", "REPROVADA", "EXECUTADA"]);
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell className="text-xs">{new Date(b.data_solicitacao).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                <TableCell className="max-w-xs truncate">{b.descricao}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNum(Number(b.quantidade))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(Number(b.valor_total))}</TableCell>
                <TableCell className="text-xs">{b.motivo?.descricao ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{b.status_fluxo}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
