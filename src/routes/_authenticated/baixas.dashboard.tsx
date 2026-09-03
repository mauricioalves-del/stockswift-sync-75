import { createFileRoute } from "@tanstack/react-router";
import { ExportarHtmlButton } from "@/components/app/ExportarHtmlButton";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/inventory";
import { BarChart3, TrendingUp, AlertTriangle, PackageMinus } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell,
  ComposedChart, Line,
} from "recharts";
import type { ReactNode } from "react";
import { DetalheMotivoBaixasDialog, type DetalheMotivoCtx } from "@/components/baixas/DetalheMotivoBaixasDialog";


export const Route = createFileRoute("/_authenticated/baixas/dashboard")({
  component: BaixasDashboard,
  head: () => ({ meta: [{ title: "Dashboard Baixas Operacionais" }] }),
});

// Paleta BI consistente por motivo — cores vivas legíveis em fundo escuro
const PALETTE = [
  "#4FC3F7", "#F48FB1", "#81C784", "#FFB74D", "#BA68C8",
  "#E57373", "#4DD0E1", "#FFD54F", "#9575CD", "#4DB6AC",
  "#F06292", "#AED581", "#7986CB", "#DCE775", "#FF8A65",
];

type Classif = "Controlado" | "Operacional" | "Investimento";
const CLASSIF_TONE: Record<Classif, string> = {
  Controlado: "bg-success/15 text-success",
  Operacional: "bg-destructive/15 text-destructive",
  Investimento: "bg-info/15 text-info",
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function monthKey(iso: string) { return iso.slice(0, 7); }
function fmtMonth(k: string) {
  const [y, m] = k.split("-");
  const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return nomes[Number(m) - 1] ?? k;
}
function fmtMil(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} Mi`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)} Mil`;
  return `R$ ${v.toFixed(0)}`;
}

