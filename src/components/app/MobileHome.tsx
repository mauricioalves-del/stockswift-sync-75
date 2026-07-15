import { Link } from "@tanstack/react-router";
import {
  ScanLine, ClipboardList, RotateCcw, Target, PackageMinus, Boxes,
  Truck, BarChart3, Users as UsersIcon, Settings as SettingsIcon,
  LayoutDashboard, FileBarChart2, Warehouse, BadgeCheck,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

type Tile = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "warning" | "info" | "default";
  role: "any" | "write" | "admin";
};

const TILES: Tile[] = [
  { to: "/scanner", label: "Scanner", icon: ScanLine, tone: "primary", role: "write" },
  { to: "/contar", label: "Contar", icon: ClipboardList, tone: "success", role: "write" },
  { to: "/recontagem", label: "Recontagem", icon: RotateCcw, tone: "warning", role: "write" },
  { to: "/gestao/minhas-tarefas", label: "Minhas Tarefas", icon: Target, tone: "info", role: "any" },
  { to: "/missoes", label: "Missões", icon: Target, role: "admin" },
  { to: "/baixas", label: "Baixas", icon: PackageMinus, role: "write" },
  { to: "/suprimentos/estoque", label: "Estoque", icon: Boxes, role: "any" },
  { to: "/suprimentos/requisicoes", label: "Requisições", icon: Truck, role: "write" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, role: "any" },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart2, role: "any" },
  { to: "/origens", label: "Almox", icon: Warehouse, role: "write" },
  { to: "/abc", label: "ABC", icon: BarChart3, role: "admin" },
  { to: "/usuarios", label: "Usuários", icon: UsersIcon, role: "admin" },
  { to: "/config", label: "Configurações", icon: SettingsIcon, role: "admin" },
];

const TONE: Record<NonNullable<Tile["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  default: "bg-muted text-foreground",
};

export function MobileHome() {
  const { role, isAdmin, canWrite } = useRole();
  const perms = usePermissions();

  const canByRole = (r: Tile["role"]) =>
    r === "any" || (r === "write" && canWrite) || (r === "admin" && isAdmin);

  const canSee = (t: Tile) => {
    if (isAdmin) return true;
    if (perms.isMapped(t.to)) return perms.canView(t.to);
    return canByRole(t.role);
  };

  const visible = TILES.filter(canSee);

  return (
    <div className="space-y-5 pb-4">
      <div
        className="rounded-2xl p-5 text-sidebar-foreground shadow-md"
        style={{ background: "var(--gradient-amazon)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="size-11 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: "var(--gradient-gold)" }}
          >
            <BadgeCheck className="size-6 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest opacity-80">
              Mágio Chocolates
            </div>
            <h1 className="text-lg font-bold leading-tight truncate">Bem-vindo(a)</h1>
            {role && (
              <div className="text-[11px] opacity-80 mt-0.5">Perfil: {role}</div>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Ações rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.to + t.label}
                to={t.to}
                className={cn(
                  "group rounded-2xl border border-border bg-card p-4 flex flex-col gap-3",
                  "active:scale-[0.98] transition-transform shadow-sm hover:shadow-md",
                )}
              >
                <div
                  className={cn(
                    "size-11 rounded-xl flex items-center justify-center",
                    TONE[t.tone ?? "default"],
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="text-sm font-semibold leading-tight">{t.label}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
