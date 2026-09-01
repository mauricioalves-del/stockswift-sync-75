import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FlaskConical } from "lucide-react";

/**
 * FONTE DE DADOS: view `v_impacto_consumo`, filtrada por sku_produto_final = '05104122'
 * (Teste Industrial). Confirmado que as OPs de Inovação já chegam nessa view.
 * Aqui usamos APENAS: ano_mes, dt_producao, numero_op, material, desc_material, um,
 * qtd_consumo e custo_unit_medio. Os campos de desvio (qtd_previsto, qtd_dif, impacto_rs,
 * tipo_desvio, tem_furo) são IGNORADOS de propósito: não existe Ficha Técnica estável
 * para Testes Industriais, então "previsto" não tem significado nesta tela.
 * Tela 100% leitura.
 */
export const SKU_TESTE_INDUSTRIAL = "05104122";

export const Route = createFileRoute("/_authenticated/producao/testes-industriais")({
  component: TestesIndustriaisPage,
  head: () => ({ meta: [
    { title: "Testes Industriais — Custo de Inovação" },
    { name: "description", content: "Evolução mês a mês do custo das Ordens de Produção de Testes Industriais (Inovação) da Mágio Chocolates." },
    { property: "og:title", content: "Testes Industriais — Custo de Inovação" },
    { property: "og:description", content: "Acompanhe o gasto mensal, as matérias-primas e as OPs dos Testes Industriais." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Linha = {
  id: string; ano_mes: string; dt_producao: string | null; numero_op: string;
  material: string; desc_material: string | null; um: string | null;
  qtd_consumo: number; custo_unit_medio: number | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
const labelMes = (m: string) => {
  const [a, mm] = m.split("-");
  return `${mm}/${a?.slice(2)}`;
};

function TestesIndustriaisPage() {
  const [mes, setMes] = useState("todos");
  const [material, setMaterial] = useState("");
  const [op, setOp] = useState("todas");
  const [soSemCusto, setSoSemCusto] = useState(false);

  const q = useQuery({
    queryKey: ["testes-industriais", SKU_TESTE_INDUSTRIAL],
    queryFn: async () =>
      await fetchAll<Linha>((from, to) =>
        (supabase as any)
          .from("v_impacto_consumo")
          .select("id, ano_mes, dt_producao, numero_op, material, desc_material, um, qtd_consumo, custo_unit_medio")
          .eq("sku_produto_final", SKU_TESTE_INDUSTRIAL)
          .order("ano_mes", { ascending: true })
          .range(from, to)),
  });

  const base = useMemo(() => (q.data ?? []).map((r) => {
    const qtd = Number(r.qtd_consumo ?? 0);
    const unit = Number(r.custo_unit_medio ?? 0);
    return {
      ...r,
      qtd,
      unit,
      custo: qtd * unit,
      semCusto: qtd > 0 && (!r.custo_unit_medio || unit === 0),
    };
  }), [q.data]);

  const meses = useMemo(() => [...new Set(base.map((r) => r.ano_mes))].sort(), [base]);
  const ops = useMemo(() => [...new Set(base.map((r) => String(r.numero_op)))].sort(), [base]);

  const filtradas = useMemo(() => base.filter((r) => {
    if (mes !== "todos" && r.ano_mes !== mes) return false;
    if (op !== "todas" && String(r.numero_op) !== op) return false;
    if (soSemCusto && !r.semCusto) return false;
    const t = material.trim().toLowerCase();
    if (t && !`${r.material} ${r.desc_material ?? ""}`.toLowerCase().includes(t)) return false;
    return true;
  }), [base, mes, op, material, soSemCusto]);

  // --- KPIs ---
  const gastoTotal = useMemo(() => filtradas.reduce((s, r) => s + r.custo, 0), [filtradas]);
  const opsDistintas = useMemo(() => new Set(filtradas.map((r) => String(r.numero_op))).size, [filtradas]);
  const custoMedioOp = opsDistintas ? gastoTotal / opsDistintas : 0;

  const porMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtradas) m.set(r.ano_mes, (m.get(r.ano_mes) ?? 0) + r.custo);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ano_mes, custo]) => ({ ano_mes, custo }));
  }, [filtradas]);

  const mesAtual = porMes.at(-1);
  const mesAnterior = porMes.at(-2);
  const variacao = mesAtual && mesAnterior && mesAnterior.custo > 0
    ? ((mesAtual.custo - mesAnterior.custo) / mesAnterior.custo) * 100
    : null;

  const linhasMesAtual = useMemo(
    () => (mesAtual ? filtradas.filter((r) => r.ano_mes === mesAtual.ano_mes) : []),
    [filtradas, mesAtual],
  );

  const concentracao = useMemo(() => {
    if (!linhasMesAtual.length || !mesAtual?.custo) return null;
    const m = new Map<string, { nome: string; custo: number }>();
    for (const r of linhasMesAtual) {
      const cur = m.get(r.material) ?? { nome: r.desc_material || r.material, custo: 0 };
      cur.custo += r.custo;
      m.set(r.material, cur);
    }
    const top = [...m.values()].sort((a, b) => b.custo - a.custo)[0];
    if (!top) return null;
    return { nome: top.nome, pct: (top.custo / mesAtual.custo) * 100 };
  }, [linhasMesAtual, mesAtual]);

  const semCustoCount = useMemo(() => filtradas.filter((r) => r.semCusto).length, [filtradas]);

  // --- Gráficos ---
  const topMateriais = useMemo(() => {
    const m = new Map<string, { nome: string; custo: number }>();
    for (const r of filtradas) {
      const cur = m.get(r.material) ?? { nome: r.desc_material || r.material, custo: 0 };
      cur.custo += r.custo;
      m.set(r.material, cur);
    }
    return [...m.values()].sort((a, b) => b.custo - a.custo).slice(0, 10);
  }, [filtradas]);

  const gastoPorOpMes = useMemo(() => {
    const alvo = mes !== "todos" ? filtradas : linhasMesAtual;
    const m = new Map<string, number>();
    for (const r of alvo) m.set(String(r.numero_op), (m.get(String(r.numero_op)) ?? 0) + r.custo);
    return [...m.entries()].map(([numero_op, custo]) => ({ numero_op, custo })).sort((a, b) => b.custo - a.custo);
  }, [filtradas, linhasMesAtual, mes]);

  // Custo unitário médio histórico do material — sobre TODAS as ocorrências do período completo.
  const historico = useMemo(() => {
    const m = new Map<string, { qtd: number; custo: number; ocorr: number }>();
    for (const r of base) {
      const cur = m.get(r.material) ?? { qtd: 0, custo: 0, ocorr: 0 };
      cur.qtd += r.qtd; cur.custo += r.custo; cur.ocorr += 1;
      m.set(r.material, cur);
    }
    return m;
  }, [base]);

  const detalhe = useMemo(
    () => [...filtradas].sort((a, b) => b.custo - a.custo),
    [filtradas],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="size-5 text-primary" />
        <h1 className="text-xl font-bold">Testes Industriais — Custo de Inovação</h1>
        <Badge variant="outline">SKU {SKU_TESTE_INDUSTRIAL}</Badge>
        <span className="text-xs text-muted-foreground">
          Evolução de custo mês a mês. Não há Ficha Técnica estável: nenhuma métrica de furo/desvio é aplicada aqui.
        </span>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {meses.map((m) => <SelectItem key={m} value={m}>{labelMes(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Matéria-prima</label>
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Buscar por código ou descrição…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">OP</label>
            <Select value={op} onValueChange={setOp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as OPs</SelectItem>
                {ops.map((o) => <SelectItem key={o} value={o}>OP {o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Gasto Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(gastoTotal)}</div>
            <div className="text-xs text-muted-foreground">{filtradas.length} linha(s) no período</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Gasto no Mês {mesAtual ? `(${labelMes(mesAtual.ano_mes)})` : ""}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{brl(mesAtual?.custo ?? 0)}</div>
            {variacao === null ? (
              <div className="text-xs text-muted-foreground">sem mês anterior para comparar</div>
            ) : (
              <div className={`text-xs flex items-center gap-1 font-medium ${variacao > 0 ? "text-destructive" : "text-success"}`}>
                {variacao > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {variacao > 0 ? "+" : ""}{variacao.toFixed(1)}% vs. mês anterior
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">OPs Testadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{opsDistintas}</div>
            <div className="text-xs text-muted-foreground">Custo médio por OP: {brl(custoMedioOp)}</div></CardContent>
        </Card>
        <Card className={concentracao && concentracao.pct > 50 ? "border-destructive" : undefined}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Maior Concentração do Mês</CardTitle></CardHeader>
          <CardContent>
            {concentracao ? (
              <>
                <div className={`text-sm font-semibold truncate ${concentracao.pct > 50 ? "text-destructive" : ""}`} title={concentracao.nome}>
                  {concentracao.nome}
                </div>
                <div className={`text-xl font-bold ${concentracao.pct > 50 ? "text-destructive" : ""}`}>
                  {concentracao.pct.toFixed(0)}% do gasto do mês
                </div>
                {concentracao.pct > 50 && (
                  <div className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-3" /> mês puxado por um único evento
                  </div>
                )}
              </>
            ) : <div className="text-sm text-muted-foreground">—</div>}
          </CardContent>
        </Card>
        <Card className={semCustoCount ? "border-warning" : undefined}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Itens sem Custo Cadastrado</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{semCustoCount}</div>
            <Button
              size="sm" variant={soSemCusto ? "default" : "outline"} className="mt-1 h-7 text-xs"
              onClick={() => setSoSemCusto((v) => !v)} disabled={!semCustoCount && !soSemCusto}
            >
              {soSemCusto ? "Mostrando só sem custo" : "Ver itens sem custo"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Gasto total por mês</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 16, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="ano_mes" tickFormatter={labelMes} fontSize={12} />
                <YAxis tickFormatter={compacto} fontSize={12} />
                <RTooltip formatter={(v: any) => brl(Number(v))} labelFormatter={labelMes} />
                <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="custo" position="top" formatter={(v: any) => compacto(Number(v))} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 matérias-primas por custo</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMateriais} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tickFormatter={compacto} fontSize={12} />
                <YAxis type="category" dataKey="nome" width={180} fontSize={11} tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 26)}…` : v)} />
                <RTooltip formatter={(v: any) => brl(Number(v))} />
                <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="custo" position="right" formatter={(v: any) => compacto(Number(v))} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Gasto por OP {mes !== "todos" ? `— ${labelMes(mes)}` : mesAtual ? `— ${labelMes(mesAtual.ano_mes)} (mês mais recente)` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gastoPorOpMes} margin={{ top: 16, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="numero_op" fontSize={12} />
                <YAxis tickFormatter={compacto} fontSize={12} />
                <RTooltip formatter={(v: any) => brl(Number(v))} labelFormatter={(v) => `OP ${v}`} />
                <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="custo" position="top" formatter={(v: any) => compacto(Number(v))} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento — {detalhe.length} linha(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>OP</TableHead>
                <TableHead>Matéria-prima</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>UM</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead className="text-right">Custo unit. médio histórico</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">% do total</TableHead>
                <TableHead>Alerta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalhe.map((r) => {
                const h = historico.get(r.material);
                const mostraHist = !!h && h.ocorr > 1 && h.qtd > 0;
                const unitHist = mostraHist ? h!.custo / h!.qtd : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{labelMes(r.ano_mes)}</TableCell>
                    <TableCell>{r.numero_op}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={`${r.material} — ${r.desc_material ?? ""}`}>
                      {r.material}{r.desc_material ? ` — ${r.desc_material}` : ""}
                    </TableCell>
                    <TableCell className="text-right">{r.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell>{r.um ?? "—"}</TableCell>
                    <TableCell className="text-right">{brl(r.unit)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {unitHist !== null ? brl(unitHist) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{brl(r.custo)}</TableCell>
                    <TableCell className="text-right">{gastoTotal > 0 ? `${((r.custo / gastoTotal) * 100).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell>
                      {r.semCusto && <Badge variant="destructive" className="text-[10px]">⚠ Sem custo</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!detalhe.length && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {q.isLoading ? "Carregando…" : "Nenhum apontamento de Teste Industrial no filtro atual."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fonte: view <code>v_impacto_consumo</code> filtrada por <code>sku_produto_final = '{SKU_TESTE_INDUSTRIAL}'</code>.
        Tela somente leitura. Para desvio contra Ficha Técnica, use{" "}
        <Link to="/producao/dispersao" className="underline">Dispersão de Lote</Link>.
      </p>
    </div>
  );
}
