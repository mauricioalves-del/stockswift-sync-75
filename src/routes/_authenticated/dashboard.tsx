import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BadgeCheck, PackageMinus, ShieldAlert, Gauge, Factory, Target, Truck,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import heroAsset from "@/assets/estoque-hero.png.asset.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Início — Controle Operacional" },
      { name: "description", content: "Central de controle operacional: baixas, shelf life, produção, inventário e suprimentos." },
    ],
  }),
});

const PILARES = [
  { to: "/baixas", icon: PackageMinus, title: "Baixas Operacionais", description: "Solicitação, aprovação e rastreabilidade das baixas." },
  { to: "/shelf-life/risco", icon: ShieldAlert, title: "Mapeamento de Risco", description: "Exposição financeira por validade e criticidade de lote." },
  { to: "/shelf-life/farol", icon: Gauge, title: "Farol de Shelf", description: "Faixas 0-30, 31-60 e 61-90 dias com ações prioritárias." },
  { to: "/producao/dispersao", icon: Factory, title: "Produção", description: "Dispersão de lote, consumo e análise de ordens de produção." },
  { to: "/missoes", icon: Target, title: "Missões de Inventário", description: "Contagens, recontagens e quebras de FEFO por missão." },
  { to: "/suprimentos/dashboard", icon: Truck, title: "Dashboard Suprimentos", description: "Estoque, requisições e planejamento de abastecimento." },
];

function HomePage() {
  const { isAdmin } = useRole();

  return (
    <div className="w-full space-y-6">
      <section
        className="relative overflow-hidden rounded-3xl border border-border shadow-lg"
        style={{
          backgroundImage: `url(${heroAsset.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "var(--gradient-amazon)", mixBlendMode: "multiply" }}
        />
        <div className="relative px-6 py-10 md:px-12 md:py-16 text-sidebar-foreground">
          <div className="max-w-3xl space-y-4">
            <div className="text-[11px] uppercase tracking-[0.25em] opacity-80">
              Mágio Chocolates
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Controle Operacional
            </h1>
            <p className="text-sm md:text-base opacity-90 leading-relaxed max-w-2xl">
              Gestão integrada de estoque, validade, produção e suprimentos — com foco em
              acuracidade, redução de perdas e decisão rápida.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="gap-2">
                <Link to="/gestao/minhas-tarefas">
                  <BadgeCheck className="size-5" />
                  Acessar tarefas
                </Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="secondary" size="lg">
                  <Link to="/config">Configurações</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Pilares do sistema
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILARES.map((p) => {
            const Icon = p.icon;
            return (
              <Link key={p.to} to={p.to} className="group block">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/40">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground leading-tight">{p.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-snug">{p.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
