import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, PackageMinus, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaixasDashboard } from "@/routes/_authenticated/baixas.dashboard";
import { InvestimentoOperacionalDashboard } from "@/routes/_authenticated/baixas.investimento-operacional";

const VISOES = ["dashboard", "investimento"] as const;
type Visao = (typeof VISOES)[number];

export const Route = createFileRoute("/_authenticated/relatorios_/pacote-baixas")({
  component: PacoteBaixas,
  validateSearch: (s: Record<string, unknown>): { visao?: Visao } => (VISOES.includes(s.visao as Visao) ? { visao: s.visao as Visao } : {}),
  head: () => ({ meta: [
    { title: "Pacote de Baixas — Relatórios" },
    { name: "description", content: "Visibilidade das baixas operacionais: dashboard de perdas e investimento operacional em um só lugar." },
    { property: "og:title", content: "Pacote de Baixas — Relatórios" },
    { property: "og:description", content: "Visibilidade das baixas operacionais: dashboard de perdas e investimento operacional em um só lugar." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function PacoteBaixas() {
  const busca = Route.useSearch();
  const [visao, setVisao] = useState<Visao>(busca.visao ?? "dashboard");
  useEffect(() => { if (busca.visao) setVisao(busca.visao); }, [busca.visao]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <h1 className="flex items-center gap-2 text-xl font-bold"><PackageMinus className="size-5" /> Pacote de Baixas <span className="ml-2 text-sm font-normal text-slate-300">Visibilidade das baixas operacionais</span></h1>
        <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)}>
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value="dashboard" className="text-xs"><BarChart3 className="mr-1 size-3.5" /> Dashboard Baixas</TabsTrigger>
            <TabsTrigger value="investimento" className="text-xs"><Sparkles className="mr-1 size-3.5" /> Investimento Operacional</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {visao === "investimento" ? <InvestimentoOperacionalDashboard embutido /> : <BaixasDashboard embutido />}
    </div>
  );
}
