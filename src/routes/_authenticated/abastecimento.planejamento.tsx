import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Loader2, AlertTriangle, TrendingUp } from "lucide-react";
import { formatNum } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/abastecimento/planejamento")({
  component: PlanejamentoPage,
  head: () => ({ meta: [{ title: "Planejamento de Cobertura" }] }),
});

type Param = { origem: string; origem_abastecimento: string; cobertura_dias: number; dias_seguranca: number; ativo: boolean };
type Estoque = { id_produto: string; descricao: string; quantidade: number; custo_unitario: number; origem: string };
type Consumo = { origem: string; sku: string; quantidade: number; data_movimento: string };
type Demanda = { origem: string; sku: string; quantidade_extra: number; status: string; data_inicio: string; data_fim: string };

type Linha = {
  sku: string; produto: string; origem: string; origem_abastecimento: string;
  estoque: number; cmd: number; cobertura_atual: number; cobertura_alvo: number;
  demanda_extra: number; necessidade: number; sugestao: number; custo_unitario: number; valor_reposicao: number;
};

function PlanejamentoPage() {
  const [origemF, setOrigemF] = useState<string>("__all");
  const [buscaF, setBuscaF] = useState("");

  const paramsQ = useQuery({
    queryKey: ["parametros_ativos_plan"],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_abastecimento" as never).select("*").eq("ativo", true);
      return (data ?? []) as unknown as Param[];
    },
  });

  const origensAtivas = (paramsQ.data ?? []).map((p) => p.origem);

  const estoqueQ = useQuery({
    queryKey: ["planejamento_estoque", origensAtivas.join(",")],
    enabled: origensAtivas.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_sistemico")
        .select("id_produto, descricao, quantidade, custo_unitario, origem")
        .in("origem", origensAtivas);
      if (error) throw error;
      return (data ?? []) as unknown as Estoque[];
    },
  });

  const consumoQ = useQuery({
    queryKey: ["planejamento_consumo", origensAtivas.join(",")],
    enabled: origensAtivas.length > 0,
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const iso = cutoff.toISOString().slice(0, 10);
      const { data } = await supabase.from("historico_consumo" as never)
        .select("origem, sku, quantidade, data_movimento")
        .in("origem", origensAtivas)
        .gte("data_movimento", iso);
      return (data ?? []) as unknown as Consumo[];
    },
  });

  const demandasQ = useQuery({
    queryKey: ["planejamento_cobertura", origensAtivas.join(",")],
    enabled: origensAtivas.length > 0,
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("demanda_extra" as never)
        .select("origem, sku, quantidade_extra, status, data_inicio, data_fim")
        .in("origem", origensAtivas).eq("status", "APROVADA").gte("data_fim", hoje);
      return (data ?? []) as unknown as Demanda[];
    },
  });

  const linhas: Linha[] = useMemo(() => {
    if (!paramsQ.data || !estoqueQ.data) return [];
    const paramsMap = new Map(paramsQ.data.map((p) => [p.origem, p]));

    // Agregar estoque por SKU+origem
    const stockMap = new Map<string, Estoque & { qtd: number }>();
    for (const e of estoqueQ.data) {
      const key = `${e.origem}|${e.id_produto}`;
      const prev = stockMap.get(key);
      if (prev) prev.qtd += Number(e.quantidade);
      else stockMap.set(key, { ...e, qtd: Number(e.quantidade) });
    }

    // Consumo 30 dias
    const consumoMap = new Map<string, number>();
    for (const c of (consumoQ.data ?? [])) {
      const key = `${c.origem}|${c.sku}`;
      consumoMap.set(key, (consumoMap.get(key) ?? 0) + Number(c.quantidade));
    }

    // Demanda extra aprovada
    const demandaMap = new Map<string, number>();
    for (const d of (demandasQ.data ?? [])) {
      const key = `${d.origem}|${d.sku}`;
      demandaMap.set(key, (demandaMap.get(key) ?? 0) + Number(d.quantidade_extra));
    }

    const out: Linha[] = [];
    for (const [key, s] of stockMap) {
      const p = paramsMap.get(s.origem); if (!p) continue;
      const consumo30 = consumoMap.get(key) ?? 0;
      const cmd = consumo30 / 30;
      const cobertura_atual = cmd > 0 ? s.qtd / cmd : (s.qtd > 0 ? 999 : 0);
      const cobertura_alvo = p.cobertura_dias;
      const necessidade_base = cmd * cobertura_alvo;
      const demanda_extra = demandaMap.get(key) ?? 0;
      const necessidade = necessidade_base + demanda_extra;
      const sugestao = Math.max(0, necessidade - s.qtd);
      out.push({
        sku: s.id_produto, produto: s.descricao, origem: s.origem,
        estoque: s.qtd, cmd, cobertura_atual, cobertura_alvo,
        demanda_extra, necessidade, sugestao,
        custo_unitario: Number(s.custo_unitario), valor_reposicao: sugestao * Number(s.custo_unitario),
      });
    }
    return out.sort((a, b) => a.cobertura_atual - b.cobertura_atual);
  }, [paramsQ.data, estoqueQ.data, consumoQ.data, demandasQ.data]);

  const linhasFiltradas = linhas.filter((l) => {
    if (origemF !== "__all" && l.origem !== origemF) return false;
    if (buscaF) {
      const t = buscaF.toLowerCase();
      if (!l.sku.toLowerCase().includes(t) && !l.produto.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const kpis = useMemo(() => {
    const total = linhasFiltradas.length;
    const abaixo = linhasFiltradas.filter((l) => l.cobertura_atual < l.cobertura_alvo).length;
    const rupturas = linhasFiltradas.filter((l) => l.cobertura_atual < 3).length;
    const valor = linhasFiltradas.reduce((s, l) => s + l.valor_reposicao, 0);
    const cobMedia = total ? linhasFiltradas.reduce((s, l) => s + Math.min(l.cobertura_atual, 60), 0) / total : 0;
    return { total, abaixo, rupturas, valor, cobMedia };
  }, [linhasFiltradas]);

  const loading = paramsQ.isLoading || estoqueQ.isLoading;
  const semParams = (paramsQ.data ?? []).length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Compass className="size-6" /> Planejamento de Cobertura</h1>
        <p className="text-sm text-muted-foreground">
          Cobertura = Estoque ÷ CMD · Sugestão = (CMD × Cobertura Alvo + Demanda Extra) − Estoque
        </p>
      </div>

      {semParams && !loading && (
        <Card className="border-warning/40">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <AlertTriangle className="size-4 text-warning" />
            Nenhum almox habilitado. Acesse <b>Parâmetros de Abastecimento</b> para começar.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI label="SKUs" value={String(kpis.total)} />
        <KPI label="Abaixo da cobertura" value={String(kpis.abaixo)} tone="warning" />
        <KPI label="Em ruptura (<3d)" value={String(kpis.rupturas)} tone="danger" />
        <KPI label="Cobertura média" value={`${kpis.cobMedia.toFixed(1)} d`} />
        <KPI label="Valor reposição" value={`R$ ${formatNum(kpis.valor)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={origemF} onValueChange={setOrigemF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os almox</SelectItem>
                {origensAtivas.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Buscar SKU ou descrição</Label>
            <Input value={buscaF} onChange={(e) => setBuscaF(e.target.value)} placeholder="digite…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4" /> Cobertura por SKU</CardTitle>
          <CardDescription>Ordenado pelos mais críticos.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">CMD</TableHead>
                  <TableHead className="text-right">Cob. Atual</TableHead>
                  <TableHead className="text-right">Cob. Alvo</TableHead>
                  <TableHead className="text-right">Dem. Extra</TableHead>
                  <TableHead className="text-right">Sugestão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhasFiltradas.slice(0, 500).map((l) => (
                    <TableRow key={`${l.origem}|${l.sku}`}>
                      <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.produto}</TableCell>
                      <TableCell className="text-xs">{l.origem}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(l.estoque)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.cmd.toFixed(2)}</TableCell>
                      <TableCell className="text-right"><CoberturaBadge dias={l.cobertura_atual} /></TableCell>
                      <TableCell className="text-right tabular-nums">{l.cobertura_alvo}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.demanda_extra > 0 ? `+${formatNum(l.demanda_extra)}` : "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatNum(l.sugestao)}</TableCell>
                      <TableCell className="text-right tabular-nums">R$ {formatNum(l.valor_reposicao)}</TableCell>
                    </TableRow>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground text-sm py-6">
                      Sem dados. Cadastre parâmetros e importe consumo.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {linhasFiltradas.length > 500 && (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  … exibindo 500 de {linhasFiltradas.length}. Refine o filtro.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoberturaBadge({ dias }: { dias: number }) {
  const txt = dias >= 999 ? "∞" : dias.toFixed(1);
  const tone = dias >= 8 ? "bg-success/15 text-success"
    : dias >= 5 ? "bg-warning/20 text-warning-foreground"
    : "bg-destructive/15 text-destructive";
  return <Badge className={tone}>{txt} d</Badge>;
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "";
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${cls}`}>{value}</div>
    </CardContent></Card>
  );
}
