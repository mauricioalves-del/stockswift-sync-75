import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListaCompletaDialog } from "@/components/shelf-life/ListaCompletaDialog";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/inventory";
import { ConfigFiltrosCard } from "@/components/shelf-life/ConfigFiltrosCard";
import { LoteDetalheDialog } from "@/components/shelf-life/LoteDetalheDialog";
import { usePersistedState, useShelfConfig } from "@/hooks/useFiltrosShelfLife";
import { useLotesRisco, type LoteRisco } from "@/hooks/useShelfLife";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell,
} from "recharts";
import { Skull } from "lucide-react";

type TopRow = { sku: string; descricao: string; custo: number; lotes: LoteRisco[] };

export const Route = createFileRoute("/_authenticated/shelf-life/farol")({
  component: FarolShelf,
  head: () => ({
    meta: [
      { title: "Farol de Shelf — Risco de Perda por Validade" },
      { name: "description", content: "Painel farol de shelf life: perda potencial, risco por faixa de validade, custo por grupo e rankings de urgência." },
      { property: "og:title", content: "Farol de Shelf — Risco de Perda por Validade" },
      { property: "og:description", content: "Visão executiva do risco de vencimento por almoxarifado, grupo e status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type StatusFarol = "vencido" | "Urgente" | "Perigo" | "Atenção";

const STATUS_ORDEM: StatusFarol[] = ["Atenção", "Perigo", "Urgente", "vencido"];

const COR: Record<StatusFarol, string> = {
  "Atenção": "#2CC5A8",
  Perigo: "#F2C14E",
  Urgente: "#F1704B",
  vencido: "#7B3B2E",
};

function statusDoLote(r: LoteRisco): StatusFarol | null {
  if (r.faixa === "VENCIDO") return "vencido";
  if (r.faixa === "30") return "Urgente";
  if (r.faixa === "60") return "Perigo";
  if (r.faixa === "90") return "Atenção";
  return null; // pendente de validade fica fora do farol
}

type FiltrosFarol = { almox: string[]; grupos: string[]; familias: string[]; status: string[]; busca: string };
const PADRAO: FiltrosFarol = { almox: [], grupos: [], familias: [], status: [], busca: "" };

function FarolShelf() {
  const { almoxAtivos, somenteComSaldo } = useShelfConfig();
  const lotesQ = useLotesRisco({ almoxAtivos, somenteComSaldo });
  const [f, setF] = usePersistedState<FiltrosFarol>("shelf-life:farol:filtros", PADRAO);
  const set = <K extends keyof FiltrosFarol>(k: K, v: FiltrosFarol[K]) => setF((p) => ({ ...p, [k]: v }));

  const base = useMemo(
    () =>
      (lotesQ.data ?? [])
        .map((r) => ({ ...r, status: statusDoLote(r) }))
        .filter((r): r is LoteRisco & { status: StatusFarol } => r.status !== null),
    [lotesQ.data],
  );

  const opts = useMemo(() => {
    const a = new Set<string>(), g = new Set<string>(), fa = new Set<string>();
    base.forEach((r) => {
      if (r.almoxarifado) a.add(r.almoxarifado);
      if (r.grupo) g.add(r.grupo);
      if (r.familia) fa.add(r.familia);
    });
    const s = (x: Set<string>) => Array.from(x).sort();
    return { almox: s(a), grupos: s(g), familias: s(fa) };
  }, [base]);

  const rows = useMemo(() => {
    const q = (f.busca ?? "").trim().toUpperCase();
    const inSel = (sel: string[], v: string | null) => sel.length === 0 || (v != null && sel.includes(v));
    return base.filter((r) => {
      if (!inSel(f.almox, r.almoxarifado)) return false;
      if (!inSel(f.grupos, r.grupo)) return false;
      if (!inSel(f.familias, r.familia)) return false;
      if (f.status.length && !f.status.includes(r.status)) return false;
      if (q && !`${r.sku} ${r.descricao} ${r.lote}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [base, f]);

  const kpis = useMemo(() => {
    const soma = (s: StatusFarol) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.valor, 0);
    const qtd = (s: StatusFarol) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.reduce((a, r) => a + r.valor, 0),
      vencidoValor: soma("vencido"),
      vencidoQtd: qtd("vencido"),
      qtd030: qtd("Urgente"),
      qtd3160: qtd("Perigo"),
      qtd6190: qtd("Atenção"),
      urgente: soma("Urgente"),
      perigo: soma("Perigo"),
      atencao: soma("Atenção"),
    };
  }, [rows]);

  const farol = useMemo(
    () => [
      { faixa: "61-90 Dias", valor: kpis.atencao, cor: COR["Atenção"] },
      { faixa: "0-30 Dias", valor: kpis.urgente, cor: COR.Urgente },
      { faixa: "31-60 Dias", valor: kpis.perigo, cor: COR.Perigo },
      { faixa: "Vencido", valor: kpis.vencidoValor, cor: COR.vencido },
    ],
    [kpis],
  );

  const porAlmox = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach((r) => {
      const k = r.almoxarifado || "—";
      const e = m.get(k) ?? { nome: k, "Atenção": 0, Perigo: 0, Urgente: 0, vencido: 0, total: 0 };
      e[r.status] += r.valor;
      e.total += r.valor;
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach((r) => {
      const k = r.grupo || "Sem grupo";
      const e = m.get(k) ?? { nome: k, "Atenção": 0, Perigo: 0, Urgente: 0, vencido: 0, total: 0 };
      e[r.status] += r.valor;
      e.total += r.valor;
      m.set(k, e);
    });
    return Array.from(m.values())
      .sort((a, b) => b.total - a.total)
      .map((e) => {
        const t = e.total || 1;
        return {
          ...e,
          pAtencao: (e["Atenção"] / t) * 100,
          pPerigo: (e.Perigo / t) * 100,
          pUrgente: (e.Urgente / t) * 100,
          pVencido: (e.vencido / t) * 100,
        };
      });
  }, [rows]);

  const topPor = (s: StatusFarol) =>
    Array.from(
      rows
        .filter((r) => r.status === s)
        .reduce((m, r) => {
          const k = r.sku;
          const e = m.get(k) ?? { sku: k, descricao: r.descricao || k, custo: 0, lotes: [] as LoteRisco[] };
          e.custo += r.valor;
          e.lotes.push(r);
          m.set(k, e);
          return m;
        }, new Map<string, TopRow>())
        .values(),
    ).sort((a, b) => b.custo - a.custo);

  const topUrgente = useMemo(() => topPor("Urgente"), [rows]);
  const topPerigo = useMemo(() => topPor("Perigo"), [rows]);
  const topAtencao = useMemo(() => topPor("Atenção"), [rows]);

  const vencidos = useMemo(
    // só entram lotes com saldo atual > 0 na base sincronizada (Lote_Sistema)
    () => rows.filter((r) => r.status === "vencido" && (r.quantidade ?? 0) > 0).sort((a, b) => b.valor - a.valor),
    [rows],
  );


  const [detalhe, setDetalhe] = useState<LoteRisco[] | null>(null);
  const [lista, setLista] = useState<StatusFarol | null>(null);
  const LISTA_TITULO: Record<string, string> = {
    Urgente: "Urgente — 0 a 30 dias",
    Perigo: "Perigo — 31 a 60 dias",
    "Atenção": "Atenção — 61 a 90 dias",
  };
  const lotesFaixa = useMemo(() => (lista ? rows.filter((r) => r.status === lista) : []), [rows, lista]);


  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4">
            <div className="text-base font-bold text-destructive">
              Perda potencial de {formatBRL(kpis.total)} · Sendo {formatBRL(kpis.vencidoValor)} já vencidos
            </div>
            <p className="text-xs text-muted-foreground mt-1">Resumo de Perdas — lotes com saldo e validade em até 90 dias.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Skull className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-lg font-bold truncate">Vencido</div>
                <div className="text-[11px] text-muted-foreground">Status Geral Farol</div>
              </div>
            </div>
            <Contador valor={kpis.vencidoQtd} label="Qtd Vencidos" />
            <Contador valor={kpis.qtd030} label="Qtd 0-30 dias" />
            <Contador valor={kpis.qtd3160 + kpis.qtd6190} label="Qtd 31-90 dias" />
          </CardContent>
        </Card>
      </div>

      <ConfigFiltrosCard />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="SKU, produto ou lote" value={f.busca} onChange={(e) => set("busca", e.target.value)} />
          </div>
          <Multi label="Almoxarifado" value={f.almox} onChange={(v) => set("almox", v)} options={opts.almox} />
          <Multi label="Grupo" value={f.grupos} onChange={(v) => set("grupos", v)} options={opts.grupos} />
          <Multi label="Família" value={f.familias} onChange={(v) => set("familias", v)} options={opts.familias} />
          <div>
            <Label className="text-xs">Status</Label>
            <MultiSelect
              options={STATUS_ORDEM.map((s) => ({ value: s, label: s === "vencido" ? "Vencido" : s }))}
              value={f.status}
              onChange={(v) => set("status", v)}
              allLabel="Todos"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Farol de Shelf</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {lotesQ.isLoading ? <Skel /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={farol} layout="vertical" margin={{ left: 20, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="faixa" width={80} fontSize={11} />
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {farol.map((d) => <Cell key={d.faixa} fill={d.cor} />)}
                    <LabelList dataKey="valor" position="right" fontSize={11} formatter={(v: any) => formatBRL(Number(v))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Risco de Perda por Almoxarifado</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {lotesQ.isLoading ? <Skel /> : !porAlmox.length ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porAlmox}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="nome" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {STATUS_ORDEM.map((s) => (
                    <Bar key={s} dataKey={s} stackId="a" fill={COR[s]} name={s === "vencido" ? "Vencido" : s} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Custo Total por Grupo e Status</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[300px] overflow-y-auto">
            {lotesQ.isLoading ? <Skel /> : !porGrupo.length ? <Vazio /> : porGrupo.map((g) => (
              <div key={g.nome} className="space-y-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{g.nome}</span>
                  <span className="font-medium shrink-0">{formatBRL(g.total)}</span>
                </div>
                <div className="flex h-4 w-full overflow-hidden rounded">
                  {([["Atenção", g.pAtencao], ["Perigo", g.pPerigo], ["Urgente", g.pUrgente], ["vencido", g.pVencido]] as [StatusFarol, number][])
                    .filter(([, p]) => p > 0)
                    .map(([s, p]) => (
                      <div
                        key={s}
                        title={`${s}: ${p.toFixed(2)}%`}
                        style={{ width: `${p}%`, background: COR[s] }}
                        className="flex items-center justify-center text-[10px] font-medium text-background"
                      >
                        {p >= 12 ? `${p.toFixed(1)}%` : ""}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TopCard title="Top 10 — Urgente (0-30 dias)" cor={COR.Urgente} rows={topUrgente} onSelect={setDetalhe} onVerTudo={() => setLista("Urgente")} />
        <TopCard title="Top 10 — Perigo (31-60 dias)" cor={COR.Perigo} rows={topPerigo} onSelect={setDetalhe} onVerTudo={() => setLista("Perigo")} />
        <TopCard title="Top 10 — Atenção (61-90 dias)" cor={COR["Atenção"]} rows={topAtencao} onSelect={setDetalhe} onVerTudo={() => setLista("Atenção")} />
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="size-3 rounded-full shrink-0" style={{ background: COR.vencido }} />
            Lista de Vencidos ({vencidos.length}) — {formatBRL(kpis.vencidoValor)}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {lotesQ.isLoading ? <Skel /> : !vencidos.length ? <Vazio /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Almoxarifado</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vencidos.map((r, i) => (
                  <TableRow
                    key={`${r.sku}-${r.lote}-${r.almoxarifado}-${i}`}
                    className="cursor-pointer"
                    onClick={() => setDetalhe([r])}
                  >
                    <TableCell className="text-xs">{r.sku}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs">{r.descricao}</TableCell>
                    <TableCell className="text-xs">{r.lote || "—"}</TableCell>
                    <TableCell className="text-xs">{r.almoxarifado || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.data_validade ? r.data_validade.slice(0, 10).split("-").reverse().join("/") : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                        {r.dias != null ? r.dias : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.quantidade}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LoteDetalheDialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)} lotes={detalhe ?? []} />

      <ListaCompletaDialog
        open={!!lista}
        onOpenChange={(v) => !v && setLista(null)}
        titulo={lista ? LISTA_TITULO[lista] ?? lista : ""}
        cor={lista ? COR[lista] : undefined}
        faixa={lista === "Urgente" ? "30" : lista === "Perigo" ? "60" : lista === "Atenção" ? "90" : null}
        onAbrirAcao={(l) => setDetalhe([l])}
      />

    </div>
  );
}

function Contador({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-2xl font-bold">{valor}</div>
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
    </div>
  );
}

function Multi({ label, value, onChange, options }: { label: string; value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <MultiSelect options={options.map((o) => ({ value: o, label: o }))} value={value} onChange={onChange} />
    </div>
  );
}

function TopCard({ title, cor, rows, onSelect, onVerTudo }: { title: string; cor: string; rows: TopRow[]; onSelect: (l: LoteRisco[]) => void; onVerTudo: () => void }) {
  const total = rows.reduce((s, r) => s + r.custo, 0);
  const top = rows.slice(0, 10);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="size-3 rounded-full shrink-0" style={{ background: cor }} />
          <span className="truncate">{title}</span>
          <Button size="sm" variant="outline" className="ml-auto shrink-0 h-7 text-xs" onClick={onVerTudo}>
            Lista Completa
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">

        {!top.length ? <Vazio /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((r, i) => (
                <TableRow key={r.sku} className="cursor-pointer" onClick={() => onSelect(r.lotes)}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{r.descricao}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatBRL(r.custo)}</TableCell>
                  <TableCell className="text-right text-xs">{total ? ((r.custo / total) * 100).toFixed(2) : "0,00"}%</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell />
                <TableCell className="text-xs font-semibold">Total ({rows.length} SKUs)</TableCell>
                <TableCell className="text-right text-xs font-semibold">{formatBRL(total)}</TableCell>
                <TableCell className="text-right text-xs font-semibold">100,00%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Skel() {
  return <div className="h-full w-full animate-pulse rounded bg-muted" />;
}

function Vazio() {
  return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>;
}
