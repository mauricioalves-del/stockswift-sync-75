import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAll } from "@/lib/fetch-all";
import { CAB_MODELO, lotesPosFaturamento, type ItemInv } from "@/lib/inventario-correcao-lotes";
import { num, sb } from "./comum";

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export function FaturadosLotesDialog({ inv, open, onOpenChange }: { inv: { id: string; numero: number; almoxarifado: string }; open: boolean; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({ queryKey: ["inv-faturados-lotes", inv.id, open], enabled: open, queryFn: async () => {
    const itens = await fetchAll<ItemInv>((a, z) => sb.from("inv_itens").select("codigo_produto, descricao, lote, qtd_sistema, qtd_contagem, qtd_recontagem, qtd_final, qtd_faturada").eq("inventario_id", inv.id).order("id").range(a, z));
    const skus = [...new Set(itens.filter((i) => Number(i.qtd_faturada) > 0).map((i) => i.codigo_produto))];
    const val = new Map<string, string | null>();
    if (skus.length) {
      const lotes = [...new Set(itens.filter((i) => skus.includes(i.codigo_produto) && i.lote).map((i) => String(i.lote).trim()))];
      const { data } = await sb.from("estoque_sistemico").select("lote, data_validade").in("lote", lotes);
      for (const e of data ?? []) if (e.data_validade && (!val.get(e.lote) || e.data_validade < val.get(e.lote)!)) val.set(String(e.lote).trim(), e.data_validade);
    }
    return lotesPosFaturamento(itens.filter((i) => skus.includes(i.codigo_produto)), val);
  } });
  const ls = q.data ?? []; const corrigir = ls.filter((l) => l.diferenca !== 0);
  function baixar() {
    const ws = XLSX.utils.aoa_to_sheet([CAB_MODELO, ...corrigir.map((l) => [l.sku, "", l.lote, null, l.fisico])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo_Inventário");
    XLSX.writeFile(wb, `correcao-lotes-faturados-inventario-${inv.numero}-${inv.almoxarifado}.xlsx`);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Correção de lotes dos produtos faturados</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Só os produtos faturados na conciliação. A venda baixa o saldo do sistema por FEFO (validade mais próxima primeiro). Físico = Final sem as unidades faturadas. {corrigir.length} lote(s) precisam de correção; a planilha traz só esses, com o físico em Cont1.</p>
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="p-2">SKU</th><th className="p-2">Produto</th><th className="p-2">Lote</th><th className="p-2">Validade</th><th className="p-2 text-right">Sistema</th><th className="p-2 text-right">Baixa FEFO</th><th className="p-2 text-right">Sistema pós-venda</th><th className="p-2 text-right">Físico</th><th className="p-2 text-right">Correção</th></tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {!q.isLoading && !ls.length && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhum produto faturado na conciliação.</td></tr>}
              {ls.map((l) => <tr key={l.sku + "|" + l.lote} className={`border-t ${l.diferenca === 0 ? "text-muted-foreground" : ""}`}>
                <td className="p-2 font-mono text-xs">{l.sku}</td><td className="p-2">{l.descricao}</td><td className="p-2 font-mono text-xs">{l.lote || "(sem lote)"}</td><td className="p-2 text-xs">{dataBR(l.validade)}</td>
                <td className="p-2 text-right tabular-nums">{num(l.sistema)}</td><td className="p-2 text-right tabular-nums">{l.baixaFefo ? `-${num(l.baixaFefo)}` : "—"}</td><td className="p-2 text-right tabular-nums">{num(l.sistemaPos)}</td><td className="p-2 text-right tabular-nums">{num(l.fisico)}</td>
                <td className={`p-2 text-right tabular-nums ${l.diferenca < 0 ? "text-destructive" : l.diferenca > 0 ? "text-primary" : ""}`}>{l.diferenca === 0 ? "ok" : `${l.diferenca > 0 ? "+" : ""}${num(l.diferenca)}`}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><Button onClick={baixar} disabled={!corrigir.length}><Download className="mr-1 size-4" />Baixar planilha para o sistema</Button></div>
      </DialogContent>
    </Dialog>
  );
}
