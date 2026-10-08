import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil } from "lucide-react";
import { AcaoObsoletoDialog, type AcaoObsDraft } from "@/components/obsoletos/AcaoObsoletoDialog";
import {
  STATUS_OBS, chaveObs, confirmadoPorMovimento, fmtBRL, useAcoesObsoleto, useItensObsoletos, useTiposAcaoObsoleto,
} from "@/lib/obsoletos";

export const Route = createFileRoute("/_authenticated/obsoletos/acoes")({
  component: AcoesObsoletos,
  head: () => ({
    meta: [
      { title: "Obsoletos — Ações" },
      { name: "description", content: "Ações corretivas sobre itens obsoletos: responsável, status e valor recuperado." },
      { property: "og:title", content: "Obsoletos — Ações" },
      { property: "og:description", content: "Gestão das ações de recuperação de itens obsoletos." },
    ],
  }),
});

const TODAS = "__todas__";

function AcoesObsoletos() {
  const acoes = useAcoesObsoleto();
  const tipos = useTiposAcaoObsoleto();
  const itens = useItensObsoletos();
  const [status, setStatus] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<AcaoObsDraft | null>(null);

  const tipoNome = useMemo(() => new Map((tipos.data ?? []).map((t) => [t.id, t.nome])), [tipos.data]);
  const atuais = useMemo(() => new Map((itens.data ?? []).map((i) => [chaveObs(i.id_produto, i.almoxarifado, i.lote), i])), [itens.data]);

  const lista = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return (acoes.data ?? [])
      .filter((a) => status === TODAS || a.status === status)
      .filter((a) => !q || `${a.id_produto} ${a.descricao} ${a.lote} ${a.responsavel_label}`.toUpperCase().includes(q));
  }, [acoes.data, status, busca]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ações de Obsoletos</h1>
        <p className="text-sm text-muted-foreground">Acompanhe as ações criadas no Mapeamento de Risco. "Movimentou" indica que o item saiu do radar ou voltou a ter movimentação após a ação.</p>
      </div>
      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">Buscar</Label><Input placeholder="SKU, produto, lote ou responsável" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                {STATUS_OBS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{lista.length} ação(ões)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Lote</TableHead>
                <TableHead>Tipo</TableHead><TableHead>Responsável</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Em risco</TableHead><TableHead className="text-right">Recuperado</TableHead>
                <TableHead>Movimentou?</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((a) => {
                const mov = confirmadoPorMovimento(a, atuais);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{a.data_acao.split("-").reverse().join("/")}</TableCell>
                    <TableCell className="font-mono text-xs">{a.id_produto}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{a.descricao}</TableCell>
                    <TableCell className="font-mono text-xs">{a.lote || "—"}</TableCell>
                    <TableCell className="text-xs">{tipoNome.get(a.tipo_acao_id ?? "") ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.responsavel_label ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{STATUS_OBS.find((s) => s.value === a.status)?.label ?? a.status}</Badge></TableCell>
                    <TableCell className="text-right">{fmtBRL(Number(a.valor_em_risco))}</TableCell>
                    <TableCell className="text-right font-medium">{fmtBRL(Number(a.valor_recuperado) + Number(a.saving_recuperado))}</TableCell>
                    <TableCell>{mov ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => setDraft(a)}><Pencil className="size-4" /></Button></TableCell>
                  </TableRow>
                );
              })}
              {!lista.length && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">{acoes.isLoading ? "Carregando..." : "Nenhuma ação registrada."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AcaoObsoletoDialog draft={draft} onOpenChange={(v) => !v && setDraft(null)} />
    </div>
  );
}
