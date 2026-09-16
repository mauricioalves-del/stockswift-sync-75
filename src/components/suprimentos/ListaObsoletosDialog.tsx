import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ItemObsoleto = {
  id_produto: string;
  descricao: string | null;
  almoxarifado: string | null;
  lote: string | null;
  saldo: number;
  valor: number;
  empresa: string;
  ultima_mov: string | null;
  dias_sem_mov: number | null;
  grupo?: string | undefined;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  cor?: string;
  itens: ItemObsoleto[];
};

const PAGE = 50;

function fmtBRL(v: number) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ListaObsoletosDialog({ open, onOpenChange, titulo, cor, itens }: Props) {
  const [almox, setAlmox] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setAlmox([]);
      setGrupos([]);
      setBusca("");
      setPage(1);
    }
  }, [open]);

  const opts = useMemo(() => {
    const a = new Set<string>(), g = new Set<string>();
    itens.forEach((r) => {
      if (r.almoxarifado) a.add(r.almoxarifado);
      if (r.grupo) g.add(r.grupo);
    });
    const s = (x: Set<string>) => Array.from(x).sort();
    return { almox: s(a), grupos: s(g) };
  }, [itens]);

  const rows = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const inSel = (sel: string[], v: string | null | undefined) => sel.length === 0 || (v != null && sel.includes(v));
    return itens
      .filter((r) => inSel(almox, r.almoxarifado) && inSel(grupos, r.grupo))
      .filter((r) => !q || `${r.id_produto} ${r.descricao ?? ""} ${r.lote ?? ""}`.toUpperCase().includes(q))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  }, [itens, almox, grupos, busca]);

  useEffect(() => setPage(1), [almox, grupos, busca]);

  const total = rows.reduce((s, r) => s + (r.valor ?? 0), 0);
  const paginas = Math.max(1, Math.ceil(rows.length / PAGE));
  const visiveis = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {cor && <span className="size-3 rounded-full shrink-0" style={{ background: cor }} />}
            <span className="truncate">{titulo}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Total de itens: <span className="font-semibold text-foreground">{rows.length}</span> · Custo total:{" "}
            <span className="font-semibold text-foreground">{fmtBRL(total)}</span>
          </p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="Código, descrição ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <MultiSelect options={opts.almox.map((o) => ({ value: o, label: o }))} value={almox} onChange={setAlmox} />
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <MultiSelect options={opts.grupos.map((o) => ({ value: o, label: o }))} value={grupos} onChange={setGrupos} />
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Almoxarifado</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Última mov.</TableHead>
                <TableHead className="text-right">Dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                    Sem itens para os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((r, i) => (
                <TableRow key={`${r.id_produto}-${r.lote}-${r.almoxarifado}-${i}`}>
                  <TableCell className="text-xs text-muted-foreground">{(page - 1) * PAGE + i + 1}</TableCell>
                  <TableCell className="text-xs">{r.id_produto}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs">{r.descricao ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.almoxarifado || "—"}</TableCell>
                  <TableCell className="text-xs">{r.lote || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{(r.saldo ?? 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{fmtBRL(r.valor ?? 0)}</TableCell>
                  <TableCell className="text-xs">{r.ultima_mov ?? "Nunca"}</TableCell>
                  <TableCell className="text-right text-xs">{r.dias_sem_mov ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Página {page} de {paginas} · {rows.length} item(ns)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
