import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  ArrowLeft, ScanLine, Save, Loader2, Warehouse, AlertTriangle,
  PlayCircle, CheckCircle2, Plus, Trash2, CalendarIcon,
} from "lucide-react";
import { sounds } from "@/lib/audio";
import { formatNum, classificarFaixa, acuracidadeColor, statusLabel, TOLERANCIA_MIN, TOLERANCIA_MAX } from "@/lib/inventory";
import { aprovarRecontagem, type RecontagemRow } from "@/lib/recontagem";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/missoes/$id")({
  component: MissaoExecucaoPage,
  head: () => ({ meta: [{ title: "Executar Missão" }] }),
});

type Missao = {
  id: string; titulo: string; descricao: string | null; tipo: string; status: string;
  origem: string | null; id_local: string | null; grupo: string | null; familia: string | null;
  responsavel_id: string | null; data_execucao: string | null;
};

type Item = {
  id: string; missao_id: string; codigo_produto: string; descricao: string | null;
  lote: string | null; quantidade_prevista: number | null; quantidade_contada: number | null;
  status_item: string | null; recontagem_origem_id: string | null;
};

type LoteSist = {
  lote: string;
  saldo: number;
  custo_unitario: number;
  unidade: string;
  id_local: string;
  data_validade: string | null;
};

type LinhaLote = {
  id?: string;
  key: string;
  lote: string | null;         // null → Não Relacionado (lote manual)
  lote_manual_texto?: string;  // texto livre quando eh_nao_relacionado
  data_validade_manual?: string | null; // yyyy-mm-dd, lote manual
  eh_nao_relacionado: boolean;
  quantidade_contada: string;  // string em edição
  saldo_sistemico_lote?: number | null;
};

const CONCLUIDO_STATUSES = [
  "OK", "DIVERGENCIA_NEGATIVA", "DIVERGENCIA_POSITIVA",
  "CONTADO", "DIVERGENTE", "QUEBRA_FEFO",
];

function MissaoExecucaoPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin } = useRole();
  useBuscaShortcut();

  const missaoQ = useQuery({
    queryKey: ["missao", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("missoes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Missao | null;
    },
  });

  const itensQ = useQuery({
    queryKey: ["missao-itens", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("missoes_itens").select("*").eq("missao_id", id).order("codigo_produto");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // Todos os lotes sistêmicos (mesmo com saldo 0) para os SKUs da missão, no almoxarifado da missão.
  const skus = useMemo(() => Array.from(new Set((itensQ.data ?? []).map((i) => i.codigo_produto))), [itensQ.data]);
  const lotesQ = useQuery({
    queryKey: ["missao-lotes-sist", id, missaoQ.data?.origem, skus.join(",")],
    enabled: !!missaoQ.data && skus.length > 0,
    queryFn: async () => {
      let q = (supabase as any).from("estoque_sistemico")
        .select("id_produto, lote, quantidade, custo_unitario, unidade, id_local, data_validade")
        .in("id_produto", skus);
      if (missaoQ.data?.origem) q = q.eq("origem", missaoQ.data.origem);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, LoteSist[]>();
      for (const r of (data ?? []) as any[]) {
        const arr = map.get(r.id_produto) ?? [];
        arr.push({
          lote: r.lote ?? "",
          saldo: Number(r.quantidade ?? 0),
          custo_unitario: Number(r.custo_unitario ?? 0),
          unidade: r.unidade ?? "UN",
          id_local: r.id_local ?? "",
          data_validade: r.data_validade ?? null,
        });
        map.set(r.id_produto, arr);
      }
      // ordena por FEFO por SKU
      for (const arr of map.values()) {
        arr.sort((a, b) => (a.data_validade ?? "9999-12-31").localeCompare(b.data_validade ?? "9999-12-31"));
      }
      return map;
    },
  });

  // Linhas de lote já persistidas para os itens da missão.
  const itemIds = useMemo(() => (itensQ.data ?? []).map((i) => i.id), [itensQ.data]);
  const itemIdsKey = useMemo(() => itemIds.join(","), [itemIds]);
  const linhasQ = useQuery({
    queryKey: ["missao-item-lotes", id, itemIdsKey],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("itens_missao_lotes").select("*").in("item_missao_id", itemIds);
      if (error) throw error;
      const map = new Map<string, any[]>();
      for (const r of (data ?? []) as any[]) {
        const arr = map.get(r.item_missao_id) ?? [];
        arr.push(r);
        map.set(r.item_missao_id, arr);
      }
      return map;
    },
  });

  async function assumirMissao() {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { error } = await (supabase as any).from("missoes")
      .update({ responsavel_id: uid, status: "EM_ANDAMENTO" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Missão iniciada");
    qc.invalidateQueries({ queryKey: ["missao", id] });
    qc.invalidateQueries({ queryKey: ["almox-ativo"] });
  }

  const [busca, setBusca] = useState("");
  const missao = missaoQ.data;
  const itens = itensQ.data ?? [];
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status_item != null && CONCLUIDO_STATUSES.includes(i.status_item)).length;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      i.codigo_produto.toLowerCase().includes(q) ||
      (i.descricao ?? "").toLowerCase().includes(q),
    );
  }, [itens, busca]);

  if (missaoQ.isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (!missao) return <div className="p-8 text-center text-muted-foreground">Missão não encontrada.</div>;

  const onSavedItem = () => {
    qc.invalidateQueries({ queryKey: ["missao-itens", id] });
    qc.invalidateQueries({ queryKey: ["missao-item-lotes", id] });
    qc.invalidateQueries({ queryKey: ["missao", id] });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link to="/missoes" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="size-3" /> Missões
            </Link>
          </div>
          <h1 className="text-2xl font-bold">{missao.titulo}</h1>
          {missao.descricao && <p className="text-sm text-muted-foreground">{missao.descricao}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-[10px]">{missao.status}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/scanner"><ScanLine className="size-4 mr-1.5" /> Scanner</Link>
          </Button>
        </div>
      </div>

      {missao.origem ? (
        <div className="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm">
          <Warehouse className="size-4 text-primary" />
          <span>Contagem restrita ao almoxarifado <strong>{missao.origem}</strong></span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4" />
          <span>Missão sem almoxarifado definido — contagem usará o padrão do usuário.</span>
        </div>
      )}

      {missao.status === "PLANEJADA" && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="text-sm">Assuma a missão para iniciar a contagem.</div>
            <Button onClick={assumirMissao} className="gap-2"><PlayCircle className="size-4" /> Iniciar Missão</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span>Itens a contar</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {concluidos} de {total} · {pct}%
              {pct === 100 && <CheckCircle2 className="size-4 text-success inline ml-1.5" />}
            </span>
          </CardTitle>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar SKU ou descrição… (atalho: /)"
            className="h-8 text-sm max-w-sm"
            data-busca-missao
          />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                {isAdmin && <TableHead className="text-right">Sistema</TableHead>}
                <TableHead className="w-[420px]">Contagem por lote</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-32 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensFiltrados.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-10 text-muted-foreground">
                  {itens.length === 0 ? "Nenhum item gerado para esta missão." : "Nenhum item corresponde à busca."}
                </TableCell></TableRow>
              )}
              {itensFiltrados.map((it) => (
                <LinhaItem
                  key={it.id}
                  item={it}
                  missao={missao}
                  lotesSist={lotesQ.data?.get(it.codigo_produto) ?? []}
                  linhasSalvas={linhasQ.data?.get(it.id) ?? []}
                  isAdmin={isAdmin}
                  onSaved={onSavedItem}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Atalho global "/" foca a busca da missão
function useBuscaShortcut() {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const el = document.querySelector<HTMLInputElement>("[data-busca-missao]");
      if (el) { e.preventDefault(); el.focus(); el.select(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

const LinhaItem = memo(function LinhaItem({
  item, missao, lotesSist, linhasSalvas, isAdmin, onSaved,
}: {
  item: Item;
  missao: Missao;
  lotesSist: LoteSist[];
  linhasSalvas: any[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  // Semente inicial: se já tiver linhas salvas → usa; senão, cria uma linha vazia com sugestão FEFO
  // (primeiro lote com saldo > 0, ou o primeiro da lista, ou "não relacionado" se não houver lote algum).
  const buildSeed = (): LinhaLote[] => {
    if (linhasSalvas.length > 0) {
      return linhasSalvas.map((r: any) => ({
        id: r.id,
        key: r.id,
        lote: r.lote,
        lote_manual_texto: r.lote_manual_texto ?? "",
        data_validade_manual: r.data_validade_manual ?? null,
        eh_nao_relacionado: !!r.eh_nao_relacionado,
        quantidade_contada: String(r.quantidade_contada ?? ""),
        saldo_sistemico_lote: r.saldo_sistemico_lote != null ? Number(r.saldo_sistemico_lote) : null,
      }));
    }
    const fefo = lotesSist.find((l) => l.saldo > 0) ?? lotesSist[0];
    if (fefo) {
      return [{
        key: crypto.randomUUID(),
        lote: fefo.lote || (item.lote ?? ""),
        eh_nao_relacionado: false,
        quantidade_contada: "",
        saldo_sistemico_lote: fefo.saldo,
      }];
    }
    return [{
      key: crypto.randomUUID(),
      lote: item.lote ?? "",
      eh_nao_relacionado: false,
      quantidade_contada: "",
      saldo_sistemico_lote: 0,
    }];
  };

  const [linhas, setLinhas] = useState<LinhaLote[]>(buildSeed);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  // Ressincroniza quando as linhas salvas chegam depois (fix do seed vazio) —
  // mas só se o usuário ainda não tocou nesta linha.
  const linhasSalvasKey = useMemo(
    () => linhasSalvas.map((r: any) => `${r.id}:${r.quantidade_contada}`).join("|"),
    [linhasSalvas],
  );
  useEffect(() => {
    if (dirtyRef.current) return;
    if (linhasSalvas.length === 0) return;
    setLinhas(buildSeed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasSalvasKey]);

  const totalSist = lotesSist.reduce((s, l) => s + (l.saldo || 0), 0);
  const totalContado = linhas.reduce((s, l) => s + (Number(l.quantidade_contada.replace(",", ".")) || 0), 0);
  // "Total Sistema" (resumo do SKU) = soma do "Saldo Sistema" de cada linha do quadro.
  // Linha reconhecida → saldo do lote; linha manual (não relacionada) → 0 por definição.
  const totalSistemaLinhas = linhas.reduce((s, l) => {
    if (l.eh_nao_relacionado) return s;
    const live = lotesSist.find((x) => x.lote === l.lote);
    return s + (live ? live.saldo : (l.saldo_sistemico_lote ?? 0));
  }, 0);
  // Motor de divergência agregado do SKU compara Total Contado × Total Sistema (faixa 95–105%).
  const sistemaParaDivergencia = totalSistemaLinhas;

  // Status simples por linha (regra única — item 3 do spec).
  function statusLinha(l: LinhaLote): "PENDENTE" | "OK" | "DIVERGENCIA" | "QUEBRA_FEFO" {
    const q = Number((l.quantidade_contada ?? "").toString().replace(",", "."));
    if (l.eh_nao_relacionado) return q > 0 ? "QUEBRA_FEFO" : "PENDENTE";
    if (l.quantidade_contada === "" || Number.isNaN(q)) return "PENDENTE";
    const live = lotesSist.find((x) => x.lote === l.lote);
    const saldo = live ? live.saldo : Number(l.saldo_sistemico_lote ?? 0);
    return q === saldo ? "OK" : "DIVERGENCIA";
  }

  function addLinha() {
    dirtyRef.current = true;
    const usados = new Set(linhas.filter((l) => !l.eh_nao_relacionado).map((l) => l.lote));
    const prox = lotesSist.find((l) => !usados.has(l.lote));
    setLinhas([...linhas, prox
      ? { key: crypto.randomUUID(), lote: prox.lote, eh_nao_relacionado: false, quantidade_contada: "", saldo_sistemico_lote: prox.saldo }
      : { key: crypto.randomUUID(), lote: "", eh_nao_relacionado: false, quantidade_contada: "", saldo_sistemico_lote: 0 }]);
  }
  function addLinhaManual() {
    dirtyRef.current = true;
    setLinhas([...linhas, {
      key: crypto.randomUUID(),
      lote: null,
      lote_manual_texto: "",
      data_validade_manual: null,
      eh_nao_relacionado: true,
      quantidade_contada: "",
      saldo_sistemico_lote: 0,
    }]);
  }
  function removerLinha(k: string) {
    dirtyRef.current = true;
    setLinhas(linhas.filter((l) => l.key !== k));
  }
  function alterarLote(k: string, valor: string) {
    dirtyRef.current = true;
    setLinhas(linhas.map((l) => {
      if (l.key !== k) return l;
      const s = lotesSist.find((x) => x.lote === valor);
      return { ...l, lote: valor, eh_nao_relacionado: false, saldo_sistemico_lote: s?.saldo ?? 0 };
    }));
  }
  function alterarLoteManual(k: string, valor: string) {
    dirtyRef.current = true;
    setLinhas(linhas.map((l) => l.key === k ? { ...l, lote_manual_texto: valor } : l));
  }
  function alterarValidadeManual(k: string, valor: string | null) {
    dirtyRef.current = true;
    setLinhas(linhas.map((l) => l.key === k ? { ...l, data_validade_manual: valor } : l));
  }
  function alterarQtd(k: string, valor: string) {
    dirtyRef.current = true;
    setLinhas(linhas.map((l) => l.key === k ? { ...l, quantidade_contada: valor } : l));
  }
  function onQtdKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (saving) return;
    salvar();
  }

  async function salvar() {
    // Validações mínimas
    if (linhas.length === 0) { toast.error("Adicione ao menos uma linha de lote"); return; }
    for (const l of linhas) {
      const q = Number(l.quantidade_contada.replace(",", "."));
      if (l.quantidade_contada === "" || Number.isNaN(q) || q < 0) {
        toast.error("Quantidade inválida em uma das linhas"); sounds.error(); return;
      }
      if (!l.eh_nao_relacionado && !l.lote) {
        toast.error("Selecione o lote em todas as linhas"); return;
      }
      if (l.eh_nao_relacionado && !(l.lote_manual_texto ?? "").trim()) {
        toast.error("Informe o código do lote manual"); return;
      }
    }
    // Sem lotes duplicados (ignorando não relacionado)
    const codigos = linhas.filter((l) => !l.eh_nao_relacionado).map((l) => l.lote);
    if (new Set(codigos).size !== codigos.length) {
      toast.error("Há lotes repetidos — junte as quantidades em uma única linha"); return;
    }

    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";

    // Substitui as linhas persistidas por essas
    await (supabase as any).from("itens_missao_lotes").delete().eq("item_missao_id", item.id);
    const payloadLinhas = linhas.map((l) => ({
      item_missao_id: item.id,
      lote: l.eh_nao_relacionado ? null : l.lote,
      lote_manual_texto: l.eh_nao_relacionado ? (l.lote_manual_texto ?? "").trim() : null,
      data_validade_manual: l.eh_nao_relacionado ? (l.data_validade_manual ?? null) : null,
      eh_nao_relacionado: l.eh_nao_relacionado,
      quantidade_contada: Number(l.quantidade_contada.replace(",", ".")),
      saldo_sistemico_lote: l.saldo_sistemico_lote ?? null,
      usuario: userId || null,
    }));
    const { error: eIns } = await (supabase as any).from("itens_missao_lotes").insert(payloadLinhas);
    if (eIns) { toast.error(eIns.message); sounds.error(); setSaving(false); return; }

    // === Análise nível SKU (agregado, faixa 95–105%) ===
    const { classe, percentual } = classificarFaixa(totalContado, sistemaParaDivergencia);

    // === Quebra de FEFO — SOMENTE de linhas de Lote Não Relacionado com qtd > 0 ===
    // Lotes reconhecidos com contagem ≠ saldo nunca disparam Quebra de FEFO;
    // são apenas Divergência de linha (visual) e entram na análise agregada.
    const detalhesQuebra: Array<{ lote: string | null; sistemico: number; contado: number; eh_nao_relacionado: boolean; percentual: number | null }> = [];
    let contadoNaoRelacionado = 0;
    for (const l of linhas) {
      if (!l.eh_nao_relacionado) continue;
      const q = Number(l.quantidade_contada.replace(",", "."));
      if (q > 0) {
        contadoNaoRelacionado += q;
        detalhesQuebra.push({
          lote: (l.lote_manual_texto ?? "").trim() || null,
          sistemico: 0, contado: q, eh_nao_relacionado: true, percentual: null,
        });
      }
    }
    const temQuebraFefo = contadoNaoRelacionado > 0;

    // status_item: QUEBRA_FEFO tem precedência (exige realocação); senão, faixa agregada.
    const status_item: string = temQuebraFefo ? "QUEBRA_FEFO" : classe;



    // Atualiza item da missão (mantém quantidade_contada agregada para compatibilidade)
    const { error: eUp } = await (supabase as any).from("missoes_itens")
      .update({ quantidade_contada: totalContado, status_item }).eq("id", item.id);
    if (eUp) { toast.error(eUp.message); sounds.error(); setSaving(false); return; }

    // === Persistência de derivados ===
    // Se OK/QUEBRA_FEFO → não vai pra recontagem; mas se QUEBRA_FEFO cria ocorrência.
    // Se DIVERGENCIA_* → vai pra recontagem (fila existente), como já era.

    // Limpa possível quebra_fefo/recontagem prévia deste item para evitar duplicação
    await (supabase as any).from("quebras_fefo").delete().eq("item_missao_id", item.id).eq("status", "PENDENTE");

    if (temQuebraFefo) {
      await (supabase as any).from("quebras_fefo").insert({
        missao_id: missao.id,
        item_missao_id: item.id,
        codigo_produto: item.codigo_produto,
        descricao: item.descricao ?? "",
        origem: missao.origem ?? "",
        id_local: missao.id_local ?? (lotesSist[0]?.id_local ?? ""),
        total_sistemico: totalSist,
        total_contado: totalContado,
        detalhes: detalhesQuebra,
        status: "PENDENTE",
        usuario: userId || null,
      });
    }

    // Recontagem — mesmo mecanismo anterior, mas usando totais
    const primeiroLote = linhas.find((l) => !l.eh_nao_relacionado)?.lote ?? item.lote ?? "";
    if (item.recontagem_origem_id) {
      const { data: origem } = await (supabase as any).from("recontagem")
        .select("*").eq("id", item.recontagem_origem_id).maybeSingle();
      if (origem) {
        if (classe === "OK") {
          await aprovarRecontagem({ ...(origem as RecontagemRow), contagem: totalContado, acuracidade: percentual });
        } else {
          await (supabase as any).from("recontagem").update({
            contagem: totalContado, acuracidade: percentual, saldo_sistema: sistemaParaDivergencia,
            status: "PENDENTE_RECONTAGEM", usuario: userId,
          }).eq("id", origem.id);
        }
      }
    } else {
      const { data: recExistente } = await (supabase as any).from("recontagem")
        .select("id").eq("item_missao_id", item.id).maybeSingle();
      if (classe !== "OK") {
        const recPayload = {
          missao_id: missao.id,
          item_missao_id: item.id,
          codigo_produto: item.codigo_produto,
          lote: primeiroLote,
          descricao: item.descricao ?? "",
          id_local: missao.id_local ?? (lotesSist[0]?.id_local ?? ""),
          origem: missao.origem ?? "",
          saldo_sistema: sistemaParaDivergencia,
          contagem: totalContado,
          acuracidade: percentual,
          status: "PENDENTE_RECONTAGEM",
          usuario: userId,
        };
        if (recExistente) await (supabase as any).from("recontagem").update(recPayload).eq("id", recExistente.id);
        else await (supabase as any).from("recontagem").insert(recPayload);
      } else if (recExistente) {
        await (supabase as any).from("recontagem").update({
          status: "APROVADO", aprovado_por: userId, aprovado_em: new Date().toISOString(),
          contagem: totalContado, acuracidade: percentual,
        }).eq("id", recExistente.id);
      }
    }

    // Transições de status da missão
    if (missao.status === "PLANEJADA") {
      await (supabase as any).from("missoes").update({
        status: "EM_ANDAMENTO",
        responsavel_id: missao.responsavel_id ?? userId,
      }).eq("id", missao.id);
    }
    const { data: restantes } = await (supabase as any).from("missoes_itens")
      .select("id").eq("missao_id", missao.id)
      .not("status_item", "in", `(${CONCLUIDO_STATUSES.join(",")})`);
    if (!restantes || restantes.length === 0) {
      await (supabase as any).from("missoes").update({ status: "CONCLUIDA" }).eq("id", missao.id);
    }

    if (isAdmin) {
      const msg = status_item === "OK" ? "Dentro da tolerância"
                : status_item === "QUEBRA_FEFO" ? "Total OK, mas há quebra de FEFO — enviado para ocorrências"
                : status_item === "DIVERGENCIA_NEGATIVA" ? "Divergência negativa — enviado para recontagem"
                : "Divergência positiva — enviado para recontagem";
      if (status_item === "OK") { toast.success(msg); sounds.success(); }
      else if (status_item === "QUEBRA_FEFO") { toast.warning(msg); sounds.success(); }
      else { toast.warning(msg); sounds.divergente(); }
    } else {
      toast.success("Contagem registrada"); sounds.success();
    }
    setSaving(false);
    dirtyRef.current = false;
    onSaved();
  }

  const cor = acuracidadeColor(
    item.status_item && CONCLUIDO_STATUSES.includes(item.status_item)
      ? classificarFaixa(Number(item.quantidade_contada ?? 0), sistemaParaDivergencia).percentual
      : null,
  );
  const badge = item.status_item == null || item.status_item === "PENDENTE"
    ? "bg-muted text-muted-foreground"
    : item.status_item === "QUEBRA_FEFO"
      ? "bg-warning/20 text-warning-foreground"
      : `${cor.bg} ${cor.text}`;
  const badgeLabel = item.status_item === "QUEBRA_FEFO" ? "Quebra de FEFO"
    : item.status_item ? statusLabel(item.status_item).label : "Pendente";

  // opções de lote no dropdown: todos os lotes sistêmicos (mesmo com saldo 0) + Não Relacionado
  const opcoesLote = lotesSist;

  const unidade = (lotesSist[0]?.unidade ?? "UN").toUpperCase();
  const destacar = unidade === "KG" || unidade === "LT" || unidade === "L";
  const unidadeBadgeClass = destacar
    ? "bg-warning/40 text-warning-foreground border-warning/60"
    : "bg-muted text-muted-foreground border-border";

  return (
    <TableRow className={destacar ? "bg-warning/10 hover:bg-warning/15" : undefined}>
      <TableCell className="font-mono text-xs align-top">
        <div className="flex items-center gap-1.5">
          <span>{item.codigo_produto}</span>
          <span className={cn("inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-bold uppercase", unidadeBadgeClass)}>
            {unidade}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-xs truncate align-top">{item.descricao}</TableCell>
      {isAdmin && (
        <TableCell className="text-right tabular-nums align-top">
          <div>{formatNum(totalSist)}</div>
          {opcoesLote.length > 0 && (
            <div className="text-[10px] text-muted-foreground">{opcoesLote.length} lote(s)</div>
          )}
        </TableCell>
      )}
      <TableCell className="align-top">
        <div className="space-y-1.5">
          {linhas.map((l) => (
            <div key={l.key} className="flex flex-wrap items-center gap-1.5">
              {l.eh_nao_relacionado ? (
                <>
                  <Input
                    type="text"
                    className="h-8 text-xs flex-1 min-w-[140px] font-mono"
                    value={l.lote_manual_texto ?? ""}
                    onChange={(e) => alterarLoteManual(l.key, e.target.value)}
                    placeholder="Lote físico (manual)…"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button" variant="outline" size="sm"
                        className={cn("h-8 justify-start text-xs font-normal gap-1.5",
                          !l.data_validade_manual && "text-muted-foreground")}
                      >
                        <CalendarIcon className="size-3.5" />
                        {l.data_validade_manual
                          ? format(parseISO(l.data_validade_manual), "dd/MM/yyyy")
                          : "Validade"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={l.data_validade_manual ? parseISO(l.data_validade_manual) : undefined}
                        onSelect={(d) => alterarValidadeManual(l.key, d ? format(d, "yyyy-MM-dd") : null)}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </>
              ) : (
                <Select
                  value={l.lote ?? ""}
                  onValueChange={(v) => alterarLote(l.key, v)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-[160px]"><SelectValue placeholder="Lote…" /></SelectTrigger>
                  <SelectContent>
                    {opcoesLote.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum lote no sistema para este SKU
                      </div>
                    )}
                    {opcoesLote.map((o) => (
                      <SelectItem key={o.lote} value={o.lote} className="text-xs">
                        <span className="font-mono">{o.lote || "(sem lote)"}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                type="number" inputMode="decimal" step="0.001" min="0"
                className="h-8 w-24 tabular-nums text-xs"
                value={l.quantidade_contada}
                onChange={(e) => alterarQtd(l.key, e.target.value)}
                onKeyDown={onQtdKeyDown}
                placeholder="0"
                title="Enter para salvar"
              />
              {(() => {
                const live = !l.eh_nao_relacionado && l.lote ? lotesSist.find((x) => x.lote === l.lote) : null;
                const saldo = l.eh_nao_relacionado ? null : (live ? live.saldo : Number(l.saldo_sistemico_lote ?? 0));
                const st = statusLinha(l);
                const stClass =
                  st === "OK" ? "bg-success/15 text-success" :
                  st === "DIVERGENCIA" ? "bg-destructive/15 text-destructive" :
                  st === "QUEBRA_FEFO" ? "bg-warning/25 text-warning-foreground" :
                  "bg-muted text-muted-foreground";
                const stLabel =
                  st === "OK" ? "OK" :
                  st === "DIVERGENCIA" ? "Divergência" :
                  st === "QUEBRA_FEFO" ? "Quebra de FEFO" :
                  "Pendente";
                return (
                  <>
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      Saldo Sistema: <span className="font-semibold text-foreground">{saldo == null ? "—" : formatNum(saldo)}</span>
                    </span>
                    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap", stClass)}>
                      {stLabel}
                    </span>
                  </>
                );
              })()}
              <Button
                type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => removerLinha(l.key)} disabled={linhas.length === 1}
                title="Remover linha"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addLinha}>
              <Plus className="size-3 mr-1" /> Adicionar lote
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addLinhaManual}>
              <Plus className="size-3 mr-1" /> Adicionar lote manual
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Total contado: <span className="tabular-nums font-semibold">{formatNum(totalContado)}</span>
            {" · "}Total Sistema: <span className="tabular-nums font-semibold">{formatNum(totalSistemaLinhas)}</span>
            {isAdmin && totalSistemaLinhas !== totalSist && (
              <span className="text-muted-foreground/70"> (SKU total: {formatNum(totalSist)})</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${badge}`}>
          {badgeLabel}
        </span>
      </TableCell>
      <TableCell className="text-right align-top">
        <Button size="sm" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <><Save className="size-3.5 mr-1" /> Salvar</>}
        </Button>
      </TableCell>
    </TableRow>
  );
});
