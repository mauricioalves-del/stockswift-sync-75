import { createFileRoute } from "@tanstack/react-router";
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
} from "recharts";
import type { ReactNode } from "react";

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

  const baixasQ = useQuery({
    queryKey: ["dash-baixas", from, to],
    queryFn: async () => {
      const fromTs = new Date(from + "T00:00:00").toISOString();
      const toTs = new Date(to + "T23:59:59").toISOString();
      const { data, error } = await supabase
        .from("baixa_operacional")
        .select("id, codigo_produto, descricao, id_local, motivo_baixa_id, valor_total, quantidade, data_solicitacao, solicitante_id, categoria")
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
        .select("valor_total, data_solicitacao")
        .gte("data_solicitacao", new Date(desde + "T00:00:00").toISOString())
        .limit(50000);
      return data ?? [];
    },
  });

  const view = useMemo(() => {
    const baixas = baixasQ.data ?? [];
    const motivos = motivosQ.data ?? [];
    const classifs = classifQ.data ?? [];
    const grupos = gruposQ.data ?? [];
    const profiles = profilesQ.data ?? [];
    const alertas = alertasQ.data ?? [];

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
    }).sort((a, b) => b.total - a.total).slice(0, 15);

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

    return {
      totalPrejuizo, motivoDestaqueNome, motivoDestaquePct, setorTop, grupoTop,
      kpiMotivos, rankingSKU, funil, grupoStack, setorStack, rankingSetor,
      tabelaMotivo, rankingSolic, motivosKeys,
    };
  }, [baixasQ.data, motivosQ.data, classifQ.data, gruposQ.data, profilesQ.data, alertasQ.data]);

  const mom = useMemo(() => {
    const rows = momQ.data ?? [];
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const k = monthKey(String(r.data_solicitacao));
      map.set(k, (map.get(k) ?? 0) + Number(r.valor_total || 0));
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ mes: fmtMonth(k), total: v }));
  }, [momQ.data]);

  const loading = baixasQ.isLoading || motivosQ.isLoading;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
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
        </div>
      </div>

      {/* Resumo executivo */}
      <Card>
        <CardContent className="p-5">
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <p className="text-base leading-relaxed">
              Prejuízo total de <strong className="text-destructive">{formatBRL(view.totalPrejuizo)}</strong> no período.{" "}
              <strong>{view.motivoDestaquePct.toFixed(1)}%</strong> concentrado em <strong>{view.motivoDestaqueNome}</strong>.{" "}
              Maior impacto no setor: <strong>{view.setorTop}</strong> e grupo: <strong>{view.grupoTop}</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPI cards por motivo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Acompanhamento por Motivo</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {view.kpiMotivos.map((m) => (
              <div key={m.id} className="rounded-md border overflow-hidden">
                <div className="h-1.5" style={{ background: m.cor }} />
                <div className="p-3">
                  <div className="text-xs text-muted-foreground truncate" title={m.nome}>{m.nome}</div>
                  <div className="text-lg font-bold tabular-nums">{formatBRL(m.valor)}</div>
                  {m.classificacao && (
                    <Badge className={`mt-1 text-[10px] ${CLASSIF_TONE[m.classificacao]}`} variant="outline">{m.classificacao}</Badge>
                  )}
                </div>
              </div>
            ))}
            {view.kpiMotivos.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground py-6 text-center">Sem baixas no período.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking SKU */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><PackageMinus className="size-4" /> Ranking de SKU — Top Baixas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rankingSKU.map((r, i) => (
                  <TableRow key={r.codigo}>
                    <TableCell className="text-xs">{i + 1}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.descricao}</div>
                      <div className="text-muted-foreground">{r.codigo}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{formatBRL(r.total)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={r.classif === "Investigar" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}>
                        {r.classif}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {view.rankingSKU.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Funil por Setor */}
        <Card>
          <CardHeader><CardTitle className="text-base">Apuração por Linha Operacional</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {view.funil.map((f, i) => {
                const max = view.funil[0]?.valor || 1;
                const pct = (f.valor / max) * 100;
                return (
                  <div key={f.nome} className="flex items-center gap-3">
                    <div className="w-32 text-xs truncate" title={f.nome}>{f.nome}</div>
                    <div className="flex-1 h-6 rounded bg-muted overflow-hidden relative">
                      <div className="h-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                      <div className="absolute inset-0 flex items-center px-2 text-xs font-medium tabular-nums">
                        {formatBRL(f.valor)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {view.funil.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">—</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barras horizontais empilhadas por Grupo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Apuração por Grupo de Produto</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(240, view.grupoStack.length * 42)}>
            <BarChart data={view.grupoStack} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis type="number" tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="grupo" width={140} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {view.motivosKeys.map((m) => (
                <Bar key={m.id} dataKey={m.nome} stackId="a" fill={m.cor} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Colunas empilhadas por Centro de Custo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Baixas por Centro de Custo</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={view.setorStack} margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatBRL(Number(v))} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {view.motivosKeys.map((m) => (
                <Bar key={m.id} dataKey={m.nome} stackId="a" fill={m.cor} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking por Setor */}
        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por Setor</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Alerta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rankingSetor.map((r) => (
                  <TableRow key={r.setor}>
                    <TableCell className="text-xs">{r.rank}</TableCell>
                    <TableCell className="text-xs">{r.setor}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{formatBRL(r.total)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={r.alerta ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}>
                        {r.alerta ? <><AlertTriangle className="size-3 mr-1" />Alerta</> : "Controle OK"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-xs font-semibold">Total</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatBRL(view.rankingSetor.reduce((s, r) => s + r.total, 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Tabela por Motivo */}
        <Card>
          <CardHeader><CardTitle className="text-base">Baixas por Motivo</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right w-16">%</TableHead>
                  <TableHead className="text-center">Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.tabelaMotivo.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.motivo}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{formatBRL(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.pct.toFixed(1)}%</TableCell>
                    <TableCell className="text-center">
                      {r.classificacao ? (
                        <Badge variant="outline" className={CLASSIF_TONE[r.classificacao]}>{r.classificacao}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="text-xs font-semibold">Total</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatBRL(view.tabelaMotivo.reduce((s, r) => s + r.total, 0))}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold">100%</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Ranking por Solicitante + MoM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por Solicitante</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rankingSolic.map((r, i) => (
                  <TableRow key={r.nome + i}>
                    <TableCell className="text-xs">{i + 1}</TableCell>
                    <TableCell className="text-xs">{r.nome}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{formatBRL(r.total)}</TableCell>
                  </TableRow>
                ))}
                {view.rankingSolic.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4" /> Tendência Mês a Mês (12m)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={mom} margin={{ top: 20, left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatBRL(Number(v))} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))">
                  <LabelList dataKey="total" position="top" formatter={(v: number) => formatBRL(v)} style={{ fontSize: 10 }} />
                  {mom.map((_, i) => <Cell key={i} fill="hsl(var(--primary))" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
