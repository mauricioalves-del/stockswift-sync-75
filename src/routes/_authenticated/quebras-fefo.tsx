import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";
import { CheckCircle2, ArrowLeftRight, Loader2, MessageSquareText, ArrowRightLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/quebras-fefo")({
  component: QuebrasFefoPage,
  head: () => ({ meta: [{ title: "Quebras de FEFO" }] }),
});

type Detalhe = { lote: string | null; sistemico: number; contado: number; eh_nao_relacionado: boolean; percentual: number | null };
type Quebra = {
  id: string;
  missao_id: string | null;
  item_missao_id: string | null;
  codigo_produto: string;
  descricao: string | null;
  origem: string | null;
  id_local: string | null;
  total_sistemico: number;
  total_contado: number;
  detalhes: Detalhe[];
  status: string;
  created_at: string;
  observacao: string | null;
  motivo_resolucao: string | null;
  resolvido_em: string | null;
};

// Duas soluções possíveis para cada ocorrência:
// REALOCADO   — o saldo voltou ao almoxarifado/lote de origem depois de identificada a ruptura; corrige a distribuição entre lotes.
// JUSTIFICADO — existe uma justificativa lógica para a causa central da ruptura; nada muda no estoque, a causa fica registrada.
const MOTIVOS_JUSTIFICATIVA = [
  "Movimentação lançada em lote errado",
  "Recebimento sem lote ou com lote não cadastrado",
  "Erro de contagem / lote identificado errado na contagem",
  "Etiqueta ou identificação do lote ilegível",
  "Transferência entre almoxarifados pendente de lançamento",
  "Produção / fracionamento apontado em outro lote",
  "Outro (descrever)",
] as const;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  REALOCADO: { label: "Realocado", cls: "border-emerald-500 text-emerald-700 dark:text-emerald-300" },
  JUSTIFICADO: { label: "Justificado", cls: "border-sky-500 text-sky-700 dark:text-sky-300" },
  IGNORADO: { label: "Ignorado (antigo)", cls: "text-muted-foreground" },
};
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

