import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { LOJAS_PADRAO, type LojaCfg } from "@/lib/abastecimento-carga";
import { interpretarFaturamento, type ResultadoFaturamento } from "@/lib/abastecimento-faturamento";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/faturamento")({
  component: FaturamentoPage,
  head: () => ({ meta: [{ title: "Carga de faturamento — Abastecimento" }] }),
});

const un = (v: number) => Math.round(v).toLocaleString("pt-BR");
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

function FaturamentoPage() {
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState("");
  const [aoa, setAoa] = useState<{ nome: string; aoa: unknown[][] }[] | null>(null);
  const [grupos, setGrupos] = useState<string[]>(["Produto Acabado"]);
  const [lendo, setLendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState("");

  const base = useQuery({
    enabled: isAdmin, queryKey: ["fat-base"], staleTime: 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: lojas } = await sb.from("abast_lojas").select("codigo, nome, almoxarifado, empresa_erp, vendedores").eq("ativo", true).order("ordem");
      const est = await fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto").range(f, t));
      const pa = await fetchAll<any>((f, t) => sb.from("grupo_produtos").select("codigo_produto").eq("grupo", "Produto Acabado").range(f, t));
      const ultimas: Record<string, string | null> = {};
      for (const l of lojas ?? []) {
        const { data } = await sb.from("historico_consumo").select("data_movimento").eq("origem", l.almoxarifado).order("data_movimento", { ascending: false }).limit(1);
        ultimas[l.codigo] = data?.[0]?.data_movimento ?? null;
      }
      return { lojas: (lojas ?? []) as { codigo: string; nome: string; almoxarifado: string; empresa_erp: string | null; vendedores: string[] | null }[], conhecidos: new Set<string>(est.map((x) => String(x.id_produto))), acabados: new Set<string>(pa.map((x) => String(x.codigo_produto).replace(/^0+/, ""))), ultimas };
    },
  });

  const cfg: LojaCfg[] = useMemo(() => {
    const l = base.data?.lojas.filter((x) => x.empresa_erp);
    return l && l.length ? l.map((x) => ({ codigo: x.codigo as LojaCfg["codigo"], empresa_erp: x.empresa_erp as string, vendedores: x.vendedores?.length ? x.vendedores : ["*"], janela_dias: 30 })) : LOJAS_PADRAO;
  }, [base.data]);

  const res: ResultadoFaturamento | null = useMemo(() => (aoa ? interpretarFaturamento(aoa, { conhecidos: base.data?.conhecidos, lojas: cfg, grupos, skusPermitidos: base.data?.acabados }) : null), [aoa, grupos, cfg, base.data]);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setLendo(true); setAoa(null); setArquivo(f.name); setGrupos(["Produto Acabado"]);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      setAoa(wb.SheetNames.map((n) => ({ nome: n, aoa: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null }) as unknown[][] })));
    } catch (err: any) { toast.error("Não consegui ler o arquivo: " + (err?.message ?? err)); }
    finally { setLendo(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function aplicar() {
    if (!res || res.bloqueios.length > 0 || !base.data) return;
    setAplicando(true); setProgresso("");
    try {
      const almoxDe = new Map(base.data.lojas.map((l) => [l.codigo, l.almoxarifado]));
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const payload = res.linhas.map((l) => ({ origem: almoxDe.get(l.loja) as string, sku: l.id_produto, descricao: l.descricao, data_movimento: l.data, quantidade: l.quantidade, importado_por: userId }));
      let ok = 0, fail = 0; const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await (supabase as any).from("historico_consumo").upsert(payload.slice(i, i + CHUNK), { onConflict: "origem,sku,data_movimento" });
        if (error) { fail += Math.min(CHUNK, payload.length - i); console.error(error); } else ok += Math.min(CHUNK, payload.length - i);
        setProgresso(`${Math.min(i + CHUNK, payload.length)} de ${payload.length}`);
      }
      if (fail > 0) toast.error(`${fail} linhas falharam (${ok} gravadas).`); else toast.success(`Faturamento carregado: ${ok} linhas (loja × SKU × dia).`);
      setAoa(null); setArquivo("");
      qc.invalidateQueries({ queryKey: ["fat-base"] }); qc.invalidateQueries({ queryKey: ["abast-v2"] });
    } catch (err: any) { toast.error("Falha ao gravar: " + (err?.message ?? err)); }
    finally { setAplicando(false); }
  }

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;
  const nomeLoja = (c: string) => base.data?.lojas.find((l) => l.codigo === c)?.nome ?? c;
  const todosGrupos = res ? Object.keys(res.gruposVistos) : [];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ReceiptText className="size-6" /> Carga de faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Envie a base de faturamento (vendas). O sistema grava <strong>unidades por loja, SKU e dia</strong> no consumo que alimenta o CMD, <strong>sem nenhum dado de cliente</strong> (nome e CPF/CNPJ não saem do navegador).
          Aceita a aba <code>Faturamento</code> (Origem, SKU, Data, Quantidade, Loja) ou a base bruta (CodProd, qtd, dt_emissao...). O ponto de venda é a coluna <code>Loja</code>; sem ela, a <code>Origem</code> (Alm_SP_Loja = Itaim); sem ela, <code>Empresa</code> + <code>Vendedor</code>. <strong>Ativação (eventos) e B2B não são loja e ficam de fora.</strong> Só entra produto acabado (pelo cadastro de grupos) e, na base bruta, venda sem nota cancelada.
        </p>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Faturamento já carregado</CardTitle></CardHeader>
        <CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead>Origem no estoque</TableHead><TableHead className="text-right">Última venda carregada</TableHead></TableRow></TableHeader>
          <TableBody>{(base.data?.lojas ?? []).map((l) => (
            <TableRow key={l.codigo}><TableCell>{l.nome}</TableCell><TableCell className="font-mono text-xs">{l.almoxarifado}</TableCell>
              <TableCell className="text-right">{dataBr(base.data?.ultimas[l.codigo] ?? null)}{(() => { const u = base.data?.ultimas[l.codigo]; if (!u) return <span className="ml-2 text-xs text-red-600">sem dados</span>; const d = Math.round((Date.now() - new Date(u + "T12:00:00").getTime()) / 86400000); return d > 3 ? <span className="ml-2 text-xs text-amber-600">defasado há {d} dias</span> : <span className="ml-2 text-xs text-emerald-600">atualizado</span>; })()}</TableCell></TableRow>))}
          </TableBody></Table></CardContent></Card>

      <Card><CardContent className="pt-4 flex items-center gap-3">
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={aoEscolher} />
        <Button onClick={() => inputRef.current?.click()} disabled={lendo} className="gap-2"><Upload className="size-4" /> {lendo ? "Lendo (pode levar alguns segundos)..." : "Escolher base de faturamento"}</Button>
        {arquivo && <span className="text-sm text-muted-foreground">{arquivo}</span>}
      </CardContent></Card>

      {res && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Auditoria do faturamento</CardTitle>
            <CardDescription>Aba <strong>{res.aba ?? "—"}</strong> · {un(res.lidas)} linhas lidas · período {dataBr(res.periodo.de)} a {dataBr(res.periodo.ate)} · layout <strong>{res.layout === "B" ? "aba Faturamento" : "base bruta"}</strong> · ponto de venda por {res.lojaPorColuna ? <strong>coluna Loja</strong> : <strong>Origem / Empresa + Vendedor</strong>}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {res.bloqueios.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Bloqueio:</strong> {res.bloqueios.join(" ")}</div>}
            {todosGrupos.length > 0 && <div className="text-sm"><div className="font-medium mb-1">Grupos de produto incluídos</div><div className="flex flex-wrap gap-3">{todosGrupos.map((g) => <label key={g} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={grupos.includes(g)} onChange={() => setGrupos(grupos.includes(g) ? grupos.filter((x) => x !== g) : [...grupos, g])} /> {g} ({un(res.gruposVistos[g])})</label>)}</div></div>}
            <Table><TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Linhas (dia × SKU)</TableHead><TableHead className="text-right">Última venda</TableHead></TableRow></TableHeader>
              <TableBody>{Object.entries(res.porLoja).map(([l, o]) => <TableRow key={l}><TableCell>{nomeLoja(l)}</TableCell><TableCell className="text-right">{un(o.unidades)}</TableCell><TableCell className="text-right">{o.skus}</TableCell><TableCell className="text-right">{un(o.linhas)}</TableCell><TableCell className="text-right">{dataBr(o.ultimaData)}</TableCell></TableRow>)}</TableBody></Table>
            {Object.keys(res.outrosPontos).length > 0 && <div className="rounded-md border p-3 text-xs"><div className="font-medium mb-1">Fora das lojas (não são ponto de venda a abastecer)</div>{Object.entries(res.outrosPontos).map(([n, o]) => <div key={n}>{n}: {un(o.unidades)} un em {un(o.linhas)} linhas</div>)}</div>}
            <p className="text-xs text-muted-foreground">Descartadas: {un(res.descartadas.foraDoCadastro)} fora do cadastro de produto acabado · {un(res.descartadas.natureza)} que não são venda · {un(res.descartadas.cancelada)} canceladas · {un(res.descartadas.grupo)} de outros grupos · {un(res.descartadas.semLoja)} sem ponto de venda reconhecido (outras empresas/canais) · {un(res.descartadas.semData)} sem data.</p>
            <div className="flex items-center justify-end gap-3">{progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}<Button onClick={aplicar} disabled={aplicando || res.bloqueios.length > 0}>{aplicando ? "Gravando..." : `Gravar ${un(res.linhas.length)} linhas`}</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
