import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      return { user: data.user };
    } catch (err) {
      // Repassa o redirecionamento; qualquer outra falha (rede, sessão
      // expirada, valor lançado sem ser Error) também leva ao login em vez
      // de derrubar a árvore React e deixar a tela em branco.
      if (isRedirect(err)) throw err;
      console.error("[_authenticated] falha ao validar sessão", err);
      throw redirect({ to: "/auth" });
    }
  },
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
