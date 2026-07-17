import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Compass, Loader2, AlertTriangle, TrendingUp, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";



export const Route = createFileRoute("/_authenticated/abastecimento/planejamento")({
  component: PlanejamentoPage,
  head: () => ({ meta: [{ title: "Abastecimento" }] }),
});

type Param = { origem: string; origem_abastecimento: string; cobertura_dias: number; dias_seguranca: number; ativo: boolean };
type Estoque = { id_produto: string; descricao: string; quantidade: number; custo_unitario: number; origem: string };
type EstoqueLote = { id_produto: string; origem: string; quantidade: number; lote: string; data_validade: string | null; data_importacao: string };
type Consumo = { origem: string; sku: string; quantidade: number; data_movimento: string };
type Demanda = { origem: string; sku: string; quantidade_extra: number; status: string; data_inicio: string; data_fim: string };
type ProdRep = { id_produto: string; estoque_minimo: number; estoque_ideal: number; estoque_maximo: number; ativo: boolean };
type Familia = { codigo_produto: string; familia: string };

type Metodo = "COBERTURA" | "MINMAX";

const SUPPLY_ORIGENS = ["Alm_SP_Fabrica", "Alm_SP_Processo"] as const;
const FAMILIA_GRANEIS = "Granéis";

type Linha = {
  sku: string; produto: string; origem: string; origem_abastecimento: string;
  estoque: number; cmd: number; cobertura_atual: number; cobertura_alvo: number;
  demanda_extra: number; necessidade: number; sugestao: number; custo_unitario: number; valor_reposicao: number;
  minimo: number; ideal: number; maximo: number; sugestao_minmax: number;
  supplier_disp: number; lote_fefo: string | null; lote_fefo_qtd: number; is_granel: boolean;
  dias_base: number; janela_dias: number; sem_base: boolean;
};



