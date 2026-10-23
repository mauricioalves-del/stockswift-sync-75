import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { detalhesRupturaDia } from "@/lib/abastecimento-ruptura-dia";
import type { HistLinha } from "@/lib/abastecimento-dash-hist";
import type { Bruto } from "@/lib/abastecimento-dados";
import { NOME, dm, n0 } from "./comum";

export function RupturasDiaDialog({ dia, fotos, hoje, bruto, onFechar }: { dia: string | null; fotos: HistLinha[]; hoje: string; bruto?: Bruto; onFechar: () => void }) {
  const selecionadas = fotos.filter((h) => h.data === dia && h.em_ruptura);
  const skus = [...new Set(selecionadas.flatMap((h) => [h.id_produto, h.id_produto.replace(/^0+/, ""), h.id_produto.padStart(8, "0")]))].sort();
  const q = useQuery({
    queryKey: ["abast-rupturas-dia", dia, skus, hoje], enabled: !!dia && skus.length > 0,
    queryFn: () => fetchAll<HistLinha>((from, to) => supabase.from("abast_disponibilidade_diaria").select("data,loja,id_produto,categoria,descricao,em_ruptura").in("id_produto", skus).lte("data", hoje).order("data").order("loja").order("id_produto").range(from, to)),
  });
  const itens = detalhesRupturaDia(selecionadas, q.data ?? []);
  const saldo = (h: HistLinha) => {
    if (!bruto) return null;
    const sku = h.id_produto.replace(/^0+/, "");
    const almox = h.loja === "CD" ? (sku === "5304043" ? "Alm_SP_Processo" : bruto.cd) : bruto.lojas.find((l) => l.codigo === h.loja)?.almoxarifado;
    if (!almox) return null;
    return bruto.estoque.reduce((s, e) => { const k = e.id_produto.replace(/^0+/, ""); return e.origem === almox && (k === "5104132" ? "5304043" : k) === sku ? s + Number(e.quantidade || 0) : s; }, 0);
  };
  return <Dialog open={!!dia} onOpenChange={(open) => { if (!open) onFechar(); }}>
    <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
      <DialogHeader><DialogTitle>Itens em ruptura · {dm(dia)}</DialogTitle><DialogDescription>{selecionadas.length} item(ns) · foto diária das 09h · locais e categoria selecionados</DialogDescription></DialogHeader>
      {q.isLoading ? <p className="py-6 text-center text-muted-foreground">Carregando histórico dos itens…</p> : q.error ? <div className="space-y-3 text-destructive"><p>Não foi possível consultar o histórico das rupturas.</p><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></div> : !itens.length ? <p className="py-6 text-center text-muted-foreground">Nenhum item em ruptura na foto deste dia.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted text-xs text-muted-foreground"><tr>{["SKU / Produto", "Local", "Entrou em ruptura", "Resolvida em", "Dias para solucionar", "Situação"].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead><tbody>
          {itens.map((h) => { const real = saldo(h); const aoVivo = !h.resolvidaEm && real !== null && real > 0; return <tr key={h.loja + h.id_produto} className="border-b last:border-0">
            <td className="min-w-48 px-3 py-2"><div className="font-mono text-xs text-muted-foreground">{h.id_produto}</div><div className="font-medium">{h.descricao ?? h.id_produto}</div></td><td className="px-3 py-2">{NOME[h.loja] ?? h.loja}</td>
            <td className="whitespace-nowrap px-3 py-2">{dm(h.entrada)}{h.parcial && <div className="text-xs text-muted-foreground">Histórico parcial</div>}</td>
            <td className="px-3 py-2">{h.resolvidaEm ? dm(h.resolvidaEm) : aoVivo ? "Entre a última foto e a leitura atual" : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{h.parcial ? "≥ " : ""}{h.dias} dia(s){!h.resolvidaEm && <div className="text-xs text-muted-foreground">Até a última foto</div>}</td>
            <td className="px-3 py-2"><span className={h.resolvidaEm || aoVivo ? "font-semibold text-success" : "font-semibold text-destructive"}>{h.resolvidaEm ? "Resolvida" : aoVivo ? `Resolvida · saldo atual ${n0(real)} un` : "Sem resolução registrada"}</span></td>
          </tr>; })}
        </tbody></table></div>
        <p className="text-xs text-muted-foreground">Resolução registrada na primeira foto com saldo após esta ocorrência, mesmo fora do período filtrado. Histórico parcial indica início anterior à primeira foto ou dias sem registro; datas exatas nesses intervalos não são conhecidas. O saldo atual não altera a ruptura gravada no dia.</p>
      </>}
    </DialogContent>
  </Dialog>;
}