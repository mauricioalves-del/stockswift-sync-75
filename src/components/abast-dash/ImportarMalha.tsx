// Importação da malha (consenso da diretoria). Movida da tela Carga de dados para Cobertura e parâmetros.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { interpretarMalha, csvParaAoa, aoaDaAba, modeloMalhaCsv, diasDoMes, type ResultadoMalha } from "@/lib/abastecimento-malha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

async function carregarConhecidos(): Promise<Set<string>> {
  const sb = supabase as any;
  const [est, grp, prod] = await Promise.all([
    fetchAll<any>((a, b) => sb.from("estoque_sistemico").select("id_produto").range(a, b)),
    fetchAll<any>((a, b) => sb.from("grupo_produtos").select("codigo_produto").range(a, b)),
    fetchAll<any>((a, b) => sb.from("abast_produto").select("id_produto").range(a, b)),
  ]);
  return new Set<string>([...est.map((x) => String(x.id_produto)), ...grp.map((x) => String(x.codigo_produto)), ...prod.map((x) => String(x.id_produto))]);
}

export function ImportarMalha() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const inputMalha = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [unidade, setUnidade] = useState<"mensal" | "diaria">("mensal");
  const [arquivoMalha, setArquivoMalha] = useState("");
  const [resMalha, setResMalha] = useState<ResultadoMalha | null>(null);
  const [aplicandoMalha, setAplicandoMalha] = useState(false);

  const malhaVigente = useQuery({
    enabled: isAdmin, queryKey: ["abast-malha-vigente"],
    queryFn: async () => {
      const rows = await fetchAll<any>((a, b) => (supabase as any).from("abast_produto_loja").select("loja, venda_malha, malha_mes").not("venda_malha", "is", null).range(a, b));
      const m = new Map<string, number>();
      for (const r of rows) { const k = `${r.loja}|${r.malha_mes ?? "planilha"}`; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([k, n]) => { const [loja, mesRef] = k.split("|"); return { loja, mesRef, n }; }).sort((a, b) => a.loja.localeCompare(b.loja) || a.mesRef.localeCompare(b.mesRef));
    },
  });

  async function aoEscolherMalha(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLendo(true); setResMalha(null); setArquivoMalha(f.name);
    try {
      let abas: { nome: string; aoa: unknown[][] }[];
      if (/\.(csv|txt)$/i.test(f.name)) abas = [{ nome: f.name, aoa: csvParaAoa(await f.text()) }];
      else { const wb = XLSX.read(await f.arrayBuffer()); abas = wb.SheetNames.map((n) => ({ nome: n, aoa: aoaDaAba(wb.Sheets[n]) })); }
      setResMalha(interpretarMalha(abas, { mes, unidade, conhecidos: await carregarConhecidos() }));
    } catch (err: any) {
      toast.error("Não consegui ler o arquivo da malha: " + (err?.message ?? err));
    } finally { setLendo(false); if (inputMalha.current) inputMalha.current.value = ""; }
  }

  async function aplicarMalha() {
    if (!resMalha || resMalha.bloqueios.length > 0) return;
    setAplicandoMalha(true);
    try {
      const itens = resMalha.itens.map((i) => ({ loja: i.loja, id_produto: i.id_produto, venda_malha: i.venda_malha }));
      const { data, error } = await (supabase as any).rpc("abast_aplicar_malha", { p_arquivo: arquivoMalha, p_mes: resMalha.mes, p_itens: itens });
      if (error) throw error;
      toast.success(`Malha de ${data?.mes} aplicada: ${data?.atualizadas} linhas atualizadas` + (data?.sem_correspondencia ? `, ${data.sem_correspondencia} sem correspondência (SKU fora do sortimento carregado).` : "."));
      setResMalha(null); setArquivoMalha("");
      for (const k of ["abast-cargas", "abast-dados", "abast-malha-vigente"]) qc.invalidateQueries({ queryKey: [k] });
    } catch (err: any) {
      toast.error("Falha ao aplicar a malha: " + (err?.message ?? err));
    } finally { setAplicandoMalha(false); }
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob([modeloMalhaCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "Modelo_Malha_Consenso.csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!isAdmin) return null;
  const mesAtual = new Date().toISOString().slice(0, 7);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Malha — consenso da diretoria</CardTitle>
        <CardDescription>Malha/dia = consenso do mês (unidades) ÷ dias do mês, como no Excel. Um arquivo por mês: CSV ou Excel com <code>SKU</code>, <code>Loja</code> e <code>Consenso</code> (ou <code>SKU</code> e uma coluna por loja).</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><div className="text-xs text-muted-foreground mb-1">Mês do consenso</div><Input type="month" className="w-40" value={mes} onChange={(e) => { setMes(e.target.value); setResMalha(null); }} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">Os valores estão em</div>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={unidade} onChange={(e) => { setUnidade(e.target.value as "mensal" | "diaria"); setResMalha(null); }}>
              <option value="mensal">unidades por mês (÷ {diasDoMes(mes)} dias)</option><option value="diaria">unidades por dia</option></select></div>
          <input ref={inputMalha} type="file" accept=".csv,.txt,.xlsx,.xlsm" className="hidden" onChange={aoEscolherMalha} />
          <Button onClick={() => inputMalha.current?.click()} disabled={lendo || !mes} className="gap-2"><Upload className="size-4" /> {lendo ? "Lendo..." : "Escolher arquivo da malha"}</Button>
          <Button variant="outline" onClick={baixarModelo} className="gap-2"><Download className="size-4" /> Baixar modelo</Button>
          {arquivoMalha && <span className="text-sm text-muted-foreground">{arquivoMalha}</span>}
        </div>
        {mes !== mesAtual && <p className="text-xs text-amber-600">Atenção: o mês escolhido ({mes}) não é o mês atual ({mesAtual}).</p>}

        {resMalha && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {resMalha.bloqueios.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive"><strong>Bloqueio:</strong> {resMalha.bloqueios.join(" ")}</div>}
            {resMalha.itens.length > 0 && <p>Formato <strong>{resMalha.formato}</strong>{resMalha.aba ? ` (aba/arquivo "${resMalha.aba}")` : ""} · <strong>{resMalha.itens.length}</strong> valores lidos para {Object.entries(resMalha.porLoja).map(([l, n]) => `${l}: ${n}`).join(" · ")} · dividido por {resMalha.diasMes} dias ({resMalha.mes}).</p>}
            {resMalha.pendencias.length > 0 && <details><summary className="cursor-pointer font-medium">{resMalha.pendencias.length} linha(s) ignorada(s)</summary><ul className="mt-1 max-h-48 overflow-auto text-xs">{resMalha.pendencias.slice(0, 60).map((p, i) => <li key={i}>linha {p.linha}, {p.campo}: "{p.valor}": {p.motivo}</li>)}</ul></details>}
            <div className="flex justify-end"><Button onClick={aplicarMalha} disabled={aplicandoMalha || resMalha.bloqueios.length > 0}>{aplicandoMalha ? "Aplicando..." : "Aplicar malha"}</Button></div>
          </div>
        )}

        <div className="text-sm">
          <div className="font-medium mb-1">Malha vigente no sistema</div>
          {(malhaVigente.data ?? []).length === 0
            ? <span className="text-muted-foreground">Nenhuma malha carregada ainda.</span>
            : <ul className="text-xs space-y-0.5">{(malhaVigente.data ?? []).map((m, i) => <li key={i}>{m.loja}: {m.n} SKUs · {m.mesRef === "planilha" ? "da planilha (mês não informado)" : `mês ${m.mesRef}`}{m.mesRef !== mesAtual ? " ⚠ não é o mês atual" : ""}</li>)}</ul>}
        </div>
      </CardContent>
    </Card>
  );
}
