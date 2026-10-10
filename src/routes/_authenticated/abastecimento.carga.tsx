import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { interpretarBases, LOJAS_PADRAO, type LojaCfg, type ResultadoCarga } from "@/lib/abastecimento-carga";
import { interpretarMalha, csvParaAoa, aoaDaAba, modeloMalhaCsv, diasDoMes, type ResultadoMalha } from "@/lib/abastecimento-malha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/carga")({
  component: CargaPage,
  head: () => ({ meta: [{ title: "Carga de dados — Abastecimento" }] }),
});

type LojaDb = { codigo: string; nome: string; empresa_erp: string | null; vendedores: string[] | null; janela_dias: number | null };

async function carregarConhecidos(): Promise<Set<string>> {
  const sb = supabase as any;
  const [est, grp, prod] = await Promise.all([
    fetchAll<any>((a, b) => sb.from("estoque_sistemico").select("id_produto").range(a, b)),
    fetchAll<any>((a, b) => sb.from("grupo_produtos").select("codigo_produto").range(a, b)),
    fetchAll<any>((a, b) => sb.from("abast_produto").select("id_produto").range(a, b)),
  ]);
  return new Set<string>([...est.map((x) => String(x.id_produto)), ...grp.map((x) => String(x.codigo_produto)), ...prod.map((x) => String(x.id_produto))]);
}

