import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Printer, Check } from "lucide-react";
import { toast } from "sonner";
import { formatNum } from "@/lib/inventory";
import { useNavigate } from "@tanstack/react-router";

type Req = {
  id: string; numero: string; origem_solicitante: string; origem_fornecedora: string;
  tipo: string; status: string;
};
type Item = {
  id: string; id_produto: string; descricao: string; unidade: string;
  quantidade_solicitada: number; quantidade_separada: number;
  status_item: string; motivo_nao_separacao: string | null;
  lotes_separados: Array<{ estoque_id: string; lote: string; data_validade: string | null; quantidade: number; custo_unitario: number }>;
};
type Lote = {
  id: string; lote: string; data_validade: string | null;
  quantidade: number; custo_unitario: number;
};

type LinhaState = {
  itemId: string;
  qtdSeparar: string;      // total a separar (input do usuário)
  motivo: string;
  alocacoes: Array<{ estoque_id: string; lote: string; data_validade: string | null; quantidade: number; custo_unitario: number }>;
  faltou: number;          // qtd que não conseguimos alocar via FEFO
};

export function SepararRequisicaoDialog({
  requisicao, open, onClose,
}: { requisicao: Req | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [linhas, setLinhas] = useState<Record<string, LinhaState>>({});

  const itensQ = useQuery({
    queryKey: ["req-separar-itens", requisicao?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requisicao_itens" as never)
        .select("*").eq("requisicao_id", requisicao!.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
    enabled: !!requisicao && open,
  });

  const lotesQ = useQuery({
    queryKey: ["req-separar-lotes", requisicao?.id, requisicao?.origem_fornecedora],
    queryFn: async () => {
      const skus = (itensQ.data ?? []).map((i) => i.id_produto);
      if (skus.length === 0) return {} as Record<string, Lote[]>;
      const { data, error } = await supabase.from("estoque_sistemico")
        .select("id, id_produto, lote, data_validade, quantidade, custo_unitario")
        .eq("origem", requisicao!.origem_fornecedora)
        .in("id_produto", skus)
        .gt("quantidade", 0);
      if (error) throw error;
      const map: Record<string, Lote[]> = {};
      for (const r of data ?? []) {
        const arr = map[r.id_produto] ?? (map[r.id_produto] = []);
        arr.push({ id: r.id, lote: r.lote, data_validade: r.data_validade, quantidade: Number(r.quantidade), custo_unitario: Number(r.custo_unitario ?? 0) });
      }
      for (const k of Object.keys(map)) {
        map[k].sort((a, b) => {
          const av = a.data_validade ?? "9999-12-31";
          const bv = b.data_validade ?? "9999-12-31";
          return av.localeCompare(bv);
        });
      }
      return map;
    },
    enabled: !!requisicao && open && !!itensQ.data && itensQ.data.length > 0,
  });

  // Inicializa alocações FEFO com quantidade solicitada
  useEffect(() => {
    if (!itensQ.data || !lotesQ.data) return;
    const init: Record<string, LinhaState> = {};
    for (const i of itensQ.data) {
      const lotes = lotesQ.data[i.id_produto] ?? [];
      const { alocacoes, faltou } = alocarFEFO(lotes, Number(i.quantidade_solicitada));
      init[i.id] = {
        itemId: i.id,
        qtdSeparar: String(Number(i.quantidade_solicitada) - faltou),
        motivo: "",
        alocacoes,
        faltou,
      };
    }
    setLinhas(init);
  }, [itensQ.data, lotesQ.data]);

  function alocarFEFO(lotes: Lote[], qtd: number) {
    const alocacoes: LinhaState["alocacoes"] = [];
    let restante = qtd;
    for (const l of lotes) {
      if (restante <= 0) break;
      const usar = Math.min(l.quantidade, restante);
      if (usar > 0) {
        alocacoes.push({ estoque_id: l.id, lote: l.lote, data_validade: l.data_validade, quantidade: usar, custo_unitario: l.custo_unitario });
        restante -= usar;
      }
    }
    return { alocacoes, faltou: Math.max(0, restante) };
  }

  function reAlocar(itemId: string, novaQtd: number) {
    const item = (itensQ.data ?? []).find((x) => x.id === itemId);
    if (!item) return;
    const lotes = lotesQ.data?.[item.id_produto] ?? [];
    const { alocacoes, faltou } = alocarFEFO(lotes, novaQtd);
    setLinhas((s) => ({ ...s, [itemId]: { ...s[itemId], qtdSeparar: String(novaQtd - faltou), alocacoes, faltou } }));
  }

  const finalizar = useMutation({
    mutationFn: async () => {
      if (!requisicao) return;
      const { data: u } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const items = itensQ.data ?? [];

      // Validar motivos
      for (const it of items) {
        const l = linhas[it.id];
        const qs = Number(l?.qtdSeparar || 0);
        if (qs < Number(it.quantidade_solicitada) && !l?.motivo.trim()) {
          throw new Error(`Item ${it.id_produto}: motivo obrigatório quando separar menos que o solicitado.`);
        }
      }

      // Atualiza cada item + decrementa estoque
      let totalOk = 0, totalParcial = 0, totalNao = 0;
      for (const it of items) {
        const l = linhas[it.id];
        const qs = Number(l?.qtdSeparar || 0);
        const qSolic = Number(it.quantidade_solicitada);
        let status = "NAO_SEPARADO";
        if (qs >= qSolic) { status = "SEPARADO"; totalOk++; }
        else if (qs > 0) { status = "SEPARADO_PARCIAL"; totalParcial++; }
        else { totalNao++; }

        const { error: e1 } = await supabase.from("requisicao_itens" as never).update({
          quantidade_separada: qs,
          quantidade_atendida: qs,
          status_item: status,
          motivo_nao_separacao: qs < qSolic ? l.motivo : null,
          lotes_separados: l?.alocacoes ?? [],
          separado_por: u.user?.id,
          separado_em: now,
        } as never).eq("id", it.id);
        if (e1) throw e1;

        // Decrementa estoque_sistemico por lote
        for (const a of l?.alocacoes ?? []) {
          const { data: est } = await supabase.from("estoque_sistemico")
            .select("quantidade").eq("id", a.estoque_id).single();
          const novaQtd = Math.max(0, Number(est?.quantidade ?? 0) - a.quantidade);
          const { error: e2 } = await supabase.from("estoque_sistemico")
            .update({ quantidade: novaQtd }).eq("id", a.estoque_id);
          if (e2) throw e2;
        }
      }

      // Status geral
      let statusReq = "ENVIADA";
      if (totalOk === items.length) statusReq = "ATENDIDA";
      else if (totalOk + totalParcial > 0) statusReq = "EM_SEPARACAO";

      const { error: e3 } = await supabase.from("requisicoes" as never)
        .update({ status: statusReq } as never).eq("id", requisicao.id);
      if (e3) throw e3;

      // Auditoria
      await supabase.from("auditoria").insert({
        entidade: "requisicoes",
        entidade_id: requisicao.id,
        acao: "SEPARACAO",
        usuario: u.user?.id,
        dados_depois: { status: statusReq, itens: items.map((i) => ({ id: i.id, sku: i.id_produto, separada: linhas[i.id]?.qtdSeparar, lotes: linhas[i.id]?.alocacoes })) },
        observacao: `Separação FEFO: ${totalOk} ok, ${totalParcial} parcial, ${totalNao} não separado`,
      });
    },
    onSuccess: () => {
      toast.success("Separação finalizada");
      qc.invalidateQueries({ queryKey: ["requisicoes"] });
      qc.invalidateQueries({ queryKey: ["requisicao", requisicao?.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = itensQ.isLoading || lotesQ.isLoading;

  const totalGeral = useMemo(() => {
    const items = itensQ.data ?? [];
    let s = 0, sep = 0;
    for (const i of items) {
      s += Number(i.quantidade_solicitada);
      sep += Number(linhas[i.id]?.qtdSeparar || 0);
    }
    return { solicitado: s, separado: sep };
  }, [itensQ.data, linhas]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Separação da requisição {requisicao?.numero}
            {requisicao && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Origem: {requisicao.origem_fornecedora} → Destino: {requisicao.origem_solicitante}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? <Loader2 className="animate-spin" /> : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU / Produto</TableHead>
                <TableHead className="text-right">Solic.</TableHead>
                <TableHead>Lote (FEFO)</TableHead>
                <TableHead className="text-right">Disp.</TableHead>
                <TableHead className="w-28">Qtd Separada</TableHead>
                <TableHead>Motivo (se &lt; solic.)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(itensQ.data ?? []).map((i) => {
                  const l = linhas[i.id];
                  const lotes = lotesQ.data?.[i.id_produto] ?? [];
                  const primeiro = lotes[0];
                  const totalDisp = lotes.reduce((s, x) => s + x.quantidade, 0);
                  const qSep = Number(l?.qtdSeparar ?? 0);
                  const qSol = Number(i.quantidade_solicitada);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">
                        <div className="font-mono">{i.id_produto}</div>
                        <div className="text-muted-foreground truncate max-w-[220px]">{i.descricao}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(qSol)} {i.unidade}</TableCell>
                      <TableCell className="text-xs">
                        {primeiro ? (
                          <>
                            <div className="font-mono">{primeiro.lote || "—"}</div>
                            <div className="text-muted-foreground">
                              val: {primeiro.data_validade ? new Date(primeiro.data_validade).toLocaleDateString("pt-BR") : "—"}
                            </div>
                            {(l?.alocacoes.length ?? 0) > 1 && (
                              <div className="text-warning text-[10px] mt-1">
                                + {(l!.alocacoes.length - 1)} lote(s) em cascata
                              </div>
                            )}
                          </>
                        ) : <span className="text-destructive">Sem estoque</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatNum(totalDisp)}</TableCell>
                      <TableCell>
                        <Input
                          type="number" min="0" max={String(qSol)}
                          value={l?.qtdSeparar ?? ""}
                          onChange={(e) => reAlocar(i.id, Math.min(qSol, Math.max(0, Number(e.target.value))))}
                          className="h-8"
                        />
                        {(l?.faltou ?? 0) > 0 && (
                          <div className="text-[10px] text-destructive mt-0.5">Faltam {formatNum(l!.faltou)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {qSep < qSol && (
                          <Input
                            placeholder="obrigatório"
                            value={l?.motivo ?? ""}
                            onChange={(e) => setLinhas((s) => ({ ...s, [i.id]: { ...s[i.id], motivo: e.target.value } }))}
                            className="h-8 text-xs"
                          />
                        )}
                        {qSep >= qSol && qSep > 0 && (
                          <Badge className="bg-success/15 text-success text-[10px]">Total</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-3 text-xs text-muted-foreground flex justify-between px-1">
              <span>Total solicitado: <b>{formatNum(totalGeral.solicitado)}</b></span>
              <span>Total a separar: <b>{formatNum(totalGeral.separado)}</b></span>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => imprimirFichaSeparacao(requisicao, itensQ.data ?? [], linhas, lotesQ.data ?? {})}
            disabled={!requisicao || loading}
          >
            <Printer className="size-4 mr-1" /> Imprimir ficha
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => finalizar.mutate()} disabled={finalizar.isPending || loading}>
            {finalizar.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            <Check className="size-4 mr-1" /> Finalizar separação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
