import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ScanLine, Save, Loader2, Warehouse, AlertTriangle, PlayCircle, CheckCircle2 } from "lucide-react";
import { sounds } from "@/lib/audio";
import { formatNum, classificarFaixa, acuracidadeColor, statusLabel } from "@/lib/inventory";
import { aprovarRecontagem, type RecontagemRow } from "@/lib/recontagem";

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

function MissaoExecucaoPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

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

  const missao = missaoQ.data;
  const itens = itensQ.data ?? [];
  const total = itens.length;
  const CONCLUIDO_STATUSES = ["OK", "DIVERGENCIA_NEGATIVA", "DIVERGENCIA_POSITIVA", "CONTADO", "DIVERGENTE"];
  const concluidos = itens.filter((i) => i.status_item != null && CONCLUIDO_STATUSES.includes(i.status_item)).length;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  if (missaoQ.isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (!missao) return <div className="p-8 text-center text-muted-foreground">Missão não encontrada.</div>;

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
            <div className="text-sm">Assuma a missão para iniciar a contagem. Isso ativa o escopo de almoxarifado no Scanner.</div>
            <Button onClick={assumirMissao} className="gap-2"><PlayCircle className="size-4" /> Iniciar Missão</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Itens a contar</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {concluidos} de {total} · {pct}%
              {pct === 100 && <CheckCircle2 className="size-4 text-success inline ml-1.5" />}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="w-40">Contagem</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-32 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum item gerado para esta missão.
                </TableCell></TableRow>
              )}
              {itens.map((it) => (
                <LinhaItem key={it.id} item={it} missao={missao} onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["missao-itens", id] });
                  qc.invalidateQueries({ queryKey: ["missao", id] });
                }} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaItem({ item, missao, onSaved }: { item: Item; missao: Missao; onSaved: () => void }) {
  const [q, setQ] = useState<string>(item.quantidade_contada != null ? String(item.quantidade_contada) : "");
  const [saving, setSaving] = useState(false);
  const prev = Number(item.quantidade_prevista ?? 0);

  async function salvar() {
    const n = Number(q.replace(",", "."));
    if (q === "" || Number.isNaN(n) || n < 0) { toast.error("Quantidade inválida"); sounds.error(); return; }
    setSaving(true);
    const { classe, percentual } = classificarFaixa(n, prev);
    const status_item = classe; // "OK" | "DIVERGENCIA_NEGATIVA" | "DIVERGENCIA_POSITIVA"

    // Atualiza item da missão
    const { error: e1 } = await (supabase as any).from("missoes_itens")
      .update({ quantidade_contada: n, status_item }).eq("id", item.id);
    if (e1) { toast.error(e1.message); sounds.error(); setSaving(false); return; }

    // Registra em inventário (para o Relatório de Inventário) — só se houve mudança
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";
    // Busca custo do estoque_sistemico (mesmo escopo de almox)
    let est = (supabase as any).from("estoque_sistemico")
      .select("custo_unitario, unidade, id_local, data_validade")
      .eq("id_produto", item.codigo_produto);
    if (item.lote) est = est.eq("lote", item.lote);
    if (missao.origem) est = est.eq("origem", missao.origem);
    const { data: eData } = await est.maybeSingle();

    const payloadInv = {
      id_produto: item.codigo_produto,
      lote: item.lote ?? "",
      descricao: item.descricao ?? "",
      unidade: eData?.unidade ?? "UN",
      id_local: eData?.id_local ?? (missao.id_local ?? ""),
      origem: missao.origem ?? "",
      custo_unitario: Number(eData?.custo_unitario ?? 0),
      saldo_sistemico: prev,
      quantidade_contada: n,
      data_validade: eData?.data_validade ?? null,
      contagem_numero: 1,
      usuario: userId,
      data_contagem: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from("inventario").select("id")
      .eq("id_produto", item.codigo_produto).eq("lote", item.lote ?? "").maybeSingle();
    if (existing) await supabase.from("inventario").update({ ...payloadInv, status: "PENDENTE" }).eq("id", existing.id);
    else await supabase.from("inventario").insert(payloadInv);

    // Recontagem automática se fora da faixa 95–105%
    const { data: recExistente } = await (supabase as any).from("recontagem")
      .select("id").eq("item_missao_id", item.id).maybeSingle();
    if (classe !== "OK") {
      const recPayload = {
        missao_id: missao.id,
        item_missao_id: item.id,
        codigo_produto: item.codigo_produto,
        lote: item.lote ?? "",
        descricao: item.descricao ?? "",
        id_local: eData?.id_local ?? (missao.id_local ?? ""),
        origem: missao.origem ?? "",
        saldo_sistema: prev,
        contagem: n,
        acuracidade: percentual,
        status: "PENDENTE_RECONTAGEM",
        usuario: userId,
      };
      if (recExistente) {
        await (supabase as any).from("recontagem").update(recPayload).eq("id", recExistente.id);
      } else {
        await (supabase as any).from("recontagem").insert(recPayload);
      }
    } else if (recExistente) {
      // Item corrigido para dentro da faixa — encerra recontagem pendente
      await (supabase as any).from("recontagem").update({
        status: "APROVADO",
        aprovado_por: userId,
        aprovado_em: new Date().toISOString(),
        contagem: n,
        acuracidade: percentual,
      }).eq("id", recExistente.id);
    }

    // Transições de status da missão
    if (missao.status === "PLANEJADA") {
      await (supabase as any).from("missoes").update({
        status: "EM_ANDAMENTO",
        responsavel_id: missao.responsavel_id ?? userId,
      }).eq("id", missao.id);
    }
    // Se todos concluídos → CONCLUIDA
    const { data: restantes } = await (supabase as any).from("missoes_itens")
      .select("id").eq("missao_id", missao.id)
      .not("status_item", "in", "(OK,DIVERGENCIA_NEGATIVA,DIVERGENCIA_POSITIVA,CONTADO,DIVERGENTE)");
    if (!restantes || restantes.length === 0) {
      await (supabase as any).from("missoes").update({ status: "CONCLUIDA" }).eq("id", missao.id);
    }

    const msg = classe === "OK" ? "Dentro da tolerância"
              : classe === "DIVERGENCIA_NEGATIVA" ? "Divergência negativa — enviado para recontagem"
              : "Divergência positiva — enviado para recontagem";
    if (classe === "OK") { toast.success(msg); sounds.success(); }
    else { toast.warning(msg); sounds.success(); }
    setSaving(false);
    onSaved();
  }

  const cor = acuracidadeColor(
    item.status_item === "OK" || item.status_item === "DIVERGENCIA_NEGATIVA" || item.status_item === "DIVERGENCIA_POSITIVA"
      ? classificarFaixa(Number(item.quantidade_contada ?? 0), prev).percentual
      : null,
  );
  const badge = item.status_item == null || item.status_item === "PENDENTE"
    ? "bg-muted text-muted-foreground"
    : `${cor.bg} ${cor.text}`;
  const badgeLabel = item.status_item ? statusLabel(item.status_item).label : "Pendente";

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.codigo_produto}</TableCell>
      <TableCell className="max-w-xs truncate">{item.descricao}</TableCell>
      <TableCell className="font-mono text-xs">{item.lote || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{formatNum(prev)}</TableCell>
      <TableCell>
        <Input type="number" inputMode="decimal" step="0.001" min="0"
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="0" className="h-9 tabular-nums" />
      </TableCell>
      <TableCell>
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${badge}`}>
          {badgeLabel}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={salvar} disabled={saving || !q}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <><Save className="size-3.5 mr-1" /> Salvar</>}
        </Button>
      </TableCell>
    </TableRow>
  );
}
