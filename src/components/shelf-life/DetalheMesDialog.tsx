import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatNum } from "@/lib/inventory";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type DetalheLinha = {
  tipo: "Perda" | "Receita Recuperada" | "Saving Recuperado";
  data: string;
  sku: string;
  descricao: string;
  lote: string;
  origem: string;
  referencia: string;
  quantidade: number;
  valor: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  linhas: DetalheLinha[];
};

type SortKey = keyof DetalheLinha;

const COLS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "tipo", label: "Tipo" },
  { key: "data", label: "Data" },
  { key: "sku", label: "SKU" },
  { key: "descricao", label: "Descrição" },
  { key: "lote", label: "Lote" },
  { key: "origem", label: "Almoxarifado" },
  { key: "referencia", label: "Motivo / Ação" },
  { key: "quantidade", label: "Qtd", align: "right" },
  { key: "valor", label: "Valor", align: "right" },
];

const TONE: Record<DetalheLinha["tipo"], string> = {
  Perda: "bg-destructive/15 text-destructive",
  "Receita Recuperada": "bg-info/15 text-info",
  "Saving Recuperado": "bg-success/15 text-success",
};

export function DetalheMesDialog({ open, onOpenChange, titulo, linhas }: Props) {
  const [busca, setBusca] = useState("");
  const [tipos, setTipos] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "valor", dir: "desc" });

  useEffect(() => {
    if (open) {
      setBusca("");
      setTipos([]);
      setSort({ key: "valor", dir: "desc" });
    }
  }, [open]);

  const rows = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const filtradas = linhas.filter((l) => {
      if (tipos.length && !tipos.includes(l.tipo)) return false;
      if (q && !`${l.sku} ${l.descricao} ${l.lote} ${l.referencia} ${l.origem}`.toUpperCase().includes(q)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtradas.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [linhas, busca, tipos, sort]);

  const total = rows.reduce((s, r) => s + r.valor, 0);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const Icon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <ChevronsUpDown className="size-3 opacity-40" /> : sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">{titulo}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {rows.length} registro(s) · Total: <span className="font-semibold text-foreground">{formatBRL(total)}</span> · clique no cabeçalho para ordenar
          </p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="SKU, produto, lote, motivo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <MultiSelect
              options={["Perda", "Receita Recuperada", "Saving Recuperado"].map((o) => ({ value: o, label: o }))}
              value={tipos}
              onChange={setTipos}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLS.map((c) => (
                  <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-1 gap-1 text-xs ${c.align === "right" ? "ml-auto" : ""}`}
                      onClick={() => toggle(c.key)}
                    >
                      {c.label} <Icon k={c.key} />
                    </Button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={COLS.length} className="py-6 text-center text-sm text-muted-foreground">
                    Sem registros para os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={`${r.tipo}-${r.sku}-${r.lote}-${i}`}>
                  <TableCell><Badge variant="secondary" className={TONE[r.tipo]}>{r.tipo}</Badge></TableCell>
                  <TableCell className="text-xs">{r.data ? r.data.split("-").reverse().join("/") : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs">{r.descricao || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.lote || "—"}</TableCell>
                  <TableCell className="text-xs">{r.origem || "—"}</TableCell>
                  <TableCell className="text-xs">{r.referencia || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{formatNum(r.quantidade)}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatBRL(r.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
