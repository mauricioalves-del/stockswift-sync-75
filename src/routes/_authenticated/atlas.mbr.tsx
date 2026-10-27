import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carregarFontesMbr, mesesDisponiveis, montarMbr } from "@/lib/mbr/gerar";
import { ITENS_SECAO2 } from "@/lib/mbr/secao2";
import { nomeMes } from "@/lib/mbr/formato";

export const Route = createFileRoute("/_authenticated/atlas/mbr")({
  component: MbrPage,
  head: () => ({ meta: [{ title: "MBR — Atlas" }, { name: "description", content: "Geração do MBR (Monthly Business Review) em PowerPoint com os dados do Atlas." }] }),
});

const SECOES: { n: number; titulo: string; itens: string[]; pronta: boolean }[] = [
  { n: 1, titulo: "Resumo Executivo Geral", itens: ["Resumo Executivo", "Scorecard do Mês"], pronta: false },
  { n: 2, titulo: "Inventários e Movimentados", itens: ITENS_SECAO2, pronta: true },
  { n: 3, titulo: "Mapeamento de Riscos e Passivos", itens: ["Baixas Operacionais", "Pacotes de Baixa", "Investimento Operacional", "Farol de Shelf-Life", "Risco de Obsolescência", "Recuperação de Shelf", "Dispersão de Ficha Técnica", "Metas Individuais", "Testes Industriais", "FEFO"], pronta: false },
  { n: 4, titulo: "Atlas", itens: ["Impacto do Atlas", "Fechamento Stock Savvy", "Próximos Passos"], pronta: false },
];

function MbrPage() {
  const q = useQuery({ queryKey: ["mbr-fontes"], queryFn: carregarFontesMbr, staleTime: 120000 });
  const meses = q.data ? mesesDisponiveis(q.data) : [];
  const [mes, setMes] = useState<string>("");
  const [gerando, setGerando] = useState(false);
  useEffect(() => { if (!mes && meses.length) setMes(meses[0]); }, [meses.length]);

  async function gerar() {
    if (!q.data || !mes) return;
    setGerando(true);
    try {
      const { pptx, nomeArquivo } = montarMbr(q.data, mes);
      await pptx.writeFile({ fileName: nomeArquivo });
      toast.success(`MBR de ${nomeMes(mes)} gerado.`);
    } catch (e: any) { toast.error("Não consegui gerar o MBR: " + (e?.message ?? e)); }
    finally { setGerando(false); }
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="size-6" /> MBR — Monthly Business Review</h1>
        <p className="text-sm text-muted-foreground">Gera o relatório executivo mensal em PowerPoint (.pptx), com a identidade visual do MBR do Atlas e os dados já migrados para o Stock Savvy.</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-56">
            <div className="mb-1 text-xs text-muted-foreground">Mês do relatório</div>
            <Select value={mes} onValueChange={setMes} disabled={!meses.length}>
              <SelectTrigger><SelectValue placeholder={q.isLoading ? "Carregando…" : "Sem fechamentos"} /></SelectTrigger>
              <SelectContent>{meses.map((m) => <SelectItem key={m} value={m}>{nomeMes(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={gerar} disabled={!mes || gerando || q.isLoading} className="gap-2">{gerando || q.isLoading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{q.isLoading ? "Carregando dados…" : gerando ? "Gerando…" : "Gerar MBR (.pptx)"}</Button>
          {q.error && <p className="text-sm text-destructive">Não foi possível carregar os dados do Atlas.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Conteúdo do relatório</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {SECOES.map((s) => (
            <div key={s.n} className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">{s.pronta ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted-foreground" />}Seção {s.n} — {s.titulo}<span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.pronta ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{s.pronta ? "no relatório" : "em migração"}</span></div>
              <ul className="ml-6 list-disc text-xs text-muted-foreground">{s.itens.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
