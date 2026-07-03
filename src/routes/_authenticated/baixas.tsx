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
import { CheckCircle2, XCircle, MessageSquareWarning, PackageMinus, Loader2, ScanBarcode, Check, ChevronsUpDown, List } from "lucide-react";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";


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
  const [ean, setEan] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [produto, setProduto] = useState<{
    id_produto: string; descricao: string; unidade: string;
  } | null>(null);
  const [origem, setOrigem] = useState("");
  const [loteSel, setLoteSel] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const motivosQ = useQuery({
    queryKey: ["motivo_baixa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa").select("*").eq("ativo", true).order("descricao");
      if (error) throw error;
      return data as Array<{ id: string; descricao: string }>;
    },
  });

  // Lista de produtos distintos para seleção manual (fallback ao scanner)
  const produtosQ = useQuery({
    queryKey: ["produtos-distintos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_sistemico")
        .select("id_produto, descricao, unidade")
        .order("id_produto");
      if (error) throw error;
      const map = new Map<string, { id_produto: string; descricao: string; unidade: string }>();
      for (const r of (data ?? []) as any[]) {
        if (r.id_produto && !map.has(r.id_produto)) {
          map.set(r.id_produto, { id_produto: r.id_produto, descricao: r.descricao ?? "", unidade: r.unidade ?? "" });
        }
      }
      return Array.from(map.values());
    },
  });

  // Todas as linhas de estoque do produto selecionado (todas origens/lotes)
  const estoqueQ = useQuery({
    queryKey: ["estoque-por-produto", produto?.id_produto],
    enabled: !!produto?.id_produto,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_sistemico")
        .select("id, id_produto, descricao, unidade, lote, origem, quantidade, custo_unitario, data_validade")
        .eq("id_produto", produto!.id_produto);
      if (error) throw error;
      return data as Array<{
        id: string; id_produto: string; descricao: string; unidade: string;
        lote: string; origem: string; quantidade: number; custo_unitario: number; data_validade: string | null;
      }>;
    },
  });

  const origensDisponiveis = useMemo(() => {
    const set = new Set((estoqueQ.data ?? []).map((e) => e.origem).filter(Boolean));
    return Array.from(set).sort();
  }, [estoqueQ.data]);

  const lotesDisponiveis = useMemo(() => {
    if (!origem) return [];
    return (estoqueQ.data ?? [])
      .filter((e) => e.origem === origem && Number(e.quantidade) > 0)
      .sort((a, b) => (a.lote ?? "").localeCompare(b.lote ?? ""));
  }, [estoqueQ.data, origem]);

  const linhaSelecionada = useMemo(() => {
    return (estoqueQ.data ?? []).find((e) => e.origem === origem && (e.lote ?? "") === loteSel) ?? null;
  }, [estoqueQ.data, origem, loteSel]);

  // Reset em cascata
  useEffect(() => { setOrigem(""); setLoteSel(""); }, [produto?.id_produto]);
  useEffect(() => { setLoteSel(""); }, [origem]);

  const qtd = Number(quantidade || 0);
  const custo = Number(linhaSelecionada?.custo_unitario ?? 0);
  const valorTotal = qtd * custo;
  const saldo = Number(linhaSelecionada?.quantidade ?? 0);

  async function buscarPorEAN(codigo: string) {
    const code = codigo.trim();
    if (!code) return;
    setEan(code);
    const { data, error } = await (supabase as any)
      .from("estoque_sistemico")
      .select("id_produto, descricao, unidade")
      .eq("ean", code)
      .limit(1)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) {
      setProduto(null);
      return toast.error(`EAN ${code} não encontrado na base de estoque`);
    }
    setProduto({ id_produto: data.id_produto, descricao: data.descricao, unidade: data.unidade });
    toast.success(`Produto localizado: ${data.id_produto}`);
  }

  function limpar() {
    setEan(""); setProduto(null); setOrigem(""); setLoteSel("");
    setQuantidade(""); setMotivoId(""); setObservacao(""); setFoto(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!produto) return toast.error("Escaneie ou informe um EAN válido");
    if (!origem) return toast.error("Selecione a Origem");
    if (!linhaSelecionada) return toast.error("Selecione o Lote");
    if (!qtd || qtd <= 0) return toast.error("Informe a quantidade");
    if (qtd > saldo) return toast.error("Quantidade solicitada maior que saldo disponível.");
    if (!motivoId) return toast.error("Selecione o motivo");
    if (!foto) return toast.error("Foto é obrigatória");
    if (!["image/jpeg", "image/png", "image/jpg"].includes(foto.type)) return toast.error("Use JPG ou PNG");
    if (foto.size > MAX_BYTES) return toast.error("Foto excede 10MB");

    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      const ext = foto.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("baixas-fotos").upload(path, foto, { contentType: foto.type });
      if (up.error) throw up.error;

      const { error } = await (supabase as any).from("baixa_operacional").insert({
        codigo_produto: produto.id_produto,
        descricao: produto.descricao,
        lote: linhaSelecionada.lote || null,
        unidade: produto.unidade || null,
        id_local: origem,
        quantidade: qtd,
        custo_unitario: custo,
        motivo_baixa_id: motivoId,
        observacao: observacao || null,
        foto_url: path,
        solicitante_id: user.id,
        status_fluxo: "PENDENTE",
      });
      if (error) throw error;

      await (supabase as any).from("audit_logs").insert({
        usuario: user.id, acao: "CRIAR_BAIXA", entidade: "baixa_operacional",
        payload: {
          ean, codigo_produto: produto.id_produto, origem, lote: linhaSelecionada.lote,
          quantidade: qtd, custo_unitario: custo, valor_total: valorTotal, motivo_baixa_id: motivoId,
        },
      });

      toast.success("Solicitação de baixa criada");
      limpar();
      qc.invalidateQueries({ queryKey: ["baixas"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao registrar baixa");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Nova Solicitação de Baixa</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Código de Barras (EAN) *</Label>
              <div className="flex gap-2">
                <Input
                  value={ean}
                  onChange={(e) => setEan(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarPorEAN(ean); } }}
                  placeholder="Escaneie ou digite o EAN e pressione Enter"
                />
                <Button type="button" variant="outline" onClick={() => buscarPorEAN(ean)}>Buscar</Button>
                <Button type="button" onClick={() => setScannerOpen(true)} className="gap-2">
                  <ScanBarcode className="size-4" /> Escanear
                </Button>
              </div>
            </div>

            <div>
              <Label>SKU</Label>
              <Input value={produto?.id_produto ?? ""} readOnly className="bg-muted font-mono" />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={produto?.unidade ?? ""} readOnly className="bg-muted" />
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input value={produto?.descricao ?? ""} readOnly className="bg-muted" />
            </div>

            <div>
              <Label>Origem (Almoxarifado) *</Label>
              <Select value={origem} onValueChange={setOrigem} disabled={!produto || origensDisponiveis.length === 0}>
                <SelectTrigger><SelectValue placeholder={produto ? "Selecione" : "Escaneie o produto primeiro"} /></SelectTrigger>
                <SelectContent>
                  {origensDisponiveis.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lote *</Label>
              <Select value={loteSel} onValueChange={setLoteSel} disabled={!origem || lotesDisponiveis.length === 0}>
                <SelectTrigger><SelectValue placeholder={origem ? "Selecione o lote" : "Selecione a origem"} /></SelectTrigger>
                <SelectContent>
                  {lotesDisponiveis.map((l) => (
                    <SelectItem key={l.id} value={l.lote ?? ""}>
                      {l.lote || "(sem lote)"} — saldo {formatNum(Number(l.quantidade))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {linhaSelecionada && (
              <div className="md:col-span-2 rounded-lg border bg-muted/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">SKU</div><div className="font-mono">{produto?.id_produto}</div></div>
                <div className="col-span-2"><div className="text-xs text-muted-foreground">Produto</div><div className="truncate">{produto?.descricao}</div></div>
                <div><div className="text-xs text-muted-foreground">Origem</div><div>{origem}</div></div>
                <div><div className="text-xs text-muted-foreground">Lote</div><div className="font-mono">{linhaSelecionada.lote || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Saldo</div><div className="font-semibold">{formatNum(saldo)}</div></div>
                <div><div className="text-xs text-muted-foreground">Validade</div><div>{linhaSelecionada.data_validade ? new Date(linhaSelecionada.data_validade).toLocaleDateString("pt-BR") : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Custo Unitário</div><div>{formatBRL(custo)}</div></div>
              </div>
            )}

            <div>
              <Label>Quantidade a Baixar *</Label>
              <Input
                type="number" step="0.001" min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={!linhaSelecionada}
              />
              {qtd > saldo && linhaSelecionada && (
                <div className="text-xs text-destructive mt-1">Quantidade solicitada maior que saldo disponível.</div>
              )}
            </div>
            <div>
              <Label>Valor Total</Label>
              <Input value={formatBRL(valorTotal)} readOnly className="bg-muted" />
            </div>

            <div>
              <Label>Motivo *</Label>
              <Select value={motivoId} onValueChange={setMotivoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(motivosQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.descricao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Foto Evidência * (JPG/PNG, máx 10MB)</Label>
              <Input type="file" accept="image/jpeg,image/png,image/jpg" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
              {foto && <div className="mt-1 text-xs text-muted-foreground">{foto.name} — {(foto.size / 1024).toFixed(0)} KB</div>}
            </div>

            <div className="md:col-span-2">
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={limpar}>Limpar</Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <PackageMinus className="size-4" />}
                Solicitar Baixa
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => { setScannerOpen(false); buscarPorEAN(code); }}
      />
    </>
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

    // Re-checa estoque e atualiza (chave: produto + lote + origem)
    const { data: est } = await (supabase as any)
      .from("estoque_sistemico")
      .select("id, quantidade")
      .eq("id_produto", b.codigo_produto)
      .eq("lote", b.lote ?? "")
      .eq("origem", b.id_local ?? "")
      .maybeSingle();
    if (!est) return toast.error("Estoque do produto/lote/origem não encontrado");

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
