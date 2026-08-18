import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import {
  parseBomPlanilha, parseConsumoPlanilha, gerarModeloBOM, gerarModeloConsumo,
  type BomRow, type ConsumoRow,
} from "@/lib/dispersao";

type Modo = "BOM" | "CONSUMO";

export function ImportarDispersaoDialog({ modo }: { modo: Modo }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rowsBom, setRowsBom] = useState<BomRow[]>([]);
  const [rowsCon, setRowsCon] = useState<ConsumoRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const isBom = modo === "BOM";
  const okRowsBom = rowsBom.filter((r) => r.status === "OK");
  const okRowsCon = rowsCon.filter((r) => r.status === "OK");
  const errosBom = rowsBom.length - okRowsBom.length;
  const errosCon = rowsCon.length - okRowsCon.length;
  const total = isBom ? rowsBom.length : rowsCon.length;

  function baixarModelo() {
    const blob = isBom ? gerarModeloBOM() : gerarModeloConsumo();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isBom ? "modelo-ficha-tecnica-bom.xlsx" : "modelo-consumo-op.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      if (isBom) setRowsBom(parseBomPlanilha(buf));
      else setRowsCon(parseConsumoPlanilha(buf));
    } catch (err) {
      toast.error("Falha ao ler planilha: " + (err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function importar() {
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      if (isBom) {
        const payload = okRowsBom.map((r) => ({
          id_produto: r.id_produto, produto: r.produto || null,
          id_subconjunto: r.id_subconjunto || null, subconjunto: r.subconjunto || null,
          id_item: r.id_item, item: r.item || null,
          qtd: r.qtd, tem_filho: !!r.tem_filho, gera_oc: !!r.gera_oc,
          linha_origem: r.linha_origem || null, custo: r.custo ?? 0,
          item_unidade: r.item_unidade || null, criado_por: uid,
        }));
        // sobrescreve BOM em blocos
        const CHUNK = 500;
        for (let i = 0; i < payload.length; i += CHUNK) {
          const slice = payload.slice(i, i + CHUNK);
          const { error } = await (supabase as any).from("ficha_tecnica_bom").insert(slice);
          if (error) throw error;
        }
      } else {
        const payload = okRowsCon.map((r) => ({
          ano_mes: r.ano_mes, id_op: r.id_op,
          produto: r.produto || null, desc_produto: r.desc_produto || null,
          material: r.material, desc_material: r.desc_material || null,
          um: r.um || null, qtd_consumo: r.qtd_consumo, qtd_previsto: r.qtd_previsto,
          qtd_produzida: r.qtd_produzida ?? null, data_producao: r.data_producao ?? null, criado_por: uid,
        }));
        // O relatório de consumo é uma fotografia completa da movimentação.
        // Substituir a base evita duplicidades e registros antigos sem a Data
        // de produção, que distorcem todos os indicadores do dashboard.
        const { error: deleteError } = await (supabase as any)
          .from("producao_consumo")
          .delete()
          .not("id", "is", null);
        if (deleteError) throw deleteError;

        const CHUNK = 500;
        for (let i = 0; i < payload.length; i += CHUNK) {
          const slice = payload.slice(i, i + CHUNK);
          const { error } = await (supabase as any).from("producao_consumo").insert(slice);
          if (error) throw error;
        }
      }
      toast.success(`Importado com sucesso (${isBom ? okRowsBom.length : okRowsCon.length} linhas).`);
      qc.invalidateQueries({ queryKey: ["dispersao"] });
      qc.invalidateQueries({ queryKey: ["bom"] });
      setOpen(false);
      setRowsBom([]); setRowsCon([]); setFilename("");
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isBom ? "outline" : "default"} className="gap-2">
          <Upload className="size-4" /> {isBom ? "Importar Ficha Técnica (BOM)" : "Importar Consumo por OP"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isBom ? "Importar Ficha Técnica (BOM)" : "Importar Consumo por OP"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={baixarModelo} className="gap-2">
            <Download className="size-4" /> Baixar Modelo
          </Button>
          <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar Planilha
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          {filename && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><FileSpreadsheet className="size-3.5" /> {filename}</span>}
        </div>

        {total > 0 && (
          <div className="flex gap-2 text-sm">
            <Badge variant="outline" className="gap-1"><CheckCircle2 className="size-3.5 text-success" />OK: {isBom ? okRowsBom.length : okRowsCon.length}</Badge>
            {(isBom ? errosBom : errosCon) > 0 && (
              <Badge variant="outline" className="gap-1"><AlertCircle className="size-3.5 text-destructive" />Erros: {isBom ? errosBom : errosCon}</Badge>
            )}
          </div>
        )}

        {!isBom && total > 0 && (
          <p className="text-xs text-muted-foreground">
            Ao confirmar, este relatório completo substituirá a base de consumo atual para evitar duplicidades.
          </p>
        )}

        {total > 0 && (() => {
          const rowsAll = isBom ? rowsBom : rowsCon;
          const errRows = rowsAll.filter((r) => r.status === "ERRO");
          if (errRows.length === 0) return null;
          const counts = new Map<string, number>();
          for (const r of errRows) for (const e of r.erros) counts.set(e, (counts.get(e) ?? 0) + 1);
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
          const dominante = top[0];
          const todasIguais = dominante && dominante[1] === errRows.length;
          return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="size-4" />
                {todasIguais
                  ? `${errRows.length} linha(s) com erro pelo mesmo motivo — confira o cabeçalho:`
                  : `${errRows.length} linha(s) com erro. Motivos mais frequentes:`}
              </div>
              <ul className="list-disc pl-6 text-muted-foreground">
                {top.map(([msg, n]) => (
                  <li key={msg}><span className="text-foreground font-medium">{n}×</span> {msg}</li>
                ))}
              </ul>
            </div>
          );
        })()}


        <div className="max-h-[400px] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {isBom ? (
                  <>
                    <TableHead>Produto</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Linha</TableHead>
                    <TableHead>Custo</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>AnoMes</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Consumo</TableHead>
                    <TableHead>Previsto</TableHead>
                    <TableHead>Dif</TableHead>
                  </>
                )}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isBom
                ? rowsBom.map((r) => (
                    <TableRow key={r.linha}>
                      <TableCell>{r.linha}</TableCell>
                      <TableCell>{r.id_produto} {r.produto ? `— ${r.produto}` : ""}</TableCell>
                      <TableCell>{r.id_item} {r.item ? `— ${r.item}` : ""}</TableCell>
                      <TableCell>{r.qtd}</TableCell>
                      <TableCell>{r.linha_origem}</TableCell>
                      <TableCell>{r.custo?.toFixed(2)}</TableCell>
                      <TableCell>
                        {r.status === "OK"
                          ? <Badge variant="outline" className="text-success border-success/30">OK</Badge>
                          : <span className="inline-flex items-center gap-2"><Badge variant="outline" className="text-destructive border-destructive/30" title={r.erros.join("; ")}>ERRO</Badge><span className="text-xs text-destructive/80">{r.erros.join("; ")}</span></span>}

                      </TableCell>
                    </TableRow>
                  ))
                : rowsCon.map((r) => (
                    <TableRow key={r.linha}>
                      <TableCell>{r.linha}</TableCell>
                      <TableCell>{r.ano_mes}</TableCell>
                      <TableCell>{r.data_producao ? r.data_producao.split("-").reverse().join("/") : "—"}</TableCell>
                      <TableCell>{r.id_op}</TableCell>
                      <TableCell>{r.material} {r.desc_material ? `— ${r.desc_material}` : ""}</TableCell>
                      <TableCell>{r.qtd_consumo}</TableCell>
                      <TableCell>{r.qtd_previsto}</TableCell>
                      <TableCell className={r.qtd_consumo - r.qtd_previsto > 0 ? "text-destructive" : "text-success"}>
                        {(r.qtd_consumo - r.qtd_previsto).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {r.status === "OK"
                          ? <Badge variant="outline" className="text-success border-success/30">OK</Badge>
                          : <span className="inline-flex items-center gap-2"><Badge variant="outline" className="text-destructive border-destructive/30" title={r.erros.join("; ")}>ERRO</Badge><span className="text-xs text-destructive/80">{r.erros.join("; ")}</span></span>}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={importar} disabled={busy || (isBom ? okRowsBom.length === 0 : okRowsCon.length === 0)} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {isBom ? okRowsBom.length : okRowsCon.length} linhas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
