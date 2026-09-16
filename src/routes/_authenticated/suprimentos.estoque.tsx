import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  lote: string | null; data_validade: string | null;
};

type GrupoRow = { codigo_produto: string; grupo: string };

function normCodigo(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function EstoquePosicaoPage() {
  const [origemF, setOrigemF] = useState<string>("__all");
  const [grupoF, setGrupoF] = useState<string>("__all");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<{ origem: string; id_produto: string; descricao: string } | null>(null);
  const { almoxes } = useMeusAlmoxarifados();

  const q = useQuery({
    queryKey: ["suprimentos_estoque_posicao", almoxes?.join(",") ?? "all"],
    queryFn: async () => {
      const rows = await fetchAll<Row>((from, to) => {
        let query = supabase.from("estoque_sistemico")
          .select("id_produto, descricao, unidade, origem, quantidade, custo_unitario, lote, data_validade")
          .order("id_produto")
          .range(from, to);
        if (almoxes) query = query.in("origem", almoxes.length ? almoxes : ["__nenhum__"]);
        return query;
      });
      return rows;
    },
  });

  const grupoQ = useQuery({
    queryKey: ["grupo_produtos_lookup"],
    queryFn: async () => {
      const rows = await fetchAll<GrupoRow>((from, to) =>
        supabase.from("grupo_produtos").select("codigo_produto, grupo").range(from, to)
      );
      return rows;
    },
  });

  const grupoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of grupoQ.data ?? []) m.set(normCodigo(r.codigo_produto), r.grupo);
    return m;
  }, [grupoQ.data]);

  function grupoDe(idProduto: string): string {
    const cod = normCodigo(idProduto);
    if (m_hasExact(grupoMap, cod)) return grupoMap.get(cod)!;
    const prefixo8 = cod.slice(0, 8);
    if (m_hasExact(grupoMap, prefixo8)) return grupoMap.get(prefixo8)!;
    return "Sem grupo";
  }
  function m_hasExact(m: Map<string, string>, k: string): boolean {
    return m.has(k);
  }

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
    if (grupoF !== "__all") arr = arr.filter((r) => grupoDe(r.id_produto) === grupoF);
    if (busca) {
      const t = busca.toLowerCase();
      arr = arr.filter((r) => r.id_produto.toLowerCase().includes(t) || r.descricao.toLowerCase().includes(t));
    }
    return arr.sort((a, b) => b.valor - a.valor);
  }, [q.data, origemF, grupoF, busca, grupoMap]);

  const grupos = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((r) => { s.add(grupoDe(r.id_produto)); });
    return Array.from(s).sort();
  }, [q.data, grupoMap]);

  const kpis = useMemo(() => {
    const skus = agregado.length;
    const valor = agregado.reduce((s, r) => s + r.valor, 0);
    const qtd = agregado.reduce((s, r) => s + r.quantidade, 0);
    return { skus, valor, qtd };
  }, [agregado]);

  const lotesDetalhe = useMemo(() => {
    if (!detalhe) return [];
    const m = new Map<string, { lote: string; quantidade: number; custo_unitario: number; data_validade: string | null }>();
    for (const r of q.data ?? []) {
      if (r.origem !== detalhe.origem || r.id_produto !== detalhe.id_produto) continue;
      const lote = r.lote || "Sem lote";
      const qtd = Number(r.quantidade);
      const cu = Number(r.custo_unitario);
      const prev = m.get(lote);
      if (prev) { prev.quantidade += qtd; }
      else m.set(lote, { lote, quantidade: qtd, custo_unitario: cu, data_validade: r.data_validade });
    }
    return Array.from(m.values()).sort((a, b) => {
      if (!a.data_validade) return 1;
      if (!b.data_validade) return -1;
      return a.data_validade.localeCompare(b.data_validade);
    });
  }, [detalhe, q.data]);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="size-6" /> Posição de Estoque</h1>
        <p className="text-sm text-muted-foreground">Saldo sistêmico consolidado por SKU e almox. Dê dois cliques numa linha para ver os lotes.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KPI label="SKUs" value={String(kpis.skus)} />
        <KPI label="Quantidade" value={formatNum(kpis.qtd)} />
        <KPI label="Valor total" value={formatBRL(kpis.valor)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
          <div>
            <Label className="text-xs">Grupo</Label>
            <Select value={grupoF} onValueChange={setGrupoF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
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
                    <TableRow
                      key={`${r.origem}|${r.id_produto}`}
                      className="cursor-pointer"
                      title="Dois cliques para ver os lotes"
                      onDoubleClick={() => setDetalhe({ origem: r.origem, id_produto: r.id_produto, descricao: r.descricao })}
                    >
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

      <Dialog open={!!detalhe} onOpenChange={(open) => { if (!open) setDetalhe(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {detalhe?.id_produto} — {detalhe?.descricao}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Custo Total</TableHead>
                <TableHead>Validade</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lotesDetalhe.map((l) => (
                  <TableRow key={l.lote}>
                    <TableCell className="text-xs">{detalhe ? grupoDe(detalhe.id_produto) : ""}</TableCell>
                    <TableCell className="font-mono text-xs">{l.lote}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(l.quantidade)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatBRL(l.quantidade * l.custo_unitario)}</TableCell>
                    <TableCell className="text-xs">{l.data_validade ? new Date(`${l.data_validade}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  </TableRow>
                ))}
                {lotesDetalhe.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">Sem lotes.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
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