function QuebrasFefoPage() {
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();
  const podeResolver = isAdmin || role === "COORDENADOR_CONTROLE";
  const [aberta, setAberta] = useState<Quebra | null>(null);
  const [justificando, setJustificando] = useState<Quebra | null>(null);
  const [aba, setAba] = useState<"pendentes" | "resolvidas">("pendentes");

  const q = useQuery({
    queryKey: ["quebras-fefo", aba],
    queryFn: async () => {
      let query = (supabase as any).from("quebras_fefo").select("*");
      query = aba === "pendentes"
        ? query.eq("status", "PENDENTE").order("created_at", { ascending: false })
        : query.neq("status", "PENDENTE").order("resolvido_em", { ascending: false, nullsFirst: false }).limit(300);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Quebra[];
    },
  });
  const pendentes = aba === "pendentes";

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ocorrências de Quebra de FEFO</h1>
        <p className="text-sm text-muted-foreground">
          Itens em que o total do SKU está dentro da tolerância, mas a distribuição entre lotes divergiu
          (ou houve lançamento em "Lote Não Relacionado"). Não é perda de estoque — é apontamento de processo.
        </p>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="resolvidas">Resolvidas</TabsTrigger>
        </TabsList>
      </Tabs>
      {pendentes && (
        <p className="text-xs text-muted-foreground">
          Cada ocorrência é encerrada de uma de duas formas: <b>Realocar</b>, quando o saldo voltou ao almoxarifado de origem depois de
          identificada a ruptura (corrige a distribuição entre lotes), ou <b>Justificar</b>, quando há uma causa lógica para a ruptura
          (nada muda no estoque; a causa fica registrada).
        </p>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Almox</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead>Lotes divergentes</TableHead>
                {pendentes
                  ? <TableHead className="text-right">Ações</TableHead>
                  : <><TableHead>Solução</TableHead><TableHead>Causa / observação</TableHead><TableHead>Quando</TableHead></>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.length === 0 && (
                <TableRow><TableCell colSpan={pendentes ? 7 : 9} className="text-center py-12 text-muted-foreground">
                  {pendentes ? "Nenhuma ocorrência pendente 🎉" : "Nenhuma ocorrência resolvida ainda."}
                </TableCell></TableRow>
              )}
              {(q.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.origem || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.descricao}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(Number(r.total_sistemico))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(Number(r.total_contado))}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.detalhes ?? []).map((d, i) => (
                        <Badge key={i} variant={d.eh_nao_relacionado ? "destructive" : "outline"} className="text-[10px] font-mono">
                          {d.eh_nao_relacionado ? "Não Rel." : d.lote}: {formatNum(d.contado)}/{formatNum(d.sistemico)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {pendentes ? (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {podeResolver && (
                          <>
                            <Button size="sm" variant="default" onClick={() => setAberta(r)} title="O saldo voltou ao almoxarifado de origem">
                              <ArrowLeftRight className="size-3.5 mr-1" /> Realocar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setJustificando(r)} title="Há uma causa lógica para a ruptura">
                              <MessageSquareText className="size-3.5 mr-1" /> Justificar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_LABEL[r.status]?.cls ?? ""}`}>{STATUS_LABEL[r.status]?.label ?? r.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-sm text-xs">
                        {r.motivo_resolucao && <div className="font-medium">{r.motivo_resolucao}</div>}
                        {r.observacao && <div className="text-muted-foreground">{r.observacao}</div>}
                        {!r.motivo_resolucao && !r.observacao && "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{quando(r.resolvido_em)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {aberta && (
        <RealocarDialog
          quebra={aberta}
          onClose={() => setAberta(null)}
          onDone={() => {
            setAberta(null);
            qc.invalidateQueries({ queryKey: ["quebras-fefo"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}
      {justificando && (
        <JustificarDialog
          quebra={justificando}
          onClose={() => setJustificando(null)}
          onDone={() => {
            setJustificando(null);
            qc.invalidateQueries({ queryKey: ["quebras-fefo"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}
    </div>
  );
}

function JustificarDialog({ quebra, onClose, onDone }: { quebra: Quebra; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const outro = motivo.startsWith("Outro");
  const minimo = outro ? 15 : 10;
  const valido = !!motivo && texto.trim().length >= minimo;

  async function confirmar() {
    if (!valido) return;
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as any).from("quebras_fefo").update({
      status: "JUSTIFICADO", motivo_resolucao: motivo, observacao: texto.trim(),
      resolvido_por: uid, resolvido_em: new Date().toISOString(),
    }).eq("id", quebra.id).eq("status", "PENDENTE");
    if (error) { setSaving(false); return toast.error(error.message); }
    await (supabase as any).from("auditoria").insert({
      acao: "JUSTIFICAR_QUEBRA_FEFO",
      entidade: "quebras_fefo",
      entidade_id: quebra.item_missao_id,
      usuario: uid,
      observacao: `SKU ${quebra.codigo_produto} · almox ${quebra.origem ?? "—"} · ${motivo}: ${texto.trim()}`,
      dados_antes: quebra.detalhes,
      dados_depois: { status: "JUSTIFICADO", motivo, justificativa: texto.trim() },
    });
    toast.success("Ocorrência justificada — estoque não foi alterado");
    setSaving(false);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Justificar ruptura — {quebra.codigo_produto}</DialogTitle>
          <DialogDescription>
            Use quando existe uma causa lógica para a quebra de FEFO e o saldo <b>não</b> precisa ser movido entre lotes.
            O estoque não é alterado; a causa fica registrada no histórico da ocorrência.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded border bg-muted/40 p-2 text-xs">
            <div className="mb-1 font-semibold">{quebra.descricao} · {quebra.origem ?? "—"}</div>
            <div className="flex flex-wrap gap-1">
              {quebra.detalhes.map((d, i) => (
                <Badge key={i} variant={d.eh_nao_relacionado ? "destructive" : "outline"} className="font-mono">
                  {d.eh_nao_relacionado ? "Não Rel." : d.lote}: {formatNum(d.contado)} / sis {formatNum(d.sistemico)}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Causa central da ruptura</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Escolha a causa" /></SelectTrigger>
              <SelectContent>{MOTIVOS_JUSTIFICATIVA.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Justificativa</Label>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
              placeholder="Explique o que aconteceu e como foi verificado (ex.: NF 1234 recebida sem lote; lote correto é o 0050…)." />
            <div className={`text-right text-[11px] ${texto.trim().length >= minimo ? "text-muted-foreground" : "text-amber-600"}`}>
              {texto.trim().length}/{minimo} caracteres mínimos
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!valido || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <><CheckCircle2 className="mr-1 size-4" /> Registrar justificativa</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RealocarDialog({ quebra, onClose, onDone }: { quebra: Quebra; onClose: () => void; onDone: () => void }) {
  // Traz TODOS os lotes sistêmicos deste SKU/almox e permite editar o saldo alvo de cada um.
  // Restrição: soma dos novos saldos deve ser igual ao saldo total atual (não altera o SKU total).
  const lotesQ = useQuery({
    queryKey: ["realoc-lotes", quebra.codigo_produto, quebra.origem],
    queryFn: async () => {
      let query = (supabase as any).from("estoque_sistemico")
        .select("id, lote, saldo_sistemico, id_local, data_validade")
        .eq("id_produto", quebra.codigo_produto);
      if (quebra.origem) query = query.eq("origem", quebra.origem);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; lote: string; saldo_sistemico: number; id_local: string; data_validade: string | null }>;
    },
  });

  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [loteAlvo, setLoteAlvo] = useState<string>("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const lotes = lotesQ.data ?? [];
  const totalAtual = lotes.reduce((s, l) => s + Number(l.saldo_sistemico ?? 0), 0);
  const totalNovo = lotes.reduce((s, l) => {
    const v = ajustes[l.id];
    const n = v === undefined ? Number(l.saldo_sistemico ?? 0) : Number(v.replace(",", "."));
    return s + (Number.isNaN(n) ? 0 : n);
  }, 0);

  function sugerirComContado() {
    // Preenche cada lote com o "contado" correspondente do detalhe da quebra;
    // se sobrar "Não Relacionado", joga tudo no loteAlvo escolhido.
    const map: Record<string, string> = {};
    for (const l of lotes) {
      const det = quebra.detalhes.find((d) => !d.eh_nao_relacionado && d.lote === l.lote);
      if (det) map[l.id] = String(det.contado);
    }
    const naoRel = quebra.detalhes.filter((d) => d.eh_nao_relacionado).reduce((s, d) => s + Number(d.contado ?? 0), 0);
    if (naoRel > 0 && loteAlvo) {
      const alvo = lotes.find((l) => l.id === loteAlvo);
      if (alvo) {
        const atual = Number(map[alvo.id] ?? alvo.saldo_sistemico ?? 0);
        map[alvo.id] = String(atual + naoRel);
      }
    }
    setAjustes(map);
  }

  async function confirmar() {
    if (Math.abs(totalNovo - totalAtual) > 0.001) {
      toast.error(`Soma deve permanecer ${formatNum(totalAtual)} (atual: ${formatNum(totalNovo)})`);
      return;
    }
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    // Atualiza cada saldo alterado
    for (const l of lotes) {
      const v = ajustes[l.id];
      if (v === undefined) continue;
      const novo = Number(v.replace(",", "."));
      if (Number.isNaN(novo) || novo === Number(l.saldo_sistemico ?? 0)) continue;
      const { error } = await (supabase as any).from("estoque_sistemico")
        .update({ saldo_sistemico: novo }).eq("id", l.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    // Auditoria
    await (supabase as any).from("auditoria").insert({
      acao: "REALOCAR_LOTES_FEFO",
      entidade: "estoque_sistemico",
      entidade_id: quebra.item_missao_id,
      usuario: uid,
      observacao: `SKU ${quebra.codigo_produto} · almox ${quebra.origem ?? "—"}`,
      dados_antes: lotes.map((l) => ({ lote: l.lote, saldo: Number(l.saldo_sistemico) })),
      dados_depois: lotes.map((l) => ({
        lote: l.lote,
        saldo: ajustes[l.id] !== undefined ? Number(ajustes[l.id].replace(",", ".")) : Number(l.saldo_sistemico),
      })),
    });
    // Fecha ocorrência
    await (supabase as any).from("quebras_fefo").update({
      status: "REALOCADO", motivo_resolucao: "Saldo retornou ao almoxarifado de origem",
      observacao: obs.trim() || null, resolvido_por: uid, resolvido_em: new Date().toISOString(),
    }).eq("id", quebra.id);

    toast.success("Lotes realocados — saldo total do SKU preservado");
    setSaving(false);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Realocar entre Lotes — {quebra.codigo_produto}</DialogTitle>
          <DialogDescription>
            Use quando o saldo voltou ao almoxarifado de origem depois de identificada a ruptura. Ajuste a distribuição entre lotes. A soma final deve manter o total sistêmico do SKU
            ({formatNum(totalAtual)}). Isso não altera o inventário total, só corrige a distribuição.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded border p-2 text-xs bg-muted/40">
            <div className="font-semibold mb-1">Contagem registrada</div>
            <div className="flex flex-wrap gap-1">
              {quebra.detalhes.map((d, i) => (
                <Badge key={i} variant={d.eh_nao_relacionado ? "destructive" : "outline"} className="font-mono">
                  {d.eh_nao_relacionado ? "Não Rel." : d.lote}: {formatNum(d.contado)} / sis {formatNum(d.sistemico)}
                </Badge>
              ))}
            </div>
          </div>

          {quebra.detalhes.some((d) => d.eh_nao_relacionado) && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Realocar "Não Relacionado" para o lote:</label>
                <Select value={loteAlvo} onValueChange={setLoteAlvo}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolher lote alvo…" /></SelectTrigger>
                  <SelectContent>
                    {lotes.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="font-mono">{l.lote}</span>
                        <span className="ml-2 text-muted-foreground text-xs">
                          saldo {formatNum(Number(l.saldo_sistemico))}
                          {l.data_validade ? ` · val ${l.data_validade}` : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="secondary" onClick={sugerirComContado}>Aplicar contagem</Button>
            </div>
          )}
          {!quebra.detalhes.some((d) => d.eh_nao_relacionado) && (
            <Button variant="secondary" size="sm" onClick={sugerirComContado}>
              Preencher com o contado
            </Button>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="text-right w-40">Novo saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">
                    {l.lote}
                    {l.data_validade && <span className="ml-2 text-[10px] text-muted-foreground">val {l.data_validade}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatNum(Number(l.saldo_sistemico))}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" inputMode="decimal" step="0.001" min="0"
                      className="h-8 text-right tabular-nums"
                      value={ajustes[l.id] ?? String(l.saldo_sistemico ?? 0)}
                      onChange={(e) => setAjustes({ ...ajustes, [l.id]: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className={`text-xs text-right tabular-nums ${Math.abs(totalNovo - totalAtual) > 0.001 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
            Soma nova: {formatNum(totalNovo)} · alvo: {formatNum(totalAtual)}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: produto retornou da loja para o almoxarifado em 03/11." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={saving || Math.abs(totalNovo - totalAtual) > 0.001}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <><CheckCircle2 className="size-4 mr-1" /> Confirmar realocação</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
