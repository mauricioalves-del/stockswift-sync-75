import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/abc")({
  component: AbcPage,
  head: () => ({ meta: [{ title: "Classificação ABC" }] }),
});

const DIAS: Record<string, number> = { A: 7, B: 15, C: 30 };

function AbcPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["abc"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("classificacao_abc").select("*").order("classe");
      if (error) throw error;
      return data as any[];
    },
  });

  async function gerarAutomatico() {
    setBusy(true);
    try {
      const { data: est } = await (supabase as any)
        .from("estoque_sistemico")
        .select("id_produto, quantidade, custo_unitario");
      const agg: Record<string, number> = {};
      (est ?? []).forEach((e: any) => {
        const v = Number(e.quantidade ?? 0) * Number(e.custo_unitario ?? 0);
        agg[e.id_produto] = (agg[e.id_produto] ?? 0) + v;
      });
      const ordered = Object.entries(agg).sort((a, b) => b[1] - a[1]);
      const total = ordered.reduce((s, [, v]) => s + v, 0);
      let cum = 0;
      const today = new Date();
      const rows = ordered.map(([codigo, v]) => {
        cum += v;
        const pct = total ? (cum / total) * 100 : 0;
        const classe = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
        const prox = new Date(today); prox.setDate(prox.getDate() + DIAS[classe]);
        return {
          codigo_produto: codigo, classe,
          ultima_contagem: null,
          proxima_contagem: prox.toISOString().slice(0, 10),
        };
      });
      // upsert em lotes
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await (supabase as any).from("classificacao_abc").upsert(rows.slice(i, i + 500), { onConflict: "codigo_produto" });
        if (error) throw error;
      }
      toast.success(`${rows.length} SKUs classificados (A: ${rows.filter((r) => r.classe === "A").length}, B: ${rows.filter((r) => r.classe === "B").length}, C: ${rows.filter((r) => r.classe === "C").length})`);
      qc.invalidateQueries({ queryKey: ["abc"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha na classificação");
    } finally {
      setBusy(false);
    }
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sh = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sh);
      const today = new Date();
      const mapped = rows.map((r) => {
        const codigo = String(r.codigo_produto ?? r.sku ?? r.SKU ?? r.codigo ?? "").trim();
        const classe = String(r.classe ?? r.classificacao ?? "C").trim().toUpperCase();
        if (!codigo || !["A", "B", "C"].includes(classe)) return null;
        const prox = new Date(today); prox.setDate(prox.getDate() + (DIAS[classe] ?? 30));
        return { codigo_produto: codigo, classe, proxima_contagem: prox.toISOString().slice(0, 10) };
      }).filter(Boolean) as any[];
      if (!mapped.length) throw new Error("Planilha vazia ou inválida (colunas: codigo_produto, classe)");
      for (let i = 0; i < mapped.length; i += 500) {
        const { error } = await (supabase as any).from("classificacao_abc").upsert(mapped.slice(i, i + 500), { onConflict: "codigo_produto" });
        if (error) throw error;
      }
      toast.success(`${mapped.length} registros importados`);
      qc.invalidateQueries({ queryKey: ["abc"] });
    } catch (err: any) {
      toast.error(err.message ?? "Falha na importação");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const counts = { A: 0, B: 0, C: 0 };
  (data ?? []).forEach((r) => { counts[r.classe as "A" | "B" | "C"]++; });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Classificação ABC</h1>
        <p className="text-sm text-muted-foreground">Define periodicidade de contagem cíclica: A semanal, B quinzenal, C mensal.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={gerarAutomatico} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Gerar Automaticamente (80/15/5 por valor)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
            <Upload className="size-4" /> Importar Planilha
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
          <div className="flex gap-2 ml-auto">
            <Badge variant="outline">A: {counts.A}</Badge>
            <Badge variant="outline">B: {counts.B}</Badge>
            <Badge variant="outline">C: {counts.C}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Última Contagem</TableHead>
                <TableHead>Próxima Contagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Sem classificação. Gere automaticamente ou importe planilha.</TableCell></TableRow>
              )}
              {(data ?? []).slice(0, 500).map((r) => (
                <TableRow key={r.codigo_produto}>
                  <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                  <TableCell><Badge variant={r.classe === "A" ? "default" : "outline"}>{r.classe}</Badge></TableCell>
                  <TableCell className="text-xs">{r.ultima_contagem ? new Date(r.ultima_contagem).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-xs">{r.proxima_contagem ? new Date(r.proxima_contagem).toLocaleDateString("pt-BR") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
