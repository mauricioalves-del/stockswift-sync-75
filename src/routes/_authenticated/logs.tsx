import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/logs")({
  component: LogsPage,
  head: () => ({ meta: [{ title: "Auditoria" }] }),
});

function LogsPage() {
  const { isAdmin } = useRole();

  const { data } = useQuery({
    queryKey: ["audit-logs"],
    enabled: isAdmin,
    queryFn: async () => {
      const [logs, profiles] = await Promise.all([
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id,nome,email"),
      ]);
      const map = new Map((profiles.data ?? []).map((p) => [p.id, p]));
      return (logs.data ?? []).map((l) => ({ ...l, autor: l.usuario ? map.get(l.usuario) : null }));
    },
  });

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Histórico das últimas 200 ações</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Eventos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-sm">{l.autor?.nome ?? l.usuario?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{l.acao}</Badge></TableCell>
                  <TableCell className="text-xs">{l.entidade ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                    {l.payload ? JSON.stringify(l.payload) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
