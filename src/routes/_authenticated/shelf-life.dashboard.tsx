import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/inventory";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  calcularIndicadores, cruzarBaixasComCampanhas, valorRecuperadoCampanha,
  type BaixaCalc,
} from "@/lib/shelf-life";
import { useCampanhas, useTiposAcao } from "@/hooks/useShelfLife";

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

const COR_PERDA = "#E57373";
const COR_RECEITA = "#4FC3F7";
const COR_SAVING = "#81C784";

function isoDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtMonth(k: string) {
  const [y, m] = k.split("-");
  return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(m) - 1] ?? m}/${y.slice(2)}`;
}

function ShelfLifeDashboard() {
  const [de, setDe] = useState(isoDaysAgo(180));
  const [ate, setAte] = useState(todayISO());
  const tipos = useTiposAcao();
  const campanhasQ = useCampanhas();

  const baixasQ = useQuery({
    queryKey: ["shelf-baixas", de, ate],
    staleTime: 60_000,
    queryFn: async (): Promise<BaixaCalc[]> => {
      const [motivos, rows] = await Promise.all([
        (supabase as any).from("motivo_baixa").select("id, descricao"),
        fetchAll<any>((from, to) =>
          (supabase as any)
            .from("baixa_operacional")
            .select("id, codigo_produto, descricao, lote, quantidade, valor_total, custo_unitario, motivo_baixa_id, data_ocorrencia, data_solicitacao, status_fluxo")
            .range(from, to),
        ),
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
        }))
        .filter((b) => b.data >= de && b.data <= ate);
    },
  });

  const campanhasPeriodo = useMemo(
    () => (campanhasQ.data ?? []).filter((c) => (c.data_acao ?? "") >= de && (c.data_acao ?? "") <= ate),
    [campanhasQ.data, de, ate],
  );

  const motivosDeAcao = useMemo(
    () => new Set((tipos.data ?? []).map((t) => t.nome)),
    [tipos.data],
  );

  const linhas = useMemo(
    () => cruzarBaixasComCampanhas(baixasQ.data ?? [], campanhasQ.data ?? [], motivosDeAcao),
    [baixasQ.data, campanhasQ.data, motivosDeAcao],
  );

  const ind = useMemo(() => calcularIndicadores(linhas, campanhasPeriodo), [linhas, campanhasPeriodo]);

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
    const m = new Map<string, { nome: string; valor: number }>();
    campanhasPeriodo.filter((c) => c.status === "CONCLUIDA").forEach((c) => {
      const k = c.sku;
      const e = m.get(k) ?? { nome: c.descricao || c.sku, valor: 0 };
      e.valor += valorRecuperadoCampanha(c);
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor).slice(0, 10);
  }, [campanhasPeriodo]);

  const topPerda = useMemo(() => {
    const m = new Map<string, { nome: string; valor: number }>();
    linhas.forEach((l) => {
      if (l.perda <= 0) return;
      const k = l.baixa.codigo_produto;
      const e = m.get(k) ?? { nome: l.baixa.descricao || k, valor: 0 };
      e.valor += l.perda;
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor).slice(0, 10);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Shelf Life</h1>
          <p className="text-sm text-muted-foreground">Perda por vencimento × recuperação por ações de lote.</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Kpi title="Perda Evitada" value={formatBRL(ind.perdaEvitada)} tone="text-success" />
        <Kpi title="Receita Recuperada" value={formatBRL(ind.receitaRecuperada)} tone="text-info" />
        <Kpi title="ROI Operacional" value={ind.roi === null ? "—" : `${ind.roi.toFixed(0)}%`} tone="text-primary"
          hint={ind.roi === null ? "Informe o custo das ações concluídas" : `Custo: ${formatBRL(ind.custoAcoes)}`} />
        <Kpi title="Eficiência de Recuperação" value={ind.eficiencia === null ? "—" : `${ind.eficiencia.toFixed(1)}%`} tone="text-primary" />
        <Kpi title="Saving Recuperado" value={formatBRL(ind.savingRecuperado)} tone="text-success" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Perda no período (baixas por Vencimento sem cobertura)</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-bold text-destructive">{formatBRL(ind.perda)}</div></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Evolução Mensal</CardTitle></CardHeader>
          <CardContent className="h-[320px]">
            {loading ? <Skel /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mensal}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="Perda" stackId="a" fill={COR_PERDA} />
                  <Bar dataKey="Receita Recuperada" stackId="a" fill={COR_RECEITA} />
                  <Bar dataKey="Saving Recuperado" stackId="a" fill={COR_SAVING} />
                </BarChart>
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
                    {rosca.map((r) => <Cell key={r.name} fill={r.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankCard title="Top 10 Recuperados" rows={topRecuperados} color={COR_SAVING} />
        <RankCard title="Top 10 Perda" rows={topPerda} color={COR_PERDA} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Estratégias mais eficientes</CardTitle></CardHeader>
        <CardContent className="h-[300px]">
          {loading ? <Skel /> : !estrategias.length ? <Vazio /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={estrategias} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nome" width={150} fontSize={11} />
                <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                <Bar dataKey="valor" fill={COR_RECEITA} radius={[0, 4, 4, 0]} />
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

function RankCard({ title, rows, color }: { title: string; rows: { nome: string; valor: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.valor));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!rows.length && <Vazio />}
        {rows.map((r) => (
          <div key={r.nome} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="truncate max-w-[70%]">{r.nome}</span>
              <span className="font-medium">{formatBRL(r.valor)}</span>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full rounded" style={{ width: `${(r.valor / max) * 100}%`, background: color }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const Skel = () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
const Vazio = () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>;
