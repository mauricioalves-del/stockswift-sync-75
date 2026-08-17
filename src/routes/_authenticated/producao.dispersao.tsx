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

type PC = {
  id: string; ano_mes: string; id_op: string;
  produto: string | null; desc_produto: string | null;
  material: string; desc_material: string | null; um: string | null;
  qtd_consumo: number; qtd_previsto: number; qtd_dif: number;
  qtd_produzida: number | null;
};

type Bom = { id_item: string; item: string | null; custo: number; linha_origem: string | null };

function DispersaoPage() {
  const { role, isAdmin } = useRole();
  const isCoord = role === "COORDENADOR_CONTROLE";
  const canImport = isAdmin || isCoord;
  const [tab, setTab] = useState("visao");
  const [anoMes, setAnoMes] = useState<string>("todos");
  const [material, setMaterial] = useState<string>("");
  const [produto, setProduto] = useState<string>("");
  const [linha, setLinha] = useState<string>("todas");
  const [classFilter, setClassFilter] = useState<string>("todas");

  const faixasQ = useQuery({
    queryKey: ["dispersao", "faixas"],
    queryFn: async (): Promise<Faixas> => {
      const { data } = await (supabase as any).from("parametros_dispersao").select("*").maybeSingle();
      if (!data) return FAIXAS_DEFAULT;
      return { atencao: Number(data.limite_atencao_pct), critico: Number(data.limite_critico_pct) };
    },
  });
  const faixas = faixasQ.data ?? FAIXAS_DEFAULT;

  const pcQ = useQuery({
    queryKey: ["dispersao", "pc"],
    queryFn: async (): Promise<PC[]> => {
      const { data, error } = await (supabase as any).from("producao_consumo")
        .select("id, ano_mes, id_op, produto, desc_produto, material, desc_material, um, qtd_consumo, qtd_previsto, qtd_dif, qtd_produzida")
        .order("ano_mes", { ascending: false }).limit(20000);
      if (error) throw error;
      return (data ?? []) as PC[];
    },
  });

  const bomQ = useQuery({
    queryKey: ["dispersao", "bom-custos"],
    queryFn: async (): Promise<Map<string, Bom>> => {
      const { data, error } = await (supabase as any).from("ficha_tecnica_bom").select("id_item, item, custo, linha_origem");
      if (error) throw error;
      const map = new Map<string, Bom>();
      for (const r of (data ?? []) as Bom[]) {
        // primeiro custo encontrado por item
        if (!map.has(r.id_item)) map.set(r.id_item, r);
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
    const rows = pcQ.data ?? [];
    return rows.map((r) => {
      const bom = bomQ.data?.get(r.material);
      const custo = bom?.custo ?? 0;
      const pct = percentualDispersao(r.qtd_dif, r.qtd_previsto, r.qtd_consumo);
      const cls = classificar(pct, faixas);
      const cd = custoDesvio(r.qtd_dif, custo);
      return { ...r, custo, pct, cls, custoPerda: cd.perda, custoSobra: cd.sobra, linha_origem: bom?.linha_origem ?? null };
    });
  }, [pcQ.data, bomQ.data, faixas]);

  const meses = useMemo(() => Array.from(new Set(linhas.map((r) => r.ano_mes))).sort().reverse(), [linhas]);
  const linhasOrigem = useMemo(() => Array.from(new Set(linhas.map((r) => r.linha_origem).filter((v): v is string => !!v))).sort(), [linhas]);

  const filtradas = useMemo(() => linhas.filter((r) => {
    if (anoMes !== "todos" && r.ano_mes !== anoMes) return false;
    if (material && !r.material.toLowerCase().includes(material.toLowerCase()) && !(r.desc_material ?? "").toLowerCase().includes(material.toLowerCase())) return false;
    if (produto && !(r.produto ?? "").toLowerCase().includes(produto.toLowerCase()) && !(r.desc_produto ?? "").toLowerCase().includes(produto.toLowerCase())) return false;
    if (linha !== "todas" && r.linha_origem !== linha) return false;
    if (classFilter !== "todas" && r.cls !== classFilter) return false;
    return true;
  }), [linhas, anoMes, material, produto, linha, classFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const opsSet = new Set<string>();
    const opsCriticas = new Set<string>();
    const matsCriticos = new Set<string>();
    let perda = 0, sobra = 0, pctSum = 0, pctN = 0;
    for (const r of filtradas) {
      opsSet.add(r.id_op);
      perda += r.custoPerda; sobra += r.custoSobra;
      if (r.pct !== "NAO_PREVISTO") { pctSum += Math.abs(r.pct); pctN += 1; }
      if (r.cls === "CRITICO") { opsCriticas.add(r.id_op); matsCriticos.add(r.material); }
    }
    return {
      ops: opsSet.size, opsCriticas: opsCriticas.size, matsCriticos: matsCriticos.size,
      pctMedia: pctN ? pctSum / pctN : 0, perda, sobra,
    };
  }, [filtradas]);

  const acoes = acoesQ.data ?? [];
  const acoesAbertas = acoes.filter((a: any) => a.status !== "CONCLUIDA").length;
  const acoesConcluidas = acoes.filter((a: any) => a.status === "CONCLUIDA" && (anoMes === "todos" || a.ano_mes === anoMes)).length;

  const top10Pct = useMemo(() => [...filtradas].filter((r) => r.pct !== "NAO_PREVISTO")
    .sort((a, b) => Math.abs(b.pct as number) - Math.abs(a.pct as number)).slice(0, 10), [filtradas]);
  const top10RS = useMemo(() => [...filtradas]
    .sort((a, b) => (b.custoPerda + b.custoSobra) - (a.custoPerda + a.custoSobra)).slice(0, 10), [filtradas]);

  // Séries para gráficos
  const serieMes = useMemo(() => {
    const map = new Map<string, { m: string; soma: number; n: number }>();
    for (const r of filtradas) {
      if (r.pct === "NAO_PREVISTO") continue;
      const cur = map.get(r.ano_mes) ?? { m: r.ano_mes, soma: 0, n: 0 };
      cur.soma += Math.abs(r.pct); cur.n += 1; map.set(r.ano_mes, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.m.localeCompare(b.m)).map((x) => ({ ano_mes: x.m, pct: +(x.soma / x.n).toFixed(2) }));
  }, [filtradas]);

  const serieLinha = useMemo(() => {
    const map = new Map<string, { l: string; soma: number; n: number }>();
    for (const r of filtradas) {
      if (r.pct === "NAO_PREVISTO" || !r.linha_origem) continue;
      const cur = map.get(r.linha_origem) ?? { l: r.linha_origem, soma: 0, n: 0 };
      cur.soma += Math.abs(r.pct); cur.n += 1; map.set(r.linha_origem, cur);
    }
    return Array.from(map.values()).map((x) => ({ linha: x.l, pct: +(x.soma / x.n).toFixed(2) }));
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
            <Kpi label="% Dispersão Média" value={`${kpis.pctMedia.toFixed(1)}%`} />
            <Kpi label="Custo de Perda" value={fmtBRL(kpis.perda)} tone="danger" />
            <Kpi label="Custo de Sobra" value={fmtBRL(kpis.sobra)} tone="success" />
            <Kpi label="Materiais Críticos" value={kpis.matsCriticos.toString()} tone="danger" />
            <Kpi label="OPs Críticas" value={kpis.opsCriticas.toString()} tone="danger" />
            <Kpi label="Ações Abertas" value={acoesAbertas.toString()} />
            <Kpi label="Ações Concluídas (período)" value={acoesConcluidas.toString()} tone="success" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Maiores Dispersões (|%|)</CardTitle></CardHeader>
              <CardContent>
                <TopTable rows={top10Pct} modo="pct" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Maiores Dispersões (R$)</CardTitle></CardHeader>
              <CardContent>
                <TopTable rows={top10RS} modo="rs" />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">% Dispersão Média por Mês</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <LineChart data={serieMes}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="ano_mes" fontSize={12} />
                    <YAxis fontSize={12} />
                    <RTooltip />
                    <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Ações por Status</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={serieStatus}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="status" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis fontSize={12} />
                    <RTooltip />
                    <Bar dataKey="qtd" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {serieLinha.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">% Dispersão por Linha / Origem</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={serieLinha}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="linha" fontSize={12} />
                    <YAxis fontSize={12} />
                    <RTooltip />
                    <Bar dataKey="pct" fill="hsl(var(--accent))" />
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={"text-xl font-semibold mt-1 " + cls}>{value}</div>
      </CardContent>
    </Card>
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
