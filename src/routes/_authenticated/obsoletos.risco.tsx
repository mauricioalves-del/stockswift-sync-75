import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { EnviarObsoletosSlackDialog } from "@/components/obsoletos/EnviarObsoletosSlackDialog";
import { chaveEnvio, indexarEnviosPorLote, type EnvioSlack, type ItemSlackObs } from "@/lib/obsoletos-slack";
import { AcaoObsoletoDialog, type AcaoObsDraft } from "@/components/obsoletos/AcaoObsoletoDialog";
import { FAIXA_OBS_LABEL, chaveObs, fmtBRL, useAcoesObsoleto, useItensObsoletos, useTiposAcaoObsoleto } from "@/lib/obsoletos";

export const Route = createFileRoute("/_authenticated/obsoletos/risco")({
  component: MapeamentoObsoletos,
  head: () => ({
    meta: [
      { title: "Obsoletos — Mapeamento de Risco" },
      { name: "description", content: "Itens sem movimentação por faixa de dias, valor exposto e ações vinculadas." },
      { property: "og:title", content: "Obsoletos — Mapeamento de Risco" },
      { property: "og:description", content: "Radar de obsolescência com criação de ações corretivas." },
    ],
  }),
});

function MapeamentoObsoletos() {
  const itens = useItensObsoletos();
  const acoes = useAcoesObsoleto();
  const tipos = useTiposAcaoObsoleto();
  const [busca, setBusca] = useState("");
  const [almox, setAlmox] = useState<string[]>([]);
  const [faixas, setFaixas] = useState<string[]>([]);
  const [statusAcao, setStatusAcao] = useState<string[]>([]);
  const [draft, setDraft] = useState<AcaoObsDraft | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [slackOpen, setSlackOpen] = useState(false);
  // Trends já abertas no Slack (Risco sem Giro), para marcar os itens e evitar envio repetido
  const envios = useQuery({
    queryKey: ["obsoletos-slack-envios"], staleTime: 60_000,
    queryFn: async () => { const { data, error } = await (supabase as any).from("obsoletos_slack_envios").select("id, numero, link, created_at, observacao, lotes").is("erro", null).order("numero", { ascending: false }); if (error) throw error; return (data ?? []) as EnvioSlack[]; },
  });
  const enviosPorItem = useMemo(() => indexarEnviosPorLote(envios.data), [envios.data]);
  const chaveItem = (r: { id_produto: string; lote: string | null; almoxarifado: string | null }) => chaveEnvio({ sku: r.id_produto, lote: r.lote ?? "", almoxarifado: r.almoxarifado ?? "" });

  const tipoNome = useMemo(() => new Map((tipos.data ?? []).map((t) => [t.id, t.nome])), [tipos.data]);
  const idx = useMemo(() => {
    const m = new Map<string, string[]>();
    (acoes.data ?? []).filter((a) => a.status !== "CANCELADA").forEach((a) => {
      const k = chaveObs(a.id_produto, a.almoxarifado, a.lote);
      m.set(k, [...(m.get(k) ?? []), tipoNome.get(a.tipo_acao_id ?? "") ?? "Ação"]);
    });
    return m;
  }, [acoes.data, tipoNome]);

  const rows = itens.data ?? [];
  const almoxOpts = useMemo(() => [...new Set(rows.map((r) => r.almoxarifado ?? "").filter(Boolean))].sort(), [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return rows
      .filter((r) => (almox.length ? almox.includes(r.almoxarifado ?? "") : true))
      .filter((r) => (faixas.length ? faixas.includes(r.faixa) : true))
      .filter((r) => {
        if (statusAcao.length !== 1) return true;
        const tem = idx.has(chaveObs(r.id_produto, r.almoxarifado, r.lote));
        return statusAcao[0] === "COM" ? tem : !tem;
      })
      .filter((r) => !q || `${r.id_produto} ${r.descricao} ${r.lote}`.toUpperCase().includes(q))
      .sort((a, b) => Number(b.valor) - Number(a.valor));
  }, [rows, almox, faixas, statusAcao, busca, idx]);

  const selecionados: ItemSlackObs[] = useMemo(() => rows.filter((r) => sel.has(chaveItem(r))).map((r) => ({ sku: r.id_produto, descricao: r.descricao ?? r.id_produto, lote: r.lote ?? "", almoxarifado: r.almoxarifado ?? "", dias_sem_mov: r.dias_sem_mov, faixa: r.faixa, quantidade: Number(r.saldo) || 0, valor: Number(r.valor) || 0 })), [rows, sel]);
  const visiveis = filtradas.slice(0, 500);
  const todosMarcados = visiveis.length > 0 && visiveis.every((r) => sel.has(chaveItem(r)));
  const alternarTodos = () => setSel((p) => { const n = new Set(p); visiveis.forEach((r) => (todosMarcados ? n.delete(chaveItem(r)) : n.add(chaveItem(r)))); return n; });
  const soma = (f: string) => filtradas.filter((r) => r.faixa === f).reduce((s, r) => s + Number(r.valor || 0), 0);
  const total = filtradas.reduce((s, r) => s + Number(r.valor || 0), 0);
  const comAcao = filtradas.filter((r) => idx.has(chaveObs(r.id_produto, r.almoxarifado, r.lote))).reduce((s, r) => s + Number(r.valor || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mapeamento de Risco — Obsoletos</h1>
        <p className="text-sm text-muted-foreground">Itens em estoque sem movimentação há 30 dias ou mais. Crie ações para recuperar o valor parado.</p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Kpi title="30 a 60 dias" value={soma("30-60")} />
        <Kpi title="61 a 90 dias" value={soma("61-90")} />
        <Kpi title="Mais de 90 dias" value={soma("+90")} />
        <Kpi title="Total em risco" value={total} />
        <Kpi title="Já com ação" value={comAcao} hint={total ? `${((comAcao / total) * 100).toFixed(1)}% do valor` : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label className="text-xs">Buscar</Label><Input placeholder="SKU, produto ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div><Label className="text-xs">Almoxarifado</Label><MultiSelect options={almoxOpts.map((o) => ({ value: o, label: o }))} value={almox} onChange={setAlmox} /></div>
          <div><Label className="text-xs">Faixa</Label><MultiSelect options={Object.entries(FAIXA_OBS_LABEL).map(([value, label]) => ({ value, label }))} value={faixas} onChange={setFaixas} allLabel="Todas" /></div>
          <div><Label className="text-xs">Status de Ação</Label><MultiSelect options={[{ value: "SEM", label: "Sem Ação" }, { value: "COM", label: "Com Ação" }]} value={statusAcao} onChange={setStatusAcao} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3"><CardTitle className="text-base">{filtradas.length} item(ns) · {fmtBRL(total)} em risco</CardTitle>
          <Button size="sm" disabled={!sel.size} onClick={() => setSlackOpen(true)}><Send className="mr-1 size-3.5" />Enviar ao Slack{sel.size ? ` (${sel.size})` : ""}</Button></CardHeader>
        <CardContent className="overflow-x-auto">
          {itens.isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox checked={todosMarcados} onCheckedChange={alternarTodos} /></TableHead>
                  <TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Lote</TableHead><TableHead>Almox</TableHead>
                  <TableHead className="text-right">Dias s/ mov.</TableHead><TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead>Faixa</TableHead><TableHead>Ação Vinculada</TableHead><TableHead>Trend</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((r, i) => {
                  const ac = idx.get(chaveObs(r.id_produto, r.almoxarifado, r.lote)) ?? [];
                  const k = chaveItem(r), tr = enviosPorItem.get(k)?.[0];
                  return (
                    <TableRow key={`${r.id_produto}-${r.almoxarifado}-${r.lote}-${i}`}>
                      <TableCell><Checkbox checked={sel.has(k)} onCheckedChange={(v) => setSel((p) => { const n = new Set(p); v ? n.add(k) : n.delete(k); return n; })} /></TableCell>
                      <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{r.descricao}</TableCell>
                      <TableCell className="font-mono text-xs">{r.lote || "—"}</TableCell>
                      <TableCell className="text-xs">{r.almoxarifado}</TableCell>
                      <TableCell className="text-right">{r.dias_sem_mov ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.saldo).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(Number(r.valor))}</TableCell>
                      <TableCell><Badge variant="secondary">{FAIXA_OBS_LABEL[r.faixa] ?? r.faixa}</Badge></TableCell>
                      <TableCell className="text-xs">{ac.length ? ac.join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-xs">{tr ? (tr.link ? <a href={tr.link} target="_blank" rel="noreferrer" className="font-semibold underline">#{tr.numero}</a> : <span className="font-semibold">#{tr.numero}</span>) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setDraft({
                          id_produto: r.id_produto, descricao: r.descricao, lote: r.lote, almoxarifado: r.almoxarifado,
                          faixa: r.faixa, dias_sem_mov: r.dias_sem_mov, quantidade: Number(r.saldo),
                          custo_unitario: Number(r.custo_unitario_medio ?? (Number(r.saldo) ? Number(r.valor) / Number(r.saldo) : 0)),
                        })}>
                          <Plus className="size-3.5 mr-1" /> Ação
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtradas.length && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Nenhum item com os filtros atuais.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
          {filtradas.length > 500 && <p className="text-xs text-muted-foreground pt-2">Exibindo os 500 itens de maior valor. Use os filtros para refinar.</p>}
        </CardContent>
      </Card>

      <AcaoObsoletoDialog draft={draft} onOpenChange={(v) => !v && setDraft(null)} />
      <EnviarObsoletosSlackDialog open={slackOpen} onOpenChange={setSlackOpen} itens={selecionados} enviosPorItem={enviosPorItem} onSent={() => { setSel(new Set()); envios.refetch(); }} />
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-xl font-bold mt-1">{fmtBRL(value)}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </CardContent></Card>
  );
}
