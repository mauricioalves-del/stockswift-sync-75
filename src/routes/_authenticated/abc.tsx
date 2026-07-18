import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { normalizeSheetRows } from "@/lib/xlsx-utils";


export const Route = createFileRoute("/_authenticated/abc")({
  component: AbcPage,
  head: () => ({ meta: [{ title: "Classificação ABC" }] }),
});

const DIAS: Record<string, number> = { A: 7, B: 15, C: 30 };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AbcPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [periodo, setPeriodo] = useState<string>("90");

  const { data } = useQuery({
    queryKey: ["abc"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("classificacao_abc").select("*")
        .order("valor_movimentado", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  async function gerarAutomatico() {
    setBusy(true);
    try {
      const dias = Number(periodo);
      const dataCorte = new Date();
      dataCorte.setDate(dataCorte.getDate() - dias);
      const corteIso = dataCorte.toISOString().slice(0, 10);

      // 1. Movimentação real por SKU no período (historico_consumo)
      const consumo: Record<string, number> = {};
      let offset = 0;
      while (true) {
        const { data: rows, error } = await (supabase as any)
          .from("historico_consumo")
          .select("sku, quantidade")
          .gte("data_movimento", corteIso)
          .range(offset, offset + 999);
        if (error) throw error;
        if (!rows || rows.length === 0) break;
        rows.forEach((r: any) => {
          const sku = String(r.sku ?? "").trim();
          if (!sku) return;
          consumo[sku] = (consumo[sku] ?? 0) + Number(r.quantidade ?? 0);
        });
        if (rows.length < 1000) break;
        offset += 1000;
      }

      // 2. Custo/preço unitário via estoque_sistemico (média ponderada por SKU)
      const custoMap: Record<string, { soma: number; qtd: number }> = {};
      offset = 0;
      while (true) {
        const { data: rows } = await (supabase as any)
          .from("estoque_sistemico")
          .select("id_produto, custo_unitario, quantidade")
          .range(offset, offset + 999);
        if (!rows || rows.length === 0) break;
        rows.forEach((e: any) => {
          const sku = String(e.id_produto ?? "").trim();
          if (!sku) return;
          const c = Number(e.custo_unitario ?? 0);
          const q = Number(e.quantidade ?? 0);
          if (!custoMap[sku]) custoMap[sku] = { soma: 0, qtd: 0 };
          custoMap[sku].soma += c * Math.max(q, 1);
          custoMap[sku].qtd += Math.max(q, 1);
        });
        if (rows.length < 1000) break;
        offset += 1000;
      }
      const custoDe = (sku: string) => {
        const m = custoMap[sku];
        if (!m || m.qtd === 0) return 0;
        return m.soma / m.qtd;
      };

      // 3. Também classificar SKUs sem giro (pegar todos do estoque) -> C
      const todosSkus = new Set<string>([...Object.keys(consumo), ...Object.keys(custoMap)]);

      // 4. Valor movimentado = quantidade * custo
      const valores: [string, number][] = [];
      todosSkus.forEach((sku) => {
        const qtd = consumo[sku] ?? 0;
        const val = qtd * custoDe(sku);
        valores.push([sku, val]);
      });

      const ordered = valores.sort((a, b) => b[1] - a[1]);
      const total = ordered.reduce((s, [, v]) => s + v, 0);
      let cum = 0;
      const today = new Date();
      const nowIso = new Date().toISOString();
      const rowsUp = ordered.map(([codigo, v]) => {
        let classe: "A" | "B" | "C";
        if (v <= 0 || total === 0) {
          classe = "C"; // sem giro -> C
        } else {
          cum += v;
          const pct = (cum / total) * 100;
          classe = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
        }
        const pctAcum = total ? Math.min((cum / total) * 100, 100) : 0;
        const prox = new Date(today);
        prox.setDate(prox.getDate() + DIAS[classe]);
        return {
          codigo_produto: codigo,
          classe,
          valor_movimentado: v,
          percentual_acumulado: pctAcum,
          periodo_dias: dias,
          calculado_em: nowIso,
          proxima_contagem: prox.toISOString().slice(0, 10),
        };
      });

      // 5. Auditoria de reclassificação
      const antigos: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { antigos[r.codigo_produto] = r.classe; });
      const mudancas = rowsUp.filter((r) => antigos[r.codigo_produto] && antigos[r.codigo_produto] !== r.classe);

      // 6. Upsert em lotes
      for (let i = 0; i < rowsUp.length; i += 500) {
        const { error } = await (supabase as any).from("classificacao_abc")
          .upsert(rowsUp.slice(i, i + 500), { onConflict: "codigo_produto" });
        if (error) throw error;
      }

      const user = (await supabase.auth.getUser()).data.user;
      if (mudancas.length && user) {
        await (supabase as any).from("audit_logs").insert({
          usuario: user.id, acao: "RECLASSIFICAR_ABC", entidade: "classificacao_abc",
          payload: {
            periodo_dias: dias,
            total_reclassificados: mudancas.length,
            exemplos: mudancas.slice(0, 20).map((m) => ({ sku: m.codigo_produto, de: antigos[m.codigo_produto], para: m.classe })),
          },
        });
      }

      const cA = rowsUp.filter((r) => r.classe === "A").length;
      const cB = rowsUp.filter((r) => r.classe === "B").length;
      const cC = rowsUp.filter((r) => r.classe === "C").length;
      toast.success(`${rowsUp.length} SKUs classificados (A: ${cA}, B: ${cB}, C: ${cC}) — período ${dias}d`);
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
      const rows = normalizeSheetRows(XLSX.utils.sheet_to_json<any>(sh));
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
  const totalValor = (data ?? []).reduce((s, r) => s + Number(r.valor_movimentado ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Classificação ABC</h1>
        <p className="text-sm text-muted-foreground">
          Baseada no <b>giro real</b> (histórico de consumo × custo). Regra de Pareto 80/15/5.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Ações</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="180">180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={gerarAutomatico} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Recalcular (movimentação real)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
            <Upload className="size-4" /> Importar Planilha
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
          <div className="flex gap-2 ml-auto items-center">
            <Badge variant="outline">A: {counts.A}</Badge>
            <Badge variant="outline">B: {counts.B}</Badge>
            <Badge variant="outline">C: {counts.C}</Badge>
            <span className="text-xs text-muted-foreground ml-2">Total mov.: {formatBRL(totalValor)}</span>
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
                <TableHead className="text-right">Valor Movimentado</TableHead>
                <TableHead className="text-right">% Acum.</TableHead>
                <TableHead>Próxima Contagem</TableHead>
                <TableHead className="text-right">Período</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Sem classificação. Recalcule ou importe planilha.</TableCell></TableRow>
              )}
              {(data ?? []).slice(0, 500).map((r) => (
                <TableRow key={r.codigo_produto}>
                  <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                  <TableCell><Badge variant={r.classe === "A" ? "default" : "outline"}>{r.classe}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatBRL(Number(r.valor_movimentado ?? 0))}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.percentual_acumulado != null ? `${Number(r.percentual_acumulado).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.proxima_contagem ? new Date(r.proxima_contagem).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r.periodo_dias ? `${r.periodo_dias}d` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

