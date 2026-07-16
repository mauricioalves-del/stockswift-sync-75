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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";
import { CheckCircle2, XCircle, ArrowLeftRight, Loader2 } from "lucide-react";

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
};

function QuebrasFefoPage() {
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();
  const podeResolver = isAdmin || role === "COORDENADOR_CONTROLE";
  const [aberta, setAberta] = useState<Quebra | null>(null);

  const q = useQuery({
    queryKey: ["quebras-fefo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("quebras_fefo")
        .select("*").eq("status", "PENDENTE").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Quebra[];
    },
  });

  async function ignorar(id: string) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as any).from("quebras_fefo").update({
      status: "IGNORADO", resolvido_por: uid, resolvido_em: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ocorrência ignorada");
    qc.invalidateQueries({ queryKey: ["quebras-fefo"] });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ocorrências de Quebra de FEFO</h1>
        <p className="text-sm text-muted-foreground">
          Itens em que o total do SKU está dentro da tolerância, mas a distribuição entre lotes divergiu
          (ou houve lançamento em "Lote Não Relacionado"). Não é perda de estoque — é apontamento de processo.
        </p>
      </div>

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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhuma ocorrência pendente 🎉
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
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {podeResolver && (
                        <>
                          <Button size="sm" variant="default" onClick={() => setAberta(r)}>
                            <ArrowLeftRight className="size-3.5 mr-1" /> Realocar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => ignorar(r.id)} title="Ignorar">
                            <XCircle className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
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
    </div>
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
      status: "REALOCADO", resolvido_por: uid, resolvido_em: new Date().toISOString(),
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
            Ajuste a distribuição entre lotes. A soma final deve manter o total sistêmico do SKU
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
