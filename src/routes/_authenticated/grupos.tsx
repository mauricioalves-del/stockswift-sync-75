import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/grupos")({
  component: GruposPage,
  head: () => ({ meta: [{ title: "Grupos de Produtos" }] }),
});

interface ParsedRow { grupo: string; codigo_produto: string; }

function GruposPage() {
  const { canWrite, isAdmin } = useRole();
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: existentes } = useQuery({
    queryKey: ["grupos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grupo_produtos").select("*").order("grupo").order("codigo_produto");
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumo = (existentes ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.grupo] = (acc[r.grupo] ?? 0) + 1;
    return acc;
  }, {});

  async function handleFile(f: File) {
    setFilename(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const errs: string[] = [];
    const parsed: ParsedRow[] = [];
    data.forEach((r, i) => {
      const grupo = String(r["Grupo"] ?? r["grupo"] ?? "").trim();
      const codigo = String(r["Codigo_Produto"] ?? r["codigo_produto"] ?? r["Código"] ?? r["Id_Produto"] ?? "").trim();
      if (!grupo) { errs.push(`Linha ${i + 2}: Grupo vazio`); return; }
      if (!codigo) { errs.push(`Linha ${i + 2}: Código vazio`); return; }
      parsed.push({ grupo, codigo_produto: codigo });
    });
    setRows(parsed);
    setErrors(errs);
  }

  async function importar() {
    if (!rows.length) return;
    setImporting(true);
    const CHUNK = 500;
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("grupo_produtos").upsert(slice, { onConflict: "codigo_produto" });
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }
    setImporting(false);
    setRows([]);
    setFilename("");
    qc.invalidateQueries({ queryKey: ["grupos"] });
    qc.invalidateQueries({ queryKey: ["grupos-distintos"] });
    if (fail === 0) toast.success(`${ok} grupos importados`);
    else toast.error(`${fail} falhas`);
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("grupo_produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["grupos"] });
    qc.invalidateQueries({ queryKey: ["grupos-distintos"] });
  }

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Grupos de Produtos</h1>
        <p className="text-sm text-muted-foreground">
          Importe a planilha com colunas <strong>Grupo</strong> e <strong>Codigo_Produto</strong>. Os grupos serão usados como filtro na Contagem.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-accent/30">
            <Upload className="size-8 text-primary" />
            <div className="text-center">
              <div className="font-medium">Clique ou arraste o arquivo</div>
              <div className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</div>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
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
              <CardTitle className="text-base">Preview ({rows.length} linhas)</CardTitle>
              <CardDescription>Códigos já existentes serão atualizados</CardDescription>
            </div>
            <Button onClick={importar} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Importando...</> : "Confirmar importação"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead>Código</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.grupo}</TableCell>
                      <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de Grupos</CardTitle>
          <CardDescription>{existentes?.length ?? 0} códigos cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(resumo).map(([g, n]) => (
              <Badge key={g} variant="secondary" className="text-sm">{g} <span className="ml-1.5 opacity-70">({n})</span></Badge>
            ))}
          </div>
          <div className="overflow-x-auto border rounded-lg max-h-96 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead>Código</TableHead>{isAdmin && <TableHead className="w-16"></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {(existentes ?? []).slice(0, 500).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.grupo}</TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => excluir(r.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
