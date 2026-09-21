import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/inventory";
import { fetchAll } from "@/lib/fetch-all";
import { Gift, Utensils, Sparkles, Package } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/baixas/investimento-operacional")({
  component: InvestimentoOperacionalDashboard,
  head: () => ({ meta: [
    { title: "Investimento Operacional — Controle Operacional" },
    { name: "description", content: "Acompanhamento de baixas por Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo, tratadas como investimento operacional, não perda." },
    { property: "og:title", content: "Investimento Operacional — Controle Operacional" },
    { property: "og:description", content: "Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo por área, operação, almoxarifado e período." },
  ] }),
});

const MOTIVOS_ALVO = ["Cortesia", "Degustação", "Sensorial/Inovações", "Uso e Consumo"];
const PALETTE: Record<string, string> = {
  "Cortesia": "#4FC3F7",
  "Degustação": "#81C784",
  "Sensorial/Inovações": "#BA68C8",
  "Uso e Consumo": "#FFB74D",
};
const ICONS: Record<string, any> = { "Cortesia": Gift, "Degustação": Utensils, "Sensorial/Inovações": Sparkles, "Uso e Consumo": Package };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function fmtMonth(k: string) {
  const [y, m] = k.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? k}/${y.slice(2)}`;
}

function BiPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-[hsl(220_18%_12%)] text-slate-100 shadow-lg overflow-hidden">
      <div className="px-4 pt-3 pb-2 text-center">
        <div className="text-sm font-semibold tracking-wide">{title}</div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function InvestimentoOperacionalDashboard() {
  const [from, setFrom] = useState<string>(isoDaysAgo(90));
  const [to, setTo] = useState<string>(todayISO());

  const motivosQ = useQuery({
    queryKey: ["motivos-invest-op"],
    queryFn: async () => (await supabase.from("motivo_baixa").select("id, descricao")).data ?? [],
  });

  const baixasQ = useQuery({
    queryKey: ["baixas-invest-op", from, to, motivosQ.data?.length],
    enabled: !!motivosQ.data,
    queryFn: async () => {
      const ids = (motivosQ.data ?? []).filter((m) => MOTIVOS_ALVO.includes(m.descricao)).map((m) => m.id);
      if (!ids.length) return [];
      const fromTs = new Date(from + "T00:00:00").toISOString();
      const toTs = new Date(to + "T23:59:59").toISOString();
      return fetchAll<any>((f, t) =>
        (supabase as any)
          .from("baixa_operacional")
          .select("id, codigo_produto, descricao, id_local, motivo_baixa_id, contexto_baixa, valor_total, quantidade, data_solicitacao, responsavel_nome, status_fluxo")
          .in("motivo_baixa_id", ids)
          .neq("status_fluxo", "REPROVADA")
          .gte("data_solicitacao", fromTs)
          .lte("data_solicitacao", toTs)
          .range(f, t),
      );
    },
  });

  const view = useMemo(() => {
    const motivos = motivosQ.data ?? [];
    const motivoNome = new Map(motivos.map((m) => [m.id, m.descricao]));
    const baixas = baixasQ.data ?? [];

    const totalGeral = baixas.reduce((s, b) => s + Number(b.valor_total || 0), 0);

    const porMotivo = new Map<string, { valor: number; qtd: number }>();
    for (const nome of MOTIVOS_ALVO) porMotivo.set(nome, { valor: 0, qtd: 0 });
    baixas.forEach((b) => {
      const nome = motivoNome.get(b.motivo_baixa_id) ?? "—";
      const cur = porMotivo.get(nome) ?? { valor: 0, qtd: 0 };
      cur.valor += Number(b.valor_total || 0);
      cur.qtd += 1;
      porMotivo.set(nome, cur);
    });
    const kpisMotivo = MOTIVOS_ALVO.map((nome) => ({ nome, ...porMotivo.get(nome)! }));
    const barrasMotivo = kpisMotivo.map((k) => ({ nome: k.nome, valor: k.valor }));

    // Tendência mensal (empilhado por motivo)
    const meses = new Set<string>();
    baixas.forEach((b) => meses.add(String(b.data_solicitacao).slice(0, 7)));
    const mesesOrdenados = [...meses].sort();
    const tendencia = mesesOrdenados.map((mk) => {
      const row: Record<string, any> = { mes: fmtMonth(mk) };
      MOTIVOS_ALVO.forEach((nome) => (row[nome] = 0));
      return row;
    });
    baixas.forEach((b) => {
      const mk = String(b.data_solicitacao).slice(0, 7);
      const idx = mesesOrdenados.indexOf(mk);
      if (idx < 0) return;
      const nome = motivoNome.get(b.motivo_baixa_id) ?? "—";
      if (!MOTIVOS_ALVO.includes(nome)) return;
      tendencia[idx][nome] = (Number(tendencia[idx][nome]) || 0) + Number(b.valor_total || 0);
    });

    // Ranking por área (Cortesia) e por operação (Degustação), a partir de contexto_baixa
    function ranking(motivoNomeAlvo: string) {
      const m = new Map<string, { valor: number; qtd: number }>();
      baixas.forEach((b) => {
        if (motivoNome.get(b.motivo_baixa_id) !== motivoNomeAlvo) return;
        const chave = b.contexto_baixa || "Não informado";
        const cur = m.get(chave) ?? { valor: 0, qtd: 0 };
        cur.valor += Number(b.valor_total || 0);
        cur.qtd += 1;
        m.set(chave, cur);
      });
      return [...m.entries()].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.valor - a.valor);
    }
    const rankingAreaCortesia = ranking("Cortesia");
    const rankingOperacaoDegustacao = ranking("Degustação");

    // Tabela detalhada (mais recentes primeiro, limitada)
    const tabela = [...baixas]
      .sort((a, b) => String(b.data_solicitacao).localeCompare(String(a.data_solicitacao)))
      .slice(0, 300)
      .map((b) => ({ ...b, motivoNome: motivoNome.get(b.motivo_baixa_id) ?? "—" }));

    return { totalGeral, kpisMotivo, barrasMotivo, tendencia, rankingAreaCortesia, rankingOperacaoDegustacao, tabela };
  }, [baixasQ.data, motivosQ.data]);

  const loading = motivosQ.isLoading || baixasQ.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Investimento Operacional</h1>
        <p className="text-sm text-muted-foreground">
          Cortesia, Degustação, Sensorial/Inovações e Uso e Consumo — tratados como investimento operacional, não perda.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total investido no período</div>
            <div className="text-2xl font-bold">{formatBRL(view.totalGeral)}</div>
          </CardContent>
        </Card>
        {view.kpisMotivo.map((k) => {
          const Icon = ICONS[k.nome];
          return (
            <Card key={k.nome}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {Icon && <Icon className="size-3.5" style={{ color: PALETTE[k.nome] }} />}
                  {k.nome}
                </div>
                <div className="text-xl font-bold">{formatBRL(k.valor)}</div>
                <div className="text-xs text-muted-foreground">{k.qtd} baixa(s)</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BiPanel title="Valor por motivo">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={view.barrasMotivo} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
              <XAxis dataKey="nome" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickFormatter={(v) => formatBRL(v)} width={80} />
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {view.barrasMotivo.map((entry, i) => <Cell key={i} fill={PALETTE[entry.nome] ?? "#4FC3F7"} />)}
                <LabelList dataKey="valor" position="top" formatter={(v: number) => formatBRL(v)} style={{ fill: "#e2e8f0", fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </BiPanel>

        <BiPanel title="Tendência mensal por motivo">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={view.tendencia} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
              <XAxis dataKey="mes" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickFormatter={(v) => formatBRL(v)} width={80} />
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "#111c24", border: "1px solid #2a3548" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {MOTIVOS_ALVO.map((nome) => (
                <Bar key={nome} dataKey={nome} stackId="a" fill={PALETTE[nome]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </BiPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Cortesia — Área que solicitou</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Área</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {view.rankingAreaCortesia.map((r) => (
                  <TableRow key={r.chave}>
                    <TableCell>{r.chave}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
                {!view.rankingAreaCortesia.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma baixa de Cortesia no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Degustação — Operação</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Operação</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {view.rankingOperacaoDegustacao.map((r) => (
                  <TableRow key={r.chave}>
                    <TableCell>{r.chave}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                  </TableRow>
                ))}
                {!view.rankingOperacaoDegustacao.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma baixa de Degustação no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{view.tabela.length} lançamento(s) recente(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Contexto</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.tabela.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{String(b.data_solicitacao).slice(0, 10).split("-").reverse().join("/")}</TableCell>
                  <TableCell className="font-mono text-xs">{b.codigo_produto}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{b.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" style={{ background: `${PALETTE[b.motivoNome]}22`, color: PALETTE[b.motivoNome] }}>{b.motivoNome}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{b.contexto_baixa || "—"}</TableCell>
                  <TableCell className="text-xs">{b.id_local || "—"}</TableCell>
                  <TableCell className="text-xs">{b.responsavel_nome || "—"}</TableCell>
                  <TableCell className="text-right">{b.quantidade}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(b.valor_total)}</TableCell>
                </TableRow>
              ))}
              {!view.tabela.length && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{loading ? "Carregando..." : "Nenhum lançamento no período."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
