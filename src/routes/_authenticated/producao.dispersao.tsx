import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend,
  ScatterChart, Scatter, Cell, ZAxis,
} from "recharts";
import {
  percentualDispersao, classificar, badgeCor, labelClass, fmtBRL, labelMes, QUADRANTES, labelQuadrante,
  CAUSAS, STATUS_ACAO, FAIXAS_DEFAULT, type Faixas, type Quadrante,
} from "@/lib/dispersao";
import { ImportarDispersaoDialog } from "@/components/producao/ImportarDispersaoDialog";
import { AlertCircle, Plus, Search, Settings2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/producao/dispersao")({
  component: DispersaoPage,
  head: () => ({ meta: [
    { title: "Dispersão de Lote — Produção" },
    { name: "description", content: "Análise de dispersão de consumo real vs. Ficha Técnica por Ordem de Produção." },
  ] }),
});

type Impacto = {
  id: string; ano_mes: string; dt_producao: string | null; numero_op: string;
  sku_produto_final: string | null; desc_prod: string | null;
  material: string; desc_material: string | null; um: string | null;
  qtd_consumo: number; qtd_previsto: number; qtd_dif: number;
  custo_unit_medio: number | null; impacto_rs: number | null;
  tipo_desvio: "ok" | "perda" | "economia"; tem_furo: boolean;
};

const SEM_DATA = "sem-data";

