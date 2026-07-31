import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatNum } from "@/lib/inventory";
import { STATUS_CAMPANHA, chaveLote, statusCampanhaLabel, statusCampanhaTone, valorRecuperadoCampanha } from "@/lib/shelf-life";
import { autoVincularBaixas, useCampanhas, useLotesComSaldo, useTiposAcao } from "@/hooks/useShelfLife";

import { CampanhaDialog, type CampanhaDraft } from "@/components/shelf-life/CampanhaDialog";
import { useRole } from "@/hooks/useRole";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shelf-life/acoes")({
  component: AcoesLote,
  head: () => ({
    meta: [
      { title: "Shelf Life — Ações de Lote" },
      { name: "description", content: "Campanhas sobre lotes em risco de vencimento: tipo de ação, valores recuperados e vínculo com baixas." },
      { property: "og:title", content: "Shelf Life — Ações de Lote" },
      { property: "og:description", content: "Gestão das campanhas de recuperação de lotes." },
    ],
  }),
});

const TODAS = "__todas__";

function AcoesLote() {
  const qc = useQueryClient();
  const campanhas = useCampanhas();
  const tipos = useTiposAcao();
  const { isAdmin, role } = useRole();
  const podeExcluir = isAdmin || role === "COORDENADOR_CONTROLE";

  const [draft, setDraft] = useState<CampanhaDraft | null>(null);
  const [status, setStatus] = useState(TODAS);
  const [tipo, setTipo] = useState(TODAS);
  const [busca, setBusca] = useState("");

  // Vínculo automático de baixas (ex.: Degustação) às campanhas abertas do mesmo SKU+Lote.
  const jaRodou = useRef(false);
  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;
    autoVincularBaixas()
      .then((n) => {
        if (n > 0) {
          toast.info(`${n} baixa(s) vinculada(s) automaticamente às ações correspondentes.`);
          qc.invalidateQueries({ queryKey: ["shelf-campanhas"] });
        }
      })
      .catch(() => {});
  }, [qc]);

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("campanhas_lote").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ação excluída."); qc.invalidateQueries({ queryKey: ["shelf-campanhas"] }); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir."),
  });

  const rows = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return (campanhas.data ?? []).filter((c) => {
      if (status !== TODAS && c.status !== status) return false;
      if (tipo !== TODAS && c.tipo_acao_id !== tipo) return false;
      if (q && !`${c.sku} ${c.descricao ?? ""} ${c.lote}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [campanhas.data, status, tipo, busca]);

  const totais = useMemo(() => ({
    recuperado: rows.filter((c) => c.status === "CONCLUIDA").reduce((s, c) => s + valorRecuperadoCampanha(c), 0),
    custo: rows.filter((c) => c.status === "CONCLUIDA").reduce((s, c) => s + (c.custo_acao || 0), 0),
  }), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Ações de Lote</h1>
          <p className="text-sm text-muted-foreground">Campanhas de recuperação para lotes próximos do vencimento.</p>
        </div>
        <Button onClick={() => setDraft({ sku: "", lote: "" })}>
          <Plus className="size-4 mr-2" /> Nova Ação
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="SKU, produto ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                {STATUS_CAMPANHA.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo de ação</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                {(tipos.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {rows.length} ação(ões) · Recuperado (concluídas): {formatBRL(totais.recuperado)} · Custo: {formatBRL(totais.custo)}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Tipo de Ação</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Recuperado</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Baixa</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{(c.data_acao ?? "").slice(0, 10).split("-").reverse().join("/")}</TableCell>
                  <TableCell className="font-mono text-xs">{c.sku}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{c.descricao ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.lote || "—"}
                    {c.lote && saldos.data && !saldos.data.has(chaveLote(c.sku, c.lote)) && (
                      <Badge variant="secondary" className="ml-1 text-[10px] font-sans bg-muted text-muted-foreground">
                        Lote já sem saldo (encerrado)
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-xs">
                    {c.tipo_nome ?? "—"}
                    {c.categoria && <Badge variant="outline" className="ml-1 text-[10px]">{c.categoria === "RECEITA" ? "Receita" : "Saving"}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{formatNum(c.quantidade_enderecada)}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(valorRecuperadoCampanha(c))}</TableCell>
                  <TableCell className="text-right">{formatBRL(c.custo_acao)}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusCampanhaTone(c.status)}>{statusCampanhaLabel(c.status)}</Badge></TableCell>
                  <TableCell>{c.baixa_operacional_id ? <Link2 className="size-4 text-success" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setDraft(c)} aria-label="Editar"><Pencil className="size-4" /></Button>
                    {podeExcluir && (
                      <Button size="icon" variant="ghost" onClick={() => excluir.mutate(c.id)} aria-label="Excluir">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">Nenhuma ação cadastrada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CampanhaDialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)} draft={draft} />
    </div>
  );
}
