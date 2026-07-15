import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ScanLine, ClipboardList, Target, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean };

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { canWrite, isAdmin } = useRole();

  const items: Item[] = [
    { to: "/dashboard", label: "Início", icon: Home, show: true },
    { to: "/scanner", label: "Scanner", icon: ScanLine, show: canWrite },
    { to: "/contar", label: "Contar", icon: ClipboardList, show: canWrite },
    { to: "/gestao/minhas-tarefas", label: "Tarefas", icon: Target, show: true },
  ].filter((i) => i.show);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação principal"
    >
      <div className="grid grid-cols-5 h-16">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              {it.label}
            </Link>
          );
        })}
        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
          Menu
        </button>
        {isAdmin ? null : null}
      </div>
    </nav>
  );
}
