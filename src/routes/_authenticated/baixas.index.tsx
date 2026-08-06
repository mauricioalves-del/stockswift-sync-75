import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL, formatNum } from "@/lib/inventory";
import { CheckCircle2, XCircle, MessageSquareWarning, PackageMinus, Loader2, ScanBarcode, Check, ChevronsUpDown, List, Plus, Trash2, Mail, Download, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { extrairCodigoNumericoQR } from "@/lib/qr-estoque";
import { ImportarBaixasDialog } from "@/components/baixas/ImportarBaixasDialog";
import { criarSolicitacaoBaixa } from "@/lib/solicitacoes-baixa";
import { readEdgeFunctionFailure } from "@/lib/edge-function-errors";



export const Route = createFileRoute("/_authenticated/baixas/")({
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
  const { isAdmin, role } = useRole();
  const podeImportar = isAdmin || role === "GERENTE";
  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Baixas Operacionais</h1>
          <p className="text-sm text-muted-foreground">
            Solicitação, aprovação e execução de baixas de estoque com rastreabilidade.
          </p>
        </div>
        {podeImportar && <ImportarBaixasDialog />}
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

type CarrinhoItem = {
  uid: string;
  codigo_produto: string;
  descricao: string;
  unidade: string;
  lote: string;
  quantidade: number;
  custo_unitario: number;
  motivo_baixa_id: string;
  motivo_desc: string;
  observacao: string;
  foto_path?: string | null;
};

function NovaBaixaForm() {
  const qc = useQueryClient();
  const { role } = useRole();
  const [submitting, setSubmitting] = useState(false);

  // Cabeçalho da solicitação
  const [origem, setOrigem] = useState("");
  const [observacaoSol, setObservacaoSol] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);

  // Item em edição
  const [ean, setEan] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [produto, setProduto] = useState<{
    id_produto: string; descricao: string; unidade: string;
  } | null>(null);
  const [loteSel, setLoteSel] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [observacaoItem, setObservacaoItem] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const motivosQ = useQuery({
    queryKey: ["motivo_baixa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa").select("*").eq("ativo", true).order("descricao");
      if (error) throw error;
      return data as Array<{ id: string; descricao: string }>;
    },
  });

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
    // Une origens do estoque + a origem já escolhida no cabeçalho (para lojas com almox fixo)
    const set = new Set<string>();
    for (const e of estoqueQ.data ?? []) if (e.origem) set.add(e.origem);
    if (origem) set.add(origem);
    return Array.from(set).sort();
  }, [estoqueQ.data, origem]);

  const lotesDisponiveis = useMemo(() => {
    if (!origem) return [];
    return (estoqueQ.data ?? [])
      .filter((e) => e.origem === origem && Number(e.quantidade) > 0)
      .sort((a, b) => (a.lote ?? "").localeCompare(b.lote ?? ""));
  }, [estoqueQ.data, origem]);

  const linhaSelecionada = useMemo(() => {
    return (estoqueQ.data ?? []).find((e) => e.origem === origem && (e.lote ?? "") === loteSel) ?? null;
  }, [estoqueQ.data, origem, loteSel]);

  useEffect(() => { setLoteSel(""); }, [produto?.id_produto, origem]);

  const qtd = Number(quantidade || 0);
  const custo = Number(linhaSelecionada?.custo_unitario ?? 0);
  const valorTotalItem = qtd * custo;
  const saldo = Number(linhaSelecionada?.quantidade ?? 0);

  const extrairCodigoNumerico = extrairCodigoNumericoQR;

  async function buscarPorCodigo(codigo: string) {
    const numeric = extrairCodigoNumerico(codigo);
    if (!numeric) return toast.error("Nenhum código numérico identificado");
    setEan(numeric);
    const { data, error } = await (supabase as any)
      .from("estoque_sistemico")
      .select("id_produto, descricao, unidade")
      .eq("id_produto", numeric)
      .limit(1)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) {
      setProduto(null);
      return toast.error(`Código ${numeric} não encontrado na base de estoque`);
    }
    setProduto({ id_produto: data.id_produto, descricao: data.descricao, unidade: data.unidade });
    toast.success(`Produto localizado: ${data.id_produto}`);
  }

  function selecionarProdutoManual(p: { id_produto: string; descricao: string; unidade: string }) {
    setEan(p.id_produto);
    setProduto(p);
    setPickerOpen(false);
    toast.success(`Produto selecionado: ${p.id_produto}`);
  }

  function limparItem() {
    setEan(""); setProduto(null); setLoteSel("");
    setQuantidade(""); setMotivoId(""); setObservacaoItem(""); setFoto(null);
  }

  async function adicionarAoCarrinho() {
    if (!origem) return toast.error("Selecione o Almoxarifado da solicitação");
    if (!produto) return toast.error("Escaneie ou selecione um produto");
    if (!linhaSelecionada) return toast.error("Selecione o Lote");
    if (!qtd || qtd <= 0) return toast.error("Informe a quantidade");
    if (qtd > saldo) return toast.error("Quantidade maior que saldo disponível");
    if (!motivoId) return toast.error("Selecione o motivo");
    if (foto) {
      if (!["image/jpeg", "image/png", "image/jpg"].includes(foto.type)) return toast.error("Use JPG ou PNG");
      if (foto.size > MAX_BYTES) return toast.error("Foto excede 10MB");
    }

    let foto_path: string | null = null;
    if (foto) {
      const user = (await supabase.auth.getUser()).data.user!;
      const ext = foto.name.split(".").pop() ?? "jpg";
      foto_path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage.from("baixas-fotos").upload(foto_path, foto, { contentType: foto.type });
      if (up.error) return toast.error(up.error.message);
    }

    const motivoDesc = (motivosQ.data ?? []).find((m) => m.id === motivoId)?.descricao ?? "";
    setCarrinho((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        codigo_produto: produto.id_produto,
        descricao: produto.descricao,
        unidade: produto.unidade,
        lote: linhaSelecionada.lote ?? "",
        quantidade: qtd,
        custo_unitario: custo,
        motivo_baixa_id: motivoId,
        motivo_desc: motivoDesc,
        observacao: observacaoItem,
        foto_path,
      },
    ]);
    toast.success(`Item adicionado ao carrinho (${carrinho.length + 1})`);
    limparItem();
  }

  function removerItem(uid: string) {
    setCarrinho((prev) => prev.filter((c) => c.uid !== uid));
  }

  const custoCarrinho = useMemo(
    () => carrinho.reduce((s, c) => s + c.quantidade * c.custo_unitario, 0),
    [carrinho],
  );

  async function enviarSolicitacao() {
    if (carrinho.length === 0) return toast.error("Adicione ao menos um item ao carrinho");
    if (!origem) return toast.error("Selecione o Almoxarifado");
    setSubmitting(true);
    try {
      const { id } = await criarSolicitacaoBaixa({
        id_local: origem,
        observacao: observacaoSol || null,
        origem_lancamento: "MANUAL",
        itens: carrinho.map((c) => ({
          codigo_produto: c.codigo_produto,
          descricao: c.descricao,
          unidade: c.unidade || null,
          lote: c.lote || null,
          id_local: origem,
          quantidade: c.quantidade,
          custo_unitario: c.custo_unitario,
          motivo_baixa_id: c.motivo_baixa_id,
          observacao: c.observacao || null,
          foto_url: c.foto_path || null,
        })),
      });
      toast.success(`Solicitação #${id} criada com ${carrinho.length} item(ns)`);
      setCarrinho([]);
      setObservacaoSol("");
      limparItem();
      qc.invalidateQueries({ queryKey: ["baixas"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao registrar solicitação");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Nova Solicitação de Baixa</CardTitle>
          <p className="text-xs text-muted-foreground">
            Adicione um ou mais itens ao carrinho e envie tudo como uma única solicitação.
            O time é notificado no Slack automaticamente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Almoxarifado (aplicado a todos os itens) *</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione o almoxarifado" /></SelectTrigger>
                <SelectContent>
                  {origensDisponiveis.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  {origem && !origensDisponiveis.includes(origem) && (
                    <SelectItem value={origem}>{origem}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Não pode ser alterado após adicionar o primeiro item.
              </p>
            </div>
            <div>
              <Label>Observação da solicitação</Label>
              <Input
                value={observacaoSol}
                onChange={(e) => setObservacaoSol(e.target.value)}
                placeholder="Contexto geral (opcional)"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Adicionar item ao carrinho</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Código do Produto / QR / EAN *</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarPorCodigo(ean); } }}
                    placeholder="Escaneie o QR/código de barras ou digite o Código do Produto"
                    className="flex-1 min-w-[220px]"
                  />
                  <Button type="button" variant="outline" onClick={() => buscarPorCodigo(ean)}>Buscar</Button>
                  <Button type="button" onClick={() => setScannerOpen(true)} className="gap-2">
                    <ScanBarcode className="size-4" /> Escanear
                  </Button>
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="secondary" className="gap-2">
                        <List className="size-4" /> Lista de Produtos
                        <ChevronsUpDown className="size-3 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="end">
                      <Command
                        filter={(value, search) => {
                          const s = search.toLowerCase();
                          return value.toLowerCase().includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Buscar por código ou descrição..." />
                        <CommandList>
                          <CommandEmpty>
                            {produtosQ.isLoading ? "Carregando..." : "Nenhum produto encontrado"}
                          </CommandEmpty>
                          <CommandGroup>
                            {(produtosQ.data ?? []).map((p) => {
                              const selected = produto?.id_produto === p.id_produto;
                              return (
                                <CommandItem
                                  key={p.id_produto}
                                  value={`${p.id_produto} ${p.descricao}`}
                                  onSelect={() => selecionarProdutoManual(p)}
                                >
                                  <Check className={cn("mr-2 size-4", selected ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span className="font-mono text-xs">{p.id_produto}</span>
                                    <span className="text-sm truncate">{p.descricao || "—"}</span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                <Label>Lote *</Label>
                <Select value={loteSel} onValueChange={setLoteSel} disabled={!origem || lotesDisponiveis.length === 0}>
                  <SelectTrigger><SelectValue placeholder={origem ? "Selecione o lote" : "Selecione o almoxarifado"} /></SelectTrigger>
                  <SelectContent>
                    {lotesDisponiveis.map((l) => (
                      <SelectItem key={l.id} value={l.lote ?? ""}>
                        {l.lote || "(sem lote)"} — saldo {formatNum(Number(l.quantidade))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label>Quantidade *</Label>
                <Input
                  type="number" step="0.001" min="0"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  disabled={!linhaSelecionada}
                />
                {qtd > saldo && linhaSelecionada && (
                  <div className="text-xs text-destructive mt-1">Quantidade maior que saldo disponível.</div>
                )}
              </div>
              <div>
                <Label>Valor do Item</Label>
                <Input value={formatBRL(valorTotalItem)} readOnly className="bg-muted" />
              </div>

              <div>
                <Label>Foto Evidência (opcional — JPG/PNG, máx 10MB)</Label>
                <Input type="file" accept="image/jpeg,image/png,image/jpg" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
                {foto && <div className="mt-1 text-xs text-muted-foreground">{foto.name} — {(foto.size / 1024).toFixed(0)} KB</div>}
              </div>
              <div>
                <Label>Observação do item</Label>
                <Input value={observacaoItem} onChange={(e) => setObservacaoItem(e.target.value)} />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={limparItem}>Limpar item</Button>
                <Button type="button" onClick={adicionarAoCarrinho} className="gap-2">
                  <Plus className="size-4" /> Adicionar ao Carrinho
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Carrinho ({carrinho.length} {carrinho.length === 1 ? "item" : "itens"})</CardTitle>
          <div className="text-sm">
            Total: <span className="font-semibold">{formatBRL(custoCarrinho)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {carrinho.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              Nenhum item ainda. Preencha acima e clique em "Adicionar ao Carrinho".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carrinho.map((c) => (
                    <TableRow key={c.uid}>
                      <TableCell className="font-mono text-xs">{c.codigo_produto}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs">{c.descricao}</TableCell>
                      <TableCell className="font-mono text-xs">{c.lote || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(c.quantidade)}</TableCell>
                      <TableCell className="text-xs">{c.motivo_desc}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {formatBRL(c.quantidade * c.custo_unitario)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => removerItem(c.uid)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || carrinho.length === 0}
              onClick={enviarSolicitacao}
              className="gap-2"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <PackageMinus className="size-4" />}
              Solicitar Baixa
            </Button>
          </div>
        </CardContent>
      </Card>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => { setScannerOpen(false); buscarPorCodigo(code); }}
      />
      {/* silence unused role warning while role-based UI is not yet needed here */}
      <span className="hidden">{role}</span>
    </>
  );
}



function useBaixas(statuses: string[]) {
  return useQuery({
    queryKey: ["baixas", statuses],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("baixa_operacional")
        .select("*, motivo:motivo_baixa(descricao), solicitacao:solicitacoes_baixa(id, solicitante_nome, solicitante_id)")
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
  const [enviandoFiscal, setEnviandoFiscal] = useState(false);
  const [avisoFiscal, setAvisoFiscal] = useState<{ code?: string; message: string } | null>(null);
  const [fAlmox, setFAlmox] = useState("__all__");
  const [fSolic, setFSolic] = useState("__all__");
  const [fMotivo, setFMotivo] = useState("__all__");
  const [editando, setEditando] = useState<any | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const perfisQ = useQuery({
    queryKey: ["profiles-nomes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("id, nome, email");
      if (error) throw error;
      return data as { id: string; nome: string | null; email: string | null }[];
    },
    staleTime: 5 * 60_000,
  });

  const perfilMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of perfisQ.data ?? []) m.set(p.id, p.nome || p.email || "");
    return m;
  }, [perfisQ.data]);

  const nomeSolicitante = (b: any) =>
    (b.solicitacao?.solicitante_nome ||
      perfilMap.get(b.solicitante_id ?? b.solicitacao?.solicitante_id ?? "") ||
      b.solicitante_nome ||
      b.responsavel_nome ||
      "") as string;

  const almoxUnicos = useMemo(
    () => Array.from(new Set((data ?? []).map((b: any) => b.id_local).filter(Boolean))).sort() as string[],
    [data],
  );
  const solicUnicos = useMemo(
    () => Array.from(new Set((data ?? []).map(nomeSolicitante).filter(Boolean))).sort() as string[],
    [data, perfilMap],
  );
  const motivosUnicos = useMemo(
    () => Array.from(new Set((data ?? []).map((b: any) => b.motivo?.descricao).filter(Boolean))).sort() as string[],
    [data],
  );

  const lista = useMemo(
    () =>
      (data ?? []).filter((b: any) => {
        if (fAlmox !== "__all__" && (b.id_local ?? "") !== fAlmox) return false;
        if (fSolic !== "__all__" && nomeSolicitante(b) !== fSolic) return false;
        if (fMotivo !== "__all__" && (b.motivo?.descricao ?? "") !== fMotivo) return false;
        return true;
      }),
    [data, fAlmox, fSolic, fMotivo, perfilMap],
  );

  const temFiltro = fAlmox !== "__all__" || fSolic !== "__all__" || fMotivo !== "__all__";

  // ---- seleção em lote -------------------------------------------------
  const listaIds = useMemo(() => lista.map((b: any) => String(b.id)), [lista]);
  const selecionados = useMemo(
    () => lista.filter((b: any) => sel.has(String(b.id))),
    [lista, sel],
  );
  const todosMarcados = listaIds.length > 0 && listaIds.every((id) => sel.has(id));

  function toggleItem(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todosMarcados) listaIds.forEach((id) => n.delete(id));
      else listaIds.forEach((id) => n.add(id));
      return n;
    });
  }
  /** Marca/desmarca todos os itens de uma mesma requisição (lote de produtos). */
  function toggleRequisicao(solicitacaoId: any) {
    const ids = lista.filter((b: any) => b.solicitacao_id === solicitacaoId).map((b: any) => String(b.id));
    const todos = ids.every((id) => sel.has(id));
    setSel((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (todos ? n.delete(id) : n.add(id)));
      return n;
    });
  }

  async function aprovarSelecionados() {
    const alvos = selecionados.filter((b: any) => b.status_fluxo !== "APROVADA");
    if (alvos.length === 0) return toast.error("Selecione ao menos um item pendente");
    const reqs = Array.from(new Set(alvos.map((b: any) => b.solicitacao_id).filter(Boolean)));
    if (!confirm(`Aprovar ${alvos.length} item(ns)${reqs.length ? ` de ${reqs.length} requisição(ões)` : ""}?`)) return;
    const comentario = window.prompt("Comentário para aprovação em lote (opcional):") ?? null;
    const user = (await supabase.auth.getUser()).data.user!;
    const { error } = await (supabase as any).from("baixa_operacional").update({
      status_fluxo: "APROVADA",
      aprovador_id: user.id,
      data_aprovacao: new Date().toISOString(),
      comentario_aprovacao: comentario,
    }).in("id", alvos.map((b: any) => b.id));
    if (error) return toast.error(error.message);
    await (supabase as any).from("audit_logs").insert(
      alvos.map((b: any) => ({
        usuario: user.id, acao: "BAIXA_APROVADA", entidade: "baixa_operacional", entidade_id: b.id,
        payload: { codigo_produto: b.codigo_produto, lote: b.lote, quantidade: b.quantidade, comentario, lote_aprovacao: true },
      })),
    );
    toast.success(`${alvos.length} baixa(s) aprovada(s)`);
    setSel(new Set());
    qc.invalidateQueries({ queryKey: ["baixas"] });
  }


  function mensagemFiscal(code: string | undefined, fallback: string) {
    if (code === "MISSING_BAIXA_FISCAL_RECIPIENTS") {
      return "Cadastre ao menos um destinatário ativo com finalidade Baixa Fiscal antes de enviar.";
    }
    if (code === "RESEND_TEST_RECIPIENT_LIMIT" || code === "RESEND_VALIDATION_ERROR") {
      return "O remetente atual ainda está em modo de teste no Resend. Use o e-mail da conta Resend para testes ou configure um domínio verificado em Configurações → Resend.";
    }
    return fallback;
  }

  async function solicitarBaixaFiscal(apenasSelecionados = false) {
    const alvos = apenasSelecionados ? selecionados : (data ?? []);
    if (alvos.length === 0)
      return toast.error(apenasSelecionados ? "Selecione ao menos um item" : "Não há itens pendentes na fila");
    if (!confirm(`Enviar solicitação de Baixa Fiscal com ${alvos.length} item(ns)?`)) return;
    setEnviandoFiscal(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("solicitar-baixa-fiscal", {
        body: apenasSelecionados ? { ids: alvos.map((b: any) => b.id) } : {},
      });
      const failure = error ? await readEdgeFunctionFailure(error) : ((resp as any)?.ok === false ? resp as any : null);
      if (failure) {
        const message = mensagemFiscal(failure.code, failure.error ?? "Falha no envio");
        setAvisoFiscal({ code: failure.code, message });
        toast.error(message);
        return;
      }
      const r = resp as any;
      setAvisoFiscal(null);
      toast.success(`E-mail enviado a ${r?.destinatarios?.length ?? 0} destinatário(s) — ${r?.qtd_itens ?? 0} item(ns).`);
    } catch (err: any) {
      const message = err?.message ?? "Falha ao enviar";
      setAvisoFiscal({ message });
      toast.error(message);
    } finally {
      setEnviandoFiscal(false);
    }
  }

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

  async function aprovarTodos() {
    const pendentes = (data ?? []).filter((b: any) => b.status_fluxo !== "APROVADA");
    if (pendentes.length === 0) return toast.error("Não há itens pendentes para aprovar");
    if (!confirm(`Aprovar todos os ${pendentes.length} item(ns) pendente(s) da fila?`)) return;
    const comentario = window.prompt("Comentário para aprovação em lote (opcional):") ?? null;
    const user = (await supabase.auth.getUser()).data.user!;
    const ids = pendentes.map((b: any) => b.id);
    const { error } = await (supabase as any).from("baixa_operacional").update({
      status_fluxo: "APROVADA",
      aprovador_id: user.id,
      data_aprovacao: new Date().toISOString(),
      comentario_aprovacao: comentario,
    }).in("id", ids);
    if (error) return toast.error(error.message);
    await (supabase as any).from("audit_logs").insert(
      pendentes.map((b: any) => ({
        usuario: user.id, acao: "BAIXA_APROVADA", entidade: "baixa_operacional", entidade_id: b.id,
        payload: { codigo_produto: b.codigo_produto, lote: b.lote, quantidade: b.quantidade, comentario, lote_aprovacao: true },
      }))
    );
    toast.success(`${pendentes.length} baixa(s) aprovada(s)`);
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
    <div className="space-y-3">
      {isAdmin && (
        <>
          <div className="flex justify-end gap-2 flex-wrap">
            {podeAprovar && (
              <Button
                onClick={aprovarTodos}
                disabled={!(data && data.some((b: any) => b.status_fluxo !== "APROVADA"))}
              >
                <CheckCircle2 className="size-4 mr-2" />
                Aprovar todos
              </Button>
            )}
            <Button
              variant="outline"
              onClick={solicitarBaixaFiscal}
              disabled={enviandoFiscal || !(data && data.length > 0)}
            >
              {enviandoFiscal ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Mail className="size-4 mr-2" />}
              Solicitar Baixa Fiscal
            </Button>
          </div>
          {avisoFiscal && (
            <Alert variant="destructive">
              <Mail className="size-4" />
              <AlertTitle>Envio fiscal pendente de configuração</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{avisoFiscal.message}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {avisoFiscal.code === "MISSING_BAIXA_FISCAL_RECIPIENTS" && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/emails">Cadastrar destinatários</Link>
                    </Button>
                  )}
                  {(avisoFiscal.code === "RESEND_TEST_RECIPIENT_LIMIT" || avisoFiscal.code === "RESEND_VALIDATION_ERROR") && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/config/resend">Ajustar Resend</Link>
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={fAlmox} onValueChange={setFAlmox}>
            <SelectTrigger><SelectValue placeholder="Almoxarifado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os almox.</SelectItem>
              {almoxUnicos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSolic} onValueChange={setFSolic}>
            <SelectTrigger><SelectValue placeholder="Solicitante" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os solicitantes</SelectItem>
              {solicUnicos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fMotivo} onValueChange={setFMotivo}>
            <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os motivos</SelectItem>
              {motivosUnicos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!temFiltro}
              onClick={() => { setFAlmox("__all__"); setFSolic("__all__"); setFMotivo("__all__"); }}
            >
              Limpar filtros
            </Button>
            <span className="text-xs text-muted-foreground">{lista.length} item(ns)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Req.</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Almox.</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">Nenhuma baixa pendente</TableCell></TableRow>
            )}
            {lista.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.solicitacao_id ? `#${b.solicitacao_id}` : "—"}</TableCell>
                <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                <TableCell className="max-w-xs truncate">{b.descricao}</TableCell>
                <TableCell className="font-mono text-xs">{b.lote || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNum(Number(b.quantidade))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(Number(b.valor_total))}</TableCell>
                <TableCell className="text-xs">{b.motivo?.descricao ?? "—"}</TableCell>
                <TableCell className="text-xs">{b.id_local ?? "—"}</TableCell>
                <TableCell className="text-xs">{nomeSolicitante(b) || "—"}</TableCell>
                <TableCell>
                  <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${STATUS_TONES[b.status_fluxo]}`}>{b.status_fluxo}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => setEditando(b)}>
                        <Pencil className="size-3.5 mr-1" /> Editar
                      </Button>
                    )}
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

      {isAdmin && (
        <EditarBaixaDialog
          baixa={editando}
          onClose={() => setEditando(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["baixas"] })}
        />
      )}
    </div>
  );
}

function EditarBaixaDialog({ baixa, onClose, onSaved }: { baixa: any | null; onClose: () => void; onSaved: () => void }) {
  const [qtd, setQtd] = useState("");
  const [lote, setLote] = useState("");
  const [almox, setAlmox] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const motivosQ = useQuery({
    queryKey: ["motivo_baixa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa").select("*").eq("ativo", true).order("descricao");
      if (error) throw error;
      return data as { id: string; descricao: string }[];
    },
  });

  useEffect(() => {
    if (!baixa) return;
    setQtd(String(baixa.quantidade ?? ""));
    setLote(baixa.lote ?? "");
    setAlmox(baixa.id_local ?? "");
    setMotivoId(baixa.motivo_baixa_id ?? "");
    setObs(baixa.observacao ?? "");
  }, [baixa]);

  async function salvar() {
    if (!baixa) return;
    const q = Number(String(qtd).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Quantidade inválida");
    setSalvando(true);
    try {
      const unit = Number(baixa.custo_unitario ?? 0) > 0
        ? Number(baixa.custo_unitario)
        : (Number(baixa.quantidade) > 0 ? Number(baixa.valor_total ?? 0) / Number(baixa.quantidade) : 0);
      const patch: Record<string, unknown> = {
        quantidade: q,
        lote: lote || null,
        id_local: almox || null,
        motivo_baixa_id: motivoId || null,
        observacao: obs || null,
        valor_total: Number((unit * q).toFixed(2)),
      };

      const { error } = await (supabase as any).from("baixa_operacional").update(patch).eq("id", baixa.id);
      if (error) throw error;
      const user = (await supabase.auth.getUser()).data.user!;
      await (supabase as any).from("audit_logs").insert({
        usuario: user.id, acao: "BAIXA_EDITADA", entidade: "baixa_operacional", entidade_id: baixa.id,
        payload: { antes: { quantidade: baixa.quantidade, lote: baixa.lote, id_local: baixa.id_local, motivo_baixa_id: baixa.motivo_baixa_id }, depois: patch },
      });
      toast.success("Baixa atualizada");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!baixa} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar baixa {baixa?.codigo_produto}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Quantidade</Label>
            <Input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label className="text-xs">Lote</Label>
            <Input value={lote} onChange={(e) => setLote(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <Input value={almox} onChange={(e) => setAlmox(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Select value={motivoId} onValueChange={setMotivoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>
                {(motivosQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.descricao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="size-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Historico() {
  const { data } = useBaixas(["APROVADA", "REPROVADA", "EXECUTADA"]);
  const [busca, setBusca] = useState("");
  const [motivoFiltro, setMotivoFiltro] = useState("__all__");
  const [almoxFiltro, setAlmoxFiltro] = useState("__all__");
  const [ordem, setOrdem] = useState<"desc" | "asc">("desc");

  const motivosUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const b of data ?? []) {
      const d = (b as any).motivo?.descricao;
      if (d) s.add(d);
    }
    return Array.from(s).sort();
  }, [data]);

  const almoxUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const b of data ?? []) {
      if ((b as any).id_local) s.add((b as any).id_local);
    }
    return Array.from(s).sort();
  }, [data]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const arr = (data ?? []).filter((b: any) => {
      if (motivoFiltro !== "__all__" && (b.motivo?.descricao ?? "") !== motivoFiltro) return false;
      if (almoxFiltro !== "__all__" && (b.id_local ?? "") !== almoxFiltro) return false;
      if (!termo) return true;
      return (
        String(b.codigo_produto ?? "").toLowerCase().includes(termo) ||
        String(b.lote ?? "").toLowerCase().includes(termo) ||
        String(b.descricao ?? "").toLowerCase().includes(termo)
      );
    });
    return [...arr].sort((a: any, b: any) => {
      const va = Number(a.valor_total ?? 0);
      const vb = Number(b.valor_total ?? 0);
      return ordem === "desc" ? vb - va : va - vb;
    });
  }, [data, busca, motivoFiltro, almoxFiltro, ordem]);

  const podeLimpar = busca || motivoFiltro !== "__all__" || almoxFiltro !== "__all__";

  async function exportarExcel() {
    if (filtrados.length === 0) return toast.error("Nenhum registro para exportar");
    const XLSX = await import("xlsx");
    const linhas = filtrados.map((b: any) => ({
      Data: new Date(b.data_solicitacao).toLocaleDateString("pt-BR"),
      Código: b.codigo_produto ?? "",
      Descrição: b.descricao ?? "",
      Lote: b.lote ?? "",
      Almoxarifado: b.id_local ?? "",
      Quantidade: Number(b.quantidade ?? 0),
      "Valor Total": Number(b.valor_total ?? 0),
      Motivo: b.motivo?.descricao ?? "",
      Status: b.status_fluxo ?? "",
      Solicitante: b.solicitante_nome ?? b.solicitante ?? "",
      Observação: b.observacao ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 22 }, { wch: 18 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Histórico");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `baixas-historico-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${linhas.length} registro(s) exportado(s)`);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_200px_200px_200px_auto]">
            <Input
              placeholder="Pesquisar por Código, Lote ou Descrição…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <Select value={motivoFiltro} onValueChange={setMotivoFiltro}>
              <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os motivos</SelectItem>
                {motivosUnicos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={almoxFiltro} onValueChange={setAlmoxFiltro}>
              <SelectTrigger><SelectValue placeholder="Almoxarifado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os almox.</SelectItem>
                {almoxUnicos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ordem} onValueChange={(v) => setOrdem(v as "desc" | "asc")}>
              <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Valor — Maior para menor</SelectItem>
                <SelectItem value="asc">Valor — Menor para maior</SelectItem>
              </SelectContent>
            </Select>
            {podeLimpar && (
              <Button variant="ghost" onClick={() => { setBusca(""); setMotivoFiltro("__all__"); setAlmoxFiltro("__all__"); }}>
                Limpar
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-xs text-muted-foreground">{filtrados.length} registro(s)</p>
            <Button size="sm" variant="outline" onClick={exportarExcel} disabled={filtrados.length === 0}>
              <Download className="size-3.5 mr-1" /> Baixar relatório completo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => setOrdem(ordem === "desc" ? "asc" : "desc")}
                >
                  Valor {ordem === "desc" ? "↓" : "↑"}
                </TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    Nenhum registro para os filtros aplicados
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{new Date(b.data_solicitacao).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                  <TableCell className="max-w-xs truncate">{b.descricao}</TableCell>
                  <TableCell className="font-mono text-xs">{b.lote || "—"}</TableCell>
                  <TableCell className="text-xs">{b.id_local || "—"}</TableCell>
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
    </div>
  );
}
