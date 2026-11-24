import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAll } from "@/lib/fetch-all";
import { CAB_MODELO, linhasModelo, lotesParaCorrecao, type ItemInv } from "@/lib/inventario-correcao-lotes";
import { num, sb } from "./comum";

export function CorrecaoLotesDialog({ inv, open, onOpenChange }: { inv: { id: string; numero: number; almoxarifado: string }; open: boolean; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({ queryKey: ["inv-correcao-lotes", inv.id, open], enabled: open, queryFn: async () => {
    const itens = await fetchAll<ItemInv>((a, z) => sb.from("inv_itens").select("codigo_produto, descricao, lote, qtd_sistema, qtd_contagem, qtd_recontagem, qtd_final").eq("inventario_id", inv.id).order("id").range(a, z));
    return lotesParaCorrecao(itens);
  } });
  const ls = q.data ?? [];
  const nDiv = new Set(ls.filter((l) => l.tipo === "DIVERGENTE").map((l) => l.sku)).size, nLote = new Set(ls.filter((l) => l.tipo === "CORRECAO_LOTE").map((l) => l.sku)).size;
  function baixar() {
    const ws = XLSX.utils.aoa_to_sheet([CAB_MODELO, ...linhasModelo(ls)]);
    ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo_Inventário");
    XLSX.writeFile(wb, `correcao-lotes-inventario-${inv.numero}-${inv.almoxarifado}.xlsx`);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Lotes a corrigir no sistema</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{ls.length} lote(s) · {nDiv} SKU(s) divergente(s) · {nLote} SKU(s) só com inconsistência de lote (soma confere). A planilha traz a quantidade contada final de cada lote.</p>
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="p-2">SKU</th><th className="p-2">Produto</th><th className="p-2">Lote</th><th className="p-2 text-right">Sistema</th><th className="p-2 text-right">Contado</th><th className="p-2 text-right">Dif.</th><th className="p-2">Tipo</th></tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {!q.isLoading && !ls.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhum lote com divergência.</td></tr>}
              {ls.map((l) => <tr key={l.sku + "|" + l.lote} className="border-t">
                <td className="p-2 font-mono text-xs">{l.sku}</td><td className="p-2">{l.descricao}</td><td className="p-2 font-mono text-xs">{l.lote || "(sem lote)"}</td>
                <td className="p-2 text-right tabular-nums">{num(l.sistema)}</td><td className="p-2 text-right tabular-nums">{num(l.contado)}</td>
                <td className={`p-2 text-right tabular-nums ${l.diferenca < 0 ? "text-destructive" : "text-primary"}`}>{l.diferenca > 0 ? "+" : ""}{num(l.diferenca)}</td>
                <td className="p-2 text-xs">{l.tipo === "DIVERGENTE" ? "Divergente" : "Correção de lote"}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><Button onClick={baixar} disabled={!ls.length}><Download className="mr-1 size-4" />Baixar planilha para o sistema</Button></div>
      </DialogContent>
    </Dialog>
  );
}
