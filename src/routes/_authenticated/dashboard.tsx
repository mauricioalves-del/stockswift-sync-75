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
  Boxes, Target, TrendingUp, TrendingDown, Percent, DollarSign, CheckCircle2, ArrowUpRight, RotateCcw, Gauge, BadgeCheck,
} from "lucide-react";
import { formatBRL, formatNum } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileHome } from "@/components/app/MobileHome";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Inventário Cloud" }] }),
});

function Dashboard() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileHome />;
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [invRes, estRes, recRes, gpRes, famRes] = await Promise.all([
        supabase.from("inventario").select("id, status, acuracidade, divergencia, valor_divergencia, descricao, id_produto, id_local, data_contagem, usuario"),
        supabase.from("estoque_sistemico").select("id_produto, lote, quantidade"),
        supabase.from("recontagem").select("id, status"),
        supabase.from("grupo_produtos").select("codigo_produto, grupo"),
        supabase.from("familias").select("codigo_produto, familia"),
      ]);
      const inv = invRes.data ?? [];
      const est = estRes.data ?? [];
      const rec = recRes.data ?? [];
      const grupoMap = new Map<string, string>((gpRes.data ?? []).map((r) => [r.codigo_produto, r.grupo]));
      const famMap = new Map<string, string>((famRes.data ?? []).map((r) => [r.codigo_produto, r.familia]));
      const totalPlanejado = new Set(est.map((e) => `${e.id_produto}|${e.lote}`)).size || est.length;
      const totalContados = inv.length;
      const acurados = inv.filter((i) => i.acuracidade != null && i.acuracidade >= 97 && i.acuracidade <= 100).length;
      const aprovados = inv.filter((i) => i.status === "APROVADO").length;
      const emRecontagem = rec.filter((r) => r.status === "PENDENTE_RECONTAGEM" || r.status === "RECONTAGEM_OBRIGATORIA").length;
      const totalRecontagens = rec.length;
      const positivos = inv.filter((i) => (i.divergencia ?? 0) > 0).length;
      const negativos = inv.filter((i) => (i.divergencia ?? 0) < 0).length;
      const divFin = inv.reduce((s, i) => s + (Number(i.valor_divergencia) || 0), 0);
      const acuracidadeGeral = totalContados > 0 ? (acurados / totalContados) * 100 : 0;
      const acsValidas = inv.filter((i) => i.acuracidade != null).map((i) => Number(i.acuracidade));
      const acuracidadeMedia = acsValidas.length ? acsValidas.reduce((a, b) => a + b, 0) / acsValidas.length : 0;
      const taxaAprovacao = totalContados > 0 ? ((aprovados + acurados) / totalContados) * 100 : 0;
      const concluido = totalPlanejado > 0 ? (totalContados / totalPlanejado) * 100 : 0;

      const top10 = [...inv].sort((a, b) => (Number(b.valor_divergencia) || 0) - (Number(a.valor_divergencia) || 0))
        .slice(0, 10).map((i) => ({ nome: (i.descricao || i.id_produto).slice(0, 22), valor: Number(i.valor_divergencia) || 0 }));

      const porLocal: Record<string, number> = {};
      inv.forEach((i) => { porLocal[i.id_local || "—"] = (porLocal[i.id_local || "—"] || 0) + (Number(i.valor_divergencia) || 0); });
      const locais = Object.entries(porLocal).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);

      const porHora: Record<string, number> = {};
      inv.forEach((i) => {
        const d = new Date(i.data_contagem);
        const k = `${d.getHours().toString().padStart(2, "0")}h`;
        porHora[k] = (porHora[k] || 0) + 1;
      });
      const evolucao = Object.entries(porHora).sort().map(([hora, qtd]) => ({ hora, qtd }));

      const sortedTop = [...top10].sort((a, b) => b.valor - a.valor);
      const totalAbs = sortedTop.reduce((s, x) => s + x.valor, 0);
      let acc = 0;
      const pareto = sortedTop.map((x) => { acc += x.valor; return { ...x, acumulado: totalAbs ? (acc / totalAbs) * 100 : 0 }; });

      // ===== POR FAMÍLIA =====
      const skusPorFamilia: Record<string, Set<string>> = {};
      famMap.forEach((fam, cod) => { (skusPorFamilia[fam] = skusPorFamilia[fam] || new Set()).add(cod); });
      const invPorFamilia: Record<string, { acs: number[]; div: number; feitos: Set<string> }> = {};
      inv.forEach((i) => {
        const fam = famMap.get(i.id_produto);
        if (!fam) return;
        invPorFamilia[fam] = invPorFamilia[fam] || { acs: [], div: 0, feitos: new Set() };
        if (i.acuracidade != null) invPorFamilia[fam].acs.push(Number(i.acuracidade));
        invPorFamilia[fam].div += Number(i.valor_divergencia) || 0;
        invPorFamilia[fam].feitos.add(i.id_produto);
      });
      const familias = Object.keys(skusPorFamilia).map((fam) => {
        const total = skusPorFamilia[fam].size;
        const d = invPorFamilia[fam] || { acs: [], div: 0, feitos: new Set() };
        const feitos = Array.from(d.feitos).filter((c) => skusPorFamilia[fam].has(c)).length;
        const ac = d.acs.length ? d.acs.reduce((a, b) => a + b, 0) / d.acs.length : 0;
        return { familia: fam, total, feitos, pctConcluido: total ? (feitos / total) * 100 : 0, acuracidade: ac, divergencia: d.div };
      }).sort((a, b) => b.divergencia - a.divergencia);

      // ===== POR GRUPO =====
      const skusPorGrupo: Record<string, Set<string>> = {};
      grupoMap.forEach((g, cod) => { (skusPorGrupo[g] = skusPorGrupo[g] || new Set()).add(cod); });
      const invPorGrupo: Record<string, { acs: number[]; div: number; feitos: Set<string> }> = {};
      inv.forEach((i) => {
        const g = grupoMap.get(i.id_produto);
        if (!g) return;
        invPorGrupo[g] = invPorGrupo[g] || { acs: [], div: 0, feitos: new Set() };
        if (i.acuracidade != null) invPorGrupo[g].acs.push(Number(i.acuracidade));
        invPorGrupo[g].div += Number(i.valor_divergencia) || 0;
        invPorGrupo[g].feitos.add(i.id_produto);
      });
      const grupos = Object.keys(skusPorGrupo).map((g) => {
        const total = skusPorGrupo[g].size;
        const d = invPorGrupo[g] || { acs: [], div: 0, feitos: new Set() };
        const feitos = Array.from(d.feitos).filter((c) => skusPorGrupo[g].has(c)).length;
        const ac = d.acs.length ? d.acs.reduce((a, b) => a + b, 0) / d.acs.length : 0;
        return { grupo: g, total, feitos, pctConcluido: total ? (feitos / total) * 100 : 0, acuracidade: ac, divergencia: d.div };
      }).sort((a, b) => b.divergencia - a.divergencia);

      return {
        totalContados, acurados, aprovados, emRecontagem, totalRecontagens,
        positivos, negativos, divFin,
        acuracidadeGeral, acuracidadeMedia, taxaAprovacao, concluido, totalPlanejado,
        top10, locais, evolucao, pareto,
        familias, grupos,
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
      {/* Header institucional Mágio */}
      <div className="rounded-xl p-5 md:p-6 text-sidebar-foreground" style={{ background: "var(--gradient-amazon)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="size-12 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-gold)" }}>
            <BadgeCheck className="size-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <h1 className="text-2xl font-bold tracking-tight">Mágio Chocolates · Dashboard Executivo</h1>
            <p className="text-sm opacity-90 italic">"Controle, rastreabilidade e acuracidade inspirados na Amazônia."</p>
          </div>
        </div>
      </div>


      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi icon={Boxes} label="Itens Inventariados" value={formatNum(stats.totalContados)} />
        <Kpi icon={BadgeCheck} label="Itens Aprovados" value={formatNum(stats.aprovados)} tone="success" />
        <Kpi icon={RotateCcw} label="Em Recontagem" value={formatNum(stats.emRecontagem)} tone="destructive" />
        <Kpi icon={Gauge} label="Acuracidade Média" value={`${stats.acuracidadeMedia.toFixed(1)}%`} tone="info" />
        <Kpi icon={RotateCcw} label="Qtd. Recontagens" value={formatNum(stats.totalRecontagens)} tone="warning" />
        <Kpi icon={CheckCircle2} label="Taxa de Aprovação" value={`${stats.taxaAprovacao.toFixed(1)}%`} tone="success" />
        <Kpi icon={Target} label="Planejados" value={formatNum(stats.totalPlanejado)} sub={`${stats.concluido.toFixed(1)}% concluído`} />
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

      {/* Por Família */}
      {stats.familias.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Conclusão por Família</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats.familias.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="familia" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Bar dataKey="pctConcluido" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Acuracidade por Família</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats.familias.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="familia" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Bar dataKey="acuracidade" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Divergência Financeira por Família</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats.familias.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="familia" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="divergencia" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Indicadores por Família / Grupo */}
      {stats.familias.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Indicadores por Família</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase tracking-wider">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Família</th>
                  <th className="text-right py-2">SKUs</th>
                  <th className="text-right py-2">Acuracidade</th>
                  <th className="text-right py-2">Concluído</th>
                  <th className="text-right py-2">Divergência (R$)</th>
                </tr>
              </thead>
              <tbody>
                {stats.familias.map((f) => (
                  <tr key={f.familia} className="border-b border-border/40">
                    <td className="py-2">{f.familia}</td>
                    <td className="text-right tabular-nums">{f.feitos}/{f.total}</td>
                    <td className={cn("text-right tabular-nums font-medium", f.acuracidade >= 97 ? "text-success" : f.acuracidade >= 80 ? "text-warning-foreground" : "text-destructive")}>{f.acuracidade.toFixed(1)}%</td>
                    <td className={cn("text-right tabular-nums font-medium", f.pctConcluido === 100 ? "text-success" : f.pctConcluido >= 80 ? "text-warning-foreground" : "text-destructive")}>{f.pctConcluido.toFixed(0)}%</td>
                    <td className="text-right tabular-nums">{formatBRL(f.divergencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats.grupos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Indicadores por Grupo de Produto</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase tracking-wider">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Grupo</th>
                  <th className="text-right py-2">SKUs</th>
                  <th className="text-right py-2">Acuracidade</th>
                  <th className="text-right py-2">Concluído</th>
                  <th className="text-right py-2">Divergência (R$)</th>
                </tr>
              </thead>
              <tbody>
                {stats.grupos.map((g) => (
                  <tr key={g.grupo} className="border-b border-border/40">
                    <td className="py-2 font-medium">{g.grupo}</td>
                    <td className="text-right tabular-nums">{g.feitos}/{g.total}</td>
                    <td className={cn("text-right tabular-nums font-medium", g.acuracidade >= 97 ? "text-success" : g.acuracidade >= 80 ? "text-warning-foreground" : "text-destructive")}>{g.acuracidade.toFixed(1)}%</td>
                    <td className={cn("text-right tabular-nums font-medium", g.pctConcluido === 100 ? "text-success" : g.pctConcluido >= 80 ? "text-warning-foreground" : "text-destructive")}>{g.pctConcluido.toFixed(0)}%</td>
                    <td className="text-right tabular-nums">{formatBRL(g.divergencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
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