function PlanejamentoPage() {
  const [origemF, setOrigemF] = useState<string>("__all");
  const [buscaF, setBuscaF] = useState("");
  const [grupoF, setGrupoF] = useState<string>("__all");
  const [metodo, setMetodo] = useState<Metodo>("COBERTURA");


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

  const supplierStockQ = useQuery({
    queryKey: ["planejamento_supplier_stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_sistemico")
        .select("id_produto, origem, quantidade, lote, data_validade, data_importacao")
        .in("origem", SUPPLY_ORIGENS as unknown as string[]);
      if (error) throw error;
      return (data ?? []) as unknown as EstoqueLote[];
    },
  });

  const familiasQ = useQuery({
    queryKey: ["planejamento_familias"],
    queryFn: async () => {
      const { data } = await supabase.from("familias" as never).select("codigo_produto, familia");
      return (data ?? []) as unknown as Familia[];
    },
  });

  const prodRepQ = useQuery({
    queryKey: ["planejamento_prod_rep"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos_reposicao" as never)
        .select("id_produto, estoque_minimo, estoque_ideal, estoque_maximo, ativo");
      return (data ?? []) as unknown as ProdRep[];
    },
  });

  const gruposQ = useQuery({
    queryKey: ["planejamento_grupos"],
    queryFn: async () => {
      const { data } = await (supabase as never as { from: (t: string) => { select: (c: string) => Promise<{ data: { grupo: string; codigo_produto: string }[] | null }> } })
        .from("grupo_produtos").select("grupo, codigo_produto");
      return (data ?? []) as { grupo: string; codigo_produto: string }[];
    },
  });
  const gruposDistintos = useMemo(
    () => Array.from(new Set((gruposQ.data ?? []).map((g) => g.grupo).filter(Boolean))).sort(),
    [gruposQ.data]
  );
  const skusDoGrupo = useMemo(() => {
    if (grupoF === "__all") return null;
    return new Set((gruposQ.data ?? []).filter((g) => g.grupo === grupoF).map((g) => g.codigo_produto));
  }, [gruposQ.data, grupoF]);

  const linhas: Linha[] = useMemo(() => {
    if (!paramsQ.data) return [];
    const paramsMap = new Map(paramsQ.data.map((p) => [p.origem, p]));
    const prodMap = new Map((prodRepQ.data ?? []).map((p) => [p.id_produto, p]));
    const familiaMap = new Map((familiasQ.data ?? []).map((f) => [f.codigo_produto, f.familia]));

    // Supplier: total disponível por (origem_abast|sku) e lote FEFO
    const supplierTotal = new Map<string, number>();
    const supplierFefo = new Map<string, { lote: string; qtd: number; validade: string | null; imp: string }>();
    for (const e of (supplierStockQ.data ?? [])) {
      const qtd = Number(e.quantidade);
      if (qtd <= 0) continue;
      const key = `${e.origem}|${e.id_produto}`;
      supplierTotal.set(key, (supplierTotal.get(key) ?? 0) + qtd);
      const prev = supplierFefo.get(key);
      const cur = { lote: e.lote, qtd, validade: e.data_validade, imp: e.data_importacao };
      if (!prev) supplierFefo.set(key, cur);
      else {
        const a = prev.validade ?? "9999-12-31";
        const b = cur.validade ?? "9999-12-31";
        if (b < a || (b === a && cur.imp < prev.imp)) supplierFefo.set(key, cur);
      }
    }

    // Saldo consolidado por origem+SKU e custo médio simples
    const stockMap = new Map<string, { qtd: number; desc: string; custo: number }>();
    for (const e of (estoqueQ.data ?? [])) {
      const key = `${e.origem}|${e.id_produto}`;
      const prev = stockMap.get(key);
      if (prev) { prev.qtd += Number(e.quantidade); }
      else stockMap.set(key, { qtd: Number(e.quantidade), desc: e.descricao ?? e.id_produto, custo: Number(e.custo_unitario) });
    }

    // CMD real: numerador = total vendido; denominador = dias com estoque disponível (proxy: dias distintos com venda > 0)
    const JANELA_DIAS = 30;
    const consumoMap = new Map<string, number>();
    const diasMap = new Map<string, Set<string>>();
    for (const c of (consumoQ.data ?? [])) {
      const qtd = Number(c.quantidade);
      if (qtd <= 0) continue;
      const key = `${c.origem}|${c.sku}`;
      consumoMap.set(key, (consumoMap.get(key) ?? 0) + qtd);
      const set = diasMap.get(key) ?? new Set<string>();
      set.add(String(c.data_movimento).slice(0, 10));
      diasMap.set(key, set);
    }

    const demandaMap = new Map<string, number>();
    for (const d of (demandasQ.data ?? [])) {
      const key = `${d.origem}|${d.sku}`;
      demandaMap.set(key, (demandaMap.get(key) ?? 0) + Number(d.quantidade_extra));
    }

    const out: Linha[] = [];
    for (const [key, s] of stockMap) {
      const [origem, sku] = key.split("|");
      const p = paramsMap.get(origem);
      if (!p) continue;
      const consumoTotal = consumoMap.get(key) ?? 0;
      const diasBase = (diasMap.get(key)?.size) ?? 0;
      const cmd = diasBase > 0 ? consumoTotal / diasBase : 0;
      const semBase = diasBase === 0;
      const cobertura_atual = cmd > 0 ? s.qtd / cmd : 999;
      const cobertura_alvo = p.cobertura_dias;
      const demanda_extra = demandaMap.get(key) ?? 0;
      const necessidade = semBase ? demanda_extra : cmd * cobertura_alvo + demanda_extra;
      let sugestao = Math.max(0, necessidade - s.qtd);


      // Regras de suprimento: só abastece do que existe em Alm_SP_Fabrica / Alm_SP_Processo
      const supKey = `${p.origem_abastecimento}|${sku}`;
      const isSupplied = (SUPPLY_ORIGENS as readonly string[]).includes(p.origem_abastecimento);
      const supplier_disp = isSupplied ? (supplierTotal.get(supKey) ?? 0) : Infinity;
      const fefo = isSupplied ? (supplierFefo.get(supKey) ?? null) : null;
      const familia = familiaMap.get(sku) ?? "";
      const is_granel = familia === FAMILIA_GRANEIS;

      // Granéis: só quando o item realmente precisa de reposição (cobertura abaixo do alvo),
      // abastecer com o lote FEFO inteiro do fornecedor.
      const precisaRepor = cobertura_atual < cobertura_alvo || sugestao > 0;
      if (is_granel && isSupplied && fefo && fefo.qtd > 0 && precisaRepor) {
        sugestao = Math.max(sugestao, fefo.qtd);
      }
      // Cap pelo disponível no fornecedor
      if (isSupplied) sugestao = Math.min(sugestao, supplier_disp);

      const pr = prodMap.get(sku);
      const minimo = Number(pr?.estoque_minimo ?? 0);
      const ideal = Number(pr?.estoque_ideal ?? 0);
      const maximo = Number(pr?.estoque_maximo ?? 0);
      let sugestao_minmax = 0;
      if (minimo > 0 && s.qtd < minimo && ideal > 0) {
        sugestao_minmax = ideal - s.qtd;
        if (maximo > 0) sugestao_minmax = Math.min(sugestao_minmax, Math.max(0, maximo - s.qtd));
        sugestao_minmax = Math.max(0, sugestao_minmax);
      }
      if (isSupplied) sugestao_minmax = Math.min(sugestao_minmax, supplier_disp);

      const sugestaoCeil = Math.ceil(Math.max(0, sugestao));
      const sugestaoMinMaxCeil = Math.ceil(Math.max(0, sugestao_minmax));

      out.push({
        sku, produto: s.desc,
        origem, origem_abastecimento: p.origem_abastecimento,
        estoque: s.qtd, cmd, cobertura_atual, cobertura_alvo,
        demanda_extra, necessidade, sugestao: sugestaoCeil,
        custo_unitario: s.custo, valor_reposicao: sugestaoCeil * s.custo,
        minimo, ideal, maximo, sugestao_minmax: sugestaoMinMaxCeil,
        supplier_disp: isSupplied ? supplier_disp : 0,
        lote_fefo: fefo?.lote ?? null,
        lote_fefo_qtd: fefo?.qtd ?? 0,
        is_granel,
        dias_base: diasBase, janela_dias: JANELA_DIAS, sem_base: semBase,

      });
    }
    return out.sort((a, b) => a.cobertura_atual - b.cobertura_atual);
  }, [paramsQ.data, estoqueQ.data, consumoQ.data, demandasQ.data, prodRepQ.data, supplierStockQ.data, familiasQ.data]);


  const linhasFiltradas = linhas.filter((l) => {
    if (origemF !== "__all" && l.origem !== origemF) return false;
    if (skusDoGrupo && !skusDoGrupo.has(l.sku)) return false;
    if (buscaF) {
      const t = buscaF.toLowerCase();
      if (!l.sku.toLowerCase().includes(t) && !l.produto.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const kpis = useMemo(() => {
    const total = linhasFiltradas.length;
    const abaixo = linhasFiltradas.filter((l) => l.cobertura_atual < l.cobertura_alvo).length;
    const criticos = linhasFiltradas.filter((l) => l.cobertura_atual < 3).length;
    const abaixoMin = linhasFiltradas.filter((l) => l.minimo > 0 && l.estoque < l.minimo).length;
    const acimaMax = linhasFiltradas.filter((l) => l.maximo > 0 && l.estoque > l.maximo).length;
    const valor = linhasFiltradas.reduce((s, l) => s + (metodo === "MINMAX" ? l.sugestao_minmax * l.custo_unitario : l.valor_reposicao), 0);
    const cobMedia = total ? linhasFiltradas.reduce((s, l) => s + Math.min(l.cobertura_atual, 60), 0) / total : 0;
    return { total, abaixo, criticos, valor, cobMedia, abaixoMin, acimaMax };
  }, [linhasFiltradas, metodo]);


  const loading = paramsQ.isLoading || estoqueQ.isLoading;
  const semParams = (paramsQ.data ?? []).length === 0;

  const nav = useNavigate();

  const gerarPedido = useMutation({
    mutationFn: async () => {
      const sugeridos = linhasFiltradas
        .map((l) => ({ ...l, _sug: metodo === "MINMAX" ? l.sugestao_minmax : l.sugestao }))
        .filter((l) => l._sug > 0);
      if (sugeridos.length === 0) throw new Error("Nenhum item com sugestão de reposição.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada.");

      const grupos = new Map<string, typeof sugeridos>();
      for (const l of sugeridos) {
        const key = `${l.origem}|${l.origem_abastecimento}`;
        const arr = grupos.get(key) ?? [];
        arr.push(l);
        grupos.set(key, arr);
      }

      const criadas: { id: string; numero: string }[] = [];
      let seq = 0;
      const metodoLabel = metodo === "MINMAX" ? "MinMax" : "Cobertura";
      for (const [key, itens] of grupos) {
        const [destino, fornecedor] = key.split("|");
        const numero = `REQ-${Date.now().toString().slice(-8)}-${seq++}`;
        const { data: req, error: e1 } = await supabase.from("requisicoes" as never).insert({
          numero, origem_solicitante: destino, origem_fornecedora: fornecedor,
          solicitante: uid, tipo: "NORMAL", status: "RASCUNHO",
          metodo_utilizado: metodoLabel,
          observacao: `Gerado pelo Abastecimento (${metodoLabel}) — ${itens.length} itens.`,
        } as never).select("id, numero").single();
        if (e1) throw e1;
        const r = req as unknown as { id: string; numero: string };
        const rows = itens.map((i) => ({
          requisicao_id: r.id, id_produto: i.sku, descricao: i.produto,
          unidade: "UN", quantidade_solicitada: Number(i._sug.toFixed(3)),
          custo_unitario: Number(i.custo_unitario ?? 0),
        }));
        const { error: e2 } = await supabase.from("requisicao_itens" as never).insert(rows as never);
        if (e2) throw e2;
        criadas.push(r);
      }
      return criadas;
    },
    onSuccess: (criadas) => {
      if (criadas.length === 1) {
        toast.success(`Requisição ${criadas[0].numero} criada`);
        nav({ to: "/suprimentos/requisicoes/$id", params: { id: criadas[0].id } });
      } else {
        toast.success(`${criadas.length} requisições criadas: ${criadas.map((c) => c.numero).join(", ")}`);
        nav({ to: "/suprimentos/requisicoes" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sugeridosCount = linhasFiltradas.filter((l) => (metodo === "MINMAX" ? l.sugestao_minmax : l.sugestao) > 0).length;



  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Compass className="size-6" /> Abastecimento</h1>
          <p className="text-sm text-muted-foreground">
            {metodo === "COBERTURA"
              ? "Sugestão = (CMD × Cob. Alvo + Demanda Extra) − Estoque · limitada ao saldo em Alm_SP_Fabrica/Processo · Granéis: abastecem o lote FEFO inteiro"
              : "Se Estoque < Mín ⇒ Sugestão = Ideal − Estoque (limitado ao Máx)"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Tabs value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
            <TabsList>
              <TabsTrigger value="COBERTURA">Por Demanda (Cobertura)</TabsTrigger>
              <TabsTrigger value="MINMAX">Mín / Ideal / Máx</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={() => gerarPedido.mutate()}
            disabled={sugeridosCount === 0 || gerarPedido.isPending}
          >
            {gerarPedido.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileText className="size-4 mr-1" />}
            Gerar Pedido{sugeridosCount > 0 ? ` (${sugeridosCount})` : ""}
          </Button>
        </div>
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
        {metodo === "COBERTURA" ? (
          <>
            <KPI label="Abaixo da cobertura" value={String(kpis.abaixo)} tone="warning" />
            <KPI label="Cobertura < 3 dias" value={String(kpis.criticos)} tone="danger" />
            <KPI label="Cobertura média" value={`${kpis.cobMedia.toFixed(1)} d`} />
          </>
        ) : (
          <>
            <KPI label="Abaixo do mínimo" value={String(kpis.abaixoMin)} tone="danger" />
            <KPI label="Acima do máximo" value={String(kpis.acimaMax)} tone="warning" />
            <KPI label="A repor" value={String(sugeridosCount)} />
          </>
        )}
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
          <div>
            <Label className="text-xs">Grupo de Produto</Label>
            <Select value={grupoF} onValueChange={setGrupoF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os grupos</SelectItem>
                {gruposDistintos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar SKU ou descrição</Label>
            <Input value={buscaF} onChange={(e) => setBuscaF(e.target.value)} placeholder="digite…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" />
            {metodo === "COBERTURA" ? "Cobertura por SKU" : "Mín / Ideal / Máx por SKU"}
          </CardTitle>
          <CardDescription>
            {metodo === "COBERTURA" ? "Ordenado pelos mais críticos." : "Vermelho: abaixo do mínimo · Amarelo: entre mín e ideal · Verde: ok · Azul: excesso"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="animate-spin" /> : metodo === "COBERTURA" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Abastecido por</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">CMD</TableHead>
                  <TableHead className="text-right">Cob. Atual</TableHead>
                  <TableHead className="text-right">Cob. Alvo</TableHead>
                  <TableHead className="text-right">Dem. Extra</TableHead>
                  <TableHead className="text-right">Disp. Fornec.</TableHead>
                  <TableHead className="text-right">Lote FEFO</TableHead>
                  <TableHead className="text-right">Sugestão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhasFiltradas.slice(0, 500).map((l) => (
                    <TableRow key={`${l.origem}|${l.sku}`}>
                      <TableCell className="font-mono text-xs">
                        {l.sku}
                        {l.is_granel && <Badge variant="outline" className="ml-1 text-[10px]">Granel</Badge>}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.produto}</TableCell>
                      <TableCell className="text-xs">{l.origem}</TableCell>
                      <TableCell className="text-xs font-medium">{l.origem_abastecimento}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(l.estoque)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.cmd.toFixed(2)}</TableCell>
                      <TableCell className="text-right"><CoberturaBadge dias={l.cobertura_atual} /></TableCell>
                      <TableCell className="text-right tabular-nums">{l.cobertura_alvo}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.demanda_extra > 0 ? `+${formatNum(l.demanda_extra)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {(SUPPLY_ORIGENS as readonly string[]).includes(l.origem_abastecimento)
                          ? <span className={l.supplier_disp <= 0 ? "text-destructive" : ""}>{formatNum(l.supplier_disp)}</span>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {l.lote_fefo ? <span className="font-mono">{l.lote_fefo} ({formatNum(l.lote_fefo_qtd)})</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatNum(l.sugestao)}</TableCell>
                      <TableCell className="text-right tabular-nums">R$ {formatNum(l.valor_reposicao)}</TableCell>
                    </TableRow>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground text-sm py-6">
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
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Mín</TableHead>
                  <TableHead className="text-right">Ideal</TableHead>
                  <TableHead className="text-right">Máx</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sugestão</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhasFiltradas.slice(0, 500).map((l) => (
                    <TableRow key={`${l.origem}|${l.sku}`}>
                      <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.produto}</TableCell>
                      <TableCell className="text-xs">{l.origem}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(l.estoque)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(l.minimo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(l.ideal)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(l.maximo)}</TableCell>
                      <TableCell><MinMaxBadge estoque={l.estoque} min={l.minimo} ideal={l.ideal} max={l.maximo} /></TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{l.sugestao_minmax > 0 ? formatNum(l.sugestao_minmax) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-6">
                      Sem dados.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
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

function MinMaxBadge({ estoque, min, ideal, max }: { estoque: number; min: number; ideal: number; max: number }) {
  if (min === 0 && ideal === 0 && max === 0) return <Badge variant="outline" className="text-xs">Sem parâmetros</Badge>;
  if (min > 0 && estoque < min) return <Badge className="bg-destructive/15 text-destructive">🔴 Abaixo do mín</Badge>;
  if (max > 0 && estoque > max) return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400">🔵 Excesso</Badge>;
  if (ideal > 0 && estoque >= ideal) return <Badge className="bg-success/15 text-success">🟢 OK</Badge>;
  return <Badge className="bg-warning/20 text-warning-foreground">🟡 Atenção</Badge>;
}