// Painel padrão BI: fundo escuro, título centralizado no topo
function BiPanel({ title, legend, children, className = "" }: { title: string; legend?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/40 bg-[hsl(220_18%_12%)] text-slate-100 shadow-lg overflow-hidden ${className}`}>
      <div className="px-4 pt-3 pb-2 text-center">
        <div className="text-sm font-semibold tracking-wide">{title}</div>
      </div>
      {legend && (
        <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
          {legend}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function MotivoLegend({ items }: { items: { id: string; nome: string; cor: string }[] }) {
  return (
    <>
      <span className="font-semibold text-slate-400 mr-1">Motivo</span>
      {items.map((m) => (
        <span key={m.id} className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full" style={{ background: m.cor }} />
          <span className="truncate max-w-[110px]">{m.nome}</span>
        </span>
      ))}
    </>
  );
}

function BaixasDashboard() {
  const [from, setFrom] = useState<string>(isoDaysAgo(60));
  const [to, setTo] = useState<string>(todayISO());
  const [almoxFilter, setAlmoxFilter] = useState<string>("__all__");
  const [motivoFilter, setMotivoFilter] = useState<string>("__all__");
  const [detalheMotivo, setDetalheMotivo] = useState<DetalheMotivoCtx | null>(null);



  const baixasQ = useQuery({
    queryKey: ["dash-baixas", from, to],
    queryFn: async () => {
      const fromTs = new Date(from + "T00:00:00").toISOString();
      const toTs = new Date(to + "T23:59:59").toISOString();
      const { data, error } = await supabase
        .from("baixa_operacional")
        .select("id, codigo_produto, descricao, id_local, motivo_baixa_id, valor_total, quantidade, data_solicitacao, solicitante_id, categoria")
        .eq("status_fluxo", "APROVADA")
        .gte("data_solicitacao", fromTs)
        .lte("data_solicitacao", toTs)
        .limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const motivosQ = useQuery({
    queryKey: ["motivos-baixa-all-dash"],
    queryFn: async () => (await supabase.from("motivo_baixa").select("id, descricao")).data ?? [],
  });

  const classifQ = useQuery({
    queryKey: ["mcp-all"],
    queryFn: async () => (await supabase.from("motivo_classificacao_prejuizo" as never).select("motivo_baixa_id, classificacao")).data as unknown as { motivo_baixa_id: string; classificacao: Classif }[] ?? [],
  });

  const gruposQ = useQuery({
    queryKey: ["grupo-produtos-dash"],
    queryFn: async () => (await supabase.from("grupo_produtos").select("codigo_produto, grupo")).data ?? [],
  });

  const profilesQ = useQuery({
    queryKey: ["profiles-dash"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome, email")).data ?? [],
  });

  const alertasQ = useQuery({
    queryKey: ["parametros-alerta"],
    queryFn: async () => (await supabase.from("parametros_alerta_baixas" as never).select("escopo, chave, limite_valor").eq("ativo", true)).data as unknown as { escopo: "Setor" | "SKU"; chave: string | null; limite_valor: number }[] ?? [],
  });

  // Tendência MoM precisa buscar TUDO (fora do filtro) para os 12 últimos meses
  const momQ = useQuery({
    queryKey: ["dash-baixas-mom"],
    queryFn: async () => {
      const desde = isoDaysAgo(365);
      const { data } = await supabase
        .from("baixa_operacional")
        .select("valor_total, data_solicitacao, motivo_baixa_id")
        .eq("status_fluxo", "APROVADA")
        .gte("data_solicitacao", new Date(desde + "T00:00:00").toISOString())
        .limit(50000);
      return data ?? [];
    },
  });

  const view = useMemo(() => {
    const baixasRaw = baixasQ.data ?? [];
    const motivos = motivosQ.data ?? [];
    const classifs = classifQ.data ?? [];
    const grupos = gruposQ.data ?? [];
    const profiles = profilesQ.data ?? [];
    const alertas = alertasQ.data ?? [];

    const baixas = baixasRaw.filter((b) =>
      (almoxFilter === "__all__" || (b.id_local ?? "—") === almoxFilter) &&
      (motivoFilter === "__all__" || b.motivo_baixa_id === motivoFilter)
    );

    const almoxOptions = [...new Set(baixasRaw.map((b) => b.id_local ?? "—"))].sort();
    const motivoOptions = [...new Set(baixasRaw.map((b) => b.motivo_baixa_id).filter(Boolean))] as string[];


    const motivoNome = new Map(motivos.map((m) => [m.id, m.descricao]));
    const motivoClassif = new Map(classifs.map((c) => [c.motivo_baixa_id, c.classificacao]));
    const grupoDe = new Map(grupos.map((g) => [g.codigo_produto, g.grupo]));
    const nomeUsuario = new Map(profiles.map((p) => [p.id, p.nome || p.email || p.id.slice(0, 8)]));

    // Cor estável por motivo
    const motivosOrdenados = [...new Set(baixas.map((b) => b.motivo_baixa_id).filter(Boolean))] as string[];
    const corMotivo = new Map<string, string>();
    motivosOrdenados.forEach((id, i) => corMotivo.set(id, PALETTE[i % PALETTE.length]));

    // Limites (usa o global — chave IS NULL — quando não há setor específico)
    const limSetor = alertas.find((a) => a.escopo === "Setor" && !a.chave)?.limite_valor ?? Infinity;
    const limSKU = alertas.find((a) => a.escopo === "SKU" && !a.chave)?.limite_valor ?? Infinity;

    const totalPrejuizo = baixas.reduce((s, b) => s + Number(b.valor_total || 0), 0);

    // Motivo destaque (maior participação entre "Operacional")
    const porMotivoVal = new Map<string, number>();
    baixas.forEach((b) => {
      const id = b.motivo_baixa_id;
      if (!id) return;
      porMotivoVal.set(id, (porMotivoVal.get(id) ?? 0) + Number(b.valor_total || 0));
    });
    const opEntries = [...porMotivoVal.entries()].filter(([id]) => motivoClassif.get(id) === "Operacional");
    const motivoDestaque = opEntries.sort((a, b) => b[1] - a[1])[0];
    const motivoDestaqueNome = motivoDestaque ? motivoNome.get(motivoDestaque[0]) ?? "—" : "—";
    const motivoDestaquePct = motivoDestaque && totalPrejuizo > 0 ? (motivoDestaque[1] / totalPrejuizo) * 100 : 0;

    // Setor top e grupo top
    const porSetor = new Map<string, number>();
    baixas.forEach((b) => {
      const k = b.id_local || "—";
      porSetor.set(k, (porSetor.get(k) ?? 0) + Number(b.valor_total || 0));
    });
    const setorTop = [...porSetor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const porGrupo = new Map<string, number>();
    baixas.forEach((b) => {
      const g = grupoDe.get(b.codigo_produto) || b.categoria || "Sem grupo";
      porGrupo.set(g, (porGrupo.get(g) ?? 0) + Number(b.valor_total || 0));
    });
    const grupoTop = [...porGrupo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // KPIs por motivo
    const kpiMotivos = [...porMotivoVal.entries()].map(([id, v]) => ({
      id,
      nome: motivoNome.get(id) ?? "—",
      valor: v,
      cor: corMotivo.get(id) || PALETTE[0],
      classificacao: motivoClassif.get(id) as Classif | undefined,
    })).sort((a, b) => b.valor - a.valor);

    // Ranking SKU
    const porSKU = new Map<string, { codigo: string; descricao: string; total: number; motivoTopId?: string }>();
    baixas.forEach((b) => {
      const key = b.codigo_produto;
      const cur = porSKU.get(key) ?? { codigo: b.codigo_produto, descricao: b.descricao, total: 0 };
      cur.total += Number(b.valor_total || 0);
      porSKU.set(key, cur);
    });
    // Motivo predominante por SKU
    const motivoTopSKU = new Map<string, string>();
    const acumSKUMotivo = new Map<string, Map<string, number>>();
    baixas.forEach((b) => {
      if (!b.motivo_baixa_id) return;
      const m = acumSKUMotivo.get(b.codigo_produto) ?? new Map();
      m.set(b.motivo_baixa_id, (m.get(b.motivo_baixa_id) ?? 0) + Number(b.valor_total || 0));
      acumSKUMotivo.set(b.codigo_produto, m);
    });
    acumSKUMotivo.forEach((m, sku) => {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) motivoTopSKU.set(sku, top[0]);
    });
    const rankingSKU = [...porSKU.values()].map((r) => {
      const motTop = motivoTopSKU.get(r.codigo);
      const cls = motTop ? motivoClassif.get(motTop) : undefined;
      const investigar = r.total > limSKU || cls === "Operacional";
      return { ...r, classif: investigar ? "Investigar" : "Controlado" as const };
    }).sort((a, b) => b.total - a.total).slice(0, 10);

    // Funil por setor
    const funil = [...porSetor.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);

    // Barras empilhadas por Grupo × Motivo
    const gruposSet = [...new Set(baixas.map((b) => grupoDe.get(b.codigo_produto) || b.categoria || "Sem grupo"))];
    const grupoStack = gruposSet.map((g) => {
      const row: Record<string, unknown> = { grupo: g };
      motivosOrdenados.forEach((mid) => {
        row[motivoNome.get(mid) ?? mid] = 0;
      });
      return row;
    });
    baixas.forEach((b) => {
      const g = grupoDe.get(b.codigo_produto) || b.categoria || "Sem grupo";
      const rowIdx = gruposSet.indexOf(g);
      if (rowIdx < 0 || !b.motivo_baixa_id) return;
      const nome = motivoNome.get(b.motivo_baixa_id) ?? b.motivo_baixa_id;
      grupoStack[rowIdx][nome] = (Number(grupoStack[rowIdx][nome]) || 0) + Number(b.valor_total || 0);
    });

    // Colunas empilhadas por Centro de Custo (id_local) × motivo
    const setoresSet = [...porSetor.keys()].sort((a, b) => (porSetor.get(b)! - porSetor.get(a)!));
    const setorStack = setoresSet.map((s) => {
      const row: Record<string, unknown> = { setor: s };
      motivosOrdenados.forEach((mid) => { row[motivoNome.get(mid) ?? mid] = 0; });
      return row;
    });
    baixas.forEach((b) => {
      const s = b.id_local || "—";
      const idx = setoresSet.indexOf(s);
      if (idx < 0 || !b.motivo_baixa_id) return;
      const nome = motivoNome.get(b.motivo_baixa_id) ?? b.motivo_baixa_id;
      setorStack[idx][nome] = (Number(setorStack[idx][nome]) || 0) + Number(b.valor_total || 0);
    });

    // Ranking por setor com alerta
    const rankingSetor = [...porSetor.entries()].map(([setor, total], i) => ({
      rank: i + 1,
      setor,
      total,
      alerta: total > limSetor,
    })).sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, rank: i + 1 }));

    // Tabela por motivo
    const totMotivosSum = [...porMotivoVal.values()].reduce((s, v) => s + v, 0) || 1;
    const tabelaMotivo = [...porMotivoVal.entries()].map(([id, v]) => ({
      id,
      motivo: motivoNome.get(id) ?? "—",
      total: v,
      pct: (v / totMotivosSum) * 100,
      classificacao: motivoClassif.get(id) as Classif | undefined,
    })).sort((a, b) => b.total - a.total);

    // Ranking solicitante
    const porSolicitante = new Map<string, number>();
    baixas.forEach((b) => {
      const k = b.solicitante_id ?? "—";
      porSolicitante.set(k, (porSolicitante.get(k) ?? 0) + Number(b.valor_total || 0));
    });
    const rankingSolic = [...porSolicitante.entries()]
      .map(([id, total]) => ({ nome: nomeUsuario.get(id) ?? id.slice(0, 8), total }))
      .sort((a, b) => b.total - a.total).slice(0, 15);

    // Chaves de motivos (para render dos <Bar dataKey>)
    const motivosKeys = motivosOrdenados.map((id) => ({
      id, nome: motivoNome.get(id) ?? id, cor: corMotivo.get(id) || PALETTE[0],
    }));

    const almoxList = almoxOptions;
    const motivoList = motivoOptions.map((id) => ({ id, nome: motivoNome.get(id) ?? id }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      totalPrejuizo, motivoDestaqueNome, motivoDestaquePct, setorTop, grupoTop,
      kpiMotivos, rankingSKU, funil, grupoStack, setorStack, rankingSetor,
      tabelaMotivo, rankingSolic, motivosKeys,
      almoxList, motivoList,
    };
  }, [baixasQ.data, motivosQ.data, classifQ.data, gruposQ.data, profilesQ.data, alertasQ.data, almoxFilter, motivoFilter]);


  const mom = useMemo(() => {
    const rows = momQ.data ?? [];
    const nomeMotivo = new Map((motivosQ.data ?? []).map((m: any) => [m.id, m.descricao as string]));

    // Total por mês e por motivo
    const porMes = new Map<string, Map<string, number>>();
    const totalMotivo = new Map<string, number>();
    rows.forEach((r: any) => {
      const k = monthKey(String(r.data_solicitacao));
      const nome = (r.motivo_baixa_id ? nomeMotivo.get(r.motivo_baixa_id) : null) ?? "Sem motivo";
      const v = Number(r.valor_total || 0);
      const m = porMes.get(k) ?? new Map<string, number>();
      m.set(nome, (m.get(nome) ?? 0) + v);
      porMes.set(k, m);
      totalMotivo.set(nome, (totalMotivo.get(nome) ?? 0) + v);
    });

    const motivos = [...totalMotivo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome], i) => ({ nome, cor: PALETTE[i % PALETTE.length] }));

    const arr = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => {
      const row: any = { mes: fmtMonth(k), total: 0 };
      motivos.forEach(({ nome }) => {
        const v = m.get(nome) ?? 0;
        row[nome] = v;
        row.total += v;
      });
      return row;
    });

    const data = arr.map((r, i) => {
      const prev = i > 0 ? arr[i - 1].total : 0;
      const variacaoPct = i === 0 ? null : prev === 0 ? (r.total > 0 ? 100 : 0) : ((r.total - prev) / prev) * 100;
      return { ...r, variacaoPct };
    });

    return { data, motivos };
  }, [momQ.data, motivosQ.data]);


  const loading = baixasQ.isLoading || motivosQ.isLoading;

  return (
    <div className="w-full space-y-4" id="dash-baixas">
      <div className="flex justify-end" data-export-hide>
        <ExportarHtmlButton
          targetId="dash-baixas"
          titulo="Dashboard Baixas Operacionais"
          filtros={[
            { label: "Período", valor: `${from} a ${to}` },
            { label: "Almoxarifado", valor: almoxFilter === "__all__" ? "Todos" : almoxFilter },
            { label: "Motivo", valor: motivoFilter === "__all__" ? "Todos" : motivoFilter },
          ]}
        />
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="size-6" /> Dashboard Baixas Operacionais
          </h1>
          <p className="text-sm text-muted-foreground">Análise executiva de prejuízo por motivo, setor, grupo e solicitante.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFrom(isoDaysAgo(30)); setTo(todayISO()); }}>30d</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(isoDaysAgo(60)); setTo(todayISO()); }}>60d</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(isoDaysAgo(90)); setTo(todayISO()); }}>90d</Button>
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <select
              value={almoxFilter}
              onChange={(e) => setAlmoxFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm w-48"
            >
              <option value="__all__">Todos</option>
              {view.almoxList.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <select
              value={motivoFilter}
              onChange={(e) => setMotivoFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm w-48"
            >
              <option value="__all__">Todos</option>
              {view.motivoList.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
          {(almoxFilter !== "__all__" || motivoFilter !== "__all__") && (
            <Button variant="ghost" size="sm" onClick={() => { setAlmoxFilter("__all__"); setMotivoFilter("__all__"); }}>Limpar</Button>
          )}
        </div>
      </div>

      {/* Resumo executivo — barra escura full width */}
      <div className="rounded-xl border border-border/40 bg-[hsl(220_18%_10%)] text-slate-100 px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Resumo Executivo</div>
        {loading ? (

          <div className="text-sm text-slate-400">Carregando…</div>
        ) : (
          <p className="text-lg font-semibold leading-snug">
            Prejuízo total de <span className="text-white">{formatBRL(view.totalPrejuizo)}</span> no período.{" "}
            <span className="text-white">{view.motivoDestaquePct.toFixed(1)}%</span> concentrado em{" "}
            <span className="text-white">{view.motivoDestaqueNome}</span>. Maior impacto no setor:{" "}
            <span className="text-white">{view.setorTop}</span> e grupo:{" "}
            <span className="text-white">{view.grupoTop}</span>.
          </p>
        )}
      </div>

      {/* Painel de Acompanhamento — tiles coloridos proporcionais ao valor */}
      <BiPanel title="Painel de Acompanhamento" legend={<MotivoLegend items={view.motivosKeys} />}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-2 items-end min-h-[180px]">
          {view.kpiMotivos.map((m) => {
            const max = view.kpiMotivos[0]?.valor || 1;
            const h = Math.max(28, Math.round((m.valor / max) * 140));
            return (
              <div key={m.id} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className="w-full rounded-sm flex items-start justify-center pt-1 text-[11px] font-semibold text-slate-900 tabular-nums cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/60"
                  style={{ background: m.cor, height: h }}
                  title={`${m.nome}: ${formatBRL(m.valor)} — clique para ver os produtos`}
                  onClick={() =>
                    setDetalheMotivo({
                      motivoId: m.id,
                      motivoNome: m.nome,
                      fromISO: new Date(from + "T00:00:00").toISOString(),
                      toISO: new Date(to + "T23:59:59").toISOString(),
                      almoxFilter,
                    })
                  }
                >
                  {m.valor > 0 ? fmtMil(m.valor).replace("R$ ", "") : ""}
                </button>
                <div className="text-[10px] text-slate-300 text-center leading-tight line-clamp-2 min-h-[24px]" title={m.nome}>
                  {m.nome}
                </div>
              </div>
            );
          })}

          {view.kpiMotivos.length === 0 && (
            <div className="col-span-full text-sm text-slate-400 py-6 text-center">Sem baixas no período.</div>
          )}
        </div>
      </BiPanel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ranking SKU */}
        <BiPanel title="Ranking de SKU — Top 10 Baixas" className="lg:col-span-1">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="text-left py-1.5 pr-2">Ranking</th>
                  <th className="text-left py-1.5">Descrição</th>
                  <th className="text-right py-1.5 px-2">Total Baixas</th>
                  <th className="text-center py-1.5">Classif.</th>
                </tr>
              </thead>
              <tbody>
                {view.rankingSKU.map((r, i) => (
                  <tr key={r.codigo} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                    <td className="py-1.5">
                      <div className="font-medium text-slate-100">{r.codigo} - {r.descricao}</div>
                    </td>
                    <td className="text-right tabular-nums py-1.5 px-2">{formatBRL(r.total)}</td>
                    <td className="text-center py-1.5">
                      <Badge variant="outline" className={r.classif === "Investigar" ? "bg-destructive/20 text-destructive border-destructive/40" : "bg-success/20 text-success border-success/40"}>
                        {r.classif === "Investigar" ? "Investimento" : "Controlado"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {view.rankingSKU.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">—</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-600">
                  <td className="py-1.5 font-semibold" colSpan={2}>Total</td>
                  <td className="text-right tabular-nums font-semibold py-1.5 px-2">
                    {formatBRL(view.rankingSKU.reduce((s, r) => s + r.total, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </BiPanel>

        {/* Funil por Setor */}
        <BiPanel title="Apuração por Linha Operacional" className="lg:col-span-1">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={view.funil} margin={{ top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "#cbd5e1" }} />
              <YAxis tickFormatter={(v) => fmtMil(Number(v))} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} formatter={(v: number) => formatBRL(v)} />
              <Bar dataKey="valor" fill="#4FC3F7" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="valor" position="top" formatter={(v: number) => v.toFixed(0)} style={{ fontSize: 10, fill: "#e2e8f0" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </BiPanel>

        {/* Barras horizontais empilhadas por Grupo */}
        <BiPanel title="Apuração por Grupo de Produto" legend={<MotivoLegend items={view.motivosKeys.slice(0, 6)} />} className="lg:col-span-1">
          <ResponsiveContainer width="100%" height={Math.max(240, view.grupoStack.length * 40)}>
            <BarChart data={view.grupoStack} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis type="number" tickFormatter={(v) => fmtMil(Number(v))} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
              <YAxis type="category" dataKey="grupo" width={110} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} formatter={(v: number) => formatBRL(v)} />
              {view.motivosKeys.map((m) => (
                <Bar key={m.id} dataKey={m.nome} stackId="a" fill={m.cor} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </BiPanel>
      </div>

      {/* Colunas empilhadas por Centro de Custo */}
      <BiPanel title="Baixas por Centro de Custo" legend={<MotivoLegend items={view.motivosKeys} />}>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={view.setorStack} margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
            <XAxis dataKey="setor" tick={{ fontSize: 11, fill: "#cbd5e1" }} />
            <YAxis tickFormatter={(v) => fmtMil(Number(v))} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} formatter={(v: number) => formatBRL(v)} />
            {view.motivosKeys.map((m) => (
              <Bar key={m.id} dataKey={m.nome} stackId="a" fill={m.cor} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </BiPanel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ranking por Setor */}
        <BiPanel title="Ranking por Setor">
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-slate-700">
              <tr>
                <th className="text-left py-1.5">Rank<br />Setor</th>
                <th className="text-left py-1.5">Setor</th>
                <th className="text-right py-1.5">Total Baixas</th>
                <th className="text-center py-1.5">Alerta Prejuízo</th>
              </tr>
            </thead>
            <tbody>
              {view.rankingSetor.map((r) => (
                <tr key={r.setor} className="border-b border-slate-800/60">
                  <td className="py-1.5 tabular-nums">{r.rank}</td>
                  <td className="py-1.5">{r.setor}</td>
                  <td className="text-right tabular-nums py-1.5">{formatBRL(r.total)}</td>
                  <td className="text-center py-1.5">
                    <Badge variant="outline" className={r.alerta ? "bg-destructive/20 text-destructive border-destructive/40" : "bg-success/20 text-success border-success/40"}>
                      {r.alerta ? <><AlertTriangle className="size-3 mr-1" />Alerta</> : "Controle OK"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600">
                <td colSpan={2} className="text-xs font-semibold py-1.5">{view.rankingSetor.length}</td>
                <td className="text-right text-xs font-semibold tabular-nums py-1.5">
                  {formatBRL(view.rankingSetor.reduce((s, r) => s + r.total, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </BiPanel>

        {/* Tabela por Motivo */}
        <BiPanel title="Baixas por Motivo">
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-slate-700">
              <tr>
                <th className="text-left py-1.5">Motivo</th>
                <th className="text-right py-1.5">Total por Motivo</th>
                <th className="text-right py-1.5 w-14">%</th>
                <th className="text-center py-1.5">Classif. Prejuízo</th>
              </tr>
            </thead>
            <tbody>
              {view.tabelaMotivo.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60">
                  <td className="py-1.5">{r.motivo}</td>
                  <td className="text-right tabular-nums py-1.5">{formatBRL(r.total)}</td>
                  <td className="text-right tabular-nums py-1.5">{r.pct.toFixed(2)}%</td>
                  <td className="text-center py-1.5">
                    {r.classificacao ? (
                      <Badge variant="outline" className={CLASSIF_TONE[r.classificacao]}>{r.classificacao}</Badge>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600">
                <td className="text-xs font-semibold py-1.5">Total</td>
                <td className="text-right text-xs font-semibold tabular-nums py-1.5">
                  {formatBRL(view.tabelaMotivo.reduce((s, r) => s + r.total, 0))}
                </td>
                <td className="text-right text-xs font-semibold py-1.5">100,00%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </BiPanel>

        {/* Ranking por Solicitante */}
        <BiPanel title="Ranking por Solicitante">
          <table className="w-full text-xs">
            <thead className="text-slate-400 border-b border-slate-700">
              <tr>
                <th className="text-left py-1.5">Rank<br />Solicitante</th>
                <th className="text-left py-1.5">Solicitante</th>
                <th className="text-right py-1.5">Total por Solicitante</th>
              </tr>
            </thead>
            <tbody>
              {view.rankingSolic.map((r, i) => (
                <tr key={r.nome + i} className="border-b border-slate-800/60">
                  <td className="py-1.5 tabular-nums">{i + 1}</td>
                  <td className="py-1.5">{r.nome}</td>
                  <td className="text-right tabular-nums py-1.5">{formatBRL(r.total)}</td>
                </tr>
              ))}
              {view.rankingSolic.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-6">—</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600">
                <td colSpan={2} className="py-1.5 font-semibold">{view.rankingSolic.length}</td>
                <td className="text-right tabular-nums font-semibold py-1.5">
                  {formatBRL(view.rankingSolic.reduce((s, r) => s + r.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </BiPanel>
      </div>

      {/* MoM — colunas de total + linha de variação % vs mês anterior */}
      <BiPanel title="MoM — Mês vs Mês Anterior">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={mom.data} margin={{ top: 26, left: 30, right: 40, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#cbd5e1" }} label={{ value: "Mês", position: "insideBottom", offset: -4, fill: "#94a3b8", fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={(v) => fmtMil(Number(v))} tick={{ fontSize: 11, fill: "#cbd5e1" }} label={{ value: "Total Baixas (R$ Mil)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#cbd5e1" }} label={{ value: "Variação % MoM", angle: 90, position: "insideRight", fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
              formatter={(v: number, name: string) => {
                if (name === "Variação %") return v == null ? ["—", name] : [`${v.toFixed(1)}%`, name];
                if (!v) return [null as any, null as any];
                return [formatBRL(v), name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
            {mom.motivos.map((m, i) => (
              <Bar
                key={m.nome}
                yAxisId="left"
                dataKey={m.nome}
                name={m.nome}
                stackId="motivos"
                fill={m.cor}
                radius={i === mom.motivos.length - 1 ? [3, 3, 0, 0] : undefined}
              >
                {i === mom.motivos.length - 1 && (
                  <LabelList dataKey="total" position="top" formatter={(v: number) => fmtMil(v)} style={{ fontSize: 10, fill: "#e2e8f0" }} />
                )}
              </Bar>
            ))}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="variacaoPct"
              name="Variação %"
              stroke="#FFB74D"
              strokeWidth={2}
              connectNulls
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.variacaoPct == null) return <g />;
                const up = payload.variacaoPct >= 0;
                return <circle cx={cx} cy={cy} r={4} fill={up ? "#E57373" : "#81C784"} stroke="#0f172a" strokeWidth={1} />;
              }}
            >
              <LabelList
                dataKey="variacaoPct"
                position="top"
                formatter={(v: number) => (v == null ? "" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`)}
                style={{ fontSize: 10, fill: "#e2e8f0" }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2">
          Barras empilhadas por motivo de baixa. Linha indica evolução (▲ vermelho = aumento de baixas / involução) ou involução (▼ verde = redução / evolução positiva) em pontos percentuais vs mês anterior.
        </p>
      </BiPanel>

      <DetalheMotivoBaixasDialog ctx={detalheMotivo} onOpenChange={(o) => !o && setDetalheMotivo(null)} />

      {/* Ícone TrendingUp usado como marcador visual (não remover) */}
      <div className="hidden"><TrendingUp /></div>

    </div>
  );
}


