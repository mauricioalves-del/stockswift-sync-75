import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { reprocessarFefoHoje } from "@/lib/fefo.functions";

export const Route = createFileRoute("/_authenticated/suprimentos/fefo/movimentacoes")({
  component: ImportarMovimentacoesPage,
  head: () => ({
    meta: [
      { title: "Importar Movimentação Diária | Controle FEFO" },
      { name: "description", content: "Upload da planilha de movimentações diárias que alimenta a checagem automática de FEFO." },
      { property: "og:title", content: "Importar Movimentação Diária | Controle FEFO" },
      { property: "og:description", content: "Reimportar um dia substitui apenas aquele dia, sem duplicar registros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Mov = {
  id_produto: string;
  descricao: string;
  data: string;       // ISO datetime
  dia: string;        // yyyy-mm-dd
  doc: string;
  desc_movimento: string;
  desc_almox: string;
  qtd: number;
  id_lote: string;
};

const REQUIRED = ["Id_produto", "Data", "Desc_Movimento", "Desc_Almox", "Qtd"];

function toIsoDateTime(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return new Date(Date.UTC(d.y, d.m - 1, d.d, 12, d.M ?? 0, Math.floor(d.S ?? 0))).toISOString();
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1], br[4] ? +br[4] : 12, +(br[5] ?? 0))).toISOString();
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (isoM) return new Date(Date.UTC(+isoM[1], +isoM[2] - 1, +isoM[3], isoM[4] ? +isoM[4] : 12, +(isoM[5] ?? 0))).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function diaSP(isoStr: string) {
  // Datas da planilha representam um dia civil; o horário ao meio-dia evita
  // que a conversão de fuso desloque 01/09 para 31/08.
  return isoStr.slice(0, 10);
}

function ImportarMovimentacoesPage() {
  const { canWrite } = useRole();
  const [rows, setRows] = useState<Mov[]>([]);
  const [filename, setFilename] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ dias: string[]; linhas: number; quebras: number } | null>(null);

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  async function handleFile(f: File) {
    setFilename(f.name); setRows([]); setErrors([]); setResult(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      if (!data.length) { setErrors(["Planilha vazia"]); return; }
      const keys = new Set(Object.keys(data[0]).map((k) => k.trim().toLowerCase()));
      const missing = REQUIRED.filter((k) => !keys.has(k.toLowerCase()));
      if (missing.length) { setErrors([`Colunas obrigatórias ausentes: ${missing.join(", ")}`]); return; }

      const errs: string[] = [];
      const parsed: Mov[] = [];
      data.forEach((r, i) => {
        const id = pickCI(r, "Id_produto", "id_produto", "SKU");
        const dataRaw = r["Data"] ?? r["data"] ?? pickCI(r, "Data");
        const iso = toIsoDateTime(dataRaw);
        const qtd = Number(String(r["Qtd"] ?? r["qtd"] ?? 0).replace(",", "."));
        if (!id) { errs.push(`Linha ${i + 2}: Id_produto vazio`); return; }
        if (!iso) { errs.push(`Linha ${i + 2}: Data inválida`); return; }
        if (Number.isNaN(qtd)) { errs.push(`Linha ${i + 2}: Qtd inválida`); return; }
        parsed.push({
          id_produto: id,
          descricao: pickCI(r, "descricao", "Descricao", "Descrição"),
          data: iso,
          dia: diaSP(iso),
          doc: pickCI(r, "Doc", "doc", "Documento"),
          desc_movimento: pickCI(r, "Desc_Movimento", "desc_movimento", "Movimento"),
          desc_almox: pickCI(r, "Desc_Almox", "desc_almox", "Almoxarifado"),
          qtd,
          id_lote: pickCI(r, "Id_Lote", "id_lote", "Lote"),
        });
      });
      setRows(parsed); setErrors(errs);
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  }

  async function importar() {
    if (!rows.length) return;
    setImporting(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const dias = Array.from(new Set(rows.map((r) => r.dia))).sort();
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const diasEncerrados = dias.filter((dia) => dia !== hoje);
      if (diasEncerrados.length) {
        throw new Error(`O histórico FEFO está encerrado. Importe somente movimentações de hoje (${hoje}).`);
      }

      // Escopo por dia: reimportar um dia substitui somente aquele dia
      for (const dia of dias) {
        const ini = `${dia}T03:00:00.000Z`;               // 00:00 SP
        const fim = `${new Date(new Date(dia + "T00:00:00Z").getTime() + 86400_000).toISOString().slice(0, 10)}T03:00:00.000Z`;
        const { error: delErr } = await (supabase as any)
          .from("movimentacoes_diarias").delete().gte("data", ini).lt("data", fim);
        if (delErr) throw delErr;
      }

      const payload = rows.map((r) => ({
        id_produto: r.id_produto, descricao: r.descricao, data: r.data, doc: r.doc,
        desc_movimento: r.desc_movimento, desc_almox: r.desc_almox, qtd: r.qtd,
        id_lote: r.id_lote, importado_por: uid,
      }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await (supabase as any).from("movimentacoes_diarias").insert(payload.slice(i, i + 500));
        if (error) throw error;
      }

      const processamento = await reprocessarFefoHoje();
      const quebras = processamento.quebras;

      setResult({ dias, linhas: payload.length, quebras });
      toast.success(`${payload.length} movimentações importadas · ${quebras} quebras detectadas`);
      setRows([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const dias = Array.from(new Set(rows.map((r) => r.dia))).sort();

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/suprimentos/fefo"><ArrowLeft className="size-4 mr-1" /> Controle FEFO</Link></Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Importar Movimentação Diária</h1>
        <p className="text-sm text-muted-foreground">
          Colunas esperadas: Id_produto, descricao, Data, Doc, Desc_Movimento ("Origem -&gt; Destino"), Desc_Almox, Qtd, Id_Lote.
          Reimportar um dia substitui apenas os registros daquele dia.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="size-4" /> Planilha</CardTitle>
          <CardDescription>{filename || "Nenhum arquivo selecionado"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" />

          {errors.length > 0 && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1 font-semibold text-destructive"><AlertCircle className="size-4" /> {errors.length} problema(s)</div>
              {errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{rows.length} linhas</Badge>
                {dias.map((d) => <Badge key={d} variant="outline">{d}</Badge>)}
              </div>
              <Button onClick={importar} disabled={importing}>
                {importing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
                Importar e processar FEFO
              </Button>
            </>
          )}

          {result && (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
              <div className="flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 className="size-4" /> Importação concluída</div>
              <div>{result.linhas} linhas · dias {result.dias.join(", ")} · {result.quebras} quebras de FEFO detectadas</div>
              <Button variant="link" size="sm" asChild className="px-0"><Link to="/suprimentos/fefo">Ver dashboard →</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Prévia (50 primeiras)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Doc</TableHead>
                  <TableHead>Movimento</TableHead><TableHead>Almox</TableHead>
                  <TableHead className="text-right">Qtd</TableHead><TableHead>Lote</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{r.dia}</TableCell>
                    <TableCell className="text-xs"><span className="font-mono">{r.id_produto}</span> {r.descricao}</TableCell>
                    <TableCell className="text-xs">{r.doc}</TableCell>
                    <TableCell className="text-xs">{r.desc_movimento}</TableCell>
                    <TableCell className="text-xs">{r.desc_almox}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.qtd}</TableCell>
                    <TableCell className="text-xs font-mono">{r.id_lote}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
