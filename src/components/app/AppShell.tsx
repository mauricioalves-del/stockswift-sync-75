import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Upload, ClipboardList, ScanLine, RotateCcw, FileBarChart2,
  Users as UsersIcon, ScrollText, Settings as SettingsIcon, LogOut, Menu, X,
  Sun, Moon, Wifi, WifiOff, Boxes, RefreshCw, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listPendingCounts } from "@/lib/idb";
import { syncPendingCounts } from "@/lib/sync";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, role: "any" as const },
  { to: "/importar", label: "Importar Estoque", icon: Upload, role: "write" as const },
  { to: "/grupos", label: "Grupos", icon: Layers, role: "write" as const },
  { to: "/inventario", label: "Inventário", icon: ClipboardList, role: "any" as const },
  { to: "/contar", label: "Contagem", icon: ClipboardList, role: "write" as const },
  { to: "/scanner", label: "Scanner", icon: ScanLine, role: "write" as const },
  { to: "/recontagem", label: "Recontagem", icon: RotateCcw, role: "write" as const },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart2, role: "any" as const },
  { to: "/usuarios", label: "Usuários", icon: UsersIcon, role: "admin" as const },
  { to: "/logs", label: "Auditoria", icon: ScrollText, role: "admin" as const },
  { to: "/config", label: "Configurações", icon: SettingsIcon, role: "admin" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, isAdmin, canWrite } = useRole();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();

  const pendingQ = useQuery({
    queryKey: ["pending-counts"],
    queryFn: async () => (await listPendingCounts()).length,
    refetchInterval: 5000,
  });

  // Auto-sync ao voltar online
  useEffect(() => {
    if (online) {
      syncPendingCounts().then(() => {
        qc.invalidateQueries({ queryKey: ["pending-counts"] });
        qc.invalidateQueries({ queryKey: ["inventario"] });
      });
    }
  }, [online, qc]);

  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const visible = NAV.filter((n) => {
    if (n.role === "any") return true;
    if (n.role === "write") return canWrite;
    if (n.role === "admin") return isAdmin;
    return false;
  });

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <SidebarContent items={visible} pathname={pathname} />
      </aside>

      {/* Sidebar mobile */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
            <button className="absolute top-3 right-3 p-2 text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="Fechar">
              <X className="size-5" />
            </button>
            <SidebarContent items={visible} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 px-4 lg:px-6 h-14">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>

            <div className="lg:hidden flex items-center gap-2 mr-auto">
              <Boxes className="size-5 text-primary" />
              <span className="font-semibold">Inventário</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {(pendingQ.data ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await syncPendingCounts();
                    qc.invalidateQueries();
                  }}
                  disabled={!online}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" /> Sincronizar
                  <Badge variant="secondary" className="ml-1">{pendingQ.data}</Badge>
                </Button>
              )}

              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              )}>
                <span className={cn("size-2 rounded-full pulse-dot", online ? "bg-success" : "bg-destructive")} />
                {online ? <><Wifi className="size-3.5" /> Online</> : <><WifiOff className="size-3.5" /> Offline</>}
              </div>

              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>

              {role && <Badge variant="outline" className="hidden sm:inline-flex">{role}</Badge>}

              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  items, pathname, onNavigate,
}: {
  items: typeof NAV;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="size-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
          <Boxes className="size-5" />
        </div>
        <div>
          <div className="font-semibold leading-tight">Inventário</div>
          <div className="text-[10px] text-sidebar-foreground/60 leading-tight">CLOUD · v1.0</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((it) => {
          const Active = pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-colors",
                Active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-[10px] text-sidebar-foreground/50 border-t border-sidebar-border">
        © {new Date().getFullYear()} · Inventário Cloud
      </div>
    </>
  );
}
