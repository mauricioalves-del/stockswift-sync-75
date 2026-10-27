import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { carregarFontesMbr, mesesDisponiveis, montarMbr } from "@/lib/mbr/gerar";
import { carregarRiscos, infoMetas, salvarMetas } from "@/lib/mbr/fontes3";
import { ITENS_SECAO1 } from "@/lib/mbr/secao1";
import { ITENS_SECAO2 } from "@/lib/mbr/secao2";
import { ITENS_SECAO3 } from "@/lib/mbr/secao3";
import { ITENS_ATLAS } from "@/lib/mbr/secao4";
import { nomeMes } from "@/lib/mbr/formato";

export const Route = createFileRoute("/_authenticated/atlas/mbr")({
  component: MbrPage,
  head: () => ({ meta: [{ title: "MBR — Atlas" }, { name: "description", content: "Geração do MBR (Monthly Business Review) em PowerPoint com os dados do Atlas." }] }),
});

const SECOES: { n: number; titulo: string; itens: string[]; fonte: string }[] = [
  { n: 1, titulo: "Resumo Executivo Geral", itens: ITENS_SECAO1, fonte: "Consolida as Seções 2 a 4" },
  { n: 2, titulo: "Inventários e Movimentados", itens: [...ITENS_SECAO2, "Atenção – Loja e Pátio Paulista"], fonte: "Fechamentos e Controle de Movimentados (Atlas)" },
  { n: 3, titulo: "Mapeamento de Riscos e Passivos", itens: ITENS_SECAO3, fonte: "Dashboards do Stock Savvy, lidos direto do banco" },
  { n: 4, titulo: "Metas Individuais e Atlas", itens: ["Metas Individuais (upload do .html)", ...ITENS_ATLAS], fonte: "Upload de metas + Fechamento Mensal (RPCs)" },
];

function MbrPage() {
  const q = useQuery({ queryKey: ["mbr-fontes"], queryFn: carregarFontesMbr, staleTime: 120000 });
  const metasQ = useQuery({ queryKey: ["mbr-metas-info"], queryFn: infoMetas });
  const meses = q.data ? mesesDisponiveis(q.data) : [];
  const [mes, setMes] = useState<string>("");
  const [fase, setFase] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (!mes && meses.length) setMes(meses[0]); }, [meses.length]);

  async function gerar() {
    if (!q.data || !mes) return;
    setFase("Lendo os dashboards do Stock Savvy…");
    try {
      const agora = new Date();
      const R = await carregarRiscos(mes, agora, setFase);
      setFase("Montando o PowerPoint…");
      const { pptx, nomeArquivo } = montarMbr(q.data, mes, agora, R);
      await pptx.writeFile({ fileName: nomeArquivo });
      if (R.falhas.length) toast.warning(`MBR gerado, mas sem dados de: ${R.falhas.join(", ")}.`);
      else toast.success(`MBR de ${nomeMes(mes)} gerado.`);
      if (!R.metas) toast.info("Metas Individuais: envie o .html de \"Minhas metas\" para preencher o slide de metas.");
    } catch (e: any) { toast.error("Não consegui gerar o MBR: " + (e?.message ?? e)); }
    finally { setFase(null); }
  }

  async function enviarMetas(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const html = await arquivo.text();
      if (!/soma dos pesos/i.test(html)) throw new Error("o arquivo não parece ser o export de \"Minhas metas\"");
      const { data: u } = await supabase.auth.getUser();
      await salvarMetas(html, arquivo.name, u.user?.email ?? null);
      await metasQ.refetch();
      toast.success("Metas enviadas — entram no próximo MBR gerado.");
    } catch (e: any) { toast.error("Não consegui enviar as metas: " + (e?.message ?? e)); }
    finally { setEnviando(false); }
  }

  const ocupado = !!fase || q.isLoading;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="size-6" /> MBR — Monthly Business Review</h1>
        <p className="text-sm text-muted-foreground">Gera o relatório executivo mensal em PowerPoint (.pptx) no modelo final do MBR — todos os KPIs são lidos direto do Stock Savvy, sem exportar .html de cada dashboard. Só as Metas Individuais dependem de upload.</p>
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
          <Button onClick={gerar} disabled={!mes || ocupado} className="gap-2">{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{q.isLoading ? "Carregando dados…" : fase ? "Gerando…" : "Gerar MBR (.pptx)"}</Button>
          {fase && <span className="text-sm text-muted-foreground">{fase}</span>}
          {q.error && <p className="text-sm text-destructive">Não foi possível carregar os dados do Atlas.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Metas Individuais</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="inline-flex">
            <input type="file" accept=".html,.htm,text/html" className="hidden" disabled={enviando} onChange={(e) => { enviarMetas(e.target.files?.[0]); e.target.value = ""; }} />
            <span className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted ${enviando ? "pointer-events-none opacity-60" : ""}`}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Enviar .html de "Minhas metas"</span>
          </label>
          <span className="text-xs text-muted-foreground">{metasQ.data ? `Último envio: ${metasQ.data.arquivo ?? "arquivo"} em ${metasQ.data.enviadoEm ? new Date(metasQ.data.enviadoEm).toLocaleString("pt-BR") : "—"}. O MBR lê o mês escolhido dentro do arquivo.` : "Nenhum arquivo enviado ainda — sem ele, o slide de metas sai com o aviso de pendência."}</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Conteúdo do relatório</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {SECOES.map((s) => (
            <div key={s.n} className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />Seção {s.n} — {s.titulo}</div>
              <div className="ml-6 text-[11px] text-muted-foreground">{s.fonte}</div>
              <ul className="ml-6 list-disc text-xs text-muted-foreground">{s.itens.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
