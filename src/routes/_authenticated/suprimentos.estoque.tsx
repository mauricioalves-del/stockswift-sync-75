import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes, Loader2 } from "lucide-react";
import { formatNum, formatBRL } from "@/lib/inventory";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";

export const Route = createFileRoute("/_authenticated/suprimentos/estoque")({
  component: EstoquePosicaoPage,
  head: () => ({ meta: [{ title: "Posição de Estoque" }] }),
});

type Row = {
  id_produto: string; descricao: string; unidade: string;
  origem: string; quantidade: number; custo_unitario: number;
};

function EstoquePosicaoPage() {
  const [origemF, setOrigemF] = useState<string>("__all");
  const [busca, setBusca] = useState("");
  const { almoxes } = useMeusAlmoxarifados();

  const q = useQuery({
    queryKey: ["suprimentos_estoque_posicao", almoxes?.join(",") ?? "all"],
    queryFn: async () => {
      let query = supabase.from("estoque_sistemico")
        .select("id_produto, descricao, unidade, origem, quantidade, custo_unitario")
        .limit(10000);
      if (almoxes) query = query.in("origem", almoxes.length ? almoxes : ["__nenhum__"]);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const origens = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((r) => { if (r.origem) s.add(r.origem); });
    return Array.from(s).sort();
  }, [q.data]);

  const agregado = useMemo(() => {
    const m = new Map<string, Row & { valor: number }>();
    for (const r of q.data ?? []) {
      if (origemF !== "__all" && r.origem !== origemF) continue;
      const key = `${r.origem}|${r.id_produto}`;
      const prev = m.get(key);
      const qtd = Number(r.quantidade);
      const cu = Number(r.custo_unitario);
      if (prev) { prev.quantidade += qtd; prev.valor += qtd * cu; }
      else m.set(key, { ...r, quantidade: qtd, custo_unitario: cu, valor: qtd * cu });
    }
    let arr = Array.from(m.values());
    if (busca) {
      const t = busca.toLowerCase();
      arr = arr.filter((r) => r.id_produto.toLowerCase().includes(t) || r.descricao.toLowerCase().includes(t));
    }
    return arr.sort((a, b) => b.valor - a.valor);
  }, [q.data, origemF, busca]);

  const kpis = useMemo(() => {
    const skus = agregado.length;
    const valor = agregado.reduce((s, r) => s + r.valor, 0);
    const qtd = agregado.reduce((s, r) => s + r.quantidade, 0);
    return { skus, valor, qtd };
  }, [agregado]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="size-6" /> Posição de Estoque</h1>
        <p className="text-sm text-muted-foreground">Saldo sistêmico consolidado por SKU e almox.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KPI label="SKUs" value={String(kpis.skus)} />
        <KPI label="Quantidade" value={formatNum(kpis.qtd)} />
        <KPI label="Valor total" value={formatBRL(kpis.valor)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Almox</Label>
            <Select value={origemF} onValueChange={setOrigemF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {origens.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Buscar SKU ou descrição</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="digite…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Estoque</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead>Almox</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Custo Unit.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {agregado.slice(0, 500).map((r) => (
                    <TableRow key={`${r.origem}|${r.id_produto}`}>
                      <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{r.descricao}</TableCell>
                      <TableCell className="text-xs">{r.unidade}</TableCell>
                      <TableCell className="text-xs">{r.origem}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(r.quantidade)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(r.custo_unitario)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatBRL(r.valor)}</TableCell>
                    </TableRow>
                  ))}
                  {agregado.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">Sem dados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {agregado.length > 500 && (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  … exibindo 500 de {agregado.length}. Refine o filtro.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
