import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { diasUteisEntre } from "@/lib/recebimento-transferencias";
import { ImportarRecebimentoDialog } from "@/components/suprimentos/ImportarRecebimentoDialog";

export const Route = createFileRoute("/_authenticated/suprimentos/farol-recebimento")({
  component: FarolRecebimentoPage,
  head: () => ({ meta: [
    { title: "Farol de Recebimento Pendente — Controle Operacional" },
    { name: "description", content: "Notas fiscais de transferência pendentes de recebimento, com dias úteis em aberto." },
  ] }),
});

type LinhaDb = {
  nr_nf: string;
  dt_emissao: string;
  empresa: string;
  almox: string;
  estado: string | null;
  qtd: number;
  vt_total_item: number;
};

function fmtDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function FarolRecebimentoPage() {
  const pendentesQ = useQuery({
    queryKey: ["farol-recebimento-pendente"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notas_transferencia_recebimento")
        .select("nr_nf, dt_emissao, empresa, almox, estado, qtd, vt_total_item")
        .eq("recebimento", "Pendente")
        .or("nota_cancelada.is.null,nota_cancelada.neq.S")
        .order("dt_emissao", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaDb[];
    },
  });

  const hoje = todayISO();

  const porNF = useMemo(() => {
    const m = new Map<string, { nr_nf: string; dt_emissao: string; empresa: string; almox: string; estado: string | null; itens: number; qtd: number; valor: number }>();
    (pendentesQ.data ?? []).forEach((r) => {
      const cur = m.get(r.nr_nf) ?? {
        nr_nf: r.nr_nf, dt_emissao: r.dt_emissao, empresa: r.empresa, almox: r.almox, estado: r.estado,
        itens: 0, qtd: 0, valor: 0,
      };
      cur.itens += 1;
      cur.qtd += Number(r.qtd) || 0;
      cur.valor += Number(r.vt_total_item) || 0;
      if (r.dt_emissao < cur.dt_emissao) cur.dt_emissao = r.dt_emissao;
      m.set(r.nr_nf, cur);
    });
    return [...m.values()]
      .map((r) => ({ ...r, diasUteis: diasUteisEntre(r.dt_emissao, hoje) }))
      .sort((a, b) => b.diasUteis - a.diasUteis);
  }, [pendentesQ.data, hoje]);

  const totalGeral = porNF.reduce((s, r) => s + r.valor, 0);
  const totalItens = porNF.reduce((s, r) => s + r.itens, 0);
  const totalQtd = porNF.reduce((s, r) => s + r.qtd, 0);
  const maiorAtraso = porNF.length ? Math.max(...porNF.map((r) => r.diasUteis)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="size-6" /> Farol de Recebimento Pendente</h1>
          <p className="text-sm text-muted-foreground">
            Notas fiscais de transferência emitidas ainda sem recebimento confirmado, com dias úteis em aberto.
          </p>
        </div>
        <ImportarRecebimentoDialog />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Notas pendentes</div>
            <div className="text-2xl font-bold">{porNF.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Itens pendentes</div>
            <div className="text-2xl font-bold">{totalItens}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Valor total pendente</div>
            <div className="text-2xl font-bold">{fmtBRL(totalGeral)}</div>
          </CardContent>
        </Card>
        <Card className={maiorAtraso > 5 ? "border-destructive/40" : undefined}>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Maior atraso (dias úteis)</div>
            <div className="text-2xl font-bold">{maiorAtraso}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{porNF.length} nota(s) pendente(s) de recebimento</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Dt. Emissão</TableHead>
                <TableHead className="text-right">Dias Úteis</TableHead>
                <TableHead>DE</TableHead>
                <TableHead>PARA (Almox)</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porNF.map((r) => (
                <TableRow key={r.nr_nf}>
                  <TableCell>{r.estado || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.nr_nf}</TableCell>
                  <TableCell>{fmtDataBR(r.dt_emissao)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.diasUteis > 5 ? "destructive" : r.diasUteis > 2 ? "secondary" : "outline"}>
                      {r.diasUteis}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.empresa}</TableCell>
                  <TableCell>{r.almox}</TableCell>
                  <TableCell className="text-right">{r.itens}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.qtd)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtBRL(r.valor)}</TableCell>
                </TableRow>
              ))}
              {!porNF.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    {pendentesQ.isLoading ? "Carregando..." : "Nenhuma transferência pendente de recebimento."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
