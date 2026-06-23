import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from "recharts";
import {
  Boxes, Target, TrendingUp, TrendingDown, Percent, DollarSign, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import { formatBRL, formatNum } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Inventário Cloud" }] }),
});

function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [invRes, estRes] = await Promise.all([
        supabase.from("inventario").select("id, status, acuracidade, divergencia, valor_divergencia, descricao, id_produto, id_local, data_contagem, usuario"),
        supabase.from("estoque_sistemico").select("id_produto, lote, quantidade"),
      ]);
      const inv = invRes.data ?? [];
      const est = estRes.data ?? [];
      const totalPlanejado = new Set(est.map((e) => `${e.id_produto}|${e.lote}`)).size || est.length;
      const totalContados = inv.length;
      const acurados = inv.filter((i) => i.acuracidade != null && i.acuracidade >= 97 && i.acuracidade <= 100).length;
      const positivos = inv.filter((i) => (i.divergencia ?? 0) > 0).length;
      const negativos = inv.filter((i) => (i.divergencia ?? 0) < 0).length;
      const divFin = inv.reduce((s, i) => s + (Number(i.valor_divergencia) || 0), 0);
      const acuracidadeGeral = totalContados > 0 ? (acurados / totalContados) * 100 : 0;
      const concluido = totalPlanejado > 0 ? (totalContados / totalPlanejado) * 100 : 0;

      // Top 10 divergências financeiras
      const top10 = [...inv]
        .sort((a, b) => (Number(b.valor_divergencia) || 0) - (Number(a.valor_divergencia) || 0))
        .slice(0, 10)
        .map((i) => ({ nome: (i.descricao || i.id_produto).slice(0, 22), valor: Number(i.valor_divergencia) || 0 }));

      // Por local (heatmap simples como barras)
      const porLocal: Record<string, number> = {};
      inv.forEach((i) => { porLocal[i.id_local || "—"] = (porLocal[i.id_local || "—"] || 0) + (Number(i.valor_divergencia) || 0); });
      const locais = Object.entries(porLocal).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);

      // Evolução por hora
      const porHora: Record<string, number> = {};
      inv.forEach((i) => {
        const d = new Date(i.data_contagem);
        const k = `${d.getHours().toString().padStart(2, "0")}h`;
        porHora[k] = (porHora[k] || 0) + 1;
      });
      const evolucao = Object.entries(porHora).sort().map(([hora, qtd]) => ({ hora, qtd }));

      // Pareto
      const sortedTop = [...top10].sort((a, b) => b.valor - a.valor);
      const totalAbs = sortedTop.reduce((s, x) => s + x.valor, 0);
      let acc = 0;
      const pareto = sortedTop.map((x) => {
        acc += x.valor;
        return { ...x, acumulado: totalAbs ? (acc / totalAbs) * 100 : 0 };
      });

      // Ranking operadores
      const porUser: Record<string, { qtd: number; div: number }> = {};
      inv.forEach((i) => {
        const k = i.usuario || "—";
        porUser[k] = porUser[k] || { qtd: 0, div: 0 };
        porUser[k].qtd += 1;
        porUser[k].div += Number(i.valor_divergencia) || 0;
      });

      return {
        totalContados, acurados, positivos, negativos, divFin,
        acuracidadeGeral, concluido, totalPlanejado,
        top10, locais, evolucao, pareto, porUser,
      };
    },
    refetchInterval: 15_000,
  });

  if (isLoading || !stats) return <div className="p-8 text-muted-foreground">Carregando dashboard...</div>;

  const COLORS = ["var(--success)", "var(--warning)", "var(--destructive)"];
  const rosca = [
    { name: "Acurados", value: stats.acurados },
    { name: "Positivos", value: stats.positivos },
    { name: "Negativos", value: stats.negativos },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Operacional</h1>
          <p className="text-sm text-muted-foreground">Visão executiva em tempo real</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi icon={Boxes} label="Itens Inventariados" value={formatNum(stats.totalContados)} />
        <Kpi icon={Target} label="Planejados" value={formatNum(stats.totalPlanejado)} sub={`${stats.concluido.toFixed(1)}% concluído`} />
        <Kpi icon={CheckCircle2} label="Acurados" value={formatNum(stats.acurados)} tone="success" />
        <Kpi icon={Percent} label="Acuracidade Geral" value={`${stats.acuracidadeGeral.toFixed(1)}%`} tone="success" />
        <Kpi icon={TrendingUp} label="Divergência Positiva" value={formatNum(stats.positivos)} tone="warning" />
        <Kpi icon={TrendingDown} label="Divergência Negativa" value={formatNum(stats.negativos)} tone="destructive" />
        <Kpi icon={DollarSign} label="Divergência Financeira" value={formatBRL(stats.divFin)} tone="destructive" />
        <Kpi icon={ArrowUpRight} label="Inventário Concluído" value={`${stats.concluido.toFixed(1)}%`} tone="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Distribuição de Contagens</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={rosca} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {rosca.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Top 10 Divergências Financeiras</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={stats.top10} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="valor" fill="var(--destructive)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Pareto — 80% das perdas</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={stats.pareto}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="valor" fill="var(--warning)" />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="var(--destructive)" strokeWidth={2} dot />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Divergência por Local</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={stats.locais}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="valor" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Evolução de Contagens por Hora</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={stats.evolucao}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hora" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="qtd" stroke="var(--success)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  tone?: "success" | "destructive" | "warning" | "info";
}) {
  const toneClass = tone
    ? tone === "success" ? "text-success bg-success/10"
    : tone === "destructive" ? "text-destructive bg-destructive/10"
    : tone === "warning" ? "text-warning-foreground bg-warning/30"
    : "text-info bg-info/10"
    : "text-primary bg-primary/10";
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("size-10 rounded-lg flex items-center justify-center", toneClass)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</div>
          <div className="text-xl font-bold leading-tight">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
