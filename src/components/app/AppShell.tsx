import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ClipboardList, ScanLine, RotateCcw, FileBarChart2,
  Users as UsersIcon, ScrollText, Settings as SettingsIcon, LogOut, Menu, X,
  Sun, Moon, Wifi, WifiOff, RefreshCw, Layers, FolderTree, Package, BarChart3,
  Leaf, ChevronDown, ChevronRight, PackageMinus, Target, TrendingUp, Warehouse, Mail,
  Compass, Sparkles, Settings2, Boxes, Truck, AlertTriangle, PanelLeftClose, PanelLeftOpen,
  Factory, GitCompareArrows, CalendarClock, Bell, ArrowRightLeft, CalendarCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listPendingCounts } from "@/lib/idb";
import { syncPendingCounts } from "@/lib/sync";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/app/MobileBottomNav";

type Access = "any" | "write" | "admin" | "gestor";
type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; role: Access };
type NavGroup = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[]; role?: Access };

const NAV: (NavItem | NavGroup)[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, role: "any" } as NavItem,
  {
    id: "cadastro", label: "Cadastro", icon: FolderTree, role: "write",
    items: [
      { to: "/origens", label: "Almox", icon: Warehouse, role: "write" },
      { to: "/motivos-baixa", label: "Motivos de Baixa", icon: PackageMinus, role: "write" },
      { to: "/emails", label: "E-mails", icon: Mail, role: "admin" },
      { to: "/importar", label: "Sincronização de Estoque", icon: RefreshCw, role: "write" },
      { to: "/importar-familias", label: "Importador de Famílias", icon: Leaf, role: "write" },
      { to: "/grupos", label: "Importador de Grupos", icon: Layers, role: "write" },

    ],
  },
  {
    id: "inventario", label: "Inventário", icon: Package, role: "any",
    items: [
      { to: "/contar", label: "Contagem", icon: ClipboardList, role: "write" },
      { to: "/scanner", label: "Scanner", icon: ScanLine, role: "write" },
      { to: "/recontagem", label: "Recontagem", icon: RotateCcw, role: "write" },
      { to: "/quebras-fefo", label: "Quebras de FEFO", icon: AlertTriangle, role: "write" },
    ],
  },
  {
    id: "suprimentos", label: "Suprimentos", icon: Truck, role: "any",
    items: [
      { to: "/suprimentos/dashboard", label: "Dashboard Suprimentos", icon: LayoutDashboard, role: "any" },
      { to: "/suprimentos/estoque", label: "Posição de Estoque", icon: Boxes, role: "any" },
      { to: "/suprimentos/fefo", label: "Controle FEFO", icon: ArrowRightLeft, role: "any" },
      { to: "/suprimentos/requisicoes", label: "Requisições", icon: ClipboardList, role: "write" },
      { to: "/abastecimento/planejamento", label: "Abastecimento", icon: Compass, role: "write" },
      { to: "/abastecimento/demandas", label: "Demandas Extras", icon: Sparkles, role: "write" },
      { to: "/abastecimento/consumo", label: "Importar Consumo", icon: TrendingUp, role: "write" },
      { to: "/abastecimento/parametros", label: "Parâmetros Abastecimento", icon: Settings2, role: "admin" },
      { to: "/config/sazonalidade", label: "Sazonalidade", icon: Sparkles, role: "admin" },
    ],
  },
  {
    id: "producao", label: "Produção", icon: Factory, role: "any",
    items: [
      { to: "/producao/pcp", label: "Análise de Ruptura", icon: Factory, role: "any" },
      { to: "/producao/solicitacao-materiais", label: "Solicitação de Materiais", icon: ClipboardList, role: "write" },
      { to: "/producao/dispersao", label: "Dispersão de Lote", icon: GitCompareArrows, role: "any" },
      { to: "/producao/testes-industriais", label: "Testes Industriais", icon: Factory, role: "any" },

      { to: "/producao/auditoria-ft", label: "Auditoria de Ficha Técnica", icon: ClipboardList, role: "write" },
    ],
  },
  {
    id: "shelf-life", label: "Shelf Life", icon: CalendarClock, role: "gestor",
    items: [
      { to: "/shelf-life/risco", label: "Mapeamento de Risco", icon: AlertTriangle, role: "gestor" },
      { to: "/shelf-life/precos", label: "Cadastro de Preço", icon: Target, role: "gestor" },
      { to: "/shelf-life/acoes", label: "Ações de Lote", icon: Target, role: "gestor" },
      { to: "/shelf-life/farol", label: "Farol de Shelf", icon: BarChart3, role: "gestor" },
      { to: "/shelf-life/dashboard", label: "Dashboard Shelf Life", icon: BarChart3, role: "gestor" },
    ],
  },
  {
    id: "gestao", label: "Gestão", icon: TrendingUp, role: "any",
    items: [
      { to: "/gestao/minhas-tarefas", label: "Minhas Tarefas", icon: ClipboardList, role: "any" },
      { to: "/gestao/planejamento", label: "Planejamento", icon: Target, role: "write" },
      { to: "/gestao/modelos-checklist", label: "Modelos de Checklist", icon: FolderTree, role: "write" },
      { to: "/baixas", label: "Baixas Operacionais", icon: PackageMinus, role: "write" },
      { to: "/baixas/dashboard", label: "Dashboard Baixas", icon: BarChart3, role: "any" },
      { to: "/missoes", label: "Missões de Inventário", icon: Target, role: "admin" },
      { to: "/abc", label: "Classificação ABC", icon: BarChart3, role: "admin" },
    ],
  },
  {
    id: "relatorios", label: "Relatórios", icon: BarChart3, role: "any",
    items: [
      { to: "/dashboard", label: "Dashboard Executivo", icon: LayoutDashboard, role: "any" },
      { to: "/fechamento-mensal", label: "Fechamento Mensal", icon: CalendarCheck, role: "any" },
      { to: "/relatorios", label: "Relatório de Inventário", icon: FileBarChart2, role: "any" },
      { to: "/usuarios", label: "Usuários", icon: UsersIcon, role: "admin" },
      { to: "/logs", label: "Auditoria", icon: ScrollText, role: "admin" },
    ],
  },
  { to: "/config", label: "Configurações", icon: SettingsIcon, role: "admin" } as NavItem,
];

