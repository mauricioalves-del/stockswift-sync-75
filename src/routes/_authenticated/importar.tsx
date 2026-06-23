import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/importar")({
  component: ImportarPage,
  head: () => ({ meta: [{ title: "Importar Estoque" }] }),
});

interface Row {
  Id_Produto: string;
  Id_Lote?: string;
  Qtd: number;
  Descricao?: string;
  Unidade?: string;
  Custo_Unitario?: number;
  Id_Local?: string;
  Cliente?: string;
  Data_Validade?: string;
}

function ImportarPage() {
  const { canWrite } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; when: string } | null>(null);

  if (!canWrite) return <NoPermission />;

  async function handleFile(f: File) {
    setFilename(f.name);
    setResult(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const errs: string[] = [];
    const parsed: Row[] = [];
    data.forEach((r, idx) => {
      const id = String(r["Id_Produto"] ?? r["id_produto"] ?? "").trim();
      const qtdRaw = r["Qtd"] ?? r["quantidade"] ?? r["Quantidade"];
      const qtd = Number(qtdRaw);
      if (!id) { errs.push(`Linha ${idx + 2}: Id_Produto vazio`); return; }
      if (Number.isNaN(qtd)) { errs.push(`Linha ${idx + 2}: Qtd inválida`); return; }
      const valStr = String(r["Data_Validade"] ?? "").trim();
      const dv = valStr ? toIsoDate(valStr) : "";
      parsed.push({
        Id_Produto: id,
        Id_Lote: String(r["Id_Lote"] ?? r["lote"] ?? "").trim(),
        Qtd: qtd,
        Descricao: String(r["Descricao"] ?? r["Descrição"] ?? "").trim(),
        Unidade: String(r["Unidade"] ?? "UN").trim() || "UN",
        Custo_Unitario: Number(r["Custo_Unitario"] ?? r["custo_unitario"] ?? 0) || 0,
        Id_Local: String(r["Id_Local"] ?? r["local"] ?? "").trim(),
        Cliente: String(r["Cliente"] ?? "").trim(),
        Data_Validade: dv,
      });
    });
    setRows(parsed);
    setErrors(errs);
  }

  async function importNow() {
    if (rows.length === 0) return;
    setImporting(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const payload = rows.map((r) => ({
      id_produto: r.Id_Produto,
      lote: r.Id_Lote || "",
      descricao: r.Descricao || "",
      unidade: r.Unidade || "UN",
      quantidade: r.Qtd,
      custo_unitario: r.Custo_Unitario || 0,
      id_local: r.Id_Local || "",
      cliente: r.Cliente || "",
      data_validade: r.Data_Validade || null,
      importado_por: userId,
    }));
    let ok = 0, fail = 0;
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabase.from("estoque_sistemico").insert(slice);
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }
    await supabase.from("audit_logs").insert({
      usuario: userId,
      acao: "IMPORTAR_ESTOQUE",
      entidade: "estoque_sistemico",
      payload: { arquivo: filename, total: rows.length, ok, fail },
    });
    setImporting(false);
    setResult({ ok, fail, when: new Date().toLocaleString("pt-BR") });
    if (fail === 0) toast.success(`${ok} registros importados`);
    else toast.error(`${fail} falhas na importação`);
    setRows([]);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Estoque Sistêmico</h1>
        <p className="text-sm text-muted-foreground">Suporta .xlsx, .xls e .csv. Campos esperados: Id_Produto, Id_Lote, Qtd, Descricao, Unidade, Custo_Unitario, Id_Local, Cliente, Data_Validade.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-accent/30 transition-colors">
            <Upload className="size-10 text-primary" />
            <div className="text-center">
              <div className="font-medium">Clique ou arraste o arquivo aqui</div>
              <div className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</div>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2"><FileSpreadsheet className="size-3.5" />{filename}</div>}
          </label>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-base">
              <AlertCircle className="size-4" /> {errors.length} erro(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
              {errors.slice(0, 50).map((e, i) => <li key={i} className="text-destructive">• {e}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-success/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success text-base">
              <CheckCircle2 className="size-4" /> Importação concluída
            </CardTitle>
            <CardDescription>{result.ok} importados · {result.fail} falhas · {result.when}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Preview ({rows.length} registros)</CardTitle>
              <CardDescription>Confira antes de confirmar a importação</CardDescription>
            </div>
            <Button onClick={importNow} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Importando...</> : "Confirmar importação"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Un</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Validade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.Id_Produto}</TableCell>
                      <TableCell className="font-mono text-xs">{r.Id_Lote}</TableCell>
                      <TableCell>{r.Descricao}</TableCell>
                      <TableCell>{r.Unidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.Qtd}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.Custo_Unitario ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{r.Id_Local}</TableCell>
                      <TableCell className="text-xs">{r.Data_Validade}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 100 && <div className="text-xs text-muted-foreground p-2 text-center">… exibindo 100 de {rows.length}</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toIsoDate(s: string): string {
  // accept dd/mm/yyyy or yyyy-mm-dd or excel serial
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const n = Number(s);
  if (!Number.isNaN(n) && n > 30000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return "";
}

function NoPermission() {
  return <div className="p-8 text-center text-muted-foreground">Você não tem permissão para importar estoque.</div>;
}
