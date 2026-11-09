import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PackageMinus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatNum } from "@/lib/inventory";
import { nk } from "@/lib/abastecimento-dados";
import { criarSolicitacaoBaixa } from "@/lib/solicitacoes-baixa";
import {
  chaveSkuLote, marcadorMissao, sugerirBaixaConsumo,
  type ItemConsumo, type LinhaContadaConsumo, type LoteSistConsumo,
} from "@/lib/missao-baixa-consumo";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missao: { id: string; titulo: string; origem: string | null; data_execucao: string | null };
  itens: ItemConsumo[];
  linhasPorItem: Map<string, LinhaContadaConsumo[]>;
  lotesPorSku: Map<string, LoteSistConsumo[]>;
  baixasAbertas: Map<string, { porLote: Record<string, number> }> | undefined;
  transito: Map<string, { qtd: number }> | undefined;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BaixaConsumoDialog({ open, onOpenChange, missao, itens, linhasPorItem, lotesPorSku, baixasAbertas, transito }: Props) {
  const qc = useQueryClient();
  const origem = missao.origem;

  // Baixas já geradas por esta missão que saíram da fila (aprovadas, executadas, em análise...).
  const geradasQ = useQuery({
    queryKey: ["missao-baixa-consumo-geradas", missao.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("baixa_operacional")
        .select("codigo_produto, lote, quantidade, status_fluxo")
        .eq("origem_lancamento", "MISSAO_INVENTARIO")
        .ilike("observacao", `%${marcadorMissao(missao.id)}%`)
        .not("status_fluxo", "in", "(REPROVADA,PENDENTE,AGUARDANDO_ADMIN)");
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as any[]) {
        const k = chaveSkuLote(r.codigo_produto, r.lote);
        m.set(k, (m.get(k) ?? 0) + Number(r.quantidade ?? 0));
      }
      return m;
    },
  });

  const motivoQ = useQuery({
    queryKey: ["motivo-uso-consumo"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa")
        .select("id, descricao").eq("ativo", true).ilike("descricao", "uso e consumo").limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; descricao: string } | null;
    },
  });

  const sugestoes = useMemo(() => {
    if (!geradasQ.data) return [];
    const pend = new Map<string, number>();
    for (const [sku, b] of baixasAbertas ?? []) {
      for (const [lote, q] of Object.entries(b.porLote)) pend.set(chaveSkuLote(sku, lote), q);
    }
    return sugerirBaixaConsumo({
      itens, linhasPorItem, lotesPorSku,
      pendentesPorSkuLote: pend,
      geradasPorSkuLote: geradasQ.data,
      transitoPorSku: (sku) => transito?.get(nk(sku))?.qtd ?? 0,
    });
  }, [geradasQ.data, baixasAbertas, itens, linhasPorItem, lotesPorSku, transito]);

  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMarcados(new Set(sugestoes.filter((s) => s.marcadoPadrao).map((s) => s.chave)));
    setQtds(Object.fromEntries(sugestoes.map((s) => [s.chave, String(s.quantidade)])));
  }, [open, sugestoes]);

  const qtdDe = (chave: string, max: number) => {
    const v = Number(String(qtds[chave] ?? "").replace(",", "."));
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0;
  };
  const selecionadas = sugestoes.filter((s) => marcados.has(s.chave) && s.quantidade > 0 && qtdDe(s.chave, s.quantidade) > 0);
  const valorTotal = selecionadas.reduce((t, s) => t + qtdDe(s.chave, s.quantidade) * s.custo_unitario, 0);
  const carregando = geradasQ.isLoading || motivoQ.isLoading;

  async function gerar() {
    if (!origem) return toast.error("Missão sem almoxarifado definido");
    if (!motivoQ.data) return toast.error("Motivo 'Uso e Consumo' não encontrado no cadastro de motivos");
    if (selecionadas.length === 0) return toast.info("Selecione ao menos um lote");
    setSalvando(true);
    try {
      const obs = `Baixa por consumo · diferença Sistema × Contagem da missão "${missao.titulo}" ${marcadorMissao(missao.id)}`;
      const r = await criarSolicitacaoBaixa({
        id_local: origem,
        motivo_baixa_id: motivoQ.data.id,
        observacao: obs,
        origem_lancamento: "MISSAO_INVENTARIO",
        itens: selecionadas.map((s) => ({
          codigo_produto: s.codigo_produto,
          descricao: s.descricao,
          unidade: s.unidade,
          lote: s.lote || null,
          id_local: origem,
          quantidade: qtdDe(s.chave, s.quantidade),
          custo_unitario: s.custo_unitario,
          motivo_baixa_id: motivoQ.data!.id,
          observacao: `Sistema ${formatNum(s.sistema)} × Contado ${formatNum(s.contado)} ${marcadorMissao(missao.id)}`,
          data_ocorrencia: missao.data_execucao,
          origem_lancamento: "MISSAO_INVENTARIO",
        })),
      });
      toast.success(`Pedido de baixa #${r.id} criado com ${selecionadas.length} lote(s) — aguardando aprovação`);
      qc.invalidateQueries({ queryKey: ["missao-baixas-abertas", missao.id] });
      qc.invalidateQueries({ queryKey: ["missao-baixa-consumo-geradas", missao.id] });
      qc.invalidateQueries({ queryKey: ["baixas"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar o pedido de baixa");
    } finally {
      setSalvando(false);
    }
  }

  const todasMarcaveis = sugestoes.filter((s) => s.quantidade > 0);
  const todasMarcadas = todasMarcaveis.length > 0 && todasMarcaveis.every((s) => marcados.has(s.chave));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageMinus className="size-5" /> Pedido de baixa por consumo</DialogTitle>
          <DialogDescription>
            Natureza <strong>Uso e Consumo</strong> do almoxarifado <strong>{origem ?? "—"}</strong>. Por lote, quando o Sistema é maior que a Contagem,
            a falta entra no pedido descontando baixas já na fila de aprovação. Lotes com estoque em trânsito vêm desmarcados para conferência.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          {carregando ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline mr-2" />Calculando…</div>
          ) : sugestoes.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">Nenhum lote com Sistema maior que a Contagem nesta missão.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 w-8">
                    <Checkbox aria-label="Selecionar todos" checked={todasMarcadas}
                      onCheckedChange={(v) => setMarcados(v ? new Set(todasMarcaveis.map((s) => s.chave)) : new Set())} />
                  </th>
                  <th className="p-2 text-left">SKU / Produto</th>
                  <th className="p-2 text-left">Lote</th>
                  <th className="p-2 text-right">Sistema</th>
                  <th className="p-2 text-right">Contado</th>
                  <th className="p-2 text-right">Diferença</th>
                  <th className="p-2 text-right" title="Baixas na fila de aprovação deste lote e almoxarifado">Baixa pendente</th>
                  <th className="p-2 text-right">Trânsito</th>
                  <th className="p-2 text-right">Qtd. baixa</th>
                  <th className="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {sugestoes.map((s) => {
                  const desabilitada = s.quantidade <= 0;
                  const q = qtdDe(s.chave, s.quantidade);
                  return (
                    <tr key={s.chave} className="border-t align-top">
                      <td className="p-2">
                        <Checkbox aria-label={`Selecionar ${s.codigo_produto} lote ${s.lote}`} disabled={desabilitada}
                          checked={marcados.has(s.chave)}
                          onCheckedChange={(v) => setMarcados((prev) => {
                            const n = new Set(prev); if (v) n.add(s.chave); else n.delete(s.chave); return n;
                          })} />
                      </td>
                      <td className="p-2">
                        <div className="font-mono text-xs">{s.codigo_produto}</div>
                        <div>{s.descricao}</div>
                        {s.aviso && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning-foreground bg-warning/20 rounded px-1.5 py-0.5">
                            <AlertTriangle className="size-3" /> {s.aviso}
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{s.lote || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{formatNum(s.sistema)}</td>
                      <td className="p-2 text-right tabular-nums">{formatNum(s.contado)}</td>
                      <td className="p-2 text-right tabular-nums text-destructive font-semibold">{formatNum(s.diferenca)}</td>
                      <td className="p-2 text-right tabular-nums">{s.baixaPendente || s.jaGerado ? formatNum(s.baixaPendente + s.jaGerado) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{s.transito ? formatNum(s.transito) : "—"}</td>
                      <td className="p-2 text-right">
                        <Input className="h-8 w-20 ml-auto text-right tabular-nums" inputMode="decimal" disabled={desabilitada}
                          aria-label={`Quantidade de baixa ${s.codigo_produto} lote ${s.lote}`}
                          value={qtds[s.chave] ?? ""} onChange={(e) => setQtds((p) => ({ ...p, [s.chave]: e.target.value }))} />
                      </td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{brl(q * s.custo_unitario)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selecionadas.length} lote(s) · <span className="font-semibold text-foreground">{brl(valorTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={gerar} disabled={salvando || carregando || selecionadas.length === 0}>
              {salvando && <Loader2 className="size-4 mr-1.5 animate-spin" />} Gerar pedido de baixa
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