function isGroup(n: NavItem | NavGroup): n is NavGroup { return (n as NavGroup).items !== undefined; }

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, isAdmin, canWrite } = useRole();
  const perms = usePermissions();
  const isCoord = role === "COORDENADOR_CONTROLE";
  const navigate = useNavigate();

  const approvalQ = useQuery({
    queryKey: ["me-approval"],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return { aprovado: true, email: "" };
      const { data } = await (supabase as any).from("profiles").select("aprovado, email, nome").eq("id", uid).maybeSingle();
      return { aprovado: data?.aprovado !== false, email: data?.email ?? "", nome: data?.nome ?? "" };
    },
    refetchInterval: 15000,
  });

  const online = useOnlineStatus();
  const { isDark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("magio.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("magio.sidebar.collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();

  const tarefasQ = useQuery({
    queryKey: ["minhas-tarefas-pendentes"],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return 0;
      const { count } = await (supabase as any)
        .from("tarefas_operacionais")
        .select("id", { count: "exact", head: true })
        .eq("responsavel_id", uid)
        .in("status", ["Pendente", "EmAndamento", "Atrasada"]);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const pendingQ = useQuery({
    queryKey: ["pending-counts"],
    queryFn: async () => (await listPendingCounts()).length,
    refetchInterval: 5000,
  });

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

  // Fallback por papel — usado apenas quando o item não estiver mapeado na matriz.
  const isGerente = role === "GERENTE";
  const canByRole = (r: Access) =>
    r === "any" || (r === "write" && canWrite) || (r === "admin" && (isAdmin || isCoord)) ||
    (r === "gestor" && (isAdmin || isCoord || isGerente));

  const canSee = (item: NavItem) => {
    if (isAdmin) return true;
    if (perms.isMapped(item.to)) return perms.canView(item.to);
    return canByRole(item.role);
  };

  const visible = useMemo(() => NAV
    .filter((n) => isGroup(n) ? n.items.some((i) => canSee(i)) : canSee(n))
    .map((n) => isGroup(n) ? { ...n, items: n.items.filter((i) => canSee(i)) } : n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, isAdmin, isCoord, perms.loading, perms.canView]);

  if (approvalQ.data && approvalQ.data.aprovado === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center shadow-lg space-y-4">
          <div className="mx-auto size-14 rounded-full bg-warning/20 flex items-center justify-center">
            <UsersIcon className="size-7 text-warning-foreground" />
          </div>
          <h1 className="text-xl font-bold">Cadastro aguardando aprovação</h1>
          <p className="text-sm text-muted-foreground">
            Olá{approvalQ.data.nome ? `, ${approvalQ.data.nome}` : ""}. Seu cadastro foi recebido e está aguardando
            aprovação de um administrador. Você receberá acesso ao sistema assim que for aprovado.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="size-4 mr-1.5" /> Sair
          </Button>
        </div>
      </div>
    );
  }

  return (

    <div className="min-h-screen flex bg-background">
      <aside className={cn(
        "hidden lg:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}>
        <SidebarContent items={visible} pathname={pathname} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
            <button className="absolute top-3 right-3 p-2 text-sidebar-foreground/70" onClick={() => setOpen(false)} aria-label="Fechar">
              <X className="size-5" />
            </button>
            <SidebarContent items={visible} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 px-4 lg:px-6 h-14">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </Button>

            <div className="lg:hidden flex items-center gap-2 mr-auto">
              <div className="size-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                <Leaf className="size-4" />
              </div>
              <span className="font-semibold">Mágio</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Link to="/gestao/minhas-tarefas" title="Minhas tarefas pendentes">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="size-5" />
                  {(tarefasQ.data ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {(tarefasQ.data ?? 0) > 99 ? "99+" : tarefasQ.data}
                    </span>
                  )}
                </Button>
              </Link>
              {(pendingQ.data ?? 0) > 0 && (
                <Button size="sm" variant="outline" onClick={async () => { await syncPendingCounts(); qc.invalidateQueries(); }} disabled={!online} className="gap-1.5">
                  <RefreshCw className="size-3.5" /> Sincronizar
                  <Badge variant="secondary" className="ml-1">{pendingQ.data}</Badge>
                </Button>
              )}

              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
                <span className={cn("size-2 rounded-full pulse-dot", online ? "bg-success" : "bg-destructive")} />
                {online ? <><Wifi className="size-3.5" /> Online</> : <><WifiOff className="size-3.5" /> Offline</>}
              </div>

              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema claro/escuro">
                {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>

              {role && <Badge variant="outline" className="hidden sm:inline-flex">{role}</Badge>}

              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 min-w-0 pb-24 lg:pb-6">{children}</main>
        <MobileBottomNav onOpenMenu={() => setOpen(true)} />
      </div>
    </div>
  );
}

function SidebarContent({
  items, pathname, onNavigate, collapsed, onExpand,
}: {
  items: (NavItem | NavGroup)[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  // Estado de grupos abertos — default: o grupo que contém a rota ativa
  const initialOpen = useMemo(() => {
    const open: Record<string, boolean> = {};
    items.forEach((n) => {
      if (isGroup(n) && n.items.some((i) => pathname.startsWith(i.to))) open[n.id] = true;
    });
    return open;
  }, [items, pathname]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  return (
    <>
      <div className={cn("flex items-center gap-3 border-b border-sidebar-border h-16", collapsed ? "px-3 justify-center" : "px-5")}>
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--gradient-gold)" }}>
          <Leaf className="size-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-semibold leading-tight tracking-tight">Mágio Chocolates</div>
            <div className="text-[10px] text-sidebar-foreground/60 leading-tight uppercase tracking-widest">Amazônia Premium</div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {items.map((n) => {
          if (!isGroup(n)) return <NavLeaf key={n.to} item={n} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />;
          const opened = openGroups[n.id] ?? false;
          const Icon = n.icon;
          const anyActive = n.items.some((i) => pathname.startsWith(i.to));
          if (collapsed) {
            return (
              <button
                key={n.id} title={n.label} aria-label={n.label}
                onClick={() => { onExpand?.(); setOpenGroups((s) => ({ ...s, [n.id]: true })); }}
                className={cn("w-full flex items-center justify-center my-0.5 py-2 rounded-md transition-colors",
                  anyActive ? "text-sidebar-foreground bg-sidebar-accent" : "text-sidebar-foreground/80 hover:bg-sidebar-accent")}
              >
                <Icon className="size-4" />
              </button>
            );
          }
          return (
            <div key={n.id}>
              <button onClick={() => setOpenGroups((s) => ({ ...s, [n.id]: !opened }))}
                className={cn("w-full flex items-center gap-3 mx-2 my-0.5 px-3 py-2 rounded-md text-sm transition-colors",
                  anyActive ? "text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent")}>
                <Icon className="size-4" />
                <span className="flex-1 text-left font-medium">{n.label}</span>
                {opened ? <ChevronDown className="size-3.5 opacity-60" /> : <ChevronRight className="size-3.5 opacity-60" />}
              </button>
              {opened && (
                <div className="mx-2 ml-5 pl-3 border-l border-sidebar-border/60 space-y-0.5 mb-1">
                  {n.items.map((i) => <NavLeaf key={i.to + i.label} item={i} pathname={pathname} onNavigate={onNavigate} compact />)}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="p-3 text-[10px] text-sidebar-foreground/50 border-t border-sidebar-border">
          © {new Date().getFullYear()} · Mágio Chocolates · Inventário
        </div>
      )}
    </>
  );
}

function NavLeaf({ item, pathname, onNavigate, compact, collapsed }: { item: NavItem; pathname: string; onNavigate?: () => void; compact?: boolean; collapsed?: boolean }) {
  const Icon = item.icon;
  const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to + "/"));
  if (collapsed) {
    return (
      <Link to={item.to} onClick={onNavigate} title={item.label} aria-label={item.label}
        className={cn("flex items-center justify-center py-2 mx-2 rounded-md transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
        <Icon className="size-4" />
      </Link>
    );
  }
  return (
    <Link to={item.to} onClick={onNavigate}
      className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
        compact ? "mx-0" : "mx-2",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}
