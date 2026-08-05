import { createFileRoute, Link } from "@tanstack/react-router";
import { ExportarHtmlButton } from "@/components/app/ExportarHtmlButton";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Boxes, ClipboardList, Compass, Sparkles, AlertTriangle } from "lucide-react";
import { formatBRL, formatNum } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/suprimentos/dashboard")({
  component: SuprimentosDashboard,
  head: () => ({ meta: [{ title: "Dashboard Suprimentos" }] }),
});

function SuprimentosDashboard() {
  const estoqueQ = useQuery({
    queryKey: ["dash_sup_estoque"],
    queryFn: async () =>
      fetchAll<{ quantidade: number; custo_unitario: number; id_produto: string; origem: string }>((from, to) =>
        supabase.from("estoque_sistemico")
          .select("quantidade, custo_unitario, id_produto, origem")
          .order("id_produto").range(from, to),
      ),
  });

  const reqQ = useQuery({
    queryKey: ["dash_sup_req"],
    queryFn: async () => {
      const { data } = await supabase.from("requisicoes" as never).select("status, valor_total, created_at");
      return (data ?? []) as unknown as { status: string; valor_total: number; created_at: string }[];
    },
  });

  const demandasQ = useQuery({
    queryKey: ["dash_sup_dem"],
    queryFn: async () => {
      const { data } = await supabase.from("demanda_extra" as never).select("status");
      return (data ?? []) as unknown as { status: string }[];
    },
  });

  const paramsQ = useQuery({
    queryKey: ["dash_sup_params"],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_abastecimento" as never).select("origem, ativo").eq("ativo", true);
      return (data ?? []) as unknown as { origem: string }[];
    },
  });

  const kpis = useMemo(() => {
    const est = estoqueQ.data ?? [];
    const valorEstoque = est.reduce((s, r: { quantidade: number; custo_unitario: number }) => s + Number(r.quantidade) * Number(r.custo_unitario), 0);
    const skus = new Set(est.map((r: { id_produto: string }) => r.id_produto)).size;
    const reqs = reqQ.data ?? [];
    const pendentes = reqs.filter((r) => r.status === "ENVIADA").length;
    const aprovadas = reqs.filter((r) => r.status === "APROVADA").length;
    const rejeitadas = reqs.filter((r) => r.status === "REJEITADA").length;
    const valorReq = reqs.reduce((s, r) => s + Number(r.valor_total ?? 0), 0);
    const demPend = (demandasQ.data ?? []).filter((d) => d.status === "PENDENTE").length;
    const almox = (paramsQ.data ?? []).length;
    return { valorEstoque, skus, pendentes, aprovadas, rejeitadas, valorReq, demPend, almox };
  }, [estoqueQ.data, reqQ.data, demandasQ.data, paramsQ.data]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="size-6" /> Dashboard Suprimentos</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada de estoque, requisições e abastecimento.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Boxes} label="Valor de estoque" value={formatBRL(kpis.valorEstoque)} />
        <KPI icon={Boxes} label="SKUs em estoque" value={String(kpis.skus)} />
        <KPI icon={Compass} label="Almox planejados" value={String(kpis.almox)} />
        <KPI icon={Sparkles} label="Demandas pendentes" value={String(kpis.demPend)} tone={kpis.demPend ? "warning" : undefined} />
        <KPI icon={ClipboardList} label="Requisições pendentes" value={String(kpis.pendentes)} tone={kpis.pendentes ? "warning" : undefined} />
        <KPI icon={ClipboardList} label="Requisições aprovadas" value={String(kpis.aprovadas)} />
        <KPI icon={AlertTriangle} label="Requisições rejeitadas" value={String(kpis.rejeitadas)} tone={kpis.rejeitadas ? "danger" : undefined} />
        <KPI icon={ClipboardList} label="Valor em requisições" value={formatBRL(kpis.valorReq)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Atalhos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <Atalho to="/suprimentos/estoque" label="Posição de Estoque" icon={Boxes} />
            <Atalho to="/suprimentos/requisicoes" label="Requisições" icon={ClipboardList} />
            <Atalho to="/abastecimento/planejamento" label="Abastecimento" icon={Compass} />
            <Atalho to="/abastecimento/demandas" label="Demandas Extras" icon={Sparkles} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Últimas requisições</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(reqQ.data ?? []).slice(0, 8).map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b last:border-0 py-1.5">
                <span className="text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                <Badge variant="outline" className="text-xs">{r.status}</Badge>
                <span className="tabular-nums text-xs">{formatBRL(Number(r.valor_total ?? 0))}</span>
              </div>
            ))}
            {(reqQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhuma requisição ainda.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "warning" | "danger" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "";
  return (
    <Card><CardContent className="p-4 flex items-start gap-3">
      <Icon className="size-4 text-muted-foreground mt-1" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      </div>
    </CardContent></Card>
  );
}

function Atalho({ to, label, icon: Icon }: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent transition-colors">
      <Icon className="size-4 text-primary" />
      <span className="font-medium">{label}</span>
    </Link>
  );
}
