import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CAB_MODELO } from "@/lib/inventario-correcao-lotes";
import { ajusteFefo, origemDoAlmox, type LinhaAjuste, type LoteSaldo } from "@/lib/movimentados-ajuste-fefo";

const sb = supabase as any;
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
type Grupo = { sku: string; almox: string; origem: string; desc: string; div: number; linhas: LinhaAjuste[]; naoCoberto: number };

export function AjusteFefoMovimentadosDialog({ ids, open, onOpenChange, descricao }: { ids: number[]; open: boolean; onOpenChange: (v: boolean) => void; descricao?: Map<string, string> }) {
  const q = useQuery({ queryKey: ["ajuste-fefo-mov", ids.join(","), open], enabled: open && ids.length > 0, queryFn: async (): Promise<Grupo[]> => {
    const divs: any[] = [];
    for (let i = 0; i < ids.length; i += 200) { const { data, error } = await sb.from("atlas_divergencias").select("id, sku, almoxarifado, divergencia_qtd").in("id", ids.slice(i, i + 200)); if (error) throw error; divs.push(...(data ?? [])); }
    const grupos = new Map<string, Grupo>();
    for (const d of divs) { const k = d.sku + "|" + d.almoxarifado; const g = grupos.get(k) ?? { sku: d.sku, almox: d.almoxarifado, origem: origemDoAlmox(d.almoxarifado), desc: descricao?.get(d.sku) ?? "", div: 0, linhas: [], naoCoberto: 0 }; g.div += Number(d.divergencia_qtd) || 0; grupos.set(k, g); }
    const skus = [...new Set(divs.map((d) => d.sku))]; const origens = [...new Set([...grupos.values()].map((g) => g.origem))];
    const est: any[] = [];
    for (let i = 0; i < skus.length; i += 200) for (let de = 0; ; de += 1000) { const { data, error } = await sb.from("estoque_sistemico").select("id_produto, origem, lote, quantidade, data_validade, descricao").in("id_produto", skus.slice(i, i + 200)).in("origem", origens).gt("quantidade", 0).order("id").range(de, de + 999); if (error) throw error; est.push(...(data ?? [])); if (!data || data.length < 1000) break; }
    for (const g of grupos.values()) {
      const lotes = new Map<string, LoteSaldo>();
      for (const e of est) if (e.id_produto === g.sku && e.origem === g.origem) { const k = String(e.lote ?? "").trim(); const l = lotes.get(k) ?? { lote: k, validade: e.data_validade ?? null, saldo: 0 }; l.saldo += Number(e.quantidade) || 0; if (e.data_validade && (!l.validade || e.data_validade < l.validade)) l.validade = e.data_validade; lotes.set(k, l); if (!g.desc) g.desc = e.descricao ?? ""; }
      const r = ajusteFefo(g.sku, g.origem, g.div, [...lotes.values()]); g.linhas = r.linhas; g.naoCoberto = r.naoCoberto;
    }
    return [...grupos.values()].sort((a, b) => a.almox.localeCompare(b.almox) || a.sku.localeCompare(b.sku));
  } });
  const gs = q.data ?? []; const linhas = gs.flatMap((g) => g.linhas); const pend = gs.filter((g) => g.naoCoberto > 0);
  function baixar() {
    const ws = XLSX.utils.aoa_to_sheet([CAB_MODELO, ...linhas.map((l) => [l.sku, l.almox, l.lote, null, l.cont1])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo_Inventário");
    XLSX.writeFile(wb, `ajuste-estoque-movimentados-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Planilha de ajuste de estoque · {ids.length} divergência(s)</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Só as divergências selecionadas. Falta baixa primeiro o lote que vence antes; se ele não tiver a quantidade toda, o restante sai do próximo lote. Sobra entra no lote que vence primeiro. Cont1 = saldo do lote depois do ajuste.</p>
        {pend.length > 0 && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{pend.length} produto(s) sem saldo suficiente nos lotes do almoxarifado: {pend.map((g) => `${g.sku} (${num(g.naoCoberto)} sem lote)`).join(", ")}.</p>}
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="p-2">SKU</th><th className="p-2">Produto</th><th className="p-2">Almox.</th><th className="p-2">Lote</th><th className="p-2">Validade</th><th className="p-2 text-right">Saldo</th><th className="p-2 text-right">Ajuste</th><th className="p-2 text-right">Cont1</th></tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {q.error && <tr><td colSpan={8} className="p-4 text-center text-destructive">Falha ao carregar: {(q.error as Error).message}</td></tr>}
              {gs.map((g) => g.linhas.length ? g.linhas.map((l, i) => <tr key={g.sku + g.almox + l.lote} className="border-t">
                <td className="p-2 font-mono text-xs">{i === 0 ? g.sku : ""}</td><td className="p-2">{i === 0 ? g.desc : ""}</td><td className="p-2 text-xs">{l.almox}</td><td className="p-2 font-mono text-xs">{l.lote || "(sem lote)"}</td><td className="p-2 text-xs">{dataBR(l.validade)}</td>
                <td className="p-2 text-right tabular-nums">{num(l.saldo)}</td><td className={`p-2 text-right tabular-nums ${l.ajuste < 0 ? "text-destructive" : "text-primary"}`}>{l.ajuste > 0 ? "+" : ""}{num(l.ajuste)}</td><td className="p-2 text-right font-medium tabular-nums">{num(l.cont1)}</td></tr>)
                : <tr key={g.sku + g.almox} className="border-t text-muted-foreground"><td className="p-2 font-mono text-xs">{g.sku}</td><td className="p-2">{g.desc}</td><td className="p-2 text-xs">{g.origem}</td><td colSpan={5} className="p-2 text-xs">{g.div ? `Sem lote com saldo para ajustar ${num(g.div)}` : "Sem divergência"}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><Button onClick={baixar} disabled={!linhas.length}><Download className="mr-1 size-4" />Baixar planilha de ajuste</Button></div>
      </DialogContent>
    </Dialog>
  );
}
