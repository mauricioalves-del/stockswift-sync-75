import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { interpretarBases, type ResultadoCarga } from "@/lib/abastecimento-carga";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/carga")({
  component: CargaPage,
  head: () => ({ meta: [{ title: "Carga de dados — Abastecimento" }] }),
});

function CargaPage() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState("");
  const [res, setRes] = useState<ResultadoCarga | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const historico = useQuery({
    enabled: isAdmin, queryKey: ["abast-cargas"],
    queryFn: async () => ((await (supabase as any).from("abast_cargas").select("id, arquivo, criado_em, resumo").order("criado_em", { ascending: false }).limit(10)).data ?? []) as any[],
  });

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLendo(true); setRes(null); setArquivo(f.name);
    try {
      const sb = supabase as any;
      const [est, grp, prod] = await Promise.all([
        fetchAll<any>((a, b) => sb.from("estoque_sistemico").select("id_produto").range(a, b)),
        fetchAll<any>((a, b) => sb.from("grupo_produtos").select("codigo_produto").range(a, b)),
        fetchAll<any>((a, b) => sb.from("abast_produto").select("id_produto").range(a, b)),
      ]);
      const conhecidos = new Set<string>([...est.map((x) => String(x.id_produto)), ...grp.map((x) => String(x.codigo_produto)), ...prod.map((x) => String(x.id_produto))]);
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      setRes(interpretarBases(wb, conhecidos));
    } catch (err: any) {
      toast.error("Não consegui ler a planilha: " + (err?.message ?? err));
    } finally { setLendo(false); if (input.current) input.current.value = ""; }
  }

  async function aplicar() {
    if (!res || res.bloqueios.length > 0) return;
    setAplicando(true);
    try {
      const payload = {
        produto_loja: res.produtoLoja.map((p) => ({ loja: p.loja, id_produto: p.id_produto, ativo: p.ativo, venda_dia: p.venda_dia, exposicao: p.exposicao, vendas_30d: p.vendas_30d, categoria: p.categoria, tipo_produto: p.tipo_produto, pedido: p.pedido })),
        produtos: res.produtos,
        resumo: { porLoja: res.porLoja, pendencias: res.pendencias.length, vendasForaDoCatalogo: res.vendasForaDoCatalogo, abas: res.abasEncontradas },
      };
      const { data, error } = await (supabase as any).rpc("abast_aplicar_carga", { p_arquivo: arquivo, p_payload: payload });
      if (error) throw error;
      toast.success(`Carga aplicada: ${data?.produto_loja ?? 0} linhas de produto por loja.`);
      setRes(null); setArquivo("");
      qc.invalidateQueries({ queryKey: ["abast-cargas"] });
      qc.invalidateQueries({ queryKey: ["abast-dados"] });
    } catch (err: any) {
      toast.error("Falha ao aplicar: " + (err?.message ?? err));
    } finally { setAplicando(false); }
  }

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="size-6" /> Carga de dados — Abastecimento</h1>
        <p className="text-sm text-muted-foreground">
          Envie a planilha <code>Bases_V2.xlsx</code>. O sistema lê venda/dia, exposição, sortimento, caixa fechada e vendas de cada loja, mostra a auditoria e só aplica se não houver bloqueio.
          O estoque <strong>não</strong> vem da planilha: já está no Stock Savvy. A carga substitui apenas as lojas que estiverem na planilha, e a anterior fica guardada no histórico.
        </p>
      </div>

      <Card><CardContent className="pt-4 flex items-center gap-3">
        <input ref={input} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={aoEscolher} />
        <Button onClick={() => input.current?.click()} disabled={lendo} className="gap-2"><Upload className="size-4" /> {lendo ? "Lendo..." : "Escolher planilha"}</Button>
        {arquivo && <span className="text-sm text-muted-foreground">{arquivo}</span>}
      </CardContent></Card>

      {res && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Auditoria da planilha</CardTitle>
            <CardDescription>Abas lidas: {res.abasEncontradas.join(", ") || "nenhuma"}{res.abasFaltando.length ? ` · Faltando: ${res.abasFaltando.join(", ")}` : ""}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {res.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Bloqueios (a carga não pode ser aplicada):</strong><ul className="list-disc pl-5">{res.bloqueios.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
            <Table>
              <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Ativos</TableHead><TableHead className="text-right">Com venda/dia</TableHead><TableHead className="text-right">Com exposição</TableHead></TableRow></TableHeader>
              <TableBody>{Object.entries(res.porLoja).map(([l, o]) => (
                <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{o.skus}</TableCell><TableCell className="text-right">{o.ativos}</TableCell><TableCell className="text-right">{o.comVendaDia}</TableCell><TableCell className="text-right">{o.comExposicao}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
            <p className="text-sm">{res.produtos.length} produtos · {res.produtos.filter((p) => p.full_case != null).length} com caixa fechada · {res.vendasForaDoCatalogo} vendas de códigos fora do catálogo (registradas à parte, não entram nos indicadores).</p>
            {res.pendencias.length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer font-medium">{res.pendencias.length} pendência(s) na planilha (não bloqueiam; viram "Dados a conferir")</summary>
                <ul className="mt-2 max-h-64 overflow-auto text-xs space-y-1">{res.pendencias.slice(0, 100).map((p, i) => <li key={i}><code>{p.aba}</code> linha {p.linha}, {p.campo}: "{p.valor}" — {p.motivo}</li>)}</ul></details>
            )}
            <div className="flex justify-end"><Button onClick={aplicar} disabled={aplicando || res.bloqueios.length > 0}>{aplicando ? "Aplicando..." : "Aplicar carga"}</Button></div>
          </CardContent>
        </Card>
      )}

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Últimas cargas</CardTitle></CardHeader>
        <CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Arquivo</TableHead><TableHead>Data</TableHead><TableHead>Lojas</TableHead></TableRow></TableHeader>
          <TableBody>
            {(historico.data ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nenhuma carga ainda.</TableCell></TableRow>}
            {(historico.data ?? []).map((c: any) => (
              <TableRow key={c.id}><TableCell>{c.arquivo}</TableCell><TableCell>{new Date(c.criado_em).toLocaleString("pt-BR")}</TableCell><TableCell className="text-xs">{Object.keys(c.resumo?.porLoja ?? {}).join(", ")}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table></CardContent></Card>
    </div>
  );
}
