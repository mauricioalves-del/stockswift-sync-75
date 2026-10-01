import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { parseRecebimentoPlanilha, gerarModeloRecebimento, type RecebimentoRow } from "@/lib/recebimento-transferencias";

export function ImportarRecebimentoDialog() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RecebimentoRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const okRows = rows.filter((r) => r.status === "OK");
  const erros = rows.length - okRows.length;
  const total = rows.length;

  function baixarModelo() {
    const blob = gerarModeloRecebimento();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-recebimento-transferencias.xlsx";
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
      setRows(parseRecebimentoPlanilha(buf));
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

      // Chave única (nr_nf, cod_prod, lote) — upsert: nada é apagado, o
      // arquivo de origem é uma janela móvel reimportada periodicamente.
      const payload = okRows.map((r) => ({
        estado: r.estado || null,
        nr_nf: r.nr_nf,
        serie: r.serie || null,
        dt_emissao: r.dt_emissao,
        empresa: r.empresa,
        almox: r.almox,
        cod_prod: r.cod_prod,
        desc_produto: r.desc_produto || null,
        qtd: r.qtd,
        vt_total_item: r.vt_total_item,
        lote: r.lote,
        nota_cancelada: r.nota_cancelada || null,
        dt_recebimento: r.dt_recebimento,
        recebimento: r.recebimento,
        importado_por: uid,
        updated_at: new Date().toISOString(),
      }));

      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error } = await (supabase as any)
          .from("notas_transferencia_recebimento")
          .upsert(slice, { onConflict: "nr_nf,cod_prod,lote" });
        if (error) throw error;
      }

      toast.success(`Importado com sucesso (${okRows.length} linhas).`);
      qc.invalidateQueries({ queryKey: ["farol-recebimento-pendente"] });
      setOpen(false);
      setRows([]);
      setFilename("");
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Upload className="size-4" /> Importar Transferências
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar Transferências — Farol de Recebimento</DialogTitle>
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
            <Badge variant="outline" className="gap-1"><CheckCircle2 className="size-3.5 text-success" />OK: {okRows.length}</Badge>
            {erros > 0 && (
              <Badge variant="outline" className="gap-1"><AlertCircle className="size-3.5 text-destructive" />Erros: {erros}</Badge>
            )}
          </div>
        )}

        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            Procura a aba "Transferência" na planilha (ou usa a primeira aba, se não achar). Linhas duplicadas (mesma NF + produto + lote) são descartadas automaticamente. O histórico é acumulativo: linhas já existentes são atualizadas, nenhum registro antigo é apagado.
          </p>
        )}

        {total > 0 && (() => {
          const errRows = rows.filter((r) => r.status === "ERRO");
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
                <TableHead>NF</TableHead>
                <TableHead>Data Emissão</TableHead>
                <TableHead>DE</TableHead>
                <TableHead>PARA</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Recebimento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.linha}>
                  <TableCell>{r.linha}</TableCell>
                  <TableCell>{r.nr_nf}</TableCell>
                  <TableCell>{r.dt_emissao ? r.dt_emissao.split("-").reverse().join("/") : "—"}</TableCell>
                  <TableCell>{r.empresa}</TableCell>
                  <TableCell>{r.almox}</TableCell>
                  <TableCell>{r.cod_prod} {r.desc_produto ? `— ${r.desc_produto}` : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{r.lote}</TableCell>
                  <TableCell>{r.recebimento}</TableCell>
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
          <Button onClick={importar} disabled={busy || okRows.length === 0} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {okRows.length} linhas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
