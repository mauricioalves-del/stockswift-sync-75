import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Compass, Loader2, AlertTriangle, TrendingUp, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";
import { indiceMedioNaJanela, indiceHoje, metodoPorABC, type PeriodoSazonal, type Metodo as MetodoSku } from "@/lib/sazonalidade";



export const Route = createFileRoute("/_authenticated/abastecimento/planejamento")({
  component: PlanejamentoPage,
  head: () => ({ meta: [{ title: "Abastecimento" }] }),
});

type Param = { origem: string; origem_abastecimento: string; cobertura_dias: number; dias_seguranca: number; ativo: boolean; metodo_override: string | null };
type Estoque = { id_produto: string; descricao: string; quantidade: number; custo_unitario: number; origem: string };
type EstoqueLote = { id_produto: string; origem: string; quantidade: number; lote: string; data_validade: string | null; data_importacao: string };
type Consumo = { origem: string; sku: string; quantidade: number; data_movimento: string };
type Demanda = { origem: string; sku: string; quantidade_extra: number; status: string; data_inicio: string; data_fim: string };
type ProdRep = { id_produto: string; estoque_minimo: number; estoque_ideal: number; estoque_maximo: number; ativo: boolean };
type Familia = { codigo_produto: string; familia: string };
type ABC = { codigo_produto: string; classe: string };
type Grupo = { grupo: string; codigo_produto: string };

type Metodo = "COBERTURA" | "MINMAX" | "AUTO";

const SUPPLY_ORIGENS = ["Alm_SP_Fabrica", "Alm_SP_Processo"] as const;
const FAMILIA_GRANEIS = "Granéis";

type Linha = {
  sku: string; produto: string; origem: string; origem_abastecimento: string;
  estoque: number; cmd: number; cobertura_atual: number; cobertura_alvo: number;
  demanda_extra: number; necessidade: number; sugestao: number; custo_unitario: number; valor_reposicao: number;
  minimo: number; ideal: number; maximo: number; sugestao_minmax: number;
  supplier_disp: number; lote_fefo: string | null; lote_fefo_qtd: number; is_granel: boolean;
  dias_base: number; janela_dias: number; sem_base: boolean;
  classe_abc: string | null;
  metodo_efetivo: MetodoSku; metodo_fonte: "override" | "abc" | "default";
  indice_sazonal: number; sazonal_nomes: string[];
};



