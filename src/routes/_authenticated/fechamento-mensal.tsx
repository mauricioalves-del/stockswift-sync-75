import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarCheck, CheckCircle2, ClipboardList,
  Download, Loader2, Lock, ShieldAlert, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/fechamento-mensal")({
  component: FechamentoMensalPage,
  head: () => ({
    meta: [
      { title: "Fechamento Mensal — Controle Operacional" },
      { name: "description", content: "Consolidação por período dos seis módulos de controle: shelf life, recuperação, baixas, dispersão de lote, testes e FEFO." },
      { property: "og:title", content: "Fechamento Mensal — Controle Operacional" },
      { property: "og:description", content: "Relatório de gestão por período com ações criadas, concluídas, em aberto e destaques de risco." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type LinhaResumo = {
  modulo: string;
  ordem: number;
  acoes_criadas: number;
  acoes_concluidas: number;
  acoes_em_aberto: number;
  valor_ou_quantidade: number;
  unidade_valor: string;
  status_geral: string;
};

type Destaque = { modulo: string; data_evento: string | null; texto: string; valor: number | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fimDoMes(ano: number, mes: number) { return new Date(ano, mes, 0); }

async function carregarPeriodo(inicio: string, fim: string) {
  const [r, d] = await Promise.all([
    (supabase as any).rpc("fechamento_mensal_resumo", { data_inicio: inicio, data_fim: fim }),
    (supabase as any).rpc("fechamento_mensal_destaques", { data_inicio: inicio, data_fim: fim }),
  ]);
  if (r.error) throw r.error;
  if (d.error) throw d.error;
  return {
    resumo: ((r.data ?? []) as LinhaResumo[]).map((x) => ({
      ...x,
      acoes_criadas: Number(x.acoes_criadas ?? 0),
      acoes_concluidas: Number(x.acoes_concluidas ?? 0),
      acoes_em_aberto: Number(x.acoes_em_aberto ?? 0),
      valor_ou_quantidade: Number(x.valor_ou_quantidade ?? 0),
    })),
    destaques: (d.data ?? []) as Destaque[],
  };
}

function totalizar(linhas: LinhaResumo[]) {
  const criadas = linhas.reduce((s, l) => s + l.acoes_criadas, 0);
  const concluidas = linhas.reduce((s, l) => s + l.acoes_concluidas, 0);
  const abertas = linhas.reduce((s, l) => s + l.acoes_em_aberto, 0);
  const fefo = linhas.find((l) => l.modulo === "Controle de FEFO");
  const aderencia = fefo && fefo.acoes_criadas > 0 ? (fefo.acoes_concluidas / fefo.acoes_criadas) * 100 : null;
  return { criadas, concluidas, abertas, aderencia };
}

function Variacao({ atual, anterior, invertido = false, sufixo = "" }: { atual: number | null; anterior: number | null; invertido?: boolean; sufixo?: string }) {
  if (atual === null || anterior === null || anterior === 0) {
    return <span className="text-xs text-muted-foreground">sem base no período anterior</span>;
  }
  const delta = ((atual - anterior) / Math.abs(anterior)) * 100;
  const bom = invertido ? delta <= 0 : delta >= 0;
  const Icon = delta >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${bom ? "text-success" : "text-destructive"}`}>
      <Icon className="size-3.5" />
      {delta > 0 ? "+" : ""}{num(delta)}%{sufixo} vs. período anterior
    </span>
  );
}

function KpiCard({ titulo, valor, icon: Icon, children }: { titulo: string; valor: string; icon: React.ComponentType<{ className?: string }>; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4" /> {titulo}
        </div>
        <div className="text-2xl font-bold tabular-nums">{valor}</div>
        {children}
      </CardContent>
    </Card>
  );
}

type SortKey = keyof Pick<LinhaResumo, "modulo" | "acoes_criadas" | "acoes_concluidas" | "acoes_em_aberto" | "valor_ou_quantidade" | "status_geral">;

function FechamentoMensalPage() {
  const hoje = new Date();
  const { role, isAdmin } = useRole();
  const podeFechar = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();

  const [modo, setModo] = useState<"mes" | "custom">("mes");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ini, setIni] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [fim, setFim] = useState(iso(hoje));
  const [sort, setSort] = useState<{ k: SortKey; dir: "asc" | "desc" }>({ k: "acoes_criadas", dir: "desc" });
  const [salvando, setSalvando] = useState(false);

  const periodo = useMemo(() => {
    if (modo === "custom") return { inicio: ini, fim };
    return { inicio: iso(new Date(ano, mes - 1, 1)), fim: iso(fimDoMes(ano, mes)) };
  }, [modo, ini, fim, ano, mes]);

  const anterior = useMemo(() => {
    const i = new Date(`${periodo.inicio}T00:00:00`);
    const f = new Date(`${periodo.fim}T00:00:00`);
    const dias = Math.max(1, Math.round((f.getTime() - i.getTime()) / 86_400_000) + 1);
    if (modo === "mes") {
      const pm = mes === 1 ? 12 : mes - 1;
      const pa = mes === 1 ? ano - 1 : ano;
      return { inicio: iso(new Date(pa, pm - 1, 1)), fim: iso(fimDoMes(pa, pm)) };
    }
    const fAnt = new Date(i.getTime() - 86_400_000);
    const iAnt = new Date(fAnt.getTime() - (dias - 1) * 86_400_000);
    return { inicio: iso(iAnt), fim: iso(fAnt) };
  }, [periodo, modo, ano, mes]);

  const atualQ = useQuery({
    queryKey: ["fechamento", periodo.inicio, periodo.fim],
    queryFn: () => carregarPeriodo(periodo.inicio, periodo.fim),
  });
  const antQ = useQuery({
    queryKey: ["fechamento", anterior.inicio, anterior.fim],
    queryFn: () => carregarPeriodo(anterior.inicio, anterior.fim),
  });

  const linhas = atualQ.data?.resumo ?? [];
  const destaques = atualQ.data?.destaques ?? [];
  const tot = totalizar(linhas);
  const totAnt = totalizar(antQ.data?.resumo ?? []);

  const linhasOrdenadas = useMemo(() => {
    const arr = [...linhas];
    arr.sort((a, b) => {
      const va = a[sort.k]; const vb = b[sort.k];
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [linhas, sort]);

  const dadosGrafico = linhas.map((l) => ({
    modulo: l.modulo.replace("Mapeamento de ", "").replace("Controle de ", ""),
    Concluídas: l.acoes_concluidas,
    "Em aberto": l.acoes_em_aberto,
  }));

  const fechamentoQ = useQuery({
    queryKey: ["fechamento-congelado", ano, mes],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("fechamentos_mensais").select("*").eq("ano", ano).eq("mes", mes).maybeSingle();
      return data ?? null;
    },
    enabled: modo === "mes",
  });

  async function fecharMes() {
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const nome = (u.user?.user_metadata as any)?.nome ?? u.user?.email ?? null;
      const { error } = await (supabase as any).from("fechamentos_mensais").upsert({
        ano, mes,
        data_inicio: periodo.inicio,
        data_fim: periodo.fim,
        acoes_criadas: tot.criadas,
        acoes_concluidas: tot.concluidas,
        acoes_em_aberto: tot.abertas,
        aderencia_fefo: tot.aderencia,
        resumo: linhas,
        destaques,
        gerado_por: u.user?.id ?? null,
        gerado_por_nome: nome,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ano,mes" });
      if (error) throw error;
      toast.success(`Fechamento de ${MESES[mes - 1]}/${ano} congelado.`);
      qc.invalidateQueries({ queryKey: ["fechamento-congelado", ano, mes] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível fechar o mês.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarPptx() {
    const PptxGenJS = (await import("pptxgenjs")).default;
    const NAVY = "1E2761", ICE = "CADCFC", TEAL = "1C7293", AMBER = "E7A94D", CORAL = "D9614E", CINZA = "5F5E5A";
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";

    const dIni = new Date(`${periodo.inicio}T00:00:00`);
    const dFim = new Date(`${periodo.fim}T00:00:00`);
    const dd = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const periodoTxt = `${dd(dIni)} a ${dd(dFim)}/${dFim.getFullYear()}`;
    const valorTxt = (l: LinhaResumo) =>
      l.unidade_valor === "R$" ? brl(l.valor_ou_quantidade) : `${num(l.valor_ou_quantidade)} ${l.unidade_valor}`;

    // ---------- Slide 1 — Capa ----------
    const s1 = pptx.addSlide();
    s1.background = { color: NAVY };
    s1.addText("Fechamento mensal", { x: 0.7, y: 1.6, w: 8.6, h: 0.9, fontFace: "Cambria", fontSize: 44, bold: true, color: "FFFFFF" });
    s1.addText("Controle e mapeamento de riscos e passivos operacionais", { x: 0.7, y: 2.5, w: 8.6, h: 0.5, fontFace: "Calibri", fontSize: 20, color: ICE });
    s1.addText(periodoTxt, { x: 0.7, y: 3.1, w: 8.6, h: 0.4, fontFace: "Calibri", fontSize: 16, color: "FFFFFF" });
    s1.addText(linhas.map((l) => l.modulo).join(" · ") || "—", { x: 0.7, y: 3.6, w: 8.6, h: 0.8, fontFace: "Calibri", fontSize: 12, color: ICE });
    s1.addText("Painel de gestão de risco", { x: 0.7, y: 4.9, w: 5, h: 0.3, fontFace: "Calibri", fontSize: 10, color: ICE });

    // ---------- Slide 2 — Resumo executivo ----------
    const s2 = pptx.addSlide();
    s2.background = { color: "FFFFFF" };
    s2.addText("Resumo executivo do período", { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: "Cambria", fontSize: 28, bold: true, color: NAVY });
    const kpis: Array<[string, string, string]> = [
      ["Ações criadas", num(tot.criadas), NAVY],
      ["Concluídas", num(tot.concluidas), TEAL],
      ["Em aberto", num(tot.abertas), AMBER],
      ["Aderência FEFO", tot.aderencia === null ? "—" : `${num(tot.aderencia)}%`, CORAL],
    ];
    kpis.forEach(([rot, val, cor], i) => {
      const x = 0.5 + i * 2.28;
      s2.addShape(pptx.ShapeType.roundRect, { x, y: 1.15, w: 2.1, h: 1.15, fill: { color: "F4F5FA" }, line: { color: "F4F5FA" }, rectRadius: 0.08 });
      s2.addText(rot.toUpperCase(), { x, y: 1.25, w: 2.1, h: 0.3, align: "center", fontFace: "Calibri", fontSize: 10, color: CINZA });
      s2.addText(val, { x, y: 1.55, w: 2.1, h: 0.6, align: "center", fontFace: "Calibri", fontSize: 28, bold: true, color: cor });
    });

    const atencao = linhas
      .filter((l) => l.status_geral === "Atenção" && l.acoes_criadas > 0)
      .sort((a, b) => b.acoes_em_aberto / b.acoes_criadas - a.acoes_em_aberto / a.acoes_criadas)[0];
    let yBul = 2.6;
    if (atencao) {
      s2.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 2.55, w: 9, h: 1.1, fill: { color: "FCF1E3" }, line: { color: "FCF1E3" }, rectRadius: 0.08 });
      s2.addText("Ponto de atenção do mês", { x: 0.7, y: 2.62, w: 8.6, h: 0.3, fontFace: "Calibri", fontSize: 12, bold: true, color: AMBER });
      s2.addText(
        `${atencao.modulo} concentra o maior risco em aberto do período: ${num(atencao.acoes_criadas)} ações criadas, apenas ${num(atencao.acoes_concluidas)} concluídas (${num(atencao.acoes_em_aberto)} em aberto) e ${valorTxt(atencao)} associados.`,
        { x: 0.7, y: 2.92, w: 8.6, h: 0.65, fontFace: "Calibri", fontSize: 13, color: "2B2B2B" },
      );
      yBul = 3.85;
    }
    const topDest = [...destaques].sort((a, b) => Math.abs(Number(b.valor ?? 0)) - Math.abs(Number(a.valor ?? 0))).slice(0, 3);
    if (topDest.length) {
      s2.addText(
        topDest.map((d) => ({
          text: `${d.texto} — ${d.modulo}${d.valor === null ? "" : ` · ${brl(Number(d.valor))}`}`,
          options: { bullet: true, fontFace: "Calibri", fontSize: 12, color: CINZA, breakLine: true },
        })),
        { x: 0.6, y: yBul, w: 8.8, h: 1.1 },
      );
    }

    // ---------- Slide 3 — Gráfico ----------
    const s3 = pptx.addSlide();
    s3.background = { color: "FFFFFF" };
    s3.addText("Concluídas x em aberto por módulo", { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: "Cambria", fontSize: 28, bold: true, color: NAVY });
    const labels = linhas.map((l) => l.modulo);
    s3.addChart(
      pptx.ChartType.bar,
      [
        { name: "Concluídas", labels, values: linhas.map((l) => l.acoes_concluidas) },
        { name: "Em aberto", labels, values: linhas.map((l) => l.acoes_em_aberto) },
      ],
      {
        x: 0.5, y: 1.1, w: 9, h: 4,
        barDir: "col", barGrouping: "stacked",
        chartColors: [TEAL, AMBER],
        showLegend: true, legendPos: "b", legendFontFace: "Calibri", legendFontSize: 11,
        showValue: true, dataLabelColor: "FFFFFF", dataLabelFontFace: "Calibri", dataLabelFontSize: 10,
        catAxisLabelFontFace: "Calibri", catAxisLabelFontSize: 10, catAxisLabelRotate: -20,
        valAxisLabelFontFace: "Calibri", valAxisLabelFontSize: 10,
      },
    );

    // ---------- Slide 4 — Mapeamento ----------
    const s4 = pptx.addSlide();
    s4.background = { color: NAVY };
    s4.addText("Mapeamento por módulo", { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: "Cambria", fontSize: 28, bold: true, color: "FFFFFF" });
    const corStatus = (s: string) => (s === "Sob controle" ? TEAL : s === "Atenção" ? AMBER : ICE);
    const head = ["Módulo", "Criadas", "Concluídas", "Em aberto", "Valor / Qtd.", "Status"].map((t) => ({
      text: t, options: { fill: { color: ICE }, color: NAVY, bold: true, fontFace: "Calibri", fontSize: 11 },
    }));
    const corpo = linhasOrdenadas.map((l, i) => {
      const bg = i % 2 === 0 ? "27356F" : "1E2761";
      const base = { fill: { color: bg }, color: "FFFFFF", fontFace: "Calibri", fontSize: 10 };
      return [
        { text: l.modulo, options: base },
        { text: num(l.acoes_criadas), options: { ...base, align: "right" as const } },
        { text: num(l.acoes_concluidas), options: { ...base, align: "right" as const } },
        { text: num(l.acoes_em_aberto), options: { ...base, align: "right" as const } },
        { text: valorTxt(l), options: { ...base, align: "right" as const } },
        { text: l.status_geral, options: { ...base, color: corStatus(l.status_geral), bold: true } },
      ];
    });
    s4.addTable([head, ...corpo], {
      x: 0.5, y: 1.15, w: 9, colW: [3, 1, 1.3, 1.2, 1.5, 1],
      border: { type: "solid", color: NAVY, pt: 1 }, autoPage: false,
    });

    // ---------- Slide 5 — Destaques ----------
    const s5 = pptx.addSlide();
    s5.background = { color: "FFFFFF" };
    s5.addText("Destaques de risco do período", { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: "Cambria", fontSize: 28, bold: true, color: NAVY });
    const dOrd = [...destaques].sort((a, b) => Math.abs(Number(b.valor ?? 0)) - Math.abs(Number(a.valor ?? 0))).slice(0, 8);
    const head5 = ["Descrição", "Módulo", "Data", "Valor"].map((t) => ({
      text: t, options: { fill: { color: NAVY }, color: "FFFFFF", bold: true, fontFace: "Calibri", fontSize: 11 },
    }));
    const corpo5 = dOrd.map((d, i) => {
      const base = { fill: { color: i % 2 === 0 ? "F4F5FA" : "FFFFFF" }, color: "2B2B2B", fontFace: "Calibri", fontSize: 10 };
      return [
        { text: d.texto, options: base },
        { text: d.modulo, options: base },
        { text: d.data_evento ? new Date(`${d.data_evento}T00:00:00`).toLocaleDateString("pt-BR") : "—", options: base },
        { text: d.valor === null ? "—" : brl(Number(d.valor)), options: { ...base, align: "right" as const } },
      ];
    });
    if (corpo5.length) {
      s5.addTable([head5, ...corpo5], {
        x: 0.5, y: 1.15, w: 9, colW: [4.2, 2, 1.3, 1.5],
        border: { type: "solid", color: "D8DAE5", pt: 1 }, autoPage: false,
      });
    }
    s5.addText(
      `Lista completa de destaques (${destaques.length} itens) disponível no relatório detalhado exportado pelo sistema.`,
      { x: 0.5, y: 4.95, w: 9, h: 0.3, fontFace: "Calibri", fontSize: 10, italic: true, color: CINZA },
    );

    const nome = modo === "mes"
      ? `fechamento_${ano}-${String(mes).padStart(2, "0")}.pptx`
      : `fechamento_${periodo.inicio}_${periodo.fim}.pptx`;
    await pptx.writeFile({ fileName: nome });
    toast.success("Apresentação gerada");
  }


  function SortHead({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const ativo = sort.k === k;
    const Icon = !ativo ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => setSort((s) => ({ k, dir: s.k === k && s.dir === "desc" ? "asc" : "desc" }))}
        >
          {children} <Icon className="size-3.5 opacity-60" />
        </button>
      </TableHead>
    );
  }

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fechamento Mensal</h1>
          <p className="text-sm text-muted-foreground">
            Consolidação por período dos seis módulos de controle e mapeamento de riscos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportarPdf} className="gap-2">
            <Download className="size-4" /> Exportar fechamento
          </Button>
          {podeFechar && modo === "mes" && (
            <Button onClick={fecharMes} disabled={salvando || atualQ.isLoading} className="gap-2">
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Fechar o mês
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Período</div>
            <Select value={modo} onValueChange={(v) => setModo(v as "mes" | "custom")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mês/ano</SelectItem>
                <SelectItem value="custom">Intervalo customizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modo === "mes" ? (
            <>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Mês</div>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Ano</div>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[hoje.getFullYear() - 2, hoje.getFullYear() - 1, hoje.getFullYear()].map((a) => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">De</div>
                <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Até</div>
                <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-40" />
              </div>
            </>
          )}
          <div className="text-xs text-muted-foreground pb-2">
            Comparando com {anterior.inicio} a {anterior.fim}
            {fechamentoQ.data && (
              <> · <Badge variant="secondary" className="ml-1">Mês congelado em {new Date(fechamentoQ.data.updated_at).toLocaleDateString("pt-BR")}</Badge></>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Ações criadas" valor={num(tot.criadas)} icon={ClipboardList}>
          <Variacao atual={tot.criadas} anterior={totAnt.criadas} />
        </KpiCard>
        <KpiCard titulo="Ações concluídas" valor={num(tot.concluidas)} icon={CheckCircle2}>
          <Variacao atual={tot.concluidas} anterior={totAnt.concluidas} />
        </KpiCard>
        <KpiCard titulo="Em aberto" valor={num(tot.abertas)} icon={ShieldAlert}>
          <Variacao atual={tot.abertas} anterior={totAnt.abertas} invertido />
        </KpiCard>
        <KpiCard titulo="Aderência FEFO" valor={tot.aderencia === null ? "—" : `${num(tot.aderencia)}%`} icon={CalendarCheck}>
          <Variacao atual={tot.aderencia} anterior={totAnt.aderencia} />
        </KpiCard>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Concluídas x em aberto por módulo</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosGrafico} margin={{ top: 8, right: 12, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="modulo" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <RTooltip />
              <Legend />
              <Bar dataKey="Concluídas" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Em aberto" stackId="a" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />

            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Mapeamento por módulo</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="modulo">Módulo</SortHead>
                  <SortHead k="acoes_criadas" className="text-right">Criadas</SortHead>
                  <SortHead k="acoes_concluidas" className="text-right">Concluídas</SortHead>
                  <SortHead k="acoes_em_aberto" className="text-right">Em aberto</SortHead>
                  <SortHead k="valor_ou_quantidade" className="text-right">Valor / Qtd.</SortHead>
                  <SortHead k="status_geral">Status geral</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atualQ.isLoading && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                )}
                {!atualQ.isLoading && linhasOrdenadas.map((l) => (
                  <TableRow key={l.modulo}>
                    <TableCell className="font-medium">{l.modulo}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.acoes_criadas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.acoes_concluidas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.acoes_em_aberto)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.unidade_valor === "R$" ? brl(l.valor_ou_quantidade) : `${num(l.valor_ou_quantidade)} ${l.unidade_valor}`}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        l.status_geral === "Sob controle" ? "bg-success/15 text-success"
                          : l.status_geral === "Atenção" ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                      }>{l.status_geral}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Destaques de risco do período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {destaques.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum evento relevante registrado no período.</p>
          )}
          {destaques.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary" className="shrink-0">{d.modulo}</Badge>
                <span className="text-sm">{d.texto}</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                {d.data_evento ? new Date(`${d.data_evento}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                {d.valor !== null && <> · {num(Number(d.valor))}</>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
