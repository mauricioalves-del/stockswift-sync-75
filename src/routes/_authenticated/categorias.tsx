import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/categorias")({
  component: CategoriasPage,
  head: () => ({
    meta: [
      { title: "Cadastro de Categoria — Gestão de Estoque" },
      { name: "description", content: "Segmento, jornada e categoria de cada SKU, com importação por planilha." },
      { property: "og:title", content: "Cadastro de Categoria" },
      { property: "og:description", content: "Segmento, jornada e categoria de cada SKU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Linha { segmento: string; jornada: string; categoria: string; codigo_produto: string; produto: string }
type Existente = Linha & { id: string };

const COLS = ["SEGMENTO", "JORNADA", "CATEGORIA", "SKU", "PRODUTO"];

function CategoriasPage() {
  const { canWrite, isAdmin } = useRole();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Linha[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [busca, setBusca] = useState("");
  const [segSel, setSegSel] = useState<string | null>(null);

  const { data: existentes = [] } = useQuery({
    queryKey: ["categorias-produto"],
    queryFn: async () => {
      const all: Existente[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any).from("categorias_produto").select("*")
          .order("segmento").order("categoria").order("codigo_produto").range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const porSeg = useMemo(() => existentes.reduce<Record<string, number>>((a, r) => ((a[r.segmento] = (a[r.segmento] ?? 0) + 1), a), {}), [existentes]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return existentes.filter((r) => (!segSel || r.segmento === segSel) &&
      (!q || [r.codigo_produto, r.produto, r.categoria, r.jornada].some((v) => (v ?? "").toLowerCase().includes(q))));
  }, [existentes, busca, segSel]);

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ["Chocolates", "Auto Consumo", "Lingua De Onça", "5004015", "Língua de Onça ao Leite Cx - 80g"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CATEGORIAS");
    XLSX.writeFile(wb, "modelo-cadastro-categoria.xlsx");
  }

  function exportar() {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ...filtrados.map((r) => [r.segmento, r.jornada, r.categoria, r.codigo_produto, r.produto])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CATEGORIAS");
    XLSX.writeFile(wb, "categorias.xlsx");
  }

  async function handleFile(f: File) {
    setFilename(f.name);
    const wb = XLSX.read(await f.arrayBuffer());
    const data = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false }));
    const errs: string[] = [];
    const vistos = new Set<string>();
    const parsed: Linha[] = [];
    data.forEach((r, i) => {
      const l: Linha = {
        segmento: pickCI(r, "SEGMENTO"),
        jornada: pickCI(r, "JORNADA"),
        categoria: pickCI(r, "CATEGORIA"),
        codigo_produto: pickCI(r, "SKU", "Codigo_Produto", "Código"),
        produto: pickCI(r, "PRODUTO", "Descrição"),
      };
      if (!l.codigo_produto) return errs.push(`Linha ${i + 2}: SKU vazio`);
      if (!l.segmento || !l.jornada || !l.categoria) return errs.push(`Linha ${i + 2}: Segmento, Jornada e Categoria são obrigatórios`);
      if (vistos.has(l.codigo_produto)) return errs.push(`Linha ${i + 2}: SKU ${l.codigo_produto} duplicado`);
      vistos.add(l.codigo_produto);
      parsed.push(l);
    });
    setRows(errs.length ? [] : parsed);
    setErrors(errs);
    if (errs.length) toast.error("Corrija os erros da planilha antes de importar — nada foi gravado.");
  }

  async function importar() {
    setImporting(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = rows.map((r) => ({ ...r, produto: r.produto || null, atualizado_por: u.user?.id ?? null }));
    const { error } = await (supabase as any).from("categorias_produto").upsert(payload, { onConflict: "codigo_produto" });
    setImporting(false);
    if (error) return toast.error("Erro ao importar: " + error.message);
    toast.success(`${rows.length} SKUs categorizados`);
    setRows([]); setFilename("");
    qc.invalidateQueries({ queryKey: ["categorias-produto"] });
  }

  async function excluir(id: string) {
    const { error } = await (supabase as any).from("categorias_produto").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categorias-produto"] });
  }

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cadastro de Categoria</h1>
          <p className="text-sm text-muted-foreground">
            Planilha padrão com colunas <strong>SEGMENTO</strong>, <strong>JORNADA</strong>, <strong>CATEGORIA</strong>, <strong>SKU</strong> e <strong>PRODUTO</strong>. SKUs já cadastrados são atualizados.
          </p>
        </div>
        <Button variant="outline" onClick={baixarModelo} className="gap-2"><Download className="size-4" /> Baixar modelo</Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-accent/30">
            <Upload className="size-8 text-primary" />
            <div className="text-center">
              <div className="font-medium">Clique para enviar a planilha</div>
              <div className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</div>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { e.target.files?.[0] && handleFile(e.target.files[0]); e.target.value = ""; }} />
            {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><FileSpreadsheet className="size-3.5" />{filename}</div>}
          </label>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-destructive text-base"><AlertCircle className="size-4" /> {errors.length} erro(s)</CardTitle></CardHeader>
          <CardContent><ul className="text-sm space-y-1 max-h-40 overflow-y-auto">{errors.slice(0, 30).map((e, i) => <li key={i} className="text-destructive">• {e}</li>)}</ul></CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Prévia ({rows.length} SKUs)</CardTitle>
              <CardDescription>Confira antes de gravar</CardDescription>
            </div>
            <Button onClick={importar} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Importando...</> : "Confirmar importação"}
            </Button>
          </CardHeader>
          <CardContent><TabelaCat linhas={rows} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Categorias cadastradas</CardTitle>
            <CardDescription>{existentes.length} SKUs · {new Set(existentes.map((e) => e.categoria)).size} categorias</CardDescription>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Buscar SKU, produto, categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />
            <Button variant="outline" onClick={exportar} className="gap-2"><Download className="size-4" /> Exportar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant={segSel === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setSegSel(null)}>Todos ({existentes.length})</Badge>
            {Object.entries(porSeg).map(([s, n]) => (
              <Badge key={s} variant={segSel === s ? "default" : "secondary"} className="cursor-pointer" onClick={() => setSegSel(segSel === s ? null : s)}>{s} ({n})</Badge>
            ))}
          </div>
          <TabelaCat linhas={filtrados} onExcluir={isAdmin ? excluir : undefined} />
        </CardContent>
      </Card>
    </div>
  );
}

function TabelaCat({ linhas, onExcluir }: { linhas: (Linha & { id?: string })[]; onExcluir?: (id: string) => void }) {
  return (
    <div className="overflow-auto border rounded-lg max-h-[520px]">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead>Segmento</TableHead><TableHead>Jornada</TableHead><TableHead>Categoria</TableHead>
            <TableHead>SKU</TableHead><TableHead>Produto</TableHead>
            {onExcluir && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((r, i) => (
            <TableRow key={r.id ?? i}>
              <TableCell>{r.segmento}</TableCell>
              <TableCell>{r.jornada}</TableCell>
              <TableCell>{r.categoria}</TableCell>
              <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
              <TableCell>{r.produto}</TableCell>
              {onExcluir && r.id && (
                <TableCell><Button size="icon" variant="ghost" onClick={() => onExcluir(r.id!)}><Trash2 className="size-3.5 text-destructive" /></Button></TableCell>
              )}
            </TableRow>
          ))}
          {linhas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma categoria.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}
