import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/abastecimento/consumo")({
  component: ConsumoPage,
  head: () => ({ meta: [{ title: "Importar Consumo" }] }),
});

type Row = { origem: string; sku: string; descricao: string; data_movimento: string; quantidade: number };

const REQUIRED = ["Origem", "SKU", "Data", "Quantidade"];

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  return pickCI(r, ...keys);
}


function toIsoDate(s: string): string {
  if (!s) return "";
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

function ConsumoPage() {
  const { canWrite, isAdmin } = useRole();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  const resumoQ = useQuery({
    queryKey: ["consumo_resumo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("historico_consumo" as never)
        .select("origem, sku, quantidade, data_movimento")
        .order("data_movimento", { ascending: false })
        .limit(500);
      const arr = (data ?? []) as unknown as { origem: string; sku: string; quantidade: number; data_movimento: string }[];
      const total = arr.reduce((s, r) => s + Number(r.quantidade), 0);
      const origens = new Set(arr.map((r) => r.origem)).size;
      const skus = new Set(arr.map((r) => r.sku)).size;
      const lastDate = arr[0]?.data_movimento ?? null;
      return { total, origens, skus, lastDate, count: arr.length };
    },
  });

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  async function handleFile(f: File) {
    setFilename(f.name); setResult(null); setErrors([]); setRows([]);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      if (data.length === 0) { setErrors(["Planilha vazia"]); return; }
      const headerKeys = new Set(Object.keys(data[0]).map((k) => k.trim().toLowerCase()));
      const missing = REQUIRED.filter((k) => !headerKeys.has(k.trim().toLowerCase()));
      if (missing.length) { setErrors([`Colunas obrigatórias ausentes: ${missing.join(", ")}`]); return; }


      const errs: string[] = [];
      const parsed: Row[] = [];
      data.forEach((r, i) => {
        const origem = pick(r, "Origem", "origem");
        const sku = pick(r, "SKU", "sku", "Id_produto", "Id_Produto");
        const dataMov = toIsoDate(pick(r, "Data", "data", "Data_Movimento"));
        const qtd = Number(String(r["Quantidade"] ?? r["quantidade"] ?? 0).replace(",", "."));
        if (!origem) return errs.push(`Linha ${i + 2}: Origem vazia`);
        if (!sku) return errs.push(`Linha ${i + 2}: SKU vazio`);
        if (!dataMov) return errs.push(`Linha ${i + 2}: Data inválida`);
        if (Number.isNaN(qtd)) return errs.push(`Linha ${i + 2}: Quantidade inválida`);
        parsed.push({
          origem, sku, descricao: pick(r, "Descricao", "descricao", "Descrição"),
          data_movimento: dataMov, quantidade: qtd,
        });
      });
      setRows(parsed); setErrors(errs);
    } catch (e) { setErrors([(e as Error).message]); }
  }

  async function importar() {
    if (rows.length === 0) return;
    setImporting(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    // Dedup/soma por (origem, sku, data_movimento) — mesma chave única do banco,
    // evitando duplicidade ao reimportar o mesmo período.
    const agg = new Map<string, Row>();
    for (const r of rows) {
      const key = `${r.origem}|${r.sku}|${r.data_movimento}`;
      const prev = agg.get(key);
      if (prev) {
        prev.quantidade += r.quantidade;
        if (!prev.descricao && r.descricao) prev.descricao = r.descricao;
      } else agg.set(key, { ...r });
    }
    const payload = Array.from(agg.values()).map((r) => ({ ...r, importado_por: userId }));
    let ok = 0, fail = 0;
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("historico_consumo" as never)
        .upsert(slice as never, { onConflict: "origem,sku,data_movimento" });
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }
    setImporting(false);
    setResult({ ok, fail });
    setRows([]);
    qc.invalidateQueries({ queryKey: ["consumo_resumo"] });
    qc.invalidateQueries({ queryKey: ["planejamento_cobertura"] });
    if (fail === 0) toast.success(`${ok} movimentos importados`);
    else toast.error(`${fail} falhas na importação`);
  }

  async function limparAntigos() {
    if (!isAdmin) return;
    if (!confirm("Remover registros com mais de 90 dias?")) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const iso = cutoff.toISOString().slice(0, 10);
    const { error } = await supabase.from("historico_consumo" as never).delete().lt("data_movimento", iso);
    if (error) { toast.error(error.message); return; }
    toast.success("Registros antigos removidos");
    qc.invalidateQueries({ queryKey: ["consumo_resumo"] });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="size-6" /> Importar Consumo</h1>
        <p className="text-sm text-muted-foreground">
          Fonte do <b>CMD (Consumo Médio Diário)</b>. Colunas obrigatórias: <b>Origem, SKU, Data, Quantidade</b>. Opcional: Descricao.
        </p>
      </div>

      {resumoQ.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI label="Registros recentes" value={String(resumoQ.data.count)} />
          <KPI label="SKUs distintos" value={String(resumoQ.data.skus)} />
          <KPI label="Origens" value={String(resumoQ.data.origens)} />
          <KPI label="Última data" value={resumoQ.data.lastDate ?? "—"} />
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-accent/30 transition-colors">
            <Upload className="size-10 text-primary" />
            <div className="text-center">
              <div className="font-medium">Selecione a planilha de consumo</div>
              <div className="text-xs text-muted-foreground">.xlsx com Origem, SKU, Data, Quantidade</div>
            </div>
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2"><FileSpreadsheet className="size-3.5" />{filename}</div>}
          </label>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-destructive text-base"><AlertCircle className="size-4" /> {errors.length} erro(s)</CardTitle></CardHeader>
          <CardContent><ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
            {errors.slice(0, 50).map((e, i) => <li key={i} className="text-destructive">• {e}</li>)}
          </ul></CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-success/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success text-base">
              <CheckCircle2 className="size-4" /> {result.ok} importados · {result.fail} falhas
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Preview ({rows.length} registros)</CardTitle>
              <CardDescription>Origens: {Array.from(new Set(rows.map((r) => r.origem))).join(", ")}</CardDescription>
            </div>
            <Button onClick={importar} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Importando…</> : "Importar"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Origem</TableHead><TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead><TableHead>Data</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.origem}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{r.descricao}</TableCell>
                      <TableCell className="text-xs">{r.data_movimento}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantidade}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 100 && <div className="text-xs text-muted-foreground p-2 text-center">… exibindo 100 de {rows.length}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={limparAntigos}>
            <Trash2 className="size-3.5 mr-1" /> Limpar registros &gt; 90 dias
          </Button>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
