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
import { AlertTriangle, CheckCircle2, Plus, Sparkles, Trash2, Search, PackageSearch } from "lucide-react";
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

type Produto = { id: string; nome: string };

function RupturaPage() {
  const nav = useNavigate();
  const [linhas, setLinhas] = useState<LinhaSim[]>([]);
  const [drill, setDrill] = useState<string | null>(null);

  // BOM completa (memoizada via react-query)
  const bomQ = useQuery({
    queryKey: ["ruptura", "bom"],
    queryFn: async () => carregarBomCompleta(),
    staleTime: 5 * 60 * 1000,
  });

  // Produtos fabricados (id_produto distintos em ficha_tecnica_bom)
  const produtosQ = useQuery({
    queryKey: ["ruptura", "produtos-fabricados"],
    queryFn: async (): Promise<Produto[]> => {
      const { data } = await (supabase as any)
        .from("ficha_tecnica_bom")
        .select("id_produto,produto")
        .limit(20000);
      const uniq = new Map<string, string>();
      for (const r of (data ?? []) as { id_produto: string; produto: string | null }[]) {
        if (!uniq.has(r.id_produto)) uniq.set(r.id_produto, r.produto ?? r.id_produto);
      }
      return Array.from(uniq.entries())
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
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

  // ============ AÇÕES ============
  function addLinha(p: Produto) {
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
      const fabricados = new Set<string>((produtosQ.data ?? []).map((p) => p.id));
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
    // Necessidade por insumo → { qtd, um, contribs: [{id_produto, nome, qtd}] }
    const agg = new Map<string, {
      id_item: string; item: string | null; um: string | null;
      necessidade: number; contribs: { id_produto: string; nome: string; qtd: number }[];
    }>();
    for (const linha of linhas) {
      if (!linha.quantidade || linha.quantidade <= 0) continue;
      const nec = explodirBOM(linha.id_produto, linha.quantidade, bom as BomLinha[]);
      for (const n of nec as NecessidadeItem[]) {
        const cur = agg.get(n.id_item);
        if (cur) {
          cur.necessidade += n.qtd_necessaria;
          cur.contribs.push({ id_produto: linha.id_produto, nome: linha.nome, qtd: n.qtd_necessaria });
        } else {
          agg.set(n.id_item, {
            id_item: n.id_item, item: n.item, um: n.um,
            necessidade: n.qtd_necessaria,
            contribs: [{ id_produto: linha.id_produto, nome: linha.nome, qtd: n.qtd_necessaria }],
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
          <AddProdutoPicker produtos={produtosQ.data ?? []} onPick={addLinha} disabled={produtosQ.isLoading} />
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Origem da necessidade — {drillItem?.id_item}</DialogTitle></DialogHeader>
          {drillItem && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {drillItem.item} · Necessidade total: <b>{fmt(drillItem.necessidade)}</b> {drillItem.um ?? ""}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto simulado</TableHead>
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
                        <div className="text-sm font-medium">{c.id_produto}</div>
                        <div className="text-xs text-muted-foreground">{c.nome}</div>
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
      <PopoverContent className="p-0 w-[420px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar por código ou nome…" />
          <CommandList>
            <CommandEmpty>Nenhum produto fabricado encontrado.</CommandEmpty>
            <CommandGroup>
              {produtos.slice(0, 500).map((p) => (
                <CommandItem key={p.id} value={`${p.id} ${p.nome}`} onSelect={() => { onPick(p); setOpen(false); }}>
                  <span className="font-mono text-xs mr-2">{p.id}</span>
                  <span className="truncate">{p.nome}</span>
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
