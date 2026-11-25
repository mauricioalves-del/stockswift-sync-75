import { useState } from "react";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DadosInv, FiltroInv } from "@/lib/atlas-inventario";

export function ExcelAuditoriaButton({ dados, filtro }: { dados: DadosInv | undefined; filtro: FiltroInv }) {
  const [preparando, setPreparando] = useState(false);
  const [arquivo, setArquivo] = useState<{ blob: Blob; nome: string; itens: number; lotes: number } | null>(null);
  async function preparar() {
    if (!dados || preparando) return;
    setPreparando(true);
    try {
      const [{ carregarAuditoriaExcel }, { montarExcelAuditoria }] = await Promise.all([import("@/lib/inventario-auditoria-carregar"), import("@/lib/inventario-auditoria-excel")]);
      const pacote = await carregarAuditoriaExcel(dados, filtro);
      const wb = montarExcelAuditoria(pacote);
      const buffer = await wb.xlsx.writeBuffer();
      const bytes = new Uint8Array(buffer);
      setArquivo({ blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome: `auditoria-inventario-${filtro.mes ?? "historico"}-${new Date().toISOString().slice(0, 10)}.xlsx`, itens: wb.getWorksheet("Resultado por produto")?.rowCount ? (wb.getWorksheet("Resultado por produto")?.rowCount ?? 1) - 1 : 0, lotes: pacote.itens.length });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível preparar o Excel de auditoria."); }
    finally { setPreparando(false); }
  }
  function baixar() {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo.blob); const a = document.createElement("a");
    a.href = url; a.download = arquivo.nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <>
    <Button type="button" variant="outline" size="sm" title="Excel de auditoria do inventário" aria-label="Preparar Excel de auditoria do inventário" disabled={!dados || preparando} onClick={preparar} className="h-7 shrink-0 gap-1 border-current/20 bg-background/10 px-2 text-[11px] font-semibold text-inherit hover:bg-background/20 hover:text-inherit">{preparando ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-success" />}Excel</Button>
    <Dialog open={!!arquivo} onOpenChange={(open) => { if (!open) setArquivo(null); }}><DialogContent><DialogHeader><DialogTitle>Excel de auditoria</DialogTitle><DialogDescription>{arquivo?.itens} produtos no resultado oficial · {arquivo?.lotes} lotes de contagem disponíveis.</DialogDescription></DialogHeader><div className="flex justify-end"><Button onClick={baixar}><Download className="size-4" />Baixar Excel</Button></div></DialogContent></Dialog>
  </>;
}