function CargaPage() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const inputMalha = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState("");
  const [res, setRes] = useState<ResultadoCarga | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [unidade, setUnidade] = useState<"mensal" | "diaria">("mensal");
  const [arquivoMalha, setArquivoMalha] = useState("");
  const [resMalha, setResMalha] = useState<ResultadoMalha | null>(null);
  const [aplicandoMalha, setAplicandoMalha] = useState(false);
  const [edit, setEdit] = useState<Record<string, { empresa: string; vendedores: string; janela: string }>>({});

  const lojasQ = useQuery({
    enabled: isAdmin, queryKey: ["abast-lojas-cfg"],
    queryFn: async () => ((await (supabase as any).from("abast_lojas").select("codigo, nome, empresa_erp, vendedores, janela_dias").order("ordem")).data ?? []) as LojaDb[],
  });
  useEffect(() => {
    if (!lojasQ.data) return;
    setEdit(Object.fromEntries(lojasQ.data.map((l) => [l.codigo, { empresa: l.empresa_erp ?? "", vendedores: (l.vendedores ?? ["*"]).join(", "), janela: String(l.janela_dias ?? 30) }])));
  }, [lojasQ.data]);

  const historico = useQuery({
    enabled: isAdmin, queryKey: ["abast-cargas"],
    queryFn: async () => ((await (supabase as any).from("abast_cargas").select("id, arquivo, criado_em, resumo").order("criado_em", { ascending: false }).limit(10)).data ?? []) as any[],
  });
  const malhaVigente = useQuery({
    enabled: isAdmin, queryKey: ["abast-malha-vigente"],
    queryFn: async () => {
      const rows = await fetchAll<any>((a, b) => (supabase as any).from("abast_produto_loja").select("loja, venda_malha, malha_mes").not("venda_malha", "is", null).range(a, b));
      const m = new Map<string, number>();
      for (const r of rows) { const k = `${r.loja}|${r.malha_mes ?? "planilha"}`; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([k, n]) => { const [loja, mesRef] = k.split("|"); return { loja, mesRef, n }; }).sort((a, b) => a.loja.localeCompare(b.loja) || a.mesRef.localeCompare(b.mesRef));
    },
  });

  function cfgAtual(): LojaCfg[] {
    const db = lojasQ.data ?? [];
    if (db.length === 0) return LOJAS_PADRAO;
    return db.filter((l) => l.empresa_erp).map((l) => ({
      codigo: l.codigo as LojaCfg["codigo"], empresa_erp: l.empresa_erp as string,
      vendedores: l.vendedores && l.vendedores.length ? l.vendedores : ["*"], janela_dias: l.janela_dias ?? 30,
    }));
  }

  async function salvarLoja(codigo: string) {
    const e = edit[codigo];
    const janela = Math.round(Number(e.janela));
    if (!e.empresa.trim() || !(janela >= 1 && janela <= 90)) { toast.error("Informe a empresa do ERP e uma janela entre 1 e 90 dias."); return; }
    const vendedores = e.vendedores.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await (supabase as any).from("abast_lojas").update({ empresa_erp: e.empresa.trim(), vendedores: vendedores.length ? vendedores : ["*"], janela_dias: janela }).eq("codigo", codigo);
    if (error) toast.error("Não consegui salvar: " + error.message);
    else { toast.success("Parâmetros da loja salvos. Vale a partir da próxima carga."); qc.invalidateQueries({ queryKey: ["abast-lojas-cfg"] }); }
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLendo(true); setRes(null); setArquivo(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      setRes(interpretarBases(wb, await carregarConhecidos(), cfgAtual()));
    } catch (err: any) {
      toast.error("Não consegui ler a planilha: " + (err?.message ?? err));
    } finally { setLendo(false); if (input.current) input.current.value = ""; }
  }

  async function aplicar() {
    if (!res || res.bloqueios.length > 0) return;
    setAplicando(true);
    try {
      const payload = {
        produto_loja: res.produtoLoja.map((p) => ({ loja: p.loja, id_produto: p.id_produto, ativo: p.ativo, venda_dia: p.venda_dia, exposicao: p.exposicao, vendas_30d: p.vendas_30d, categoria: p.categoria, tipo_produto: p.tipo_produto, pedido: p.pedido, venda_malha: p.venda_malha })),
        produtos: res.produtos,
        resumo: { porLoja: res.porLoja, pendencias: res.pendencias.length, vendasForaDoCatalogo: res.vendasForaDoCatalogo, abas: res.abasEncontradas, calculo: { referencia: res.calculo.referencia, usado: res.calculo.usado, comparados: res.calculo.comparados, divergentes: res.calculo.divergentes } },
      };
      const { data, error } = await (supabase as any).rpc("abast_aplicar_carga", { p_arquivo: arquivo, p_payload: payload });
      if (error) throw error;
      toast.success(`Carga aplicada: ${data?.produto_loja ?? 0} linhas de produto por loja.`);
      setRes(null); setArquivo("");
      for (const k of ["abast-cargas", "abast-dados", "abast-malha-vigente"]) qc.invalidateQueries({ queryKey: [k] });
    } catch (err: any) {
      toast.error("Falha ao aplicar: " + (err?.message ?? err));
    } finally { setAplicando(false); }
  }

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

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;
  const mesAtual = new Date().toISOString().slice(0, 7);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="size-6" /> Carga de dados — Abastecimento</h1>
        <p className="text-sm text-muted-foreground">
          <strong>1)</strong> Envie a planilha <code>Bases_V2.xlsx</code>: o sistema recalcula a venda/dia a partir das vendas do ERP (mesma regra do Excel), lê exposição, sortimento e caixa fechada, mostra a auditoria e só aplica se não houver bloqueio.
          <strong> 2)</strong> Envie a <strong>malha</strong> (consenso da diretoria) todo mês. O estoque <strong>não</strong> vem da planilha: já está no Stock Savvy.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Parâmetros das lojas (vendas do ERP)</CardTitle>
          <CardDescription>Como cada loja aparece nas vendas e quantos dias entram no cálculo. O Itaim é a "Filial SP - Fabrica" filtrada por vendedor. Vale a partir da próxima carga.</CardDescription></CardHeader>
        <CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead>Empresa no ERP</TableHead><TableHead>Vendedores (vírgula; * = todos)</TableHead><TableHead className="w-24">Janela (dias)</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(lojasQ.data ?? []).map((l) => edit[l.codigo] && (
            <TableRow key={l.codigo}>
              <TableCell className="font-medium">{l.nome}</TableCell>
              <TableCell><Input value={edit[l.codigo].empresa} onChange={(e) => setEdit({ ...edit, [l.codigo]: { ...edit[l.codigo], empresa: e.target.value } })} /></TableCell>
              <TableCell><Input value={edit[l.codigo].vendedores} onChange={(e) => setEdit({ ...edit, [l.codigo]: { ...edit[l.codigo], vendedores: e.target.value } })} /></TableCell>
              <TableCell><Input inputMode="numeric" value={edit[l.codigo].janela} onChange={(e) => setEdit({ ...edit, [l.codigo]: { ...edit[l.codigo], janela: e.target.value } })} /></TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => salvarLoja(l.codigo)}>Salvar</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></CardContent>
      </Card>

      <Card><CardContent className="pt-4 flex items-center gap-3">
        <input ref={input} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={aoEscolher} />
        <Button onClick={() => input.current?.click()} disabled={lendo} className="gap-2"><Upload className="size-4" /> {lendo ? "Lendo..." : "Escolher planilha (Bases_V2.xlsx)"}</Button>
        {arquivo && <span className="text-sm text-muted-foreground">{arquivo}</span>}
      </CardContent></Card>

      {res && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Auditoria da planilha</CardTitle>
            <CardDescription>Abas lidas: {res.abasEncontradas.join(", ") || "nenhuma"}{res.abasFaltando.length ? ` · Faltando: ${res.abasFaltando.join(", ")}` : ""}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {res.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Bloqueios (a carga não pode ser aplicada):</strong><ul className="list-disc pl-5">{res.bloqueios.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
            <Table>
              <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Ativos</TableHead><TableHead className="text-right">Com venda/dia</TableHead><TableHead className="text-right">Com exposição</TableHead><TableHead className="text-right">Com venda recente</TableHead></TableRow></TableHeader>
              <TableBody>{Object.entries(res.porLoja).map(([l, o]) => (
                <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{o.skus}</TableCell><TableCell className="text-right">{o.ativos}</TableCell><TableCell className="text-right">{o.comVendaDia}</TableCell><TableCell className="text-right">{o.comExposicao}</TableCell><TableCell className="text-right">{res.calculo.porLoja[l]?.skusComVenda ?? "—"}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
            <div className="rounded-md border p-3 text-sm">
              {res.calculo.usado
                ? <>Venda/dia <strong>recalculada</strong> com as vendas até <strong>{res.calculo.referencia}</strong>. Comparada com a planilha em {res.calculo.comparados} SKUs: <strong className={res.calculo.divergentes ? "text-amber-600" : "text-emerald-600"}>{res.calculo.divergentes} divergência(s)</strong>.
                  {res.calculo.exemplos.length > 0 && <ul className="mt-1 text-xs">{res.calculo.exemplos.slice(0, 6).map((x, i) => <li key={i}>{x.loja} · {x.sku}: planilha {x.planilha ?? "vazio"} → calculado {x.calculado.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</li>)}</ul>}</>
                : <span className="text-amber-700">A venda/dia não pôde ser recalculada (aba BASE VENDAS ausente ou sem data): vale a da planilha.</span>}
            </div>
            <p className="text-sm">{res.produtos.length} produtos · {res.produtos.filter((p) => p.full_case != null).length} com caixa fechada · {res.vendasForaDoCatalogo} combinações de loja/SKU com venda fora do catálogo (não entram nos indicadores).</p>
            {res.pendencias.length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer font-medium">{res.pendencias.length} pendência(s) na planilha (não bloqueiam; viram "Dados a conferir")</summary>
                <ul className="mt-2 max-h-64 overflow-auto text-xs space-y-1">{res.pendencias.slice(0, 100).map((p, i) => <li key={i}><code>{p.aba}</code> linha {p.linha}, {p.campo}: "{p.valor}" — {p.motivo}</li>)}</ul></details>
            )}
            <div className="flex justify-end"><Button onClick={aplicar} disabled={aplicando || res.bloqueios.length > 0}>{aplicando ? "Aplicando..." : "Aplicar carga"}</Button></div>
          </CardContent>
        </Card>
      )}

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
            <Button onClick={() => inputMalha.current?.click()} disabled={lendo || !mes} className="gap-2"><Upload className="size-4" /> Escolher arquivo da malha</Button>
            <Button variant="outline" onClick={baixarModelo} className="gap-2"><Download className="size-4" /> Baixar modelo</Button>
            {arquivoMalha && <span className="text-sm text-muted-foreground">{arquivoMalha}</span>}
          </div>
          {mes !== mesAtual && <p className="text-xs text-amber-600">Atenção: o mês escolhido ({mes}) não é o mês atual ({mesAtual}).</p>}

          {resMalha && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              {resMalha.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800"><strong>Bloqueio:</strong> {resMalha.bloqueios.join(" ")}</div>}
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

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Últimas cargas</CardTitle></CardHeader>
        <CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Arquivo</TableHead><TableHead>Tipo</TableHead><TableHead>Data</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
          <TableBody>
            {(historico.data ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma carga ainda.</TableCell></TableRow>}
            {(historico.data ?? []).map((c: any) => (
              <TableRow key={c.id}><TableCell>{c.arquivo}</TableCell><TableCell>{c.resumo?.tipo === "malha" ? "Malha" : "Planilha"}</TableCell><TableCell>{new Date(c.criado_em).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-xs">{c.resumo?.tipo === "malha" ? `mês ${c.resumo.mes} · ${c.resumo.atualizadas} de ${c.resumo.recebidas}` : Object.keys(c.resumo?.porLoja ?? {}).join(", ")}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table></CardContent></Card>
    </div>
  );
}
