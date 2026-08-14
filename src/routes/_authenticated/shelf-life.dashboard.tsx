import { createFileRoute } from "@tanstack/react-router";
import { ExportarHtmlButton } from "@/components/app/ExportarHtmlButton";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/inventory";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LabelList,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  calcularIndicadores, cruzarBaixasComCampanhas, valorRecuperadoCampanha,
  type BaixaCalc,
} from "@/lib/shelf-life";
import { useCampanhas, useTiposAcao } from "@/hooks/useShelfLife";
import { indicadoresMetodologia } from "@/lib/shelf-life-financeiro";
import { ConfigFiltrosCard, useOrigensDisponiveis } from "@/components/shelf-life/ConfigFiltrosCard";
import { almoxEfetivos, usePersistedState, useShelfConfig } from "@/hooks/useFiltrosShelfLife";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { MultiSelect } from "@/components/ui/multi-select";


export const Route = createFileRoute("/_authenticated/shelf-life/dashboard")({
  component: ShelfLifeDashboard,
  head: () => ({
    meta: [
      { title: "Shelf Life — Dashboard Executivo" },
      { name: "description", content: "Perda evitada, receita recuperada, saving, ROI operacional e eficiência de recuperação de shelf life." },
      { property: "og:title", content: "Shelf Life — Dashboard Executivo" },
      { property: "og:description", content: "Indicadores executivos de controle de validade." },
    ],
  }),
});

const COR_PERDA = "var(--chart-5)";
const COR_RECEITA = "var(--chart-1)";
const COR_SAVING = "var(--chart-3)";
const COR_CATEGORIA = ["var(--chart-1)", "var(--chart-3)", "var(--chart-2)", "var(--chart-4)"];

function isoDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtMonth(k: string) {
  const [y, m] = k.split("-");
  return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(m) - 1] ?? m}/${y.slice(2)}`;
}

type FiltrosDash = {
  de: string;
  ate: string;
  almox: string[];
  grupos: string[];
  familias: string[];
  motivos: string[];
  tipos: string[];
};

function ShelfLifeDashboard() {
  const tipos = useTiposAcao();
  const campanhasQ = useCampanhas();
  const { almoxAtivos } = useShelfConfig();
  const { almoxes: permitidos } = useMeusAlmoxarifados();
  const origens = useOrigensDisponiveis();
  const almoxBase = useMemo(() => almoxEfetivos(permitidos, almoxAtivos), [permitidos, almoxAtivos]);

  const [f, setF] = usePersistedState<FiltrosDash>("shelf-life:dashboard:filtros", {
    de: isoDaysAgo(180), ate: todayISO(), almox: [], grupos: [], familias: [], motivos: [], tipos: [],
  });
  const set = <K extends keyof FiltrosDash>(k: K, v: FiltrosDash[K]) => setF((p) => ({ ...p, [k]: v }));
  const de = f.de, ate = f.ate;

  const catalogoQ = useQuery({
    queryKey: ["shelf-catalogo-gf"],
    staleTime: 300_000,
    queryFn: async () => {
      const [grupos, familias] = await Promise.all([
        fetchAll<any>((from, to) => (supabase as any).from("grupo_produtos").select("codigo_produto, grupo").range(from, to)),
        fetchAll<any>((from, to) => (supabase as any).from("familias").select("codigo_produto, familia").range(from, to)),
      ]);
      const norm = (s: any) => String(s ?? "").trim().toUpperCase();
      return {
        grupo: new Map<string, string>(grupos.map((g) => [norm(g.codigo_produto), String(g.grupo)])),
        familia: new Map<string, string>(familias.map((x) => [norm(x.codigo_produto), String(x.familia)])),
      };
    },
  });

  const baixasQ = useQuery({
    queryKey: ["shelf-baixas", de, ate, almoxBase?.join(",") ?? "all"],
    staleTime: 60_000,
    queryFn: async (): Promise<(BaixaCalc & { origem: string | null })[]> => {
      const [motivos, rows] = await Promise.all([
        (supabase as any).from("motivo_baixa").select("id, descricao"),
        fetchAll<any>((from, to) => {
          let q = (supabase as any)
            .from("baixa_operacional")
            .select("id, codigo_produto, descricao, lote, quantidade, valor_total, custo_unitario, motivo_baixa_id, data_ocorrencia, data_solicitacao, status_fluxo, origem")
            .range(from, to);
          if (almoxBase && almoxBase.length > 0) q = q.in("origem", almoxBase);
          if (almoxBase && almoxBase.length === 0) q = q.in("origem", ["__nenhum__"]);
          return q;
        }),
      ]);
      const mMap = new Map<string, string>(((motivos.data ?? []) as any[]).map((m) => [m.id, m.descricao]));
      return rows
        .map((b) => ({
          id: b.id,
          codigo_produto: String(b.codigo_produto ?? ""),
          descricao: b.descricao ?? null,
          lote: b.lote ?? null,
          quantidade: Number(b.quantidade) || 0,
          valor_total: Number(b.valor_total) || 0,
          custo_unitario: Number(b.custo_unitario) || 0,
          data: String(b.data_ocorrencia ?? b.data_solicitacao ?? "").slice(0, 10),
          motivo_nome: b.motivo_baixa_id ? mMap.get(b.motivo_baixa_id) ?? null : null,
          origem: b.origem ?? null,
        }))
        .filter((b) => b.data >= de && b.data <= ate);
    },
  });

  const norm = (s: any) => String(s ?? "").trim().toUpperCase();
  const inSel = (sel: string[], v: string | null | undefined) => sel.length === 0 || (v != null && sel.includes(v));

  const baixasFiltradas = useMemo(() => {
    const g = catalogoQ.data?.grupo, fa = catalogoQ.data?.familia;
    return (baixasQ.data ?? []).filter((b) => {
      if (!inSel(f.almox, b.origem)) return false;
      if (!inSel(f.motivos, b.motivo_nome)) return false;
      if (f.grupos.length && !f.grupos.includes(g?.get(norm(b.codigo_produto)) ?? "")) return false;
      if (f.familias.length && !f.familias.includes(fa?.get(norm(b.codigo_produto)) ?? "")) return false;
      return true;
    });
  }, [baixasQ.data, f, catalogoQ.data]);

  const campanhasFiltradas = useMemo(() => {
    const g = catalogoQ.data?.grupo, fa = catalogoQ.data?.familia;
    return (campanhasQ.data ?? []).filter((c) => {
      if (almoxBase && c.almoxarifado && !almoxBase.includes(c.almoxarifado)) return false;
      if (!inSel(f.almox, c.almoxarifado)) return false;
      if (f.tipos.length && !f.tipos.includes(c.tipo_nome ?? "")) return false;
      if (f.grupos.length && !f.grupos.includes(g?.get(norm(c.sku)) ?? "")) return false;
      if (f.familias.length && !f.familias.includes(fa?.get(norm(c.sku)) ?? "")) return false;
      return true;
    });
  }, [campanhasQ.data, f, catalogoQ.data, almoxBase]);

  const campanhasPeriodo = useMemo(
    () => campanhasFiltradas.filter((c) => (c.data_acao ?? "") >= de && (c.data_acao ?? "") <= ate),
    [campanhasFiltradas, de, ate],
  );

  const motivosDeAcao = useMemo(
    () => new Set((tipos.data ?? []).map((t) => t.nome)),
    [tipos.data],
  );

  const motivosOpts = useMemo(
    () => Array.from(new Set((baixasQ.data ?? []).map((b) => b.motivo_nome).filter(Boolean) as string[])).sort(),
    [baixasQ.data],
  );
  const gfOpts = useMemo(() => {
    const g = new Set<string>(), fa = new Set<string>();
    catalogoQ.data?.grupo.forEach((v) => v && g.add(v));
    catalogoQ.data?.familia.forEach((v) => v && fa.add(v));
    return { grupos: Array.from(g).sort(), familias: Array.from(fa).sort() };
  }, [catalogoQ.data]);

  const linhas = useMemo(
    () => cruzarBaixasComCampanhas(baixasFiltradas, campanhasFiltradas, motivosDeAcao),
    [baixasFiltradas, campanhasFiltradas, motivosDeAcao],
  );

  const ind = useMemo(() => calcularIndicadores(linhas, campanhasPeriodo), [linhas, campanhasPeriodo]);

  const met = useMemo(() => indicadoresMetodologia(campanhasPeriodo as any), [campanhasPeriodo]);
  const composicao = useMemo(
    () => met.porCategoria.filter((x) => x.valor > 0).map((x, i) => ({ name: x.categoria, value: x.valor, fill: COR_CATEGORIA[i % COR_CATEGORIA.length] })),
    [met],
  );
  const composicaoTotal = composicao.reduce((s, r) => s + r.value, 0);


  const mensal = useMemo(() => {
    const m = new Map<string, { mes: string; Perda: number; "Receita Recuperada": number; "Saving Recuperado": number }>();
    const get = (k: string) => {
      let e = m.get(k);
      if (!e) { e = { mes: k, Perda: 0, "Receita Recuperada": 0, "Saving Recuperado": 0 }; m.set(k, e); }
      return e;
    };
    linhas.forEach((l) => { if (l.baixa.data) get(l.baixa.data.slice(0, 7)).Perda += l.perda; });
    campanhasPeriodo.filter((c) => c.status === "CONCLUIDA").forEach((c) => {
      const e = get((c.data_acao ?? "").slice(0, 7));
      if (c.categoria === "RECEITA") e["Receita Recuperada"] += c.valor_estimado_recuperado || 0;
      else e["Saving Recuperado"] += c.valor_estimado_saving || 0;
    });
    return Array.from(m.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map((e) => ({ ...e, label: fmtMonth(e.mes) }));
  }, [linhas, campanhasPeriodo]);

  const rosca = useMemo(() => ([
    { name: "Perda", value: Math.max(0, ind.perda), fill: COR_PERDA },
    { name: "Receita Recuperada", value: Math.max(0, ind.receitaRecuperada), fill: COR_RECEITA },
  ]), [ind]);
  const roscaTotal = rosca.reduce((s, r) => s + r.value, 0);

  const topRecuperados = useMemo(() => {
    const m = new Map<string, { nome: string; valor: number; acoes: Set<string>; qtdAcoes: number; custo: number; saving: number }>();
    campanhasPeriodo.filter((c) => c.status === "CONCLUIDA").forEach((c) => {
      const k = c.sku;
      const e = m.get(k) ?? { nome: c.descricao || c.sku, valor: 0, acoes: new Set<string>(), qtdAcoes: 0, custo: 0, saving: 0 };
      e.valor += valorRecuperadoCampanha(c);
      e.custo += Number(c.custo_acao) || 0;
      e.saving += Number(c.valor_estimado_saving) || 0;
      e.qtdAcoes += 1;
      if (c.tipo_nome) e.acoes.add(c.tipo_nome);
      m.set(k, e);
    });
    return Array.from(m.values())
      .map((e) => ({ ...e, acao: Array.from(e.acoes).join(", ") || "—" }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [campanhasPeriodo]);

  const topPerda = useMemo(() => {
    const m = new Map<string, { nome: string; valor: number; quantidade: number; ocorrencias: number; motivos: Set<string> }>();
    linhas.forEach((l) => {
      if (l.perda <= 0) return;
      const k = l.baixa.codigo_produto;
      const e = m.get(k) ?? { nome: l.baixa.descricao || k, valor: 0, quantidade: 0, ocorrencias: 0, motivos: new Set<string>() };
      e.valor += l.perda;
      e.quantidade += Number(l.baixa.quantidade) || 0;
      e.ocorrencias += 1;
      if (l.baixa.motivo_nome) e.motivos.add(l.baixa.motivo_nome);
      m.set(k, e);
    });
    return Array.from(m.values())
      .map((e) => ({ ...e, motivo: Array.from(e.motivos).join(", ") || "—" }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [linhas]);

  const estrategias = useMemo(() => {
    const m = new Map<string, number>();
    campanhasPeriodo.filter((c) => c.status === "CONCLUIDA").forEach((c) => {
      const k = c.tipo_nome ?? "Sem tipo";
      m.set(k, (m.get(k) ?? 0) + valorRecuperadoCampanha(c));
    });
    return Array.from(m.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  }, [campanhasPeriodo]);

  const loading = baixasQ.isLoading || campanhasQ.isLoading;

  return (
    <div className="space-y-4" id="dash-shelf-life">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Shelf Life</h1>
          <p className="text-sm text-muted-foreground">Perda por vencimento × recuperação por ações de lote.</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => set("de", e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => set("ate", e.target.value)} /></div>
          <ExportarHtmlButton
            targetId="dash-shelf-life"
            titulo="Dashboard Shelf Life"
            filtros={[
              { label: "Período", valor: `${de} a ${ate}` },
              { label: "Almoxarifado", valor: f.almox.join(", ") || "Todos" },
              { label: "Grupo", valor: f.grupos.join(", ") || "Todos" },
              { label: "Família", valor: f.familias.join(", ") || "Todas" },
              { label: "Tipo de ação", valor: f.tipos.join(", ") || "Todos" },
            ]}
          />
        </div>
      </div>


      <ConfigFiltrosCard mostrarSaldo={false} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <MultiSelect options={(almoxBase ?? origens).map((o) => ({ value: o, label: o }))} value={f.almox} onChange={(v) => set("almox", v)} />
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <MultiSelect options={gfOpts.grupos.map((o) => ({ value: o, label: o }))} value={f.grupos} onChange={(v) => set("grupos", v)} />
          </div>
          <div>
            <Label className="text-xs">Família</Label>
            <MultiSelect options={gfOpts.familias.map((o) => ({ value: o, label: o }))} value={f.familias} onChange={(v) => set("familias", v)} />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <MultiSelect options={motivosOpts.map((o) => ({ value: o, label: o }))} value={f.motivos} onChange={(v) => set("motivos", v)} />
          </div>
          <div>
            <Label className="text-xs">Tipo de Ação</Label>
            <MultiSelect options={(tipos.data ?? []).map((t) => ({ value: t.nome, label: t.nome }))} value={f.tipos} onChange={(v) => set("tipos", v)} />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Metodologia de Recuperação Financeira (ações concluídas)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Kpi title="Receita Recuperada" value={formatBRL(met.receitaRecuperada)} tone="text-info" hint="Ações de categoria Vendas" />
          <Kpi title="Perda Evitada" value={formatBRL(met.perdaEvitada)} tone="text-success" hint="Todas as categorias, exceto Descarte" />
          <Kpi title="Perda Real" value={formatBRL(met.perdaReal)} tone="text-destructive" hint={`Custo total: ${formatBRL(met.custoTotal)}`} />
          <Kpi title="Saving Recuperado" value={formatBRL(met.savingRecuperado)} tone="text-success" hint="Valor recuperado − custo da ação" />
          <Kpi title="ROI Operacional" value={met.roiOperacional === null ? "—" : `${met.roiOperacional.toFixed(0)}%`} tone="text-primary" hint="Saving ÷ custo das ações" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Evolução Mensal</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {loading ? <Skel /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: any) => formatBRL(Number(v))}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                />
                <Legend />
                <Bar dataKey="Perda" stackId="a" fill={COR_PERDA} />
                <Bar dataKey="Receita Recuperada" stackId="a" fill={COR_RECEITA} />
                <Bar dataKey="Saving Recuperado" stackId="a" fill={COR_SAVING} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Composição da Perda Evitada por Categoria</CardTitle></CardHeader>
          <CardContent className="h-[320px]">
            {loading ? <Skel /> : composicaoTotal === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composicao} dataKey="value" nameKey="name" outerRadius={100}
                    label={(e: any) => `${((e.value / composicaoTotal) * 100).toFixed(0)}%`} labelLine={false}>
                    {composicao.map((r) => <Cell key={r.name} fill={r.fill} stroke="var(--card)" />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => formatBRL(Number(v))}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recuperação × Perda</CardTitle></CardHeader>
          <CardContent className="h-[320px]">
            {loading ? <Skel /> : roscaTotal === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rosca} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}
                    label={(e: any) => `${((e.value / roscaTotal) * 100).toFixed(0)}%`}>
                    {rosca.map((r) => <Cell key={r.name} fill={r.fill} stroke="var(--card)" />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => formatBRL(Number(v))}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Perda no período (baixas por Vencimento sem cobertura)</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-destructive">{formatBRL(ind.perda)}</div>
          <p className="text-xs text-muted-foreground mt-1">Considera apenas baixas por vencimento sem ação de lote vinculada.</p>
        </CardContent>
      </Card>


      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Recuperados — ação e resultado</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {!topRecuperados.length ? <Vazio /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Saving</TableHead>
                    <TableHead className="text-right">Recuperado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRecuperados.map((r) => (
                    <TableRow key={r.nome}>
                      <TableCell className="max-w-[220px] truncate">{r.nome}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">{r.acao}</TableCell>
                      <TableCell className="text-right">{r.qtdAcoes}</TableCell>
                      <TableCell className="text-right">{formatBRL(r.custo)}</TableCell>
                      <TableCell className="text-right text-success">{formatBRL(r.saving)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Perda — motivo e resultado</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {!topPerda.length ? <Vazio /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Baixas</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Perda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPerda.map((r) => (
                    <TableRow key={r.nome}>
                      <TableCell className="max-w-[220px] truncate">{r.nome}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">{r.motivo}</TableCell>
                      <TableCell className="text-right">{r.ocorrencias}</TableCell>
                      <TableCell className="text-right">{r.quantidade.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{formatBRL(r.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Estratégias mais eficientes</CardTitle></CardHeader>
        <CardContent style={{ height: Math.max(240, estrategias.length * 46 + 60) }}>
          {loading ? <Skel /> : !estrategias.length ? <Vazio /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={estrategias} layout="vertical" margin={{ left: 20, right: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
                <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nome" width={170} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  formatter={(v: any) => formatBRL(Number(v))}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                />
                <Bar dataKey="valor" fill={COR_RECEITA} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="valor" position="right" fontSize={11} fill="var(--foreground)"
                    formatter={(v: any) => formatBRL(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ title, value, tone, hint }: { title: string; value: string; tone: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground truncate">{title}</div>
        <div className={`text-xl font-bold mt-1 ${tone}`}>{value}</div>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const Skel = () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
const Vazio = () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>;
