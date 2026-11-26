import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ComposedChart, Line,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, FlaskConical, Layers, Minus, RotateCcw } from "lucide-react";
import { exportarBIInterativo } from "@/lib/export-bi-interativo";
import { toast } from "sonner";

/**
 * FONTE DE DADOS: view `v_teste_industrial_consumo` (dedicada — não depende de
 * v_impacto_consumo, que exclui este SKU da análise de Dispersão)
 * (Teste Industrial). Usamos APENAS: ano_mes, dt_producao, numero_op, material,
 * desc_material, um, qtd_consumo e custo_unit_medio. Campos de desvio são IGNORADOS:
 * não existe Ficha Técnica estável para Testes Industriais.
 * Tela 100% leitura.
 */
export const SKU_TESTE_INDUSTRIAL = "05104122";

export const Route = createFileRoute("/_authenticated/producao/testes-industriais")({
  component: TestesIndustriaisPage,
  head: () => ({ meta: [
    { title: "Testes Industriais — Custo de Inovação" },
    { name: "description", content: "Painel executivo do custo das Ordens de Produção de Testes Industriais (Inovação) da Mágio Chocolates." },
    { property: "og:title", content: "Testes Industriais — Custo de Inovação" },
    { property: "og:description", content: "Acompanhe o gasto por ano, mês e dia, os grupos de materiais e as OPs dos Testes Industriais." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Linha = {
  id: string; ano_mes: string; dt_producao: string | null; numero_op: string;
  material: string; desc_material: string | null; um: string | null;
  qtd_consumo: number; custo_unit_medio: number | null;
};

type Gran = "ano" | "mes" | "dia";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
const labelMes = (m: string) => {
  const [a, mm] = m.split("-");
  return `${mm}/${a?.slice(2)}`;
};
const labelPeriodo = (p: string, g: Gran) => {
  if (g === "ano") return p;
  if (g === "mes") return labelMes(p);
  const [a, mm, d] = p.split("-");
  return `${d}/${mm}/${a?.slice(2)}`;
};

const PALETA = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const corGrupo = (i: number) => PALETA[i % PALETA.length];

function Kpi({
  titulo, valor, hint, tom, children,
}: { titulo: string; valor: string; hint?: React.ReactNode; tom?: "danger" | "warning"; children?: React.ReactNode }) {
  return (
    <div className={`min-w-0 rounded-xl border border-l-4 bg-card p-3 shadow-sm ${tom === "danger" ? "border-l-destructive" : tom === "warning" ? "border-l-warning" : "border-l-primary"}`}>
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">{titulo}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tom === "danger" ? "text-destructive" : tom === "warning" ? "text-warning" : ""}`}>{valor}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

function Painel({ letra, titulo, children, acao, className = "" }: {
  letra: string; titulo: React.ReactNode; children: React.ReactNode; acao?: React.ReactNode; className?: string;
}) {
  return <section className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-dashboard-marker text-[11px] font-bold text-dashboard-marker-foreground">{letra}</span>
        <h2 className="text-sm font-bold">{titulo}</h2>
      </div>
      {acao}
    </div>
    {children}
  </section>;
}

function TabelaTop({
  titulo, subtitulo, colunas, linhas, total,
}: {
  titulo: string; subtitulo?: string; colunas: [string, string];
  linhas: { chave: string; nome: string; custo: number; extra?: string }[]; total: number;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{titulo}</span>
        {subtitulo && <span className="text-[11px] font-normal text-muted-foreground">{subtitulo}</span>}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>{colunas[0]}</TableHead>
              <TableHead className="text-right">{colunas[1]}</TableHead>
              <TableHead className="w-[110px] text-right">% </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, i) => {
              const pct = total > 0 ? (l.custo / total) * 100 : 0;
              return (
                <TableRow key={l.chave}>
                  <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={l.nome}>
                    <span className="font-medium">{l.nome}</span>
                    {l.extra && <span className="text-xs text-muted-foreground"> · {l.extra}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{brl(l.custo)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: "var(--primary)" }} />
                      </div>
                      <span className="tabular-nums text-xs w-10">{pct.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!linhas.length && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TestesIndustriaisPage() {
  const [gran, setGran] = useState<Gran>("mes");
  const [periodo, setPeriodo] = useState("todos");
  const [material, setMaterial] = useState("");
  const [op, setOp] = useState("todas");
  const [soSemCusto, setSoSemCusto] = useState(false);

  const q = useQuery({
    queryKey: ["testes-industriais", SKU_TESTE_INDUSTRIAL],
    queryFn: async () =>
      await fetchAll<Linha>((from, to) =>
        (supabase as any)
          .from("v_teste_industrial_consumo")
          .select("id, ano_mes, dt_producao, numero_op, material, desc_material, um, qtd_consumo, custo_unit_medio")
          .eq("sku_produto_final", SKU_TESTE_INDUSTRIAL)
          .order("ano_mes", { ascending: true })
          .range(from, to)),
  });

  const gruposQ = useQuery({
    queryKey: ["grupo-produtos-testes"],
    queryFn: async () =>
      await fetchAll<{ codigo_produto: string; grupo: string | null }>((from, to) =>
        (supabase as any).from("grupo_produtos").select("codigo_produto, grupo").range(from, to)),
  });

  const mapaGrupo = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gruposQ.data ?? []) if (g.codigo_produto) m.set(String(g.codigo_produto), g.grupo || "Sem grupo");
    return m;
  }, [gruposQ.data]);

  const base = useMemo(() => (q.data ?? []).map((r) => {
    const qtd = Number(r.qtd_consumo ?? 0);
    const unit = Number(r.custo_unit_medio ?? 0);
    const dia = r.dt_producao ? String(r.dt_producao).slice(0, 10) : `${r.ano_mes}-01`;
    return {
      ...r,
      qtd,
      unit,
      custo: qtd * unit,
      dia,
      ano: r.ano_mes.slice(0, 4),
      grupo: mapaGrupo.get(String(r.material)) ?? "Sem grupo",
      semCusto: qtd > 0 && (!r.custo_unit_medio || unit === 0),
    };
  }), [q.data, mapaGrupo]);

  const chaveGran = (r: (typeof base)[number]) => (gran === "ano" ? r.ano : gran === "mes" ? r.ano_mes : r.dia);

  const periodos = useMemo(
    () => [...new Set(base.map((r) => chaveGran(r)))].sort(),
    [base, gran],
  );
  const ops = useMemo(() => [...new Set(base.map((r) => String(r.numero_op)))].sort(), [base]);

  const filtradas = useMemo(() => base.filter((r) => {
    if (periodo !== "todos" && chaveGran(r) !== periodo) return false;
    if (op !== "todas" && String(r.numero_op) !== op) return false;
    if (soSemCusto && !r.semCusto) return false;
    const t = material.trim().toLowerCase();
    if (t && !`${r.material} ${r.desc_material ?? ""}`.toLowerCase().includes(t)) return false;
    return true;
  }), [base, periodo, op, material, soSemCusto, gran]);

  // --- Série por período (respeita filtros, exceto o próprio período quando "todos") ---
  const porPeriodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtradas) {
      const k = chaveGran(r);
      m.set(k, (m.get(k) ?? 0) + r.custo);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([p, custo]) => ({ p, custo }));
  }, [filtradas, gran]);

  // --- MoM ESTÁTICO: sempre sobre a base completa, nunca afetado pelos filtros ---
  const momEstatico = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of base) m.set(r.ano_mes, (m.get(r.ano_mes) ?? 0) + r.custo);
    const arr = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return arr.map(([ano_mes, custo], i) => {
      const ant = i > 0 ? arr[i - 1]?.[1] ?? null : null;
      return {
        ano_mes,
        custo,
        anterior: ant,
        var_pct: ant && ant > 0 ? ((custo - ant) / ant) * 100 : null,
      };
    });
  }, [base]);

  // --- Período atual (o mais recente da granularidade escolhida) ---
  const periodoAtualChave = periodo !== "todos" ? periodo : periodos.at(-1) ?? null;
  const linhasPeriodoAtual = useMemo(
    () => (periodoAtualChave ? filtradas.filter((r) => chaveGran(r) === periodoAtualChave) : []),
    [filtradas, periodoAtualChave, gran],
  );

  // --- KPIs ---
  const gastoTotal = useMemo(() => filtradas.reduce((s, r) => s + r.custo, 0), [filtradas]);
  const opsDistintas = useMemo(() => new Set(filtradas.map((r) => String(r.numero_op))).size, [filtradas]);
  const custoMedioOp = opsDistintas ? gastoTotal / opsDistintas : 0;
  const gastoPeriodoAtual = useMemo(() => linhasPeriodoAtual.reduce((s, r) => s + r.custo, 0), [linhasPeriodoAtual]);

  const idxAtual = porPeriodo.findIndex((x) => x.p === periodoAtualChave);
  const anteriorVal = idxAtual > 0 ? porPeriodo[idxAtual - 1]?.custo ?? null : null;
  const variacao = anteriorVal && anteriorVal > 0 ? ((gastoPeriodoAtual - anteriorVal) / anteriorVal) * 100 : null;

  const agregar = (linhas: typeof base, chave: (r: (typeof base)[number]) => string, nome: (r: (typeof base)[number]) => string) => {
    const m = new Map<string, { chave: string; nome: string; custo: number }>();
    for (const r of linhas) {
      const k = chave(r);
      const cur = m.get(k) ?? { chave: k, nome: nome(r), custo: 0 };
      cur.custo += r.custo;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.custo - a.custo);
  };

  const topMateriaisPeriodo = useMemo(
    () => agregar(linhasPeriodoAtual, (r) => r.material, (r) => r.desc_material || r.material).slice(0, 10),
    [linhasPeriodoAtual],
  );
  const topOpsPeriodo = useMemo(
    () => agregar(linhasPeriodoAtual, (r) => String(r.numero_op), (r) => `OP ${r.numero_op}`).slice(0, 10),
    [linhasPeriodoAtual],
  );
  const porGrupoPeriodo = useMemo(
    () => agregar(linhasPeriodoAtual, (r) => r.grupo, (r) => r.grupo),
    [linhasPeriodoAtual],
  );
  const pizza = useMemo(() => {
    const top = porGrupoPeriodo.slice(0, 6);
    const resto = porGrupoPeriodo.slice(6).reduce((s, g) => s + g.custo, 0);
    return resto > 0 ? [...top, { chave: "__outros", nome: "Outros", custo: resto }] : top;
  }, [porGrupoPeriodo]);

  const concentracao = useMemo(() => {
    const top = topMateriaisPeriodo[0];
    if (!top || !gastoPeriodoAtual) return null;
    return { nome: top.nome, pct: (top.custo / gastoPeriodoAtual) * 100 };
  }, [topMateriaisPeriodo, gastoPeriodoAtual]);

  const semCustoCount = useMemo(() => filtradas.filter((r) => r.semCusto).length, [filtradas]);

  const historico = useMemo(() => {
    const m = new Map<string, { qtd: number; custo: number; ocorr: number }>();
    for (const r of base) {
      const cur = m.get(r.material) ?? { qtd: 0, custo: 0, ocorr: 0 };
      cur.qtd += r.qtd; cur.custo += r.custo; cur.ocorr += 1;
      m.set(r.material, cur);
    }
    return m;
  }, [base]);

  const detalhe = useMemo(() => [...filtradas].sort((a, b) => b.custo - a.custo), [filtradas]);

  function exportarHtmlAtivo() {
    if (!base.length) return;
    exportarBIInterativo({
      titulo: "Testes Industriais — Custo de Inovação",
      subtitulo: `SKU ${SKU_TESTE_INDUSTRIAL} · banco embarcado e filtro cruzado entre todos os visuais`,
      linhas: base.map((r) => ({
        ano: r.ano,
        ano_mes: r.ano_mes,
        dia: r.dia,
        numero_op: `OP ${r.numero_op}`,
        material: r.material,
        desc_material: r.desc_material ?? "",
        grupo: r.grupo,
        um: r.um ?? "",
        qtd: r.qtd,
        custo_unit: r.unit,
        custo: r.custo,
        sem_custo: r.semCusto ? "Sem custo" : "OK",
      })),
      dimensoes: [
        { chave: "material", rotulo: "Matéria-prima", chaveRotulo: "desc_material" },
        { chave: "numero_op", rotulo: "Ordem de Produção" },
        { chave: "grupo", rotulo: "Grupo", pizza: true },
        { chave: "ano_mes", rotulo: "Mês" },
      ],
      medida: { chave: "custo", rotulo: "Gasto Total", formato: "brl" },
      medidaSecundaria: { chave: "qtd", rotulo: "Quantidade consumida", formato: "num" },
      serie: { chave: gran === "ano" ? "ano" : gran === "mes" ? "ano_mes" : "dia", rotulo: nomeGran },
      colunas: [
        { chave: "dia", rotulo: "Data" },
        { chave: "ano_mes", rotulo: "Mês" },
        { chave: "numero_op", rotulo: "OP" },
        { chave: "material", rotulo: "Código" },
        { chave: "desc_material", rotulo: "Matéria-prima" },
        { chave: "grupo", rotulo: "Grupo" },
        { chave: "um", rotulo: "UM" },
        { chave: "qtd", rotulo: "Qtd", formato: "num" },
        { chave: "custo_unit", rotulo: "Custo unit.", formato: "brl" },
        { chave: "custo", rotulo: "Custo total", formato: "brl" },
        { chave: "sem_custo", rotulo: "Status custo" },
      ],
      filtrosAtivos: [
        ...(periodo !== "todos" ? [{ label: nomeGran, valor: labelPeriodo(periodo, gran) }] : []),
        ...(op !== "todas" ? [{ label: "OP", valor: op }] : []),
        ...(material.trim() ? [{ label: "Matéria-prima", valor: material.trim() }] : []),
        ...(soSemCusto ? [{ label: "Filtro", valor: "Somente itens sem custo" }] : []),
      ],
    });
    toast.success("HTML interativo gerado");
  }
  const rotuloPeriodoAtual = periodoAtualChave ? labelPeriodo(periodoAtualChave, gran) : "—";
  const nomeGran = gran === "ano" ? "Ano" : gran === "mes" ? "Mês" : "Dia";

  return (
    <div className="industrial-dashboard w-full min-w-0 space-y-4">
      {/* Faixa de título estilo BI */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-dashboard-header px-5 py-4 text-dashboard-header-foreground">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="flex items-start gap-2 text-xl font-bold"><FlaskConical className="mt-0.5 size-5 shrink-0" />Testes Industriais <span className="text-sm font-normal text-dashboard-header-muted">Custo de Inovação</span></h1>
          <p className="mt-1 text-xs text-dashboard-header-muted">SKU {SKU_TESTE_INDUSTRIAL}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="text-foreground" onClick={exportarHtmlAtivo} disabled={!base.length}>
            <Download className="size-4" /> HTML interativo
          </Button>
          <Tabs value={gran} onValueChange={(v) => { setGran(v as Gran); setPeriodo("todos"); }}>
            <TabsList className="bg-dashboard-header-muted/15 text-dashboard-header-muted">
              <TabsTrigger className="data-[state=active]:bg-card data-[state=active]:text-card-foreground" value="ano">Ano</TabsTrigger>
              <TabsTrigger className="data-[state=active]:bg-card data-[state=active]:text-card-foreground" value="mes">Mês</TabsTrigger>
              <TabsTrigger className="data-[state=active]:bg-card data-[state=active]:text-card-foreground" value="dia">Diária</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* KPIs */}
      <div>
        <div className="mb-3 flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-dashboard-marker text-[11px] font-bold text-dashboard-marker-foreground">A</span><h2 className="text-sm font-bold">Indicadores do período</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi titulo="Gasto Total" valor={brl(gastoTotal)} hint={`${filtradas.length} linha(s) no filtro`} />
        <Kpi
          titulo={`Gasto no ${nomeGran} (${rotuloPeriodoAtual})`}
          valor={brl(gastoPeriodoAtual)}
          hint={
            variacao === null ? (
              <span className="flex items-center gap-1"><Minus className="size-3" /> sem período anterior</span>
            ) : (
              <span className={`flex items-center gap-1 font-medium ${variacao > 0 ? "text-destructive" : "text-success"}`}>
                {variacao > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {variacao > 0 ? "+" : ""}{variacao.toFixed(1)}% vs. anterior
              </span>
            )
          }
        />
        <Kpi titulo="OPs Testadas" valor={String(opsDistintas)} hint={`Custo médio por OP: ${brl(custoMedioOp)}`} />
        <Kpi
          titulo={`Maior Concentração — ${rotuloPeriodoAtual}`}
          valor={concentracao ? `${concentracao.pct.toFixed(0)}%` : "—"}
          tom={concentracao && concentracao.pct > 50 ? "danger" : undefined}
          hint={
            concentracao ? (
              <span className="flex items-center gap-1 truncate" title={concentracao.nome}>
                {concentracao.pct > 50 && <AlertTriangle className="size-3 text-destructive" />}
                {concentracao.nome}
              </span>
            ) : "sem dados no período"
          }
        />
        <Kpi titulo="Itens sem Custo Cadastrado" valor={String(semCustoCount)} tom={semCustoCount ? "warning" : undefined}>
          <Button
            size="sm" variant={soSemCusto ? "default" : "outline"} className="mt-2 h-7 text-xs"
            onClick={() => setSoSemCusto((v) => !v)} disabled={!semCustoCount && !soSemCusto}
          >
            {soSemCusto ? "Mostrando só sem custo" : "Ver itens sem custo"}
          </Button>
        </Kpi>
      </div>

      </div>

      {/* Linha 1: série por período + pizza por grupo */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Painel letra="B" titulo={`Gasto por ${nomeGran.toLowerCase()}`} className="xl:col-span-2" acao={
          <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] text-muted-foreground">{nomeGran}</label>
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os períodos</SelectItem>
                  {periodos.map((p) => <SelectItem key={p} value={p}>{labelPeriodo(p, gran)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] text-muted-foreground">Matéria-prima</label>
              <Input className="h-8 w-full text-xs sm:w-[185px]" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Buscar por código ou descrição…" />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] text-muted-foreground">OP</label>
              <Select value={op} onValueChange={setOp}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-[145px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as OPs</SelectItem>
                  {ops.map((o) => <SelectItem key={o} value={o}>OP {o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-8 w-full text-xs sm:w-auto" onClick={() => { setPeriodo("todos"); setMaterial(""); setOp("todas"); setSoSemCusto(false); }}><RotateCcw className="size-3.5" />Limpar filtros</Button>
          </div>
        }>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porPeriodo} margin={{ top: 18, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
                <XAxis dataKey="p" tickFormatter={(v: string) => labelPeriodo(v, gran)} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compacto} fontSize={11} tickLine={false} axisLine={false} />
                <RTooltip
                  formatter={(v: any) => [brl(Number(v)), "Custo"]}
                  labelFormatter={(v: string) => labelPeriodo(v, gran)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                />
                <Bar dataKey="custo" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={64}>
                  <LabelList dataKey="custo" position="top" formatter={(v: any) => compacto(Number(v))} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel letra="C" titulo={<span className="flex items-center gap-2"><Layers className="size-4 text-primary" />Custo por grupo — {rotuloPeriodoAtual}</span>}>
          <div className="h-72">
            {pizza.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pizza} dataKey="custo" nameKey="nome" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {pizza.map((g, i) => <Cell key={g.chave} fill={corGrupo(i)} />)}
                  </Pie>
                  <Legend verticalAlign="bottom" height={56} wrapperStyle={{ fontSize: 11 }} />
                  <RTooltip
                    formatter={(v: any, n: any) => [brl(Number(v)), String(n)]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>
            )}
          </div>
        </Painel>
      </div>

      {/* MoM estático */}
      <Painel letra="D" titulo="Análise MoM — evolução mês a mês" acao={<Badge variant="secondary" className="text-[10px] font-normal">Histórico completo</Badge>}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={momEstatico} margin={{ top: 18, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
              <XAxis dataKey="ano_mes" tickFormatter={labelMes} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tickFormatter={compacto} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`} fontSize={11} tickLine={false} axisLine={false} />
              <RTooltip
                labelFormatter={labelMes}
                formatter={(v: any, n: any) => (n === "var_pct"
                  ? [v === null ? "—" : `${Number(v).toFixed(1)}%`, "Variação"]
                  : [brl(Number(v)), "Custo do mês"])}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
              />
              <Bar yAxisId="l" dataKey="custo" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={64}>
                <LabelList dataKey="custo" position="top" formatter={(v: any) => compacto(Number(v))} fontSize={11} />
              </Bar>
              <Line yAxisId="r" type="monotone" dataKey="var_pct" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      {/* Tops do período atual */}
      <Painel letra="E" titulo="Rankings do período">
      <div className="grid gap-4 xl:grid-cols-3">
        <TabelaTop
          titulo="Top 10 matérias-primas"
          subtitulo={rotuloPeriodoAtual}
          colunas={["Matéria-prima", "Custo"]}
          linhas={topMateriaisPeriodo}
          total={gastoPeriodoAtual}
        />
        <TabelaTop
          titulo="Top 10 OPs"
          subtitulo={rotuloPeriodoAtual}
          colunas={["Ordem de Produção", "Custo"]}
          linhas={topOpsPeriodo}
          total={gastoPeriodoAtual}
        />
        <TabelaTop
          titulo="Top 10 grupos"
          subtitulo={rotuloPeriodoAtual}
          colunas={["Grupo", "Custo"]}
          linhas={porGrupoPeriodo.slice(0, 10)}
          total={gastoPeriodoAtual}
        />
      </div>

      </Painel>

      {/* Tabela detalhada */}
      <Painel letra="F" titulo={`Detalhamento — ${detalhe.length} linha(s)`}>
        <div className="max-h-[520px] overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>OP</TableHead>
                <TableHead>Matéria-prima</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>UM</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead className="text-right">Unit. médio hist.</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">% do total</TableHead>
                <TableHead>Alerta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalhe.map((r) => {
                const h = historico.get(r.material);
                const mostraHist = !!h && h.ocorr > 1 && h.qtd > 0;
                const unitHist = mostraHist && h ? h.custo / h.qtd : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{labelPeriodo(r.dia, "dia")}</TableCell>
                    <TableCell>{r.numero_op}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={`${r.material} — ${r.desc_material ?? ""}`}>
                      {r.material}{r.desc_material ? ` — ${r.desc_material}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.grupo}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell>{r.um ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(r.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {unitHist !== null ? brl(unitHist) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{brl0(r.custo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{gastoTotal > 0 ? `${((r.custo / gastoTotal) * 100).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell>
                      {r.semCusto && <Badge variant="destructive" className="text-[10px]">⚠ Sem custo</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!detalhe.length && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  {q.isLoading ? "Carregando…" : "Nenhum apontamento de Teste Industrial no filtro atual."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Painel>

      <p className="text-xs text-muted-foreground">
        Fonte: view <code>v_teste_industrial_consumo</code> (dedicada, filtrada por <code>sku_produto_final = '{SKU_TESTE_INDUSTRIAL}'</code>);
        grupos vindos de <code>grupo_produtos</code>. Tela somente leitura. Para desvio contra Ficha Técnica, use{" "}
        <Link to="/producao/dispersao" className="underline">Dispersão de Lote</Link>.
      </p>
    </div>
  );
}
