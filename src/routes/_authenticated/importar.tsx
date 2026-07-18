import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/importar")({
  component: ImportarPage,
  head: () => ({ meta: [{ title: "Sincronização de Estoque" }] }),
});

interface Row {
  ativo: string;
  tipo_material: string;
  id_produto: string;
  descricao: string;
  um: string;
  origem: string;
  qtd: number;
  lote: string;
  data_validade: string;
  unidade: string;       // local
  peso_kg: number;
  custo_vlr: number;
  ean: string;
}

const SHEET_NAME = "Lote_Sistema";
const REQUIRED = ["Id_produto", "descricao", "um", "Origem", "Qtd", "Lote", "Unidade", "Custo_Vlr"];

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  return pickCI(r, ...keys);
}


function ImportarPage() {
  const { canWrite } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; novos: number; atualizados: number; fail: number; origens: number; when: string } | null>(null);

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  async function handleFile(f: File) {
    setFilename(f.name);
    setResult(null);
    setErrors([]);
    setRows([]);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setErrors([`Aba "${SHEET_NAME}" não encontrada`]); return; }
      const data = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      if (data.length === 0) { setErrors(["Planilha vazia"]); return; }
      const headerKeys = new Set(Object.keys(data[0]).map((k) => k.trim().toLowerCase()));
      const missing = REQUIRED.filter((k) => !headerKeys.has(k.trim().toLowerCase()));
      if (missing.length) { setErrors([`Colunas obrigatórias ausentes: ${missing.join(", ")}`]); return; }


      const errs: string[] = [];
      const parsed: Row[] = [];
      data.forEach((r, idx) => {
        const id = pick(r, "Id_produto", "Id_Produto", "id_produto");
        const qtd = Number(String(r["Qtd"] ?? r["qtd"] ?? 0).replace(",", "."));
        const origem = pick(r, "Origem", "origem");
        if (!id) { errs.push(`Linha ${idx + 2}: Id_produto vazio`); return; }
        if (Number.isNaN(qtd)) { errs.push(`Linha ${idx + 2}: Qtd inválida`); return; }
        if (!origem) { errs.push(`Linha ${idx + 2}: Almox vazio`); return; }
        parsed.push({
          ativo: pick(r, "Ativo"),
          tipo_material: pick(r, "TipoMaterial", "Tipo Material"),
          id_produto: id,
          descricao: pick(r, "descricao", "Descricao", "Descrição"),
          um: pick(r, "um", "UM") || "UN",
          origem,
          qtd,
          lote: pick(r, "Lote", "lote"),
          data_validade: toIsoDate(pick(r, "Dt_Validade", "Data_Validade", "Validade")),
          unidade: pick(r, "Unidade", "unidade") || "",
          peso_kg: Number(String(r["Peso_Kg"] ?? 0).replace(",", ".")) || 0,
          custo_vlr: Number(String(r["Custo_Vlr"] ?? 0).replace(",", ".")) || 0,
          ean: pick(r, "EAN", "Ean", "ean"),
        });
      });
      setRows(parsed);
      setErrors(errs);
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  }

  async function sincronizar() {
    if (rows.length === 0) return;
    setImporting(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;

    // 1. Origens únicas: cadastrar se não existirem
    const origens = Array.from(new Set(rows.map((r) => r.origem).filter(Boolean)));
    const { data: existentes } = await supabase.from("origens").select("codigo_origem").in("codigo_origem", origens);
    const setExist = new Set((existentes ?? []).map((o) => o.codigo_origem));
    const novasOrigens = origens.filter((o) => !setExist.has(o)).map((o) => ({ codigo_origem: o, descricao: o }));
    if (novasOrigens.length) {
      await supabase.from("origens").insert(novasOrigens);
    }

    // 2. Contar quantos já existem (para diferenciar novos x atualizados) — chave = SKU+Lote+Almox
    const chaves = rows.map((r) => `${r.id_produto}|${r.lote}|${r.origem}`);
    const skus = Array.from(new Set(rows.map((r) => r.id_produto)));
    const { data: jaExistem } = await supabase.from("estoque_sistemico").select("id_produto, lote, origem").in("id_produto", skus);
    const setJa = new Set((jaExistem ?? []).map((e) => `${e.id_produto}|${e.lote ?? ""}|${e.origem ?? ""}`));
    const novos = chaves.filter((k) => !setJa.has(k)).length;
    const atualizados = rows.length - novos;

    // 3. Upsert estoque
    // Deduplicar por (SKU + Lote + Almox) somando quantidades — evita "ON CONFLICT affect row a second time"
    const agg = new Map<string, {
      id_produto: string; lote: string; descricao: string; unidade: string; quantidade: number;
      custo_unitario: number; id_local: string; origem: string; cliente: string;
      data_validade: string | null; importado_por: string | undefined; ean: string | null;
    }>();
    for (const r of rows) {
      const key = `${r.id_produto}|${r.lote || ""}|${r.origem}`;
      const prev = agg.get(key);
      if (prev) {
        prev.quantidade += r.qtd;
        if (!prev.ean && r.ean) prev.ean = r.ean;
      } else {
        agg.set(key, {
          id_produto: r.id_produto,
          lote: r.lote || "",
          descricao: r.descricao,
          unidade: r.um,
          quantidade: r.qtd,
          custo_unitario: r.custo_vlr,
          id_local: r.unidade || "",
          origem: r.origem,
          cliente: "",
          data_validade: r.data_validade || null,
          importado_por: userId,
          ean: r.ean || null,
        });
      }
    }
    const payload = Array.from(agg.values());


    let ok = 0;
    let fail = 0;
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabase.from("estoque_sistemico").upsert(slice, { onConflict: "id_produto,lote,origem" });
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }

    // 4. Log de importação
    await supabase.from("importacoes_estoque").insert({
      usuario: userId,
      arquivo: filename,
      registros_processados: rows.length,
      novos,
      atualizados,
      erros: fail,
      detalhes: { origens_novas: novasOrigens.map((o) => o.codigo_origem) },
    });

    await supabase.from("audit_logs").insert({
      usuario: userId,
      acao: "SINCRONIZAR_ESTOQUE",
      entidade: "estoque_sistemico",
      payload: { arquivo: filename, total: rows.length, ok, fail, novos, atualizados, origens_novas: novasOrigens.length },
    });

    setImporting(false);
    setResult({ ok, novos, atualizados, fail, origens: novasOrigens.length, when: new Date().toLocaleString("pt-BR") });
    if (fail === 0) toast.success(`${ok} registros sincronizados (${novos} novos, ${atualizados} atualizados)`);
    else toast.error(`${fail} falhas na sincronização`);
    setRows([]);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><RefreshCw className="size-6" /> Sincronização de Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Fonte oficial: planilha <b>Lote_Sistema</b>. Chave única <b>Id_produto + Lote</b>. Almox novos são cadastrados automaticamente.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-accent/30 transition-colors">
            <Upload className="size-10 text-primary" />
            <div className="text-center">
              <div className="font-medium">Selecione o arquivo Lote_Sistema</div>
              <div className="text-xs text-muted-foreground">.xlsx contendo a aba <b>Lote_Sistema</b></div>
            </div>
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2"><FileSpreadsheet className="size-3.5" />{filename}</div>}
          </label>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-base"><AlertCircle className="size-4" /> {errors.length} erro(s)</CardTitle>
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
            <CardTitle className="flex items-center gap-2 text-success text-base"><CheckCircle2 className="size-4" /> Sincronização concluída</CardTitle>
            <CardDescription>
              {result.ok} processados · {result.novos} novos · {result.atualizados} atualizados · {result.fail} falhas · {result.origens} almox cadastrados · {result.when}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Preview ({rows.length} registros)</CardTitle>
              <CardDescription>Almox detectados: {Array.from(new Set(rows.map((r) => r.origem))).join(", ")}</CardDescription>
            </div>
            <Button onClick={sincronizar} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Sincronizando...</> : <><RefreshCw className="size-4 mr-2" /> Sincronizar Estoque</>}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Almox</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>UM</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>EAN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{r.origem}</TableCell>
                      <TableCell className="text-xs">{r.unidade}</TableCell>
                      <TableCell className="text-xs">{r.tipo_material}</TableCell>
                      <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{r.descricao}</TableCell>
                      <TableCell className="font-mono text-xs">{r.lote}</TableCell>
                      <TableCell className="text-xs">{r.um}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.qtd}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.custo_vlr.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{r.data_validade}</TableCell>
                      <TableCell className="font-mono text-[10px]">{r.ean}</TableCell>
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
