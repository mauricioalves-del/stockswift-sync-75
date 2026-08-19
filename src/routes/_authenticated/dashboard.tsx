import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, ScanLine, ClipboardList, Boxes, Truck, BarChart3, Target } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Início — Controle Operacional" },
      { name: "description", content: "Central de controle operacional com inventário, scanner, suprimentos e produção." },
    ],
  }),
});

function HomePage() {
  const isMobile = useIsMobile();
  const { isAdmin, canWrite } = useRole();

  if (isMobile) {
    return <MobileLanding />;
  }

  return (
    <div className="w-full min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-4xl space-y-8 text-center">
        <div className="mx-auto size-32 rounded-3xl p-1 shadow-xl" style={{ background: "var(--gradient-gold)" }}>
          <div className="size-full rounded-[22px] bg-card flex items-center justify-center">
            <img
              src="/estoque-icon.png"
              alt="Ícone Controle Operacional"
              className="size-20 object-contain"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Controle Operacional
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Sistema integrado de gestão operacional para controle de estoque, inventário,
            rastreabilidade de lotes, suprimentos, baixas e produção. Tudo em um só lugar,
            com foco em acuracidade, agilidade e tomada de decisão.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          <AtalhoCard
            to="/scanner"
            icon={ScanLine}
            title="Scanner"
            description="Leitura rápida de códigos de barras e QR para contagem e movimentação."
            show={canWrite}
          />
          <AtalhoCard
            to="/contar"
            icon={ClipboardList}
            title="Contagem"
            description="Registre contagens de inventário com múltiplos lotes e validação automática."
            show={canWrite}
          />
          <AtalhoCard
            to="/suprimentos/dashboard"
            icon={Boxes}
            title="Suprimentos"
            description="Estoque, requisições e planejamento de abastecimento por almoxarifado."
            show
          />
          <AtalhoCard
            to="/baixas"
            icon={Truck}
            title="Baixas Operacionais"
            description="Solicitação, aprovação e acompanhamento de baixas com rastreabilidade."
            show={canWrite}
          />
          <AtalhoCard
            to="/producao/dispersao"
            icon={BarChart3}
            title="Produção"
            description="Dispersão de lote, consumo e análise de ordens de produção."
            show
          />
          <AtalhoCard
            to="/gestao/minhas-tarefas"
            icon={Target}
            title="Minhas Tarefas"
            description="Acompanhe missões, tarefas e pendências do seu dia."
            show
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild size="lg" className="gap-2">
            <Link to="/gestao/minhas-tarefas">
              <BadgeCheck className="size-5" />
              Acessar tarefas
            </Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" size="lg">
              <Link to="/config">Configurações</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileLanding() {
  return (
    <div className="w-full py-6 px-4 space-y-6">
      <div className="rounded-2xl p-5 text-sidebar-foreground shadow-md" style={{ background: "var(--gradient-amazon)" }}>
        <div className="flex items-center gap-3">
          <div className="size-14 rounded-xl flex items-center justify-center bg-card/20">
            <img
              src="/estoque-icon.png"
              alt="Ícone Controle Operacional"
              className="size-10 object-contain"
            />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-[11px] uppercase tracking-widest opacity-80">Mágio Chocolates</div>
            <h1 className="text-lg font-bold leading-tight truncate">Controle Operacional</h1>
            <p className="text-[11px] opacity-90 leading-snug mt-0.5">
              Inventário, suprimentos, baixas e produção em um só lugar.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
          Acesso rápido
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <MobileTile to="/gestao/minhas-tarefas" label="Minhas Tarefas" icon={Target} tone="info" />
          <MobileTile to="/suprimentos/dashboard" label="Suprimentos" icon={Boxes} tone="primary" />
          <MobileTile to="/baixas" label="Baixas" icon={Truck} tone="warning" />
          <MobileTile to="/producao/dispersao" label="Produção" icon={BarChart3} tone="default" />
        </div>
      </section>
    </div>
  );
}

function AtalhoCard({
  to,
  icon: Icon,
  title,
  description,
  show,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <Link to={to} className="group block">
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/40">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="size-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function MobileTile({
  to,
  label,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "info" | "warning" | "default";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    info: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
    warning: "bg-warning/15 text-warning-foreground",
    default: "bg-muted text-foreground",
  }[tone];

  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform shadow-sm hover:shadow-md"
    >
      <div className={`size-11 rounded-xl flex items-center justify-center ${toneClass}`}>
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-semibold leading-tight">{label}</div>
    </Link>
  );
}