function PlanejamentoPage() {
  const [origemF, setOrigemF] = useState<string>("__all");
  const [buscaF, setBuscaF] = useState("");
  const [grupoF, setGrupoF] = useState<string>("__all");
  const [metodo, setMetodo] = useState<Metodo>("AUTO");


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
      const data = await fetchAll<Estoque>((f, t) =>
        supabase.from("estoque_sistemico")
          .select("id_produto, descricao, quantidade, custo_unitario, origem")
          .in("origem", origensAtivas)
          .order("id_produto").range(f, t),
      );
      return data;
    },
  });

  const consumoQ = useQuery({
    queryKey: ["planejamento_consumo_90d", origensAtivas.join(",")],
    enabled: origensAtivas.length > 0,
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const iso = cutoff.toISOString().slice(0, 10);
      const data = await fetchAll<Consumo>((f, t) =>
        (supabase.from("historico_consumo" as never) as any)
          .select("origem, sku, quantidade, data_movimento")
          .in("origem", origensAtivas)
          .gte("data_movimento", iso)
          .order("data_movimento").range(f, t),
      );
      return data;
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
      const data = await fetchAll<EstoqueLote>((f, t) =>
        supabase.from("estoque_sistemico")
          .select("id_produto, origem, quantidade, lote, data_validade, data_importacao")
          .in("origem", SUPPLY_ORIGENS as unknown as string[])
          .order("id_produto").range(f, t),
      );
      return data;
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
      const { data } = await (supabase as never as { from: (t: string) => { select: (c: string) => Promise<{ data: Grupo[] | null }> } })
        .from("grupo_produtos").select("grupo, codigo_produto");
      return (data ?? []) as Grupo[];
    },
  });

  const abcQ = useQuery({
    queryKey: ["planejamento_abc"],
    queryFn: async () => {
      const { data } = await (supabase as never as { from: (t: string) => { select: (c: string) => Promise<{ data: ABC[] | null }> } })
        .from("classificacao_abc").select("codigo_produto, classe");
      return (data ?? []) as ABC[];
    },
  });

  const sazonaisQ = useQuery({
    queryKey: ["planejamento_sazonais"],
    queryFn: async () => {
      const { data } = await (supabase as never as { from: (t: string) => { select: (c: string) => { eq: (col: string, v: boolean) => Promise<{ data: PeriodoSazonal[] | null }> } } })
        .from("periodos_sazonais").select("*").eq("ativo", true);
      return (data ?? []) as PeriodoSazonal[];
    },
  });

  const locaisQ = useQuery({
    queryKey: ["produtos-locais"],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await (supabase as any)
        .from("grupo_produtos").select("codigo_produto").eq("eh_produto_local", true);
      return new Set(((data ?? []) as { codigo_produto: string }[]).map((r) => (r.codigo_produto ?? "").trim()));
    },
    staleTime: 5 * 60_000,
  });
  const locais = locaisQ.data ?? new Set<string>();

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
    const abcMap = new Map((abcQ.data ?? []).map((a) => [a.codigo_produto, a.classe]));
    const grupoMap = new Map((gruposQ.data ?? []).map((g) => [g.codigo_produto, g.grupo]));
    const periodos = sazonaisQ.data ?? [];

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

    // CMD ponderado por janelas (7/30/90 dias)
    const JANELAS = [
      { dias: 7, peso: 0.5 },
      { dias: 30, peso: 0.3 },
      { dias: 90, peso: 0.2 },
    ];
    const hojeDate = new Date();
    const cutoffs = JANELAS.map((j) => {
      const d = new Date(hojeDate);
      d.setDate(d.getDate() - j.dias);
      return d.toISOString().slice(0, 10);
    });

    const consumoJanela: Map<string, number>[] = JANELAS.map(() => new Map());
    const diasJanela: Map<string, Set<string>>[] = JANELAS.map(() => new Map());
    for (const c of (consumoQ.data ?? [])) {
      const qtd = Number(c.quantidade);
      if (qtd <= 0) continue;
      const key = `${c.origem}|${c.sku}`;
      const dia = String(c.data_movimento).slice(0, 10);
      for (let i = 0; i < JANELAS.length; i++) {
        if (dia >= cutoffs[i]) {
          consumoJanela[i].set(key, (consumoJanela[i].get(key) ?? 0) + qtd);
          const set = diasJanela[i].get(key) ?? new Set<string>();
          set.add(dia);
          diasJanela[i].set(key, set);
        }
      }
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

      const cmds: { cmd: number; peso: number; dias: number }[] = [];
      for (let i = 0; i < JANELAS.length; i++) {
        const total = consumoJanela[i].get(key) ?? 0;
        const dias = diasJanela[i].get(key)?.size ?? 0;
        if (dias > 0 && total > 0) {
          cmds.push({ cmd: total / dias, peso: JANELAS[i].peso, dias });
        }
      }
      const pesoTotal = cmds.reduce((a, b) => a + b.peso, 0);
      const cmd = pesoTotal > 0 ? cmds.reduce((a, b) => a + b.cmd * b.peso, 0) / pesoTotal : 0;
      const diasBase = cmds.length > 0 ? Math.max(...cmds.map((c) => c.dias)) : 0;
      const janelaBase = cmds.length > 0 ? Math.max(...cmds.map((c) => JANELAS.find((j) => j.peso === c.peso)?.dias ?? 0)) : 30;
      const semBase = cmd === 0;

      // Contexto SKU para sazonalidade e ABC
      const familia = familiaMap.get(sku) ?? "";
      const grupo = grupoMap.get(sku) ?? "";
      const classe = abcMap.get(sku) ?? null;
      const cobertura_alvo = p.cobertura_dias;

      // Índice médio de sazonalidade na janela de cobertura alvo (afeta CMD projetado)
      const saz = indiceMedioNaJanela(periodos, { sku, grupo, familia }, Math.max(1, cobertura_alvo));
      // Índice hoje (afeta Ideal/Máx no MinMax)
      const sazHoje = indiceHoje(periodos, { sku, grupo, familia });

      const cobertura_atual = cmd > 0 ? s.qtd / cmd : 999;
      const demanda_extra = demandaMap.get(key) ?? 0;
      // Necessidade ajustada por sazonalidade média da janela
      const necessidade = semBase ? demanda_extra : cmd * cobertura_alvo * saz.indice + demanda_extra;
      let sugestao = Math.max(0, necessidade - s.qtd);

      // Regras de suprimento
      const supKey = `${p.origem_abastecimento}|${sku}`;
      const isSupplied = (SUPPLY_ORIGENS as readonly string[]).includes(p.origem_abastecimento);
      const supplier_disp = isSupplied ? (supplierTotal.get(supKey) ?? 0) : Infinity;
      const fefo = isSupplied ? (supplierFefo.get(supKey) ?? null) : null;
      const is_granel = familia === FAMILIA_GRANEIS;

      const precisaRepor = cobertura_atual < cobertura_alvo || sugestao > 0;
      if (is_granel && isSupplied && fefo && fefo.qtd > 0 && precisaRepor) {
        sugestao = Math.max(sugestao, fefo.qtd);
      }
      if (isSupplied) sugestao = Math.min(sugestao, supplier_disp);

      const pr = prodMap.get(sku);
      const minimo = Number(pr?.estoque_minimo ?? 0);
      // Sazonalidade sobre Ideal/Máx no momento atual
      const ideal = Number(pr?.estoque_ideal ?? 0) * sazHoje.indice;
      const maximo = Number(pr?.estoque_maximo ?? 0) * sazHoje.indice;
      let sugestao_minmax = 0;
      if (minimo > 0 && s.qtd < minimo && ideal > 0) {
        sugestao_minmax = ideal - s.qtd;
        if (maximo > 0) sugestao_minmax = Math.min(sugestao_minmax, Math.max(0, maximo - s.qtd));
        sugestao_minmax = Math.max(0, sugestao_minmax);
      }
      if (isSupplied) sugestao_minmax = Math.min(sugestao_minmax, supplier_disp);

      const sugestaoCeil = Math.ceil(Math.max(0, sugestao));
      const sugestaoMinMaxCeil = Math.ceil(Math.max(0, sugestao_minmax));

      const met = metodoPorABC(classe, p.metodo_override);

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
        dias_base: diasBase, janela_dias: janelaBase, sem_base: semBase,
        classe_abc: classe,
        metodo_efetivo: met.metodo, metodo_fonte: met.fonte,
        indice_sazonal: saz.indice, sazonal_nomes: saz.nomes,
      });
    }
    return out.sort((a, b) => a.cobertura_atual - b.cobertura_atual);
  }, [paramsQ.data, estoqueQ.data, consumoQ.data, demandasQ.data, prodRepQ.data, supplierStockQ.data, familiasQ.data, abcQ.data, gruposQ.data, sazonaisQ.data]);


  const linhasFiltradas = linhas.filter((l) => {
    if (origemF !== "__all" && l.origem !== origemF) return false;
    if (skusDoGrupo && !skusDoGrupo.has(l.sku)) return false;
    if (buscaF) {
      const t = buscaF.toLowerCase();
      if (!l.sku.toLowerCase().includes(t) && !l.produto.toLowerCase().includes(t)) return false;
    }
    return true;
  });

  // Escolhe qual sugestão usar por linha, respeitando o modo global (COBERTURA/MINMAX)
  // ou o método efetivo por SKU (AUTO — ABC + override).
  const sugestaoDe = (l: Linha) => {
    if (metodo === "COBERTURA") return l.sugestao;
    if (metodo === "MINMAX") return l.sugestao_minmax;
    return l.metodo_efetivo === "MIN_IDEAL_MAX" ? l.sugestao_minmax : l.sugestao;
  };

  const kpis = useMemo(() => {
    // Produtos Locais não têm saldo próprio de verdade — são montados na loja.
    // Excluí-los evita alarme falso de "Sem Estoque" / "Cobertura crítica".
    const paraKpi = linhasFiltradas.filter((l) => !locais.has(l.sku));
    const total = linhasFiltradas.length;
    const abaixo = paraKpi.filter((l) => l.cobertura_atual < l.cobertura_alvo).length;
    const criticos = paraKpi.filter((l) => l.cobertura_atual < 3).length;
    const abaixoMin = paraKpi.filter((l) => l.minimo > 0 && l.estoque < l.minimo).length;
    const acimaMax = paraKpi.filter((l) => l.maximo > 0 && l.estoque > l.maximo).length;
    const valor = paraKpi.reduce((s, l) => s + sugestaoDe(l) * l.custo_unitario, 0);
    const cobMedia = paraKpi.length ? paraKpi.reduce((s, l) => s + Math.min(l.cobertura_atual, 60), 0) / paraKpi.length : 0;
    return { total, abaixo, criticos, valor, cobMedia, abaixoMin, acimaMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, metodo, locais]);


  const loading = paramsQ.isLoading || estoqueQ.isLoading;
  const semParams = (paramsQ.data ?? []).length === 0;

  const nav = useNavigate();

  const gerarPedido = useMutation({
    mutationFn: async () => {
      const sugeridos = linhasFiltradas
        .filter((l) => !locais.has(l.sku)) // produto local nunca é reposto por transferência
        .map((l) => ({ ...l, _sug: sugestaoDe(l), _metodo: metodo === "AUTO" ? l.metodo_efetivo : (metodo === "MINMAX" ? "MIN_IDEAL_MAX" : "POR_DEMANDA") }))
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
      const metodoLabel = metodo === "AUTO" ? "Auto (ABC)" : metodo === "MINMAX" ? "MinMax" : "Cobertura";
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

  const sugeridosCount = linhasFiltradas.filter((l) => sugestaoDe(l) > 0).length;



  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Compass className="size-6" /> Abastecimento</h1>
          <p className="text-sm text-muted-foreground">
            {metodo === "COBERTURA" && "Sugestão = (CMD × Cob. Alvo × Sazonalidade + Demanda Extra) − Estoque · limitada ao saldo em Alm_SP_Fabrica/Processo · Granéis: lote FEFO inteiro"}
            {metodo === "MINMAX" && "Se Estoque < Mín ⇒ Sugestão = Ideal − Estoque (limitado ao Máx) · Ideal/Máx ajustados por sazonalidade ativa"}
            {metodo === "AUTO" && "Método por SKU: classe A/B → Por Demanda · classe C → Mín/Ideal/Máx · com override manual e ajuste sazonal automático"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Tabs value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
            <TabsList>
              <TabsTrigger value="AUTO">Auto (ABC)</TabsTrigger>
              <TabsTrigger value="COBERTURA">Por Demanda</TabsTrigger>
              <TabsTrigger value="MINMAX">Mín / Ideal / Máx</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={() => exportarExcel(linhasFiltradas, metodo)} disabled={linhasFiltradas.length === 0}>
            <FileSpreadsheet className="size-4 mr-1" /> Baixar Excel
          </Button>
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
        {metodo === "MINMAX" ? (
          <>
            <KPI label="Abaixo do mínimo" value={String(kpis.abaixoMin)} tone="danger" />
            <KPI label="Acima do máximo" value={String(kpis.acimaMax)} tone="warning" />
            <KPI label="A repor" value={String(sugeridosCount)} />
          </>
        ) : (
          <>
            <KPI label="Abaixo da cobertura" value={String(kpis.abaixo)} tone="warning" />
            <KPI label="Cobertura < 3 dias" value={String(kpis.criticos)} tone="danger" />
            <KPI label="Cobertura média" value={`${kpis.cobMedia.toFixed(1)} d`} />
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
            {metodo === "MINMAX" ? "Mín / Ideal / Máx por SKU" : metodo === "AUTO" ? "Cobertura por SKU (Auto ABC + Sazonalidade)" : "Cobertura por SKU"}
          </CardTitle>
          <CardDescription>
            {metodo === "MINMAX" ? "Vermelho: abaixo do mínimo · Amarelo: entre mín e ideal · Verde: ok · Azul: excesso" : "Ordenado pelos mais críticos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="animate-spin" /> : metodo !== "MINMAX" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Abastecido por</TableHead>
                  {metodo === "AUTO" && <TableHead>Método</TableHead>}
                  <TableHead>Sazon.</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">CMD</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead>Confiança</TableHead>
                  <TableHead className="text-right">Cob. Atual</TableHead>
                  <TableHead className="text-right">Cob. Alvo</TableHead>
                  <TableHead className="text-right">Dem. Extra</TableHead>
                  <TableHead className="text-right">Disp. Fornec.</TableHead>
                  <TableHead className="text-right">Lote FEFO</TableHead>
                  <TableHead className="text-right">Sugestão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow></TableHeader>

                <TableBody>
                  {linhasFiltradas.slice(0, 500).map((l) => {
                    const sug = sugestaoDe(l);
                    const isLocal = locais.has(l.sku);
                    return (
                    <TableRow key={`${l.origem}|${l.sku}`}>
                      <TableCell className="font-mono text-xs">
                        {l.sku}
                        {l.classe_abc && <Badge variant="outline" className="ml-1 text-[10px]">{l.classe_abc}</Badge>}
                        {l.is_granel && <Badge variant="outline" className="ml-1 text-[10px]">Granel</Badge>}
                        {isLocal && <Badge className="ml-1 text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-400">Local</Badge>}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.produto}</TableCell>
                      <TableCell className="text-xs">{l.origem}</TableCell>
                      <TableCell className="text-xs font-medium">{l.origem_abastecimento}</TableCell>
                      {metodo === "AUTO" && (
                        <TableCell className="text-xs">
                          <MetodoBadge metodo={l.metodo_efetivo} fonte={l.metodo_fonte} />
                        </TableCell>
                      )}
                      <TableCell><SazonBadge indice={l.indice_sazonal} nomes={l.sazonal_nomes} /></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(l.estoque)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.sem_base ? "—" : l.cmd.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{l.dias_base}/{l.janela_dias}</TableCell>
                      <TableCell><ConfiancaBadge diasBase={l.dias_base} janela={l.janela_dias} /></TableCell>
                      <TableCell className="text-right">
                        {isLocal ? (
                          <Link
                            to="/producao/pcp"
                            search={{ produto: l.sku } as never}
                            className="inline-block"
                            title="Produto montado na loja — ver disponibilidade de insumos"
                          >
                            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[10px] hover:bg-blue-500/25">
                              Produto Local — ver insumos
                            </Badge>
                          </Link>
                        ) : l.sem_base ? <Badge variant="outline" className="text-[10px]">Sem base</Badge> : <CoberturaBadge dias={l.cobertura_atual} />}
                      </TableCell>

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
                      <TableCell className="text-right font-semibold tabular-nums">{isLocal ? "—" : formatNum(sug)}</TableCell>
                      <TableCell className="text-right tabular-nums">{isLocal ? "—" : `R$ ${formatNum(sug * l.custo_unitario)}`}</TableCell>
                    </TableRow>
                    );
                  })}
                  {linhasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={metodo === "AUTO" ? 17 : 16} className="text-center text-muted-foreground text-sm py-6">
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


function ConfiancaBadge({ diasBase, janela }: { diasBase: number; janela: number }) {
  if (janela <= 0 || diasBase === 0) return <Badge variant="outline" className="text-[10px]">Sem base</Badge>;
  const ratio = diasBase / janela;
  if (ratio >= 0.7) return <Badge className="bg-success/15 text-success text-[10px]">Alta</Badge>;
  if (ratio >= 0.4) return <Badge className="bg-warning/20 text-warning-foreground text-[10px]">Média</Badge>;
  return <Badge className="bg-destructive/15 text-destructive text-[10px]">Baixa</Badge>;
}

function MetodoBadge({ metodo, fonte }: { metodo: "POR_DEMANDA" | "MIN_IDEAL_MAX"; fonte: "override" | "abc" | "default" }) {
  const label = metodo === "POR_DEMANDA" ? "Por Demanda" : "Mín/Máx";
  const src = fonte === "override" ? "manual" : fonte === "abc" ? "ABC" : "default";
  const tone = metodo === "POR_DEMANDA" ? "bg-primary/10 text-primary" : "bg-muted text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={`${tone} text-[10px]`}>{label}</Badge>
      <span className="text-[9px] text-muted-foreground">{src}</span>
    </div>
  );
}

function SazonBadge({ indice, nomes }: { indice: number; nomes: string[] }) {
  if (!indice || indice === 1) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round((indice - 1) * 100);
  const tone = indice > 1 ? "bg-warning/20 text-warning-foreground" : "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  const label = `${pct > 0 ? "+" : ""}${pct}%`;
  return (
    <Badge className={`${tone} text-[10px]`} title={nomes.join(", ")}>{label}</Badge>
  );
}

function exportarExcel(linhas: Linha[], metodo: Metodo) {
  if (!linhas.length) return;
  const sugestaoDe = (l: Linha) => metodo === "MINMAX" ? l.sugestao_minmax : metodo === "AUTO" ? (l.metodo_efetivo === "MIN_IDEAL_MAX" ? l.sugestao_minmax : l.sugestao) : l.sugestao;
  const rows = linhas.map((l) => ({
    "SKU": l.sku,
    "Produto": l.produto,
    "Almox (destino)": l.origem,
    "Almox (fornecedor)": l.origem_abastecimento,
    "Classe ABC": l.classe_abc ?? "",
    "Método": l.metodo_efetivo === "POR_DEMANDA" ? "Por Demanda" : "Mín/Máx",
    "Fonte método": l.metodo_fonte,
    "Estoque": Number(l.estoque.toFixed(3)),
    "CMD (ponderado)": Number(l.cmd.toFixed(3)),
    "Base (dias)": l.janela_dias,
    "Cobertura atual (d)": Number(l.cobertura_atual.toFixed(1)),
    "Cobertura alvo (d)": l.cobertura_alvo,
    "Demanda extra": Number(l.demanda_extra.toFixed(3)),
    "Mínimo": Number(l.minimo.toFixed(3)),
    "Ideal": Number(l.ideal.toFixed(3)),
    "Máximo": Number(l.maximo.toFixed(3)),
    "Índice sazonal": Number(l.indice_sazonal.toFixed(3)),
    "Períodos sazonais": l.sazonal_nomes.join(", "),
    "Necessidade": Number(l.necessidade.toFixed(3)),
    "Sugestão": Number(sugestaoDe(l).toFixed(3)),
    "Disp. Fornecedor": Number(l.supplier_disp.toFixed(3)),
    "Lote FEFO": l.lote_fefo ?? "",
    "Qtd Lote FEFO": Number(l.lote_fefo_qtd.toFixed(3)),
    "Granel": l.is_granel ? "Sim" : "Não",
    "Custo unitário": Number((l.custo_unitario ?? 0).toFixed(4)),
    "Valor reposição (R$)": Number(l.valor_reposicao.toFixed(2)),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planejamento");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Abastecimento_Planejamento_${metodo}_${stamp}.xlsx`);
}
