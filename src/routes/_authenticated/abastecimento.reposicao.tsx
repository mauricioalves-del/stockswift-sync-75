import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { calcularItem, resumirLoja, STATUS, DIAS_PADRAO, type StatusItem, type Dias } from "@/lib/abastecimento-motor";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/reposicao")({
  component: ReposicaoPage,
  head: () => ({ meta: [{ title: "Reposição de Lojas" }, { name: "description", content: "Visão geral e sugestão de reposição do CD para as lojas." }] }),
});

type Loja = { codigo: string; nome: string; almoxarifado: string };
const COR: Record<StatusItem, string> = {
  ruptura: "bg-red-100 text-red-700 border-red-200", abaixo: "bg-amber-100 text-amber-800 border-amber-200",
  ok: "bg-emerald-100 text-emerald-700 border-emerald-200", excesso: "bg-sky-100 text-sky-700 border-sky-200",
  semdemanda: "bg-slate-100 text-slate-600 border-slate-200", cadastro: "bg-violet-100 text-violet-700 border-violet-200",
  conferir: "bg-orange-100 text-orange-700 border-orange-200", fora: "bg-slate-100 text-slate-500 border-slate-200",
};
const n1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

function ReposicaoPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const [lojaSel, setLojaSel] = useState("");
  const [filtro, setFiltro] = useState<StatusItem | "SUGESTAO" | "TODOS">("TODOS");
  const [busca, setBusca] = useState("");
  const [demanda, setDemanda] = useState<"real" | "malha">("real");

  const base = useQuery({
    enabled: pode, queryKey: ["abast-base"], staleTime: 30_000,
    queryFn: async () => {
      const sb = supabase as any;
      const [{ data: lojas }, { data: cfg }] = await Promise.all([
        sb.from("abast_lojas").select("codigo, nome, almoxarifado").eq("ativo", true).order("ordem"),
        sb.from("abast_config").select("chave, valor"),
      ]);
      const c = Object.fromEntries((cfg ?? []).map((x: any) => [x.chave, x.valor]));
      const dias: Dias = { min: Number(c.dias_min) || DIAS_PADRAO.min, ideal: Number(c.dias_ideal) || DIAS_PADRAO.ideal, max: Number(c.dias_max) || DIAS_PADRAO.max };
      return { lojas: (lojas ?? []) as Loja[], dias, cd: String(c.cd_almoxarifado || "Alm_SP_Fabrica") };
    },
  });
  const loja = base.data?.lojas.find((l) => l.codigo === lojaSel) ?? base.data?.lojas[0];

  const dados = useQuery({
    enabled: !!loja && !!base.data, queryKey: ["abast-dados", loja?.codigo], staleTime: 30_000,
    queryFn: async () => {
      const sb = supabase as any;
      const [pl, prod, est, ids, grp] = await Promise.all([
        fetchAll<any>((f, t) => sb.from("abast_produto_loja").select("*").eq("loja", loja!.codigo).range(f, t)),
        fetchAll<any>((f, t) => sb.from("abast_produto").select("id_produto, descricao, full_case").range(f, t)),
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, descricao, origem, quantidade, custo_unitario").gt("quantidade", 0).in("origem", [loja!.almoxarifado, base.data!.cd]).range(f, t)),
        fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto").gt("quantidade", 0).range(f, t)),
        fetchAll<any>((f, t) => sb.from("grupo_produtos").select("codigo_produto").range(f, t)),
      ]);
      return { pl, prod, est, master: new Set<string>([...ids.map((x: any) => String(x.id_produto)), ...grp.map((x: any) => String(x.codigo_produto))]) };
    },
  });

  const itens = useMemo(() => {
    if (!dados.data || !loja || !base.data) return [];
    const { pl, prod, est, master } = dados.data;
    const info = new Map<string, any>(prod.map((p: any) => [String(p.id_produto), p]));
    const nomeEst = new Map<string, string>();
    const estLoja = new Map<string, number>(), cd = new Map<string, number>(), valLoja = new Map<string, number>(), valCd = new Map<string, number>();
    for (const e of est) {
      const k = String(e.id_produto), q = Number(e.quantidade) || 0, c = Number(e.custo_unitario) || 0;
      if (e.descricao && !nomeEst.has(k)) nomeEst.set(k, e.descricao);
      if (e.origem === loja.almoxarifado) { estLoja.set(k, (estLoja.get(k) ?? 0) + q); valLoja.set(k, (valLoja.get(k) ?? 0) + q * c); }
      else { cd.set(k, (cd.get(k) ?? 0) + q); valCd.set(k, (valCd.get(k) ?? 0) + q * c); }
    }
    return pl.map((r: any) => {
      const k = String(r.id_produto);
      const qL = estLoja.get(k) ?? 0, qC = cd.get(k) ?? 0;
      const custo = qL > 0 ? (valLoja.get(k) ?? 0) / qL : qC > 0 ? (valCd.get(k) ?? 0) / qC : null;
      return calcularItem({
        sku: k, descricao: info.get(k)?.descricao ?? nomeEst.get(k) ?? "", categoria: r.categoria, tipo: r.tipo_produto,
        ativo: !!r.ativo_sortimento, estoque: qL, vendaDia: demanda === "malha" ? r.venda_malha : r.venda_dia, exposicao: r.exposicao, fullCase: info.get(k)?.full_case,
        custo, saldoCD: qC, emPedido: 0, vendas30: r.vendas_30d, masterPresente: master.has(k),
      }, base.data!.dias);
    });
  }, [dados.data, loja, base.data, demanda]);

  const malhaMap = useMemo(() => new Map<string, number | null>((dados.data?.pl ?? []).map((r: any) => [String(r.id_produto), r.venda_malha == null ? null : Number(r.venda_malha)])), [dados.data]);
  const infoMalha = useMemo(() => {
    const pl: any[] = dados.data?.pl ?? [];
    const comMalha = pl.filter((r) => r.venda_malha != null).length;
    const meses = [...new Set(pl.filter((r) => r.malha_mes).map((r) => String(r.malha_mes)))].sort();
    const mesAtual = new Date().toISOString().slice(0, 7);
    const desatualizada = comMalha > 0 && (meses.length === 0 || meses[meses.length - 1] !== mesAtual);
    return { comMalha, meses, mesAtual, desatualizada, total: pl.length };
  }, [dados.data]);

  const resumo = useMemo(() => resumirLoja(itens), [itens]);
  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i: any) => i.ativo)
      .filter((i: any) => filtro === "TODOS" ? true : filtro === "SUGESTAO" ? i.sugestao > 0 : i.status === filtro)
      .filter((i: any) => !q || i.sku.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q))
      .sort((a: any, b: any) => STATUS[a.status as StatusItem].ordem - STATUS[b.status as StatusItem].ordem || b.sugestao - a.sugestao);
  }, [itens, filtro, busca]);

  function exportar() {
    const f = (n: unknown) => (n == null ? "" : String(n).replace(".", ","));
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["SKU", "Produto", "Categoria", "Status", "Estoque loja", demanda === "malha" ? "Demanda/dia (malha)" : "Venda/dia (real)", "Exposição", "Cobertura (dias)", "Mínimo", "Ideal", "Máximo", "Caixa", "Sugestão (un)", "Sugestão (caixas)", "Saldo CD", "Custo", "Valor sugestão"];
    const corpo = linhas.filter((i: any) => i.sugestao > 0).map((i: any) => [i.sku, i.descricao, i.categoria, STATUS[i.status as StatusItem].rotulo, f(i.estoque), f(i.vendaDia), f(i.exposicao),
      f(i.cobertura == null ? null : Math.round(i.cobertura * 10) / 10), f(i.minQ), f(i.idealQ), f(i.maxQ), f(i.caixa), f(i.sugestao), f(i.sugestao / i.caixa), f(i.saldoCD), f(i.custo), f(Math.round(i.sugestao * (i.custo || 0) * 100) / 100)].map(esc).join(";"));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Reposicao_${loja?.codigo}_${demanda}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const semCarga = !dados.isLoading && !!dados.data && dados.data.pl.length === 0;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="size-6" /> Reposição de Lojas</h1>
        <p className="text-sm text-muted-foreground">
          Estoque do CD <strong>{base.data?.cd}</strong> para as lojas. Mínimo, ideal e máximo = exposição + venda/dia × {base.data?.dias.min}/{base.data?.dias.ideal}/{base.data?.dias.max} dias.
          O estoque vem do Stock Savvy; venda/dia, exposição, sortimento e caixa vêm da carga da planilha; a malha vem do consenso da diretoria. A sugestão é sempre em caixa fechada.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(base.data?.lojas ?? []).map((l) => (
          <Button key={l.codigo} size="sm" variant={loja?.codigo === l.codigo ? "default" : "outline"} onClick={() => { setLojaSel(l.codigo); setFiltro("TODOS"); }}>{l.nome}</Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Base de venda:</span>
        <Button size="sm" variant={demanda === "real" ? "default" : "outline"} onClick={() => setDemanda("real")}>Real (últimos dias)</Button>
        <Button size="sm" variant={demanda === "malha" ? "default" : "outline"} onClick={() => setDemanda("malha")}>Malha (consenso da diretoria)</Button>
        <span className={`text-xs ${infoMalha.desatualizada ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
          {infoMalha.comMalha === 0
            ? "Sem malha nesta loja: envie o consenso em Carga de dados."
            : `Malha: ${infoMalha.comMalha} de ${infoMalha.total} SKUs · ${infoMalha.meses.length ? "mês " + infoMalha.meses.join(", ") : "vinda da planilha, sem mês informado"}${infoMalha.desatualizada ? ` ⚠ desatualizada (mês atual: ${infoMalha.mesAtual})` : ""}`}
        </span>
      </div>

      {semCarga && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900">
          Ainda não há carga de dados para esta loja. Um administrador precisa enviar a planilha <code>Bases_V2.xlsx</code> em <strong>Abastecimento → Carga de dados</strong>.
        </CardContent></Card>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi t="Disponibilidade" v={resumo.disponibilidade == null ? "—" : `${(resumo.disponibilidade * 100).toFixed(1)}%`} />
        <Kpi t="SKUs ativos" v={String(resumo.ativos)} />
        <Kpi t="Ruptura" v={String(resumo.contagem.ruptura)} tom="text-red-600" />
        <Kpi t="Abaixo do mínimo" v={String(resumo.contagem.abaixo)} tom="text-amber-600" />
        <Kpi t="Excesso" v={String(resumo.contagem.excesso)} tom="text-sky-600" />
        <Kpi t="A repor" v={`${resumo.repor} itens · ${resumo.unidades.toLocaleString("pt-BR")} un`} />
        <Kpi t="Valor a repor (custo)" v={formatBRL(resumo.valorRepor)} />
        <Kpi t="Capital parado" v={formatBRL(resumo.parado)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["TODOS", "SUGESTAO", "ruptura", "abaixo", "ok", "excesso", "semdemanda", "cadastro", "conferir"] as const).map((s) => (
          <button key={s} onClick={() => setFiltro(s)} className={`rounded-full border px-3 py-1 text-xs ${filtro === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>
            {s === "TODOS" ? "Todos" : s === "SUGESTAO" ? "Com sugestão" : STATUS[s].rotulo}{s !== "TODOS" && s !== "SUGESTAO" ? ` (${resumo.contagem[s]})` : ""}
          </button>
        ))}
        <Input className="h-8 w-56" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={exportar}><Download className="size-4" /> CSV da sugestão</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">{demanda === "malha" ? "Demanda (malha)" : "Venda/dia"}</TableHead><TableHead className="text-right">Malha/dia</TableHead><TableHead className="text-right">Expo.</TableHead>
            <TableHead className="text-right">Cobert.</TableHead><TableHead className="text-right">Mín</TableHead><TableHead className="text-right">Ideal</TableHead><TableHead className="text-right">Máx</TableHead>
            <TableHead className="text-right">Sugestão</TableHead><TableHead className="text-right">Saldo CD</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {linhas.length === 0 && <TableRow><TableCell colSpan={13} className="py-10 text-center text-muted-foreground">{dados.isLoading ? "Carregando..." : "Nenhum item neste filtro."}</TableCell></TableRow>}
            {linhas.slice(0, 600).map((i: any) => (
              <TableRow key={i.sku}>
                <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                <TableCell className="max-w-[240px] truncate">{i.descricao || "—"}</TableCell>
                <TableCell><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${COR[i.status as StatusItem]}`}>{STATUS[i.status as StatusItem].rotulo}</span></TableCell>
                <TableCell className="text-right">{n1(i.estoque)}</TableCell><TableCell className="text-right">{n2(i.vendaDia)}</TableCell><TableCell className="text-right text-muted-foreground">{n2(malhaMap.get(i.sku))}</TableCell><TableCell className="text-right">{n1(i.exposicao)}</TableCell>
                <TableCell className="text-right">{n1(i.cobertura)}</TableCell><TableCell className="text-right">{n1(i.minQ)}</TableCell><TableCell className="text-right">{n1(i.idealQ)}</TableCell><TableCell className="text-right">{n1(i.maxQ)}</TableCell>
                <TableCell className="text-right font-semibold">{i.sugestao > 0 ? `${i.sugestao}${i.caixa > 1 ? ` (${i.sugestao / i.caixa} cx)` : ""}` : "—"}</TableCell>
                <TableCell className="text-right">{n1(i.saldoCD)}{i.sugestao > 0 && (i.saldoCD ?? 0) < i.sugestao && <AlertTriangle className="inline size-3 ml-1 text-amber-600" aria-label="CD não cobre a sugestão" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Pedidos em trânsito ainda não abatem a sugestão (o ciclo do pedido Loja → CD é a próxima fase). {linhas.length > 600 ? "Mostrando os 600 primeiros; o CSV traz todos com sugestão." : ""}</p>
    </div>
  );
}

function Kpi({ t, v, tom }: { t: string; v: string; tom?: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground truncate">{t}</div><div className={`text-lg font-bold mt-1 ${tom ?? ""}`}>{v}</div></CardContent></Card>;
}
