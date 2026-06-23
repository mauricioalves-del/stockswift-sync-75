import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { formatBRL } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios" }] }),
});

function RelatoriosPage() {
  const [busy, setBusy] = useState<string | null>(null);

  async function exportExcel() {
    setBusy("xlsx");
    const { data, error } = await supabase.from("inventario").select("*").order("id_produto");
    if (error) { setBusy(null); return toast.error(error.message); }
    const rows = (data ?? []).map((r) => ({
      "Grupo": "MATÉRIA PRIMA",
      "Código": r.id_produto,
      "Descrição": r.descricao,
      "Chave": `${r.id_produto}|${r.lote}`,
      "Lote": r.lote,
      "Unidade": r.unidade,
      "Contagem 1": Number(r.quantidade_contada),
      "Data Validade": r.data_validade ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário");
    XLSX.writeFile(wb, "Ficha_Inventario.xlsx");
    toast.success("Excel gerado");
    setBusy(null);
  }

  async function exportPdf() {
    setBusy("pdf");
    const { data } = await supabase.from("inventario").select("*").order("valor_divergencia", { ascending: false });
    const rows = data ?? [];
    const totalDiv = rows.reduce((s, r) => s + (Number(r.valor_divergencia) || 0), 0);
    const acurados = rows.filter((r) => r.acuracidade != null && Number(r.acuracidade) >= 97 && Number(r.acuracidade) <= 100).length;
    const acuracidade = rows.length ? (acurados / rows.length) * 100 : 0;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Inventário", 14, 16);
    doc.setFontSize(10);
    doc.text(new Date().toLocaleString("pt-BR"), 14, 22);

    doc.setFontSize(12);
    doc.text("Resumo Executivo", 14, 32);
    doc.setFontSize(10);
    doc.text(`Itens contados: ${rows.length}`, 14, 39);
    doc.text(`Acurados (97–100%): ${acurados}`, 14, 45);
    doc.text(`Acuracidade geral: ${acuracidade.toFixed(1)}%`, 14, 51);
    doc.text(`Divergência financeira: ${formatBRL(totalDiv)}`, 14, 57);

    autoTable(doc, {
      startY: 65,
      head: [["Produto", "Lote", "Local", "Sist.", "Cont.", "Diverg.", "R$ Div.", "Acur."]],
      body: rows.slice(0, 100).map((r) => [
        r.id_produto, r.lote, r.id_local,
        Number(r.saldo_sistemico).toFixed(0),
        Number(r.quantidade_contada).toFixed(0),
        (Number(r.divergencia) || 0).toFixed(0),
        formatBRL(Number(r.valor_divergencia)),
        r.acuracidade != null ? `${Number(r.acuracidade).toFixed(1)}%` : "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 163, 74] },
    });

    doc.save("Relatorio_Inventario.pdf");
    toast.success("PDF gerado");
    setBusy(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatórios & Exportações</h1>
        <p className="text-sm text-muted-foreground">Finalize o inventário e gere as fichas oficiais</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="size-10 rounded-lg bg-success/15 text-success flex items-center justify-center mb-2">
              <FileSpreadsheet className="size-5" />
            </div>
            <CardTitle>Ficha de Inventário (.xlsx)</CardTitle>
            <CardDescription>Layout padrão: Grupo, Código, Descrição, Chave, Lote, Unidade, Contagem 1, Data Validade.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={exportExcel} disabled={busy !== null} className="w-full">
              {busy === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : "Finalizar inventário e baixar Excel"}
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="size-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center mb-2">
              <FileText className="size-5" />
            </div>
            <CardTitle>Relatório Executivo (.pdf)</CardTitle>
            <CardDescription>KPIs, divergências e top 100 itens com maior impacto financeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={exportPdf} disabled={busy !== null} variant="outline" className="w-full">
              {busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : "Exportar PDF"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
