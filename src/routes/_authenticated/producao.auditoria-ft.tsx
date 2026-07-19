// Auditoria de Ficha Técnica — mostra quantos Produtos Acabados têm
// (e quantos NÃO têm) Ficha Técnica cadastrada. Substitui o processo
// caso-a-caso de descobrir gaps SKU por SKU.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, ClipboardCheck, Search, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/producao/auditoria-ft")({
  component: AuditoriaFtPage,
  head: () => ({ meta: [
    { title: "Auditoria de Ficha Técnica" },
    { name: "description", content: "Produtos Acabados com e sem Ficha Técnica cadastrada." },
  ]}),
});

type Row = { codigo: string; descricao: string; familia: string | null; grupo: string; local: boolean; temFt: boolean };

function AuditoriaFtPage() {
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

      // 3. IDs com FT — varredura paginada de ficha_tecnica_bom (contorna teto de 1000 do PostgREST)
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
    return l;
  }, [dataQ.data, filtro, busca]);

  function exportar() {
    const rows = filtradas.map((r) => ({
      "Código": r.codigo, "Produto": r.descricao, "Família": r.familia ?? "",
      "Grupo": r.grupo, "É Produto Local": r.local ? "Sim" : "Não",
      "Tem Ficha Técnica": r.temFt ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria FT");
    XLSX.writeFile(wb, `auditoria-ficha-tecnica-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardCheck className="size-6" /> Auditoria de Ficha Técnica
          </h1>
          <p className="text-sm text-muted-foreground">
            Compara os produtos do Cadastro com os `id_produto` distintos em <code>ficha_tecnica_bom</code>.
            Produtos Locais são marcados — normalmente não têm ficha própria porque são montados na loja.
          </p>
        </div>
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
            {filtradas.length} produto(s) {filtro === "sem" ? "sem ficha técnica" : filtro === "com" ? "com ficha técnica" : ""}
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 1000).map((r) => (
                  <TableRow key={r.codigo}>
                    <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                    <TableCell className="text-sm">{r.descricao || <span className="text-muted-foreground italic">sem descrição</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.familia ?? "—"}</TableCell>
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
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
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
    </div>
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
