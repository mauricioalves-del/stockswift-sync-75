// Auditoria de Ficha Técnica — ponto único de descoberta de furos de FT:
// (A) completude de cadastro, (B) ranking de dispersão por ficha técnica com
// árvore expansível de composição e (C) atalho para sugestão de revisão.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileSpreadsheet, ClipboardCheck, Search, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { fetchAll } from "@/lib/fetch-all";
import { FAIXAS_DEFAULT, classificar, fmtBRL, labelMes, percentualDispersao, type Faixas } from "@/lib/dispersao";
import { ArvoreFichaTecnica } from "@/components/producao/ArvoreFichaTecnica";
import type { ImpactoLinha } from "@/lib/ft-arvore";

export const Route = createFileRoute("/_authenticated/producao/auditoria-ft")({
  component: AuditoriaFtPage,
  head: () => ({ meta: [
    { title: "Auditoria de Ficha Técnica" },
    { name: "description", content: "Completude e ranking de dispersão das Fichas Técnicas de Produção." },
  ]}),
});

type Row = { codigo: string; descricao: string; familia: string | null; grupo: string; local: boolean; temFt: boolean };

function AuditoriaFtPage() {
  return (
    <div className="space-y-4 w-full">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ClipboardCheck className="size-6" /> Auditoria de Ficha Técnica
        </h1>
        <p className="text-sm text-muted-foreground">
          Completude do cadastro e onde a Ficha Técnica está descolada do consumo real.
        </p>
      </div>
      <Tabs defaultValue="completude">
        <TabsList>
          <TabsTrigger value="completude">Completude de Cadastro</TabsTrigger>
          <TabsTrigger value="ranking">Ranking de Dispersão por Ficha Técnica</TabsTrigger>
        </TabsList>
        <TabsContent value="completude" className="space-y-4 pt-3"><Completude /></TabsContent>
        <TabsContent value="ranking" className="space-y-4 pt-3"><RankingFT /></TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// PARTE A — Ranking de dispersão por Ficha Técnica + PARTE B — árvore
// ===========================================================================

type RankRow = {
  produto: string; desc: string;
  ops: number; linhas: number;
  aderencia: number; perda: number; economia: number; dispersao: number;
};

function useFaixas() {
  const paramsQ = useQuery({
    queryKey: ["dispersao", "faixas"],
    queryFn: async (): Promise<Faixas> => {
      const { data } = await (supabase as any).from("parametros_dispersao").select("*").maybeSingle();
      if (!data) return FAIXAS_DEFAULT;
      return { atencao: Number(data.limite_atencao_pct), critico: Number(data.limite_critico_pct) };
    },
    staleTime: 5 * 60_000,
  });
  return paramsQ.data ?? FAIXAS_DEFAULT;
}

function useImpactoFT() {
  return useQuery({
    queryKey: ["auditoria-ft", "impacto"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      fetchAll<ImpactoLinha & { ano_mes: string }>((from, to) =>
        (supabase as any).from("v_impacto_consumo")
          .select("ano_mes, numero_op, sku_produto_final, desc_prod, material, desc_material, um, qtd_consumo, qtd_previsto, qtd_dif, impacto_rs, tipo_desvio")
          .range(from, to)),
  });
}

function RankingFT() {
  const [anoMes, setAnoMes] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const faixas = useFaixas();
  const impactoQ = useImpactoFT();


  const todas = impactoQ.data ?? [];
  const meses = useMemo(
    () => Array.from(new Set(todas.map((r) => r.ano_mes).filter(Boolean))).sort().reverse(),
    [todas],
  );

  const impacto = useMemo(
    () => (anoMes === "todos" ? todas : todas.filter((r) => r.ano_mes === anoMes)),
    [todas, anoMes],
  );

  // Ranking por produto final (sku_produto_final agrupa também os subconjuntos com OP própria).
  const ranking = useMemo<RankRow[]>(() => {
    const map = new Map<string, { desc: string; ops: Set<string>; linhas: number; normais: number; perda: number; economia: number }>();
    for (const r of impacto) {
      const p = String(r.sku_produto_final ?? "").trim();
      if (!p) continue;
      const cur = map.get(p) ?? { desc: r.desc_prod ?? "", ops: new Set<string>(), linhas: 0, normais: 0, perda: 0, economia: 0 };
      if (!cur.desc && r.desc_prod) cur.desc = r.desc_prod;
      cur.ops.add(r.numero_op);
      cur.linhas += 1;
      const pct = percentualDispersao(Number(r.qtd_dif ?? 0), Number(r.qtd_previsto ?? 0), Number(r.qtd_consumo ?? 0));
      if (classificar(pct, faixas) === "NORMAL") cur.normais += 1;
      const imp = Number(r.impacto_rs ?? 0);
      if (imp > 0) cur.perda += imp; else cur.economia += -imp;
      map.set(p, cur);
    }
    return Array.from(map.entries()).map(([produto, v]) => ({
      produto, desc: v.desc,
      ops: v.ops.size, linhas: v.linhas,
      aderencia: v.linhas ? (100 * v.normais) / v.linhas : 0,
      perda: v.perda, economia: v.economia,
      dispersao: v.perda + v.economia,
    })).sort((a, b) => b.dispersao - a.dispersao);
  }, [impacto, faixas]);

  // Descrições ausentes em v_impacto_consumo: resolve na Ficha Técnica em cascata
  // (id_produto/produto → id_subconjunto/subconjunto → id_item/item), igual à tela de dispersão.
  const codigosSemDesc = useMemo(
    () => ranking.filter((r) => !r.desc).map((r) => r.produto).sort(),
    [ranking],
  );
  const descQ = useQuery({
    queryKey: ["auditoria-ft", "descricoes", codigosSemDesc.join(",")],
    enabled: codigosSemDesc.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = new Map<string, string>();
      const setIfEmpty = (k: unknown, v: unknown) => {
        const key = k == null ? "" : String(k).trim();
        const val = v == null ? "" : String(v).trim();
        if (key && val && !map.has(key)) map.set(key, val);
      };
      const [porProduto, porSubconjunto, porItem] = await Promise.all([
        fetchAll<any>((from, to) => (supabase as any).from("ficha_tecnica_bom")
          .select("id_produto,produto").in("id_produto", codigosSemDesc).range(from, to)),
        fetchAll<any>((from, to) => (supabase as any).from("ficha_tecnica_bom")
          .select("id_subconjunto,subconjunto").in("id_subconjunto", codigosSemDesc).range(from, to)),
        fetchAll<any>((from, to) => (supabase as any).from("ficha_tecnica_bom")
          .select("id_item,item").in("id_item", codigosSemDesc).range(from, to)),
      ]);
      for (const p of porProduto) setIfEmpty(p.id_produto, p.produto);
      for (const p of porSubconjunto) setIfEmpty(p.id_subconjunto, p.subconjunto);
      for (const p of porItem) setIfEmpty(p.id_item, p.item);
      return map;
    },
  });

  const rankingComDesc = useMemo<RankRow[]>(() => {
    const m = descQ.data;
    if (!m || m.size === 0) return ranking;
    return ranking.map((r) => (r.desc ? r : { ...r, desc: m.get(r.produto) ?? "" }));
  }, [ranking, descQ.data]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rankingComDesc;
    return rankingComDesc.filter((r) => r.produto.toLowerCase().includes(t) || r.desc.toLowerCase().includes(t));
  }, [rankingComDesc, busca]);


  function exportar() {
    const ws = XLSX.utils.json_to_sheet(filtradas.map((r) => ({
      "Código": r.produto, "Produto": r.desc, "OPs": r.ops, "Linhas": r.linhas,
      "% Aderência": +r.aderencia.toFixed(1), "Perda (R$)": +r.perda.toFixed(2),
      "Economia (R$)": +r.economia.toFixed(2), "Dispersão Total (R$)": +r.dispersao.toFixed(2),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ranking FT");
    XLSX.writeFile(wb, `ranking-dispersao-ft-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Cruza <code>v_impacto_consumo</code> com a Ficha Técnica. Expanda um produto para ver a composição item a item.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={anoMes} onValueChange={setAnoMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {meses.map((m) => <SelectItem key={m} value={m}>{labelMes(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Buscar produto</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código ou nome..." className="pl-7" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{filtradas.length} produto(s) com produção no período</CardTitle>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!filtradas.length}>
            <FileSpreadsheet className="size-4 mr-1" /> Exportar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">OPs</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">% Aderência</TableHead>
                  <TableHead className="text-right">Perda</TableHead>
                  <TableHead className="text-right">Economia</TableHead>
                  <TableHead className="text-right">Dispersão Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 300).map((r) => (
                  <Fragment key={r.produto}>
                    <TableRow className="cursor-pointer" onClick={() => setAberto(aberto === r.produto ? null : r.produto)}>
                      <TableCell>
                        {aberto === r.produto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.produto}</TableCell>
                      <TableCell className="text-sm max-w-[280px] truncate" title={r.desc}>
                        {r.desc || "—"}
                        {r.produto.trim() === "05104122" && (
                          <Link to="/producao/testes-industriais" onClick={(e) => e.stopPropagation()} className="ml-1.5 inline-flex align-middle" title="Gasto de inovação — não é furo de produção padrão">
                            <Badge variant="outline" className="text-[10px]">Teste Industrial</Badge>
                          </Link>
                        )}
                      </TableCell>

                      <TableCell className="text-right tabular-nums text-xs">{r.ops}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{r.linhas}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        <Badge variant="outline" className={r.aderencia >= 90 ? "bg-success/15 text-success border-success/30" : r.aderencia >= 70 ? "bg-warning/15 text-warning border-warning/30" : "bg-destructive/15 text-destructive border-destructive/30"}>
                          {r.aderencia.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-destructive">{fmtBRL(r.perda)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-success">{fmtBRL(r.economia)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-medium">{fmtBRL(r.dispersao)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => e.stopPropagation()}>
                          <Link to="/producao/dispersao" search={{ produto: r.produto } as any}><ExternalLink className="size-3.5" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {aberto === r.produto && (
                      <TableRow>
                        <TableCell colSpan={10} className="p-2 bg-muted/30">
                          <ArvoreFichaTecnica idProduto={r.produto} descProduto={r.desc} impacto={impacto} faixas={faixas} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                    {impactoQ.isLoading ? "Carregando..." : "Sem dados de consumo no período."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ===========================================================================
// Completude de cadastro (comportamento original)
// ===========================================================================

function Completude() {
  const [grupoSel, setGrupoSel] = useState("Produto Acabado");
  const [filtro, setFiltro] = useState<"todos" | "sem" | "com">("sem");
  const [busca, setBusca] = useState("");

  const gruposQ = useQuery({
    queryKey: ["audit-ft", "grupos"],
    queryFn: async (): Promise<string[]> => {
      const { data } = await (supabase as any).from("grupo_produtos").select("grupo");
      return Array.from(new Set(((data ?? []) as { grupo: string }[]).map((d) => d.grupo).filter(Boolean))).sort();
    },
    staleTime: 5 * 60_000,
  });

  const dataQ = useQuery({
    queryKey: ["audit-ft", "data", grupoSel],
    queryFn: async (): Promise<Row[]> => {
      // 1. Produtos do Grupo (paginado)
      const produtos: { codigo: string; local: boolean }[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("grupo_produtos")
          .select("codigo_produto,eh_produto_local,grupo")
          .eq("grupo", grupoSel).range(from, from + size - 1);
        if (error) throw error;
        const rows = (data ?? []) as { codigo_produto: string; eh_produto_local: boolean | null }[];
        for (const r of rows) {
          const c = (r.codigo_produto ?? "").trim();
          if (c) produtos.push({ codigo: c, local: !!r.eh_produto_local });
        }
        if (rows.length < size) break;
        from += size;
      }
      if (!produtos.length) return [];

      // 2. Descrição + família (chunked IN)
      const familia = new Map<string, string | null>();
      const desc = new Map<string, string>();
      const codigos = produtos.map((p) => p.codigo);
      for (let i = 0; i < codigos.length; i += 500) {
        const slice = codigos.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("familias").select("codigo_produto,familia,descricao_produto").in("codigo_produto", slice);
        for (const r of (data ?? []) as { codigo_produto: string; familia: string | null; descricao_produto: string | null }[]) {
          const c = (r.codigo_produto ?? "").trim();
          familia.set(c, r.familia ?? null);
          if (r.descricao_produto) desc.set(c, r.descricao_produto);
        }
      }

      // 3. IDs com FT — varredura paginada de ficha_tecnica_bom
      const comFt = new Set<string>();
      const codigosSet = new Set(codigos);
      let bomFrom = 0; const bomSize = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("ficha_tecnica_bom").select("id_produto,produto").range(bomFrom, bomFrom + bomSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as { id_produto: string; produto: string | null }[];
        for (const r of rows) {
          const id = (r.id_produto ?? "").trim();
          if (!codigosSet.has(id)) continue;
          comFt.add(id);
          if (r.produto && !desc.has(id)) desc.set(id, r.produto);
        }
        if (rows.length < bomSize) break;
        bomFrom += bomSize;
      }

      return produtos.map((p) => ({
        codigo: p.codigo,
        descricao: desc.get(p.codigo) ?? "",
        familia: familia.get(p.codigo) ?? null,
        grupo: grupoSel,
        local: p.local,
        temFt: comFt.has(p.codigo),
      })).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  // Relevância de consumo para priorizar cadastro de FT.
  const relevanciaQ = useQuery({
    queryKey: ["audit-ft", "relevancia"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await (supabase as any)
        .from("v_consumo_relevancia_sku").select("sku, qtd_total");
      if (error) return new Map();
      const m = new Map<string, number>();
      for (const r of (data ?? []) as any[]) m.set(String(r.sku ?? "").trim(), Number(r.qtd_total ?? 0));
      return m;
    },
  });

  const kpis = useMemo(() => {
    const list = dataQ.data ?? [];
    const total = list.length;
    const com = list.filter((r) => r.temFt).length;
    const sem = total - com;
    const semNaoLocais = list.filter((r) => !r.temFt && !r.local).length;
    return { total, com, sem, semNaoLocais };
  }, [dataQ.data]);

  const filtradas = useMemo(() => {
    let l = dataQ.data ?? [];
    if (filtro === "sem") l = l.filter((r) => !r.temFt);
    else if (filtro === "com") l = l.filter((r) => r.temFt);
    if (busca.trim()) {
      const t = busca.toLowerCase();
      l = l.filter((r) => r.codigo.toLowerCase().includes(t) || r.descricao.toLowerCase().includes(t));
    }
    const rel = relevanciaQ.data;
    if (filtro === "sem" && rel) {
      return [...l].sort((a, b) => (rel.get(b.codigo) ?? 0) - (rel.get(a.codigo) ?? 0));
    }
    return l;
  }, [dataQ.data, filtro, busca, relevanciaQ.data]);

  function exportar() {
    const rows = filtradas.map((r) => ({
      "Código": r.codigo, "Produto": r.descricao, "Família": r.familia ?? "",
      "Grupo": r.grupo, "É Produto Local": r.local ? "Sim" : "Não",
      "Tem Ficha Técnica": r.temFt ? "Sim" : "Não",
      "Consumo (qtd)": +(relevanciaQ.data?.get(r.codigo) ?? 0).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria FT");
    XLSX.writeFile(wb, `auditoria-ficha-tecnica-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" onClick={exportar} disabled={!filtradas.length}>
          <FileSpreadsheet className="size-4 mr-1" /> Exportar Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Produtos do grupo" value={kpis.total} />
        <Kpi label="Com Ficha Técnica" value={kpis.com} tone="success" />
        <Kpi label="Sem Ficha Técnica" value={kpis.sem} tone="danger" />
        <Kpi label="Sem FT (não-locais)" value={kpis.semNaoLocais} tone="warning"
             hint="Excluindo Produtos Locais — esses são os gaps reais de cadastro." />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Selecione o grupo e o recorte desejado</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Grupo</label>
            <Select value={grupoSel} onValueChange={setGrupoSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(gruposQ.data ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Exibir</label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sem">Sem Ficha Técnica</SelectItem>
                <SelectItem value="com">Com Ficha Técnica</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU ou nome..." className="pl-7" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtradas.length} produto(s) {filtro === "sem" ? "sem ficha técnica (ordenados por volume de consumo)" : filtro === "com" ? "com ficha técnica" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Família</TableHead>
                  <TableHead className="text-right">Consumo (qtd)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 1000).map((r) => (
                  <TableRow key={r.codigo}>
                    <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                    <TableCell className="text-sm">{r.descricao || <span className="text-muted-foreground italic">sem descrição</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.familia ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {relevanciaQ.data?.get(r.codigo) ? relevanciaQ.data.get(r.codigo)!.toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      {r.temFt
                        ? <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="size-3 mr-1" /> Com FT</Badge>
                        : r.local
                          ? <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400">Produto Local</Badge>
                          : <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertTriangle className="size-3 mr-1" /> Sem FT</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    {dataQ.isLoading ? "Carregando..." : "Nenhum resultado."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {filtradas.length > 1000 && (
              <div className="text-xs text-muted-foreground p-2 text-center">
                Exibindo 1.000 de {filtradas.length}. Refine o filtro ou exporte para Excel.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: number; tone?: "success" | "danger" | "warning"; hint?: string }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value.toLocaleString("pt-BR")}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
