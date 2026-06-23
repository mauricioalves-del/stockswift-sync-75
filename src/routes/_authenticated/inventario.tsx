import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { acuracidadeColor, formatBRL, formatNum, statusLabel } from "@/lib/inventory";
import { ClipboardList, ScanLine, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inventario")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventário" }] }),
});

const PAGE_SIZE = 25;

function InventarioPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["inventario", search, statusFilter, page],
    queryFn: async () => {
      let q = supabase.from("inventario").select("*", { count: "exact" })
        .order("data_contagem", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (search) q = q.or(`id_produto.ilike.%${search}%,lote.ilike.%${search}%,descricao.ilike.%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventário</h1>
          <p className="text-sm text-muted-foreground">Contagens registradas e seu status</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/scanner"><ScanLine className="size-4 mr-1.5" /> Scanner</Link></Button>
          <Button asChild><Link to="/contar"><ClipboardList className="size-4 mr-1.5" /> Nova contagem</Link></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por produto, lote ou descrição..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="OK">Acurados</SelectItem>
              <SelectItem value="DIVERGENCIA_POSITIVA">Divergência (+)</SelectItem>
              <SelectItem value="RECONTAGEM_NECESSARIA">Recontagem</SelectItem>
              <SelectItem value="AGUARDANDO_APROVACAO">Aguardando aprovação</SelectItem>
              <SelectItem value="APROVADO">Aprovados</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Sist.</TableHead>
                <TableHead className="text-right">Contada</TableHead>
                <TableHead className="text-right">Diverg.</TableHead>
                <TableHead className="text-right">R$ Div.</TableHead>
                <TableHead>Acur.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : data?.rows.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhuma contagem encontrada</TableCell></TableRow>
              ) : data?.rows.map((r) => {
                const ac = acuracidadeColor(r.acuracidade ? Number(r.acuracidade) : null);
                const st = statusLabel(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                    <TableCell className="font-mono text-xs">{r.lote}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.descricao}</TableCell>
                    <TableCell>{r.id_local}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(Number(r.saldo_sistemico))}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatNum(Number(r.quantidade_contada))}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", Number(r.divergencia) < 0 ? "text-destructive" : Number(r.divergencia) > 0 ? "text-warning-foreground" : "")}>
                      {r.divergencia != null ? formatNum(Number(r.divergencia)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(Number(r.valor_divergencia))}</TableCell>
                    <TableCell>
                      <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-semibold tabular-nums", ac.bg, ac.text)}>{ac.label}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.tone === "success" ? "default" : st.tone === "destructive" ? "destructive" : "secondary"}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.data_contagem).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between p-3 border-t">
          <div className="text-xs text-muted-foreground">{data?.count ?? 0} registros</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="text-xs">Página {page + 1} de {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
