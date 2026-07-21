import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import {
  parsePlanilhaBaixas, gerarModeloBaixas, ordenarFEFO,
  type ParsedRow, type CatalogoProduto, type LoteDisponivel,
} from "@/lib/baixas-import";
import { criarSolicitacaoBaixa } from "@/lib/solicitacoes-baixa";

export function ImportarBaixasDialog() {
  const qc = useQueryClient();
  const { almoxes } = useMeusAlmoxarifados();
  const [open, setOpen] = useState(false);
  const [almoxSel, setAlmoxSel] = useState<string>("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Origens que o usuário pode escolher — se almoxes===null, mostra todas ativas
  const origensQ = useQuery({
    queryKey: ["baixas-origens-permitidas", almoxes?.join(",") ?? "all"],
    enabled: open,
    queryFn: async () => {
      let query = (supabase as any).from("origens")
        .select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem");
      if (almoxes && almoxes.length > 0) query = query.in("codigo_origem", almoxes);
      if (almoxes && almoxes.length === 0) return [];
      const { data, error } = await query;
      if (error) throw error;
      return data as Array<{ codigo_origem: string; descricao: string }>;
    },
  });

  const catalogoQ = useQuery({
    queryKey: ["baixas-catalogo-produtos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CatalogoProduto[]> => {
      const [estoque, grupos, familias] = await Promise.all([
        (supabase as any).from("estoque_sistemico").select("id_produto, descricao, unidade, custo_unitario"),
        (supabase as any).from("grupo_produtos").select("codigo_produto, grupo"),
        (supabase as any).from("familias").select("codigo_produto, familia"),
      ]);
      if (estoque.error) throw estoque.error;
      const grupoMap = new Map<string, string>();
      for (const g of (grupos.data ?? []) as any[]) grupoMap.set(g.codigo_produto, g.grupo);
      const famMap = new Map<string, string>();
      for (const f of (familias.data ?? []) as any[]) famMap.set(f.codigo_produto, f.familia);

      const map = new Map<string, CatalogoProduto>();
      for (const r of (estoque.data ?? []) as any[]) {
        if (!r.id_produto || map.has(r.id_produto)) continue;
        map.set(r.id_produto, {
          sku: r.id_produto,
          descricao: r.descricao ?? "",
          unidade: r.unidade ?? "",
          custo_unitario: Number(r.custo_unitario ?? 0),
          categoria: grupoMap.get(r.id_produto) ?? "",
          subcategoria: famMap.get(r.id_produto) ?? "",
        });
      }
      return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
    },
  });

  const motivosQ = useQuery({
    queryKey: ["motivo_baixa", "ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("motivo_baixa").select("id, descricao").eq("ativo", true);
      if (error) throw error;
      return data as Array<{ id: string; descricao: string }>;
    },
  });

  const okCount = useMemo(() => rows.filter((r) => r.status === "OK").length, [rows]);
  const errCount = rows.length - okCount;

  function baixarModelo() {
    const catalogo = catalogoQ.data ?? [];
    if (catalogo.length === 0) {
      toast.error("Catálogo de produtos ainda não carregou. Aguarde alguns segundos.");
      return;
    }
    const blob = gerarModeloBaixas(catalogo);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelo-baixas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success("Modelo baixado");
  }

  async function carregarLotesPorSku(): Promise<Map<string, LoteDisponivel[]>> {
    const { data, error } = await (supabase as any)
      .from("estoque_sistemico")
      .select("id, id_produto, lote, data_validade, quantidade, custo_unitario")
      .eq("origem", almoxSel);
    if (error) throw error;
    const map = new Map<string, LoteDisponivel[]>();
    for (const r of (data ?? []) as any[]) {
      const arr = map.get(r.id_produto) ?? [];
      arr.push({
        estoque_id: r.id,
        lote: r.lote ?? "",
        data_validade: r.data_validade,
        quantidade: Number(r.quantidade ?? 0),
        custo_unitario: Number(r.custo_unitario ?? 0),
      });
      map.set(r.id_produto, arr);
    }
    return map;
  }

  async function handleFile(file: File) {
    if (!almoxSel) return toast.error("Selecione o Almoxarifado antes de subir a planilha");
    setFilename(file.name);
    setRows([]);
    setParsing(true);
    try {
      const lotesMap = await carregarLotesPorSku();
      const parsed = await parsePlanilhaBaixas(
        file, catalogoQ.data ?? [], motivosQ.data ?? [], lotesMap,
      );
      if (parsed.length === 0) toast.error("Nenhuma linha encontrada na planilha");
      setRows(parsed);
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  }

  function alterarLote(linha: number, estoqueId: string) {
    setRows((prev) => prev.map((r) => r.linha === linha ? { ...r, lote_selecionado_id: estoqueId } : r));
  }

  function loteDaLinha(r: ParsedRow): LoteDisponivel | undefined {
    return r.lotes_disponiveis?.find((l) => l.estoque_id === r.lote_selecionado_id);
  }

  async function confirmar() {
    const okRows = rows.filter((r) => r.status === "OK");
    if (okRows.length === 0) return toast.error("Nenhuma linha válida para importar");
    setImporting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user!;
      const itens = okRows.map((r) => {
        const lote = loteDaLinha(r);
        return {
          codigo_produto: r.sku,
          descricao: r.descricao ?? r.produto,
          unidade: r.unidade ?? null,
          quantidade: r.quantidade,
          custo_unitario: lote?.custo_unitario ?? 0,
          motivo_baixa_id: r.motivo_id ?? null,
          categoria: r.categoria || null,
          subcategoria: r.subcategoria || null,
          responsavel_nome: r.responsavel || null,
          data_ocorrencia: r.data,
          id_local: almoxSel,
          lote: lote?.lote || null,
          origem_lancamento: "IMPORTACAO_PLANILHA",
        };
      });

      const { id: solicitacaoId } = await criarSolicitacaoBaixa({
        id_local: almoxSel,
        origem_lancamento: "IMPORTACAO_PLANILHA",
        observacao: `Importação de planilha (${filename})`,
        itens,
      });

      await (supabase as any).from("audit_logs").insert({
        usuario: user.id,
        acao: "IMPORTAR_BAIXAS_PLANILHA",
        entidade: "solicitacoes_baixa",
        entidade_id: String(solicitacaoId),
        payload: { arquivo: filename, almoxarifado: almoxSel, linhas_ok: okRows.length, linhas_erro: errCount },
      });

      toast.success(`Solicitação #${solicitacaoId} criada com ${okRows.length} baixas${errCount > 0 ? ` (${errCount} ignoradas)` : ""}`);
      setRows([]); setFilename(""); setAlmoxSel("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["baixas"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao importar baixas");
    } finally {
      setImporting(false);

    }
  }

  const origens = origensQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={baixarModelo} className="gap-2">
          <Download className="size-4" /> Baixar Modelo
        </Button>
        <DialogTrigger asChild>
          <Button type="button" size="sm" className="gap-2">
            <Upload className="size-4" /> Importar Planilha
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Planilha de Baixas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Almoxarifado (aplica-se a toda a leva)</Label>
            <Select value={almoxSel} onValueChange={(v) => { setAlmoxSel(v); setRows([]); setFilename(""); }}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder={origens.length === 0 ? "Nenhum almoxarifado disponível" : "Selecione o almoxarifado"} />
              </SelectTrigger>
              <SelectContent>
                {origens.map((o) => (
                  <SelectItem key={o.codigo_origem} value={o.codigo_origem}>
                    {o.descricao || o.codigo_origem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 ${almoxSel ? "cursor-pointer hover:bg-accent/30" : "opacity-50 cursor-not-allowed"}`}>
            <FileSpreadsheet className="size-8 text-primary" />
            <div className="text-sm font-medium">Selecione o arquivo .xlsx</div>
            <div className="text-xs text-muted-foreground">
              Aba <b>BAIXA</b>, cabeçalho na linha 2, dados a partir da linha 3
            </div>
            <input
              type="file" accept=".xlsx,.xls" className="hidden" disabled={!almoxSel}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {filename && (
              <div className="text-xs text-muted-foreground mt-1">
                {parsing ? "Analisando..." : filename}
              </div>
            )}
          </label>

          {rows.length > 0 && (
            <>
              <div className="flex gap-4 items-center text-sm">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-4" /> {okCount} linhas OK
                </span>
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="size-4" /> {errCount} linhas com erro
                </span>
              </div>

              <div className="border rounded-lg overflow-x-auto max-h-[50vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lin.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead>Observações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const lotesOrd = ordenarFEFO(r.lotes_disponiveis ?? []);
                      const sugestaoId = lotesOrd[0]?.estoque_id;
                      const loteSel = loteDaLinha(r);
                      const valorTotal = (loteSel?.custo_unitario ?? 0) * r.quantidade;
                      return (
                        <TableRow key={r.linha} className={r.status === "ERRO" ? "bg-destructive/5" : ""}>
                          <TableCell className="text-xs">{r.linha}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "OK" ? "default" : "destructive"} className="text-[10px]">
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                          <TableCell className="text-xs max-w-[16rem] truncate">{r.produto || r.descricao || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{r.quantidade || "—"}</TableCell>
                          <TableCell className="text-xs">{r.motivo}</TableCell>
                          <TableCell className="text-xs">
                            {r.data ? new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-xs min-w-[15rem]">
                            {lotesOrd.length === 0 ? (
                              <span className="text-destructive">sem lote</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Select
                                  value={r.lote_selecionado_id ?? ""}
                                  onValueChange={(v) => alterarLote(r.linha, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {lotesOrd.map((l) => (
                                      <SelectItem key={l.estoque_id} value={l.estoque_id} className="text-xs">
                                        {(l.lote || "(s/lote)")} — Vence em {l.data_validade ? new Date(l.data_validade + "T00:00:00").toLocaleDateString("pt-BR") : "s/ data"} (saldo {l.quantidade})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {r.lote_selecionado_id === sugestaoId && (
                                  <Badge variant="secondary" className="text-[9px] whitespace-nowrap">FEFO</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {valorTotal > 0 ? valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-destructive">
                            {r.erros.join("; ")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={confirmar}
            disabled={importing || okCount === 0}
            className="gap-2"
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {okCount} linhas OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
