import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chaveObs, confirmadoPorMovimento, fmtBRL, useAcoesObsoleto, useItensObsoletos, useTiposAcaoObsoleto } from "@/lib/obsoletos";

export const Route = createFileRoute("/_authenticated/obsoletos/dashboard")({
  component: DashboardObsoletos,
  head: () => ({
    meta: [
      { title: "Obsoletos — Dashboard de Recuperação" },
      { name: "description", content: "Valor recuperado pelas ações sobre itens obsoletos, por tipo e por mês." },
      { property: "og:title", content: "Obsoletos — Dashboard de Recuperação" },
      { property: "og:description", content: "Resultado das ações de recuperação de obsoletos." },
    ],
  }),
});

function DashboardObsoletos() {
  const acoes = useAcoesObsoleto();
  const itens = useItensObsoletos();
  const tipos = useTiposAcaoObsoleto();

  const d = useMemo(() => {
    const atuais = new Map((itens.data ?? []).map((i) => [chaveObs(i.id_produto, i.almoxarifado, i.lote), i]));
    const tipoNome = new Map((tipos.data ?? []).map((t) => [t.id, t.nome]));
    const validas = (acoes.data ?? []).filter((a) => a.status !== "CANCELADA");
    const concl = validas.filter((a) => a.status === "CONCLUIDA");
    const rec = (a: any) => Number(a.valor_recuperado || 0) + Number(a.saving_recuperado || 0);
    const emRiscoTotal = (itens.data ?? []).reduce((s, i) => s + Number(i.valor || 0), 0);
    const enderecado = validas.reduce((s, a) => s + Number(a.valor_em_risco || 0), 0);
    const recuperado = concl.reduce((s, a) => s + rec(a), 0);
    const confirmadas = concl.filter((a) => confirmadoPorMovimento(a, atuais));
    const recConfirmado = confirmadas.reduce((s, a) => s + rec(a), 0);

    const porTipo = new Map<string, { tipo: string; Recuperado: number; Enderecado: number }>();
    validas.forEach((a) => {
      const t = tipoNome.get(a.tipo_acao_id ?? "") ?? "Sem tipo";
      const c = porTipo.get(t) ?? { tipo: t, Recuperado: 0, Enderecado: 0 };
      c.Enderecado += Number(a.valor_em_risco || 0);
      if (a.status === "CONCLUIDA") c.Recuperado += rec(a);
      porTipo.set(t, c);
    });
    const porMes = new Map<string, { mes: string; Recuperado: number; Confirmado: number }>();
    concl.forEach((a) => {
      const m = (a.concluido_em ?? a.data_acao).slice(0, 7);
      const c = porMes.get(m) ?? { mes: m, Recuperado: 0, Confirmado: 0 };
      c.Recuperado += rec(a);
      if (confirmadoPorMovimento(a, atuais)) c.Confirmado += rec(a);
      porMes.set(m, c);
    });
    return {
      emRiscoTotal, enderecado, recuperado, recConfirmado,
      qtd: validas.length, qtdConcl: concl.length, qtdConf: confirmadas.length,
      abertas: validas.length - concl.length,
      porTipo: [...porTipo.values()].sort((a, b) => b.Enderecado - a.Enderecado),
      porMes: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({ ...x, mes: x.mes.split("-").reverse().join("/") })),
    };
  }, [acoes.data, itens.data, tipos.data]);

  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Dashboard de Recuperação — Obsoletos</h1>
        <p className="text-sm text-muted-foreground">Valor recuperado = receita + saving informados nas ações concluídas. "Confirmado" = o item também saiu do radar ou voltou a movimentar depois da ação.</p>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi title="Valor em risco hoje" value={fmtBRL(d.emRiscoTotal)} />
        <Kpi title="Valor endereçado por ações" value={fmtBRL(d.enderecado)} hint={`${d.qtd} ação(ões) · ${d.abertas} em aberto`} />
        <Kpi title="Valor recuperado" value={fmtBRL(d.recuperado)} hint={`${d.qtdConcl} concluída(s) · ${pct(d.recuperado, d.enderecado)} do endereçado`} />
        <Kpi title="Recuperado confirmado pela movimentação" value={fmtBRL(d.recConfirmado)} hint={`${d.qtdConf} de ${d.qtdConcl} concluída(s)`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Por tipo de ação</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer>
              <BarChart data={d.porTipo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar dataKey="Enderecado" name="Endereçado" fill="var(--chart-2)" />
                <Bar dataKey="Recuperado" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recuperação por mês</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer>
              <BarChart data={d.porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar dataKey="Recuperado" fill="var(--chart-2)" />
                <Bar dataKey="Confirmado" name="Confirmado pela movimentação" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </CardContent></Card>
  );
}
