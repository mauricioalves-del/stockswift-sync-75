import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, Upload, Settings2, Loader2, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/suprimentos/fefo/")({
  component: ControleFefoPage,
  head: () => ({
    meta: [
      { title: "Controle FEFO | Suprimentos" },
      { name: "description", content: "Checagem automática diária de FEFO nas transferências entre almoxarifados, com quebras, taxa de quebra e detalhamento por destino." },
      { property: "og:title", content: "Controle FEFO | Suprimentos" },
      { property: "og:description", content: "Painel de acompanhamento de quebras de FEFO nas transferências de estoque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Checagem = {
  id: string;
  data: string;
  id_produto: string;
  descricao: string;
  desc_movimento: string;
  desc_almox: string;
  destino: string;
  doc: string;
  lote_movimentado: string;
  qtd_movimentado: number;
  validade_movimentado: string | null;
  quebra: boolean;
  status: string;
  lote_mais_antigo: string | null;
  qtd_lote_mais_antigo: number | null;
  validade_mais_antiga: string | null;
};

const AUDITADO = (s: string) => s !== "Destino (não auditado)";
const INCONCLUSIVO = (s: string) =>
  s.startsWith("Inconclusivo") || s.startsWith("Sem validade") || s === "Almox não mapeado";

function statusTone(s: string) {
  if (s.includes("QUEBRA")) return "bg-destructive/15 text-destructive border-destructive/30";
  if (s.startsWith("OK")) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (INCONCLUSIVO(s)) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); }

function ControleFefoPage() {
  const [ini, setIni] = useState<string>(addDays(iso(new Date()), -6));
  const [fim, setFim] = useState<string>(iso(new Date()));
  const [tudo, setTudo] = useState(false);
  const [produto, setProduto] = useState("");
  const [destino, setDestino] = useState("__all__");
  const [rodando, setRodando] = useState(false);

  const q = useQuery({
    queryKey: ["checagens-fefo"],
    queryFn: async () =>
      fetchAll<Checagem>((from, to) =>
        (supabase as any).from("checagens_fefo").select("*").order("data", { ascending: false }).range(from, to),
      ),
  });

  const todas = q.data ?? [];

  const destinos = useMemo(
    () => Array.from(new Set(todas.filter((r) => AUDITADO(r.status)).map((r) => r.destino).filter(Boolean))).sort(),
    [todas],
  );

  const filtradas = useMemo(() => {
    const p = produto.trim().toLowerCase();
    return todas.filter((r) => {
      if (!tudo && (r.data < ini || r.data > fim)) return false;
      if (destino !== "__all__" && r.destino !== destino) return false;
      if (p && !(`${r.id_produto} ${r.descricao}`.toLowerCase().includes(p))) return false;
      return true;
    });
  }, [todas, ini, fim, tudo, produto, destino]);

  const auditadas = useMemo(() => filtradas.filter((r) => AUDITADO(r.status)), [filtradas]);

  const kpis = useMemo(() => {
    const total = auditadas.length;
    const quebras = auditadas.filter((r) => r.quebra).length;
    const inconclusivos = auditadas.filter((r) => INCONCLUSIVO(r.status)).length;
    const oks = auditadas.filter((r) => r.status.startsWith("OK")).length;

    // Variação vs. semana anterior (independe do filtro de período)
    const hoje = iso(new Date());
    const ini7 = addDays(hoje, -6), ini14 = addDays(hoje, -13), fim14 = addDays(hoje, -7);
    const base = todas.filter((r) => AUDITADO(r.status));
    const sem1 = base.filter((r) => r.data >= ini7 && r.data <= hoje);
    const sem0 = base.filter((r) => r.data >= ini14 && r.data <= fim14);
    const qb1 = sem1.filter((r) => r.quebra).length, qb0 = sem0.filter((r) => r.quebra).length;
    const tx1 = sem1.length ? (qb1 / sem1.length) * 100 : 0;
    const tx0 = sem0.length ? (qb0 / sem0.length) * 100 : 0;

    return {
      total, quebras, inconclusivos, oks,
      taxa: total ? (quebras / total) * 100 : 0,
      deltaQuebras: qb1 - qb0,
      deltaTaxa: tx1 - tx0,
    };
  }, [auditadas, todas]);

  const porDia = useMemo(() => {
    const map = new Map<string, { dia: string; total: number; quebras: number }>();
    for (const r of auditadas) {
      const e = map.get(r.data) ?? { dia: r.data, total: 0, quebras: 0 };
      e.total++; if (r.quebra) e.quebras++;
      map.set(r.data, e);
    }
    return Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia));
  }, [auditadas]);

  const topProdutos = useMemo(() => {
    const map = new Map<string, { nome: string; quebras: number }>();
    for (const r of auditadas.filter((x) => x.quebra)) {
      const k = r.id_produto;
      const e = map.get(k) ?? { nome: `${r.id_produto}${r.descricao ? " — " + r.descricao : ""}`, quebras: 0 };
      e.quebras++; map.set(k, e);
    }
    return Array.from(map.values()).sort((a, b) => b.quebras - a.quebras).slice(0, 10);
  }, [auditadas]);

  const porDestino = useMemo(() => {
    const map = new Map<string, { destino: string; total: number; quebras: number }>();
    for (const r of auditadas) {
      const k = r.destino || "—";
      const e = map.get(k) ?? { destino: k, total: 0, quebras: 0 };
      e.total++; if (r.quebra) e.quebras++;
      map.set(k, e);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, taxa: e.total ? (e.quebras / e.total) * 100 : 0 }))
      .sort((a, b) => b.quebras - a.quebras || b.total - a.total);
  }, [auditadas]);

  async function rodarAgora() {
    setRodando(true);
    const { data, error } = await (supabase as any).rpc("processar_fefo", { _data: null });
    setRodando(false);
    if (error) return toast.error(error.message);
    const r = Array.isArray(data) ? data[0] : data;
    toast.success(r?.dia ? `Dia ${r.dia}: ${r.processados} linhas, ${r.quebras} quebras` : "Nenhuma movimentação importada");
    q.refetch();
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowRightLeft className="size-5" /> Controle FEFO</h1>
          <p className="text-sm text-muted-foreground">
            Checagem automática diária das transferências saindo da Fábrica. Processamento roda todo dia às 08:00.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/suprimentos/fefo/movimentacoes"><Upload className="size-4 mr-1" /> Importar movimentação</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/suprimentos/fefo/config"><Settings2 className="size-4 mr-1" /> Configurações</Link>
          </Button>
          <Button size="sm" onClick={rodarAgora} disabled={rodando}>
            {rodando ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />} Reprocessar agora
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" className="h-9 w-40" value={ini} disabled={tudo} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" className="h-9 w-40" value={fim} disabled={tudo} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="flex gap-1">
            <Button variant={!tudo && ini === addDays(fim, -6) ? "default" : "secondary"} size="sm"
              onClick={() => { setTudo(false); setFim(iso(new Date())); setIni(addDays(iso(new Date()), -6)); }}>7 dias</Button>
            <Button variant={!tudo && ini === addDays(fim, -29) ? "default" : "secondary"} size="sm"
              onClick={() => { setTudo(false); setFim(iso(new Date())); setIni(addDays(iso(new Date()), -29)); }}>30 dias</Button>
            <Button variant={tudo ? "default" : "secondary"} size="sm" onClick={() => setTudo(true)}>Tudo</Button>
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">Produto</label>
            <Input className="h-9" placeholder="Código ou descrição…" value={produto} onChange={(e) => setProduto(e.target.value)} />
          </div>
          <div className="min-w-56">
            <label className="text-xs text-muted-foreground">Destino</label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os destinos</SelectItem>
                {destinos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Transferências auditadas" value={formatNum(kpis.total)} icon={<ArrowRightLeft className="size-4" />} accent="border-l-primary" />
        <Kpi title="Quebras de FEFO" value={formatNum(kpis.quebras)} icon={<AlertTriangle className="size-4" />} accent="border-l-destructive"
          hint={`${kpis.deltaQuebras >= 0 ? "+" : ""}${kpis.deltaQuebras} vs. semana anterior`} />
        <Kpi title="Taxa de quebra" value={`${kpis.taxa.toFixed(1)}%`} icon={<AlertTriangle className="size-4" />} accent="border-l-amber-500"
          hint={`${kpis.deltaTaxa >= 0 ? "+" : ""}${kpis.deltaTaxa.toFixed(1)} p.p. vs. semana anterior`} />
        <Kpi title="OK / Inconclusivo" value={`${formatNum(kpis.oks)} / ${formatNum(kpis.inconclusivos)}`}
          icon={<CheckCircle2 className="size-4" />} accent="border-l-emerald-500"
          hint={`${kpis.inconclusivos} sem validade ou almox não mapeado`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Transferências e quebras por dia</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDia}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="dia" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Transferências" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="quebras" name="Quebras" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top produtos com mais quebras</CardTitle></CardHeader>
          <CardContent className="h-72">
            {topProdutos.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Nenhuma quebra no período 🎉</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProdutos} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={200} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="quebras" name="Quebras" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Transferências e quebras por destino</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Transferências</TableHead>
                <TableHead className="text-right">Quebras</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porDestino.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados no período</TableCell></TableRow>
              )}
              {porDestino.map((d) => (
                <TableRow key={d.destino}>
                  <TableCell>{d.destino}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(d.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(d.quebras)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${d.taxa > 0 ? "text-destructive font-semibold" : ""}`}>{d.taxa.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Detalhamento</CardTitle>
          <span className="text-xs text-muted-foreground">{filtradas.length} linhas</span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Movimento</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Lote mov.</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Lote mais antigo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="size-5 animate-spin mx-auto" /></TableCell></TableRow>
              )}
              {!q.isLoading && filtradas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhuma checagem — importe a planilha de movimentação para começar.
                </TableCell></TableRow>
              )}
              {filtradas.slice(0, 500).map((r) => (
                <TableRow key={r.id} className={r.quebra ? "bg-destructive/5" : undefined}>
                  <TableCell className="text-xs whitespace-nowrap">{r.data}</TableCell>
                  <TableCell className="text-xs max-w-64 truncate" title={`${r.id_produto} — ${r.descricao}`}>
                    <span className="font-mono">{r.id_produto}</span>{r.descricao ? ` — ${r.descricao}` : ""}
                  </TableCell>
                  <TableCell className="text-xs max-w-64 truncate" title={r.desc_movimento}>{r.desc_movimento}</TableCell>
                  <TableCell className="text-xs">{r.destino}</TableCell>
                  <TableCell className="font-mono text-xs">{r.lote_movimentado}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatNum(Number(r.qtd_movimentado))}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.lote_mais_antigo ? `${r.lote_mais_antigo} (${r.validade_mais_antiga ?? "—"})` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${statusTone(r.status)}`}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtradas.length > 500 && (
            <div className="p-2 text-center text-xs text-muted-foreground">Exibindo as 500 primeiras de {filtradas.length} linhas.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ title, value, hint, icon, accent }: { title: string; value: string; hint?: string; icon: React.ReactNode; accent: string }) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{title}</span>{icon}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><HelpCircle className="size-3" />{hint}</div>}
      </CardContent>
    </Card>
  );
}
