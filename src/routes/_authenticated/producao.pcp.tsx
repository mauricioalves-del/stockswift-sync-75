import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Plus, Sparkles, Trash2, Search, PackageSearch, FileWarning } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carregarBomCompleta, explodirBOM, type BomLinha, type NecessidadeItem } from "@/lib/pcp-bom";

export const Route = createFileRoute("/_authenticated/producao/pcp")({
  component: RupturaPage,
  head: () => ({ meta: [
    { title: "Planejamento de Produção — Análise de Ruptura" },
    { name: "description", content: "Simulação de necessidade de matérias-primas versus saldo do Almox_Fábrica." },
  ]}),
});

const ALMOX_FABRICA = "Alm_SP_Fabrica";

type LinhaSim = { id_produto: string; nome: string; quantidade: number };

type Produto = { id: string; nome: string; familia: string | null; temBom: boolean };

function RupturaPage() {
  const nav = useNavigate();
  const [linhas, setLinhas] = useState<LinhaSim[]>([]);
  const [drill, setDrill] = useState<string | null>(null);
  const [grupoSel, setGrupoSel] = useState<string>("Produto Acabado");
  const [familiaSel, setFamiliaSel] = useState<string>("__all__");

  // BOM completa (memoizada via react-query)
  const bomQ = useQuery({
    queryKey: ["ruptura", "bom"],
    queryFn: async () => carregarBomCompleta(),
    staleTime: 5 * 60 * 1000,
  });

  // Lista de grupos (todos)
  const gruposQ = useQuery({
    queryKey: ["ruptura", "grupos"],
    queryFn: async (): Promise<string[]> => {
      const { data } = await (supabase as any).from("grupo_produtos").select("grupo");
      return Array.from(new Set(((data ?? []) as { grupo: string }[]).map((d) => d.grupo).filter(Boolean))).sort();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Produtos do Grupo selecionado (TODOS, incluindo sem ficha técnica)
  const produtosQ = useQuery({
    queryKey: ["ruptura", "produtos", grupoSel],
    queryFn: async (): Promise<Produto[]> => {
      // 1. Códigos do grupo selecionado (paginado)
      const codigosGrupo: string[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("grupo_produtos").select("codigo_produto")
          .eq("grupo", grupoSel).range(from, from + size - 1);
        if (error) throw error;
        const rows = (data ?? []) as { codigo_produto: string }[];
        codigosGrupo.push(...rows.map((r) => (r.codigo_produto ?? "").trim()).filter(Boolean));

        if (rows.length < size) break;
        from += size;
      }
      if (!codigosGrupo.length) return [];

      // 2. Famílias + descrição (via familias) — paginado por lotes de 500 IN
      const familiaByCod = new Map<string, string | null>();
      const descByCod = new Map<string, string>();
      for (let i = 0; i < codigosGrupo.length; i += 500) {
        const slice = codigosGrupo.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("familias").select("codigo_produto,familia,descricao_produto").in("codigo_produto", slice);
        for (const r of (data ?? []) as { codigo_produto: string; familia: string | null; descricao_produto: string | null }[]) {
          familiaByCod.set(r.codigo_produto, r.familia ?? null);
          if (r.descricao_produto) descByCod.set(r.codigo_produto, r.descricao_produto);
        }
      }

      // 3+4. Fallback de descrição e set de produtos com BOM cadastrada.
      // IMPORTANTE: ficha_tecnica_bom tem >13k linhas (multinível). Um .in() com 500 códigos
      // estoura o limite default de 1000 linhas do PostgREST e trunca a resposta, marcando
      // produtos legítimos como "Sem Ficha Técnica". Solução: varrer a tabela paginando por range,
      // coletando ids distintos e nomes — sem filtro IN.
      const comBom = new Set<string>();
      const codigosSet = new Set(codigosGrupo.map((c) => (c ?? "").trim()));
      let bomFrom = 0; const bomSize = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("ficha_tecnica_bom").select("id_produto,produto").range(bomFrom, bomFrom + bomSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as { id_produto: string; produto: string | null }[];
        for (const r of rows) {
          const id = (r.id_produto ?? "").trim();
          if (!codigosSet.has(id)) continue;
          comBom.add(id);
          if (r.produto && !descByCod.has(id)) descByCod.set(id, r.produto);
        }
        if (rows.length < bomSize) break;
        bomFrom += bomSize;
      }


      return codigosGrupo.map((id) => ({
        id,
        nome: descByCod.get(id) ?? id,
        familia: familiaByCod.get(id) ?? null,
        temBom: comBom.has(id),
      })).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  // Saldo do Almox_Fábrica agregado por id_produto
  const saldoQ = useQuery({
    queryKey: ["ruptura", "saldo-fabrica"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await (supabase as any)
        .from("estoque_sistemico")
        .select("id_produto,quantidade,origem")
        .eq("origem", ALMOX_FABRICA);
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { id_produto: string; quantidade: number }[]) {
        map[r.id_produto] = (map[r.id_produto] ?? 0) + Number(r.quantidade || 0);
      }
      return map;
    },
    staleTime: 60 * 1000,
  });

  // Famílias derivadas dos produtos do grupo atual
  const familiasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const p of produtosQ.data ?? []) if (p.familia) set.add(p.familia);
    return Array.from(set).sort();
  }, [produtosQ.data]);

  // Lista filtrada exibida no picker (aplica filtro de família)
  const produtosFiltrados = useMemo(() => {
    const list = produtosQ.data ?? [];
    if (familiaSel === "__all__") return list;
    return list.filter((p) => p.familia === familiaSel);
  }, [produtosQ.data, familiaSel]);

  // ============ AÇÕES ============
  function addLinha(p: Produto) {
    if (!p.temBom) {
      toast.error("Este produto não tem Ficha Técnica cadastrada — não é possível calcular a necessidade de matéria-prima.");
      return;
    }
    setLinhas((prev) => prev.some((l) => l.id_produto === p.id)
      ? prev
      : [...prev, { id_produto: p.id, nome: p.nome, quantidade: 1 }]);
  }
  function updQtd(id: string, q: number) {
    setLinhas((prev) => prev.map((l) => l.id_produto === id ? { ...l, quantidade: q } : l));
  }
  function rm(id: string) {
    setLinhas((prev) => prev.filter((l) => l.id_produto !== id));
  }

  async function carregarDaSugestao() {
    try {
      const [{ data: rep }, { data: est }] = await Promise.all([
        (supabase as any).from("produtos_reposicao")
          .select("id_produto,descricao,estoque_ideal").eq("ativo", true),
        (supabase as any).from("estoque_sistemico").select("id_produto,quantidade"),
      ]);
      const fabricados = new Set<string>((produtosQ.data ?? []).filter((p) => p.temBom).map((p) => p.id));
      const saldos: Record<string, number> = {};
      for (const r of (est ?? []) as any[]) saldos[r.id_produto] = (saldos[r.id_produto] ?? 0) + Number(r.quantidade || 0);
      const novas: LinhaSim[] = ((rep ?? []) as any[])
        .filter((r) => fabricados.has(r.id_produto))
        .map((r) => {
          const sug = Math.max(0, Number(r.estoque_ideal ?? 0) - (saldos[r.id_produto] ?? 0));
          return { id_produto: r.id_produto, nome: r.descricao ?? r.id_produto, quantidade: sug };
        })
        .filter((l) => l.quantidade > 0);
      if (!novas.length) { toast.info("Sem sugestões de abastecimento para produtos fabricados."); return; }
      setLinhas(novas);
      toast.success(`${novas.length} produto(s) carregado(s) da sugestão de abastecimento.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar sugestões"); }
  }

  // ============ CÁLCULO ============
  const resultado = useMemo(() => {
    const bom = bomQ.data ?? [];
    const saldos = saldoQ.data ?? {};
    // Necessidade por insumo folha → { qtd, um, contribs: [{id_produto, nome, qtd, caminho}] }
    const agg = new Map<string, {
      id_item: string; item: string | null; um: string | null;
      necessidade: number;
      contribs: { id_produto: string; nome: string; qtd: number; caminho: { id: string; nome: string | null }[] }[];
    }>();
    for (const linha of linhas) {
      if (!linha.quantidade || linha.quantidade <= 0) continue;
      const nec = explodirBOM(linha.id_produto, linha.quantidade, bom as BomLinha[]);
      for (const n of nec as NecessidadeItem[]) {
        if (n.eh_semiacabado) continue; // ruptura só na folha (matéria-prima real)
        const contrib = { id_produto: linha.id_produto, nome: linha.nome, qtd: n.qtd_necessaria, caminho: n.caminho };
        const cur = agg.get(n.id_item);
        if (cur) {
          cur.necessidade += n.qtd_necessaria;
          cur.contribs.push(contrib);
        } else {
          agg.set(n.id_item, {
            id_item: n.id_item, item: n.item, um: n.um,
            necessidade: n.qtd_necessaria,
            contribs: [contrib],
          });
        }
      }
    }
    const rows = Array.from(agg.values()).map((r) => {
      const saldo = saldos[r.id_item] ?? 0;
      const diff = saldo - r.necessidade;
      return { ...r, saldo, diff, insuf: diff < 0 };
    });
    rows.sort((a, b) => a.diff - b.diff);
    const totalInsuf = rows.filter((r) => r.insuf).length;
    return { rows, totalInsuf };
  }, [linhas, bomQ.data, saldoQ.data]);

  const drillItem = drill ? resultado.rows.find((r) => r.id_item === drill) ?? null : null;

  function gerarDemandaExtra(item: { id_item: string; item: string | null; diff: number }) {
    const falta = Math.abs(item.diff);
    nav({
      to: "/abastecimento/demandas",
      search: {
        sku: item.id_item,
        produto: item.item ?? "",
        quantidade: falta,
        origem: ALMOX_FABRICA,
        motivo: "Ruptura de produção (simulação)",
      } as never,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Planejamento de Produção — Análise de Ruptura</h1>
          <p className="text-sm text-muted-foreground">
            Simule a produção e veja quais matérias-primas faltariam no <b>{ALMOX_FABRICA}</b>. Sem processo de OP.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregarDaSugestao} disabled={produtosQ.isLoading}>
            <Sparkles className="h-4 w-4 mr-1" /> Carregar da Sugestão de Abastecimento
          </Button>
          <Button variant="ghost" onClick={() => setLinhas([])} disabled={!linhas.length}>
            <Trash2 className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageSearch className="h-4 w-4" /> Produtos a simular
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Grupo</label>
              <Select value={grupoSel} onValueChange={(v) => { setGrupoSel(v); setFamiliaSel("__all__"); }}>
                <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(gruposQ.data ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Família</label>
              <Select value={familiaSel} onValueChange={setFamiliaSel}>
                <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {familiasDisponiveis.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <AddProdutoPicker produtos={produtosFiltrados} onPick={addLinha} disabled={produtosQ.isLoading} />
            <div className="text-xs text-muted-foreground ml-auto">
              {produtosFiltrados.length} produto(s) · {produtosFiltrados.filter((p) => !p.temBom).length} sem ficha técnica
            </div>
          </div>

          {linhas.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
              Nenhum produto na simulação. Adicione produtos ou carregue da sugestão.
            </div>
          )}
          {linhas.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-40 text-right">Quantidade</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id_produto}>
                    <TableCell>
                      <div className="text-sm font-medium">{l.id_produto}</div>
                      <div className="text-xs text-muted-foreground">{l.nome}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min={0} step="any"
                        className="text-right"
                        value={l.quantidade}
                        onChange={(e) => updQtd(l.id_produto, Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => rm(l.id_produto)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Ruptura por matéria-prima
            </CardTitle>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <Badge variant="outline">{resultado.rows.length} insumos</Badge>
              {resultado.totalInsuf > 0
                ? <Badge className="bg-destructive/15 text-destructive border-destructive/30">{resultado.totalInsuf} insuficiente(s)</Badge>
                : linhas.length > 0 && <Badge className="bg-success/15 text-success border-success/30">Sem rupturas</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matéria-Prima</TableHead>
                <TableHead className="text-right">Necessidade</TableHead>
                <TableHead className="text-right">Saldo {ALMOX_FABRICA}</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.rows.map((r) => (
                <TableRow
                  key={r.id_item}
                  className={r.insuf ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/40"}
                >
                  <TableCell>
                    <button className="text-left" onClick={() => setDrill(r.id_item)}>
                      <div className="text-sm font-medium underline-offset-2 hover:underline">{r.id_item}</div>
                      <div className="text-xs text-muted-foreground">{r.item ?? ""} {r.um ? `· ${r.um}` : ""}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.necessidade)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.saldo)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.insuf ? "text-destructive font-medium" : ""}`}>
                    {fmt(r.diff)}
                  </TableCell>
                  <TableCell>
                    {r.insuf
                      ? <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertTriangle className="h-3 w-3 mr-1" />Insuficiente</Badge>
                      : <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Suficiente</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.insuf && (
                      <Button size="sm" variant="outline" onClick={() => gerarDemandaExtra(r)}>
                        <Plus className="h-3 w-3 mr-1" /> Demanda Extra
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!resultado.rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    {linhas.length === 0 ? "Adicione produtos para simular." : "Nenhum insumo calculado. Verifique a Ficha Técnica dos produtos."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Origem da necessidade — {drillItem?.id_item}</DialogTitle></DialogHeader>
          {drillItem && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {drillItem.item} · Necessidade total: <b>{fmt(drillItem.necessidade)}</b> {drillItem.um ?? ""}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caminho na estrutura</TableHead>
                    <TableHead className="text-right">Puxa</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillItem.contribs
                    .slice()
                    .sort((a, b) => b.qtd - a.qtd)
                    .map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="text-xs text-muted-foreground break-words">
                          {c.caminho.map((p, idx) => (
                            <span key={idx}>
                              {idx > 0 && <span className="mx-1 text-muted-foreground/60">→</span>}
                              <span className={idx === 0 ? "font-medium text-foreground" : ""}>
                                {p.nome ?? p.id}
                              </span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.qtd)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {drillItem.necessidade > 0 ? ((c.qtd / drillItem.necessidade) * 100).toFixed(1) : "0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddProdutoPicker({ produtos, onPick, disabled }: { produtos: Produto[]; onPick: (p: Produto) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Search className="h-4 w-4 mr-1" /> Adicionar produto…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[520px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar por código, nome ou família…" />
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            <CommandGroup>
              {produtos.slice(0, 800).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.id} ${p.nome} ${p.familia ?? ""}`}
                  onSelect={() => { onPick(p); setOpen(false); }}
                  className={!p.temBom ? "opacity-70" : ""}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{p.id}</span>
                      <span className="truncate text-sm">{p.nome}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{p.familia ?? "Sem família"}</div>
                  </div>
                  {!p.temBom && (
                    <Badge variant="outline" className="ml-2 shrink-0 text-[10px] border-warning/40 text-warning">
                      <FileWarning className="h-3 w-3 mr-1" />Sem Ficha Técnica
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