/** Data de referência da produção (campo "Data"). Só aceita ano_mes plausível como fallback. */
function refData(r: { dt_producao: string | null; ano_mes: string | null }): string | null {
  if (r.dt_producao) return String(r.dt_producao).slice(0, 10);
  const am = String(r.ano_mes ?? "");
  const m = /^(\d{4})-(\d{2})$/.exec(am);
  if (m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${am}-01`;
  return null;
}

function DispersaoPage() {
  const { role, isAdmin } = useRole();
  const isCoord = role === "COORDENADOR_CONTROLE";
  const canImport = isAdmin || isCoord;
  const [tab, setTab] = useState("visao");
  const [anoMes, setAnoMes] = useState<string>("todos");
  const [dtDe, setDtDe] = useState<string>("");
  const [dtAte, setDtAte] = useState<string>("");
  const [granul, setGranul] = useState<"dia" | "mes" | "ano">("mes");
  const [material, setMaterial] = useState<string>("");
  const [produto, setProduto] = useState<string>("");
  const [linha, setLinha] = useState<string>("todas");
  const [classFilter, setClassFilter] = useState<string>("todas");


  const paramsQ = useQuery({
    queryKey: ["dispersao", "faixas"],
    queryFn: async (): Promise<Faixas & { freqOps: number; impactoRs: number }> => {
      const { data } = await (supabase as any).from("parametros_dispersao").select("*").maybeSingle();
      if (!data) return { ...FAIXAS_DEFAULT, freqOps: 5, impactoRs: 150 };
      return {
        atencao: Number(data.limite_atencao_pct),
        critico: Number(data.limite_critico_pct),
        freqOps: Number(data.limite_freq_ops ?? 5),
        impactoRs: Number(data.limite_impacto_rs ?? 150),
      };
    },
  });
  const faixas: Faixas = paramsQ.data ?? FAIXAS_DEFAULT;
  const limFreq = paramsQ.data?.freqOps ?? 5;
  const limImpacto = paramsQ.data?.impactoRs ?? 150;

  const impactoQ = useQuery({
    queryKey: ["dispersao", "v-impacto"],
    queryFn: async (): Promise<Impacto[]> => {
      const { data, error } = await (supabase as any).from("v_impacto_consumo")
        .select("id, ano_mes, dt_producao, numero_op, sku_produto_final, desc_prod, material, desc_material, um, qtd_consumo, qtd_previsto, qtd_dif, custo_unit_medio, impacto_rs, tipo_desvio, tem_furo")
        .order("dt_producao", { ascending: false, nullsFirst: false }).limit(20000);
      if (error) throw error;
      return (data ?? []) as Impacto[];
    },
  });

  const origemQ = useQuery({
    queryKey: ["dispersao", "origem-item"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await (supabase as any).from("ficha_tecnica_bom").select("id_item, linha_origem");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as any[]) {
        if (r.linha_origem && !map.has(r.id_item)) map.set(r.id_item, r.linha_origem);
      }
      return map;
    },
  });

  const acoesQ = useQuery({
    queryKey: ["dispersao", "acoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("dispersao_acoes_corretivas")
        .select("id, status, data_conclusao, ano_mes").order("data_abertura", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const linhas = useMemo(() => {
    const rows = impactoQ.data ?? [];
    return rows.map((r) => {
      const custo = Number(r.custo_unit_medio ?? 0);
      const impacto = Number(r.impacto_rs ?? 0);
      const pct = percentualDispersao(r.qtd_dif, r.qtd_previsto, r.qtd_consumo);
      const cls = classificar(pct, faixas);
      const data = refData(r);
      return {
        ...r,
        id_op: r.numero_op,
        produto: r.sku_produto_final,
        desc_produto: r.desc_prod,
        data,                                   // yyyy-mm-dd (campo "Data")
        mes: data ? data.slice(0, 7) : SEM_DATA, // yyyy-mm
        ano: data ? data.slice(0, 4) : SEM_DATA,
        custo,
        impacto,
        pct,
        cls,
        custoPerda: impacto > 0 ? impacto : 0,
        custoSobra: impacto < 0 ? -impacto : 0,
        linha_origem: origemQ.data?.get(r.material) ?? null,
      };
    });
  }, [impactoQ.data, origemQ.data, faixas]);

  const meses = useMemo(
    () => Array.from(new Set(linhas.map((r) => r.mes))).filter((m) => m !== SEM_DATA).sort().reverse(),
    [linhas],
  );
  const temSemData = useMemo(() => linhas.some((r) => r.mes === SEM_DATA), [linhas]);
  const linhasOrigem = useMemo(() => Array.from(new Set(linhas.map((r) => r.linha_origem).filter((v): v is string => !!v))).sort(), [linhas]);

  const filtradas = useMemo(() => linhas.filter((r) => {
    if (anoMes !== "todos" && r.mes !== anoMes) return false;
    if (dtDe && (!r.data || r.data < dtDe)) return false;
    if (dtAte && (!r.data || r.data > dtAte)) return false;
    if (material && !r.material.toLowerCase().includes(material.toLowerCase()) && !(r.desc_material ?? "").toLowerCase().includes(material.toLowerCase())) return false;
    if (produto && !(r.produto ?? "").toLowerCase().includes(produto.toLowerCase()) && !(r.desc_produto ?? "").toLowerCase().includes(produto.toLowerCase())) return false;
    if (linha !== "todas" && r.linha_origem !== linha) return false;
    if (classFilter !== "todas" && r.cls !== classFilter) return false;
    return true;
  }), [linhas, anoMes, dtDe, dtAte, material, produto, linha, classFilter]);


  // Matriz de criticidade (mesma regra da view v_matriz_criticidade, com limiares configuráveis)
  const matriz = useMemo(() => {
    const map = new Map<string, { material: string; desc_material: string; ops: Set<string>; liq: number; abs: number }>();
    for (const r of filtradas) {
      if (!r.tem_furo) continue;
      const key = r.material;
      const cur = map.get(key) ?? { material: r.material, desc_material: r.desc_material || r.material, ops: new Set<string>(), liq: 0, abs: 0 };
      cur.ops.add(r.id_op); cur.liq += r.impacto; cur.abs += Math.abs(r.impacto);
      map.set(key, cur);
    }
    return Array.from(map.values()).map((m) => {
      const freq = m.ops.size;
      const quadrante: Quadrante =
        freq >= limFreq && m.abs >= limImpacto ? "critico_recorrente"
        : freq < limFreq && m.abs >= limImpacto ? "pontual"
        : freq >= limFreq ? "cronico" : "controle";
      return { material: m.material, desc_material: m.desc_material, freq_ops: freq, impacto_liquido: m.liq, impacto_abs: m.abs, quadrante };
    }).sort((a, b) => b.impacto_abs - a.impacto_abs);
  }, [filtradas, limFreq, limImpacto]);

  // KPIs executivos
  const kpis = useMemo(() => {
    const ops = new Set<string>();
    const opsFuro = new Set<string>();
    const opsCriticas = new Set<string>();
    let perda = 0, economia = 0;
    for (const r of filtradas) {
      ops.add(r.id_op);
      if (r.tem_furo) opsFuro.add(r.id_op);
      if (r.impacto > 0) perda += r.impacto; else economia += -r.impacto;
      if (r.cls === "CRITICO") opsCriticas.add(r.id_op);
    }
    const cronicos = matriz.filter((m) => m.freq_ops >= limFreq).length;
    const totalAbs = matriz.reduce((s, m) => s + m.impacto_abs, 0);
    const top20 = matriz.slice(0, 20).reduce((s, m) => s + m.impacto_abs, 0);
    return {
      ops: ops.size, opsFuro: opsFuro.size,
      taxaFuro: ops.size ? (100 * opsFuro.size) / ops.size : 0,
      perda, economia, liquido: perda - economia,
      cronicos, opsCriticas: opsCriticas.size,
      pctTop20: totalAbs ? (100 * top20) / totalAbs : 0,
    };
  }, [filtradas, matriz, limFreq]);

  const acoes = acoesQ.data ?? [];
  const acoesAbertas = acoes.filter((a: any) => a.status !== "CONCLUIDA").length;
  const acoesConcluidas = acoes.filter((a: any) => a.status === "CONCLUIDA" && (anoMes === "todos" || a.ano_mes === anoMes)).length;

  const topPerda = useMemo(() => matriz.filter((m) => m.impacto_liquido > 0)
    .sort((a, b) => b.impacto_liquido - a.impacto_liquido).slice(0, 10), [matriz]);
  const topEconomia = useMemo(() => matriz.filter((m) => m.impacto_liquido < 0)
    .sort((a, b) => a.impacto_liquido - b.impacto_liquido).slice(0, 10), [matriz]);

  // Tendência em R$ por dia / mês / ano (baseada no campo "Data")
  const serieMes = useMemo(() => {
    const map = new Map<string, { chave: string; perda: number; economia: number }>();
    for (const r of filtradas) {
      const chave = granul === "dia" ? (r.data ?? SEM_DATA) : granul === "ano" ? r.ano : r.mes;
      const cur = map.get(chave) ?? { chave, perda: 0, economia: 0 };
      if (r.impacto > 0) cur.perda += r.impacto; else cur.economia += -r.impacto;
      map.set(chave, cur);
    }
    const label = (k: string) => {
      if (k === SEM_DATA) return "Sem data";
      if (granul === "ano") return k;
      if (granul === "mes") return labelMes(k);
      const [y, m, d] = k.split("-");
      return `${d}/${m}/${y}`;
    };
    return Array.from(map.values()).sort((a, b) => a.chave.localeCompare(b.chave))
      .map((x) => ({ mes: label(x.chave), perda: +x.perda.toFixed(2), economia: +x.economia.toFixed(2) }));
  }, [filtradas, granul]);


  // Impacto por linha/origem (R$)
  const serieLinha = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtradas) {
      if (!r.linha_origem) continue;
      map.set(r.linha_origem, (map.get(r.linha_origem) ?? 0) + Math.abs(r.impacto));
    }
    return Array.from(map.entries()).map(([linha, impacto_abs]) => ({ linha, impacto_abs: +impacto_abs.toFixed(2) }))
      .sort((a, b) => b.impacto_abs - a.impacto_abs);
  }, [filtradas]);


  const serieStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of acoes as any[]) map.set(a.status, (map.get(a.status) ?? 0) + 1);
    return STATUS_ACAO.map((s) => ({ status: s.l, qtd: map.get(s.v) ?? 0 }));
  }, [acoes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispersão de Lote</h1>
          <p className="text-sm text-muted-foreground">Ficha Técnica × Consumo real por Ordem de Produção.</p>
        </div>
        <div className="flex gap-2">
          {canImport && <ImportarDispersaoDialog modo="BOM" />}
          {canImport && <ImportarDispersaoDialog modo="CONSUMO" />}
          {isAdmin && (
            <Button asChild variant="outline" size="icon" title="Configurar faixas de alerta">
              <Link to="/config/dispersao"><Settings2 className="size-4" /></Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={anoMes} onValueChange={setAnoMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Produto</label>
            <Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Buscar produto…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Material</label>
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Buscar material…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Linha/Origem</label>
            <Select value={linha} onValueChange={setLinha}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {linhasOrigem.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Classificação</label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="ATENCAO">Atenção</SelectItem>
                <SelectItem value="CRITICO">Crítico</SelectItem>
                <SelectItem value="NAO_PREVISTO">Não Previsto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="lista">Lista Detalhada</TabsTrigger>
          <TabsTrigger value="acoes">Ações Corretivas</TabsTrigger>
        </TabsList>

        {/* ============ VISÃO GERAL ============ */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="OPs Analisadas" value={kpis.ops.toString()} />
            <Kpi label="Taxa de Furo" value={`${kpis.taxaFuro.toFixed(1)}%`} sub={`${kpis.opsFuro} de ${kpis.ops} OPs com desvio`} tone={kpis.taxaFuro > 50 ? "danger" : undefined} />
            <Kpi
              label="Impacto Financeiro Líquido"
              value={fmtBRL(kpis.liquido)}
              sub={`Perda ${fmtBRL(kpis.perda)} · Economia ${fmtBRL(kpis.economia)}`}
              tone={kpis.liquido > 0 ? "danger" : "success"}
            />
            <Kpi label="Concentração de Risco" value={`${kpis.pctTop20.toFixed(1)}%`} sub="do impacto nos 20 maiores materiais" />
            <Kpi label="Materiais Críticos" value={kpis.cronicos.toString()} sub={`≥ ${limFreq} OPs com furo`} tone="danger" />
            <Kpi label="OPs Críticas" value={kpis.opsCriticas.toString()} tone="danger" />
            <Kpi label="Ações Abertas" value={acoesAbertas.toString()} />
            <Kpi label="Ações Concluídas (período)" value={acoesConcluidas.toString()} tone="success" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Matriz de Criticidade (frequência × impacto)</CardTitle>
              <p className="text-xs text-muted-foreground">Limiares atuais: {limFreq} OPs e {fmtBRL(limImpacto)} — configuráveis em Faixas de Alerta.</p>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis type="number" dataKey="freq_ops" name="OPs" fontSize={12} label={{ value: "Frequência (OPs)", position: "insideBottom", offset: -10, fontSize: 11 }} />
                  <YAxis type="number" dataKey="impacto_abs" name="Impacto" fontSize={12} tickFormatter={(v) => fmtBRL(Number(v))} width={90} />
                  <ZAxis range={[60, 60]} />
                  <RTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      const p: any = payload?.[0]?.payload;
                      if (!p) return null;
                      return (
                        <div className="rounded-md border bg-popover p-2 text-xs shadow">
                          <div className="font-medium">{p.material} — {p.desc_material}</div>
                          <div>Frequência: {p.freq_ops} OP(s)</div>
                          <div>Impacto líquido: {fmtBRL(p.impacto_liquido)}</div>
                          <div>Impacto absoluto: {fmtBRL(p.impacto_abs)}</div>
                          <div>{labelQuadrante(p.quadrante)}</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={matriz}>
                    {matriz.map((m) => (
                      <Cell key={m.material} fill={QUADRANTES[m.quadrante].color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2">
                {(Object.keys(QUADRANTES) as Quadrante[]).map((q) => (
                  <span key={q} className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full" style={{ background: QUADRANTES[q].color }} />
                    {QUADRANTES[q].label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Perda (R$)</CardTitle></CardHeader>
              <CardContent><TopMateriais rows={topPerda} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Economia / Risco de apontamento</CardTitle></CardHeader>
              <CardContent><TopMateriais rows={topEconomia} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Tendência Mensal (R$)</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={serieMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="mes" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtBRL(Number(v))} width={90} />
                    <RTooltip formatter={(v: any, n: any) => [fmtBRL(Number(v)), n === "perda" ? "Perda" : "Economia"]} />
                    <Legend formatter={(v) => (v === "perda" ? "Perda" : "Economia")} />
                    <Bar dataKey="perda" fill="#E57373" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="economia" fill="#81C784" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Ações por Status</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={serieStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="status" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis fontSize={12} />
                    <RTooltip />
                    <Bar dataKey="qtd" fill="#4FC3F7" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {serieLinha.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Impacto por Linha / Origem (R$)</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={serieLinha}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="linha" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => fmtBRL(Number(v))} width={90} />
                    <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                    <Bar dataKey="impacto_abs" fill="#FFB74D" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ LISTA ============ */}
        <TabsContent value="lista" className="space-y-2">
          <div className="text-sm text-muted-foreground">{filtradas.length} linhas</div>
          <div className="border rounded-md max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OP</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>UM</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Dif</TableHead>
                  <TableHead className="text-right">% Disp.</TableHead>
                  <TableHead className="text-right">Custo Desvio</TableHead>
                  <TableHead>Classif.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 500).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.id_op}</TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      <Link to="/producao/material/$material" params={{ material: r.material }} className="hover:underline">
                        {r.produto || r.desc_produto || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to="/producao/material/$material" params={{ material: r.material }} className="hover:underline">
                        {r.material} {r.desc_material ? `— ${r.desc_material}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell>{r.um}</TableCell>
                    <TableCell className="text-right">{r.qtd_consumo.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.qtd_previsto.toFixed(2)}</TableCell>
                    <TableCell className={"text-right " + (r.qtd_dif > 0 ? "text-destructive" : r.qtd_dif < 0 ? "text-success" : "")}>{r.qtd_dif.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.pct === "NAO_PREVISTO" ? "—" : `${r.pct.toFixed(1)}%`}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.custoPerda - r.custoSobra)}</TableCell>
                    <TableCell><Badge variant="outline" className={badgeCor(r.cls)}>{labelClass(r.cls)}</Badge></TableCell>
                  </TableRow>
                ))}
                {filtradas.length > 500 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground">Exibindo 500 de {filtradas.length}. Refine os filtros.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============ AÇÕES ============ */}
        <TabsContent value="acoes">
          <AcoesCorretivas />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={"text-xl font-semibold mt-1 " + cls}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

type MatrizRow = {
  material: string; desc_material: string; freq_ops: number;
  impacto_liquido: number; impacto_abs: number; quadrante: Quadrante;
};

function TopMateriais({ rows }: { rows: MatrizRow[] }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">OPs</TableHead>
            <TableHead className="text-right">Impacto</TableHead>
            <TableHead>Classif.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.material}>
              <TableCell className="max-w-[240px] truncate">
                <Link to="/producao/material/$material" params={{ material: r.material }} className="hover:underline">
                  {r.material} — {r.desc_material}
                </Link>
              </TableCell>
              <TableCell className="text-right">{r.freq_ops}</TableCell>
              <TableCell className={"text-right " + (r.impacto_liquido > 0 ? "text-destructive" : "text-success")}>
                {fmtBRL(r.impacto_liquido)}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={QUADRANTES[r.quadrante].badge}>{QUADRANTES[r.quadrante].label}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground">Sem dados</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}


function TopTable({ rows, modo }: { rows: any[]; modo: "pct" | "rs" }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>OP</TableHead>
            <TableHead className="text-right">Dif</TableHead>
            <TableHead className="text-right">{modo === "pct" ? "%" : "R$"}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[220px] truncate">
                <Link to="/producao/material/$material" params={{ material: r.material }} className="hover:underline">
                  {r.material}{r.desc_material ? ` — ${r.desc_material}` : ""}
                </Link>
              </TableCell>
              <TableCell>{r.id_op}</TableCell>
              <TableCell className="text-right">{r.qtd_dif.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                {modo === "pct"
                  ? (r.pct === "NAO_PREVISTO" ? "—" : `${r.pct.toFixed(1)}%`)
                  : fmtBRL(r.custoPerda - r.custoSobra)}
              </TableCell>
              <TableCell><Badge variant="outline" className={badgeCor(r.cls)}>{labelClass(r.cls)}</Badge></TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">Sem dados</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AcoesCorretivas() {
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();
  const isCoord = role === "COORDENADOR_CONTROLE";
  const isGerente = role === "GERENTE";
  const canConcluir = isAdmin || isCoord;
  const [statusFilter, setStatusFilter] = useState<string>("abertas");

  const acoesQ = useQuery({
    queryKey: ["dispersao", "acoes-full"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("dispersao_acoes_corretivas")
        .select("*, dispersao_causa_raiz:producao_consumo_id(causa)")
        .order("data_abertura", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (acoesQ.data ?? []).filter((a: any) => {
    if (statusFilter === "abertas") return a.status !== "CONCLUIDA";
    if (statusFilter === "concluidas") return a.status === "CONCLUIDA";
    if (statusFilter === "todas") return true;
    return a.status === statusFilter;
  });

  async function alterarStatus(id: string, novo: string) {
    if (novo === "CONCLUIDA" && !canConcluir) {
      toast.error("Apenas Administrador/Coordenador pode concluir.");
      return;
    }
    const patch: any = { status: novo };
    if (novo === "CONCLUIDA") patch.data_conclusao = new Date().toISOString();
    const { error } = await (supabase as any).from("dispersao_acoes_corretivas").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["dispersao"] });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Abertas</SelectItem>
            <SelectItem value="concluidas">Concluídas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
            {STATUS_ACAO.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Abertura</TableHead>
              <TableHead>Material / Período</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs">{new Date(a.data_abertura).toLocaleDateString()}</TableCell>
                <TableCell className="text-xs">{a.material || "—"} · {a.ano_mes || "—"}</TableCell>
                <TableCell className="max-w-[380px]">{a.descricao_acao}</TableCell>
                <TableCell>{a.responsavel || "—"}</TableCell>
                <TableCell><Badge variant="outline">{STATUS_ACAO.find((s) => s.v === a.status)?.l ?? a.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {(isAdmin || isCoord || isGerente) && (
                    <Select value={a.status} onValueChange={(v) => alterarStatus(a.id, v)}>
                      <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_ACAO.map((s) => (
                          <SelectItem key={s.v} value={s.v} disabled={s.v === "CONCLUIDA" && !canConcluir}>{s.l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Nenhuma ação nesse filtro.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
