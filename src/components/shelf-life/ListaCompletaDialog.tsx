import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/inventory";
import { chaveLote, type Faixa } from "@/lib/shelf-life";
import { useCampanhas, indexarCampanhasPorLote, useLotesRisco, type LoteRisco } from "@/hooks/useShelfLife";
import { useShelfConfig } from "@/hooks/useFiltrosShelfLife";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nome da faixa, ex.: "Urgente — 0 a 30 dias" */
  titulo: string;
  cor?: string;
  /** Faixa exibida — mesma fonte do Mapeamento de Risco, sem limite */
  faixa: Faixa | null;
  /** Duplo clique na linha → abre modal de ação já existente */
  onAbrirAcao: (lote: LoteRisco) => void;
};

const PAGE = 50;

export function ListaCompletaDialog({ open, onOpenChange, titulo, cor, faixa, onAbrirAcao }: Props) {
  const campanhas = useCampanhas();
  const idx = useMemo(() => indexarCampanhasPorLote(campanhas.data), [campanhas.data]);
  const { almoxAtivos, somenteComSaldo } = useShelfConfig();
  const lotesQ = useLotesRisco({ almoxAtivos, somenteComSaldo });
  const lotes = useMemo(
    () => (faixa ? (lotesQ.data ?? []).filter((r) => r.faixa === faixa && (r.quantidade ?? 0) > 0) : []),
    [lotesQ.data, faixa],
  );

  const [almox, setAlmox] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [familias, setFamilias] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setAlmox([]);
      setGrupos([]);
      setFamilias([]);
      setPage(1);
    }
  }, [open]);

  const opts = useMemo(() => {
    const a = new Set<string>(), g = new Set<string>(), f = new Set<string>();
    lotes.forEach((r) => {
      if (r.almoxarifado) a.add(r.almoxarifado);
      if (r.grupo) g.add(r.grupo);
      if (r.familia) f.add(r.familia);
    });
    const s = (x: Set<string>) => Array.from(x).sort();
    return { almox: s(a), grupos: s(g), familias: s(f) };
  }, [lotes]);

  const rows = useMemo(() => {
    const inSel = (sel: string[], v: string | null) => sel.length === 0 || (v != null && sel.includes(v));
    return lotes
      .filter((r) => inSel(almox, r.almoxarifado) && inSel(grupos, r.grupo) && inSel(familias, r.familia))
      .sort((a, b) => (a.dias ?? Number.MAX_SAFE_INTEGER) - (b.dias ?? Number.MAX_SAFE_INTEGER) || b.valor - a.valor);
  }, [lotes, almox, grupos, familias]);

  useEffect(() => setPage(1), [almox, grupos, familias]);

  const total = rows.reduce((s, r) => s + r.valor, 0);
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
            <span className="font-semibold text-foreground">{formatBRL(total)}</span> · duplo clique na linha para gerar ação
          </p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <MultiSelect options={opts.almox.map((o) => ({ value: o, label: o }))} value={almox} onChange={setAlmox} />
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <MultiSelect options={opts.grupos.map((o) => ({ value: o, label: o }))} value={grupos} onChange={setGrupos} />
          </div>
          <div>
            <Label className="text-xs">Família</Label>
            <MultiSelect options={opts.familias.map((o) => ({ value: o, label: o }))} value={familias} onChange={setFamilias} />
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Almoxarifado</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    Sem itens para os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((r, i) => {
                const comAcao = (idx.get(chaveLote(r.sku, r.lote)) ?? []).some((c) => c.status !== "CANCELADA");
                return (
                  <TableRow
                    key={`${r.sku}-${r.lote}-${r.almoxarifado}-${i}`}
                    className="cursor-pointer select-none"
                    onDoubleClick={() => onAbrirAcao(r)}
                  >
                    <TableCell className="text-xs text-muted-foreground">{(page - 1) * PAGE + i + 1}</TableCell>
                    <TableCell className="text-xs">{r.almoxarifado || "—"}</TableCell>
                    <TableCell className="text-xs">{r.sku}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs">{r.descricao}</TableCell>
                    <TableCell className="text-xs">{r.lote || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{r.quantidade}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatBRL(r.valor)}</TableCell>
                    <TableCell className="text-xs">
                      {r.data_validade ? r.data_validade.slice(0, 10).split("-").reverse().join("/") : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.dias != null ? r.dias : "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={comAcao ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}
                      >
                        {comAcao ? "Com Ação" : "Sem Ação"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Página {page} de {paginas} · {rows.length} lote(s)
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
