import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/inventory";
import { FAIXA_LABEL, FAIXA_TONE } from "@/lib/shelf-life";
import { useTiposAcao } from "@/hooks/useShelfLife";
import type { LoteRisco } from "@/hooks/useShelfLife";
import { CampanhaDialog, type CampanhaDraft } from "@/components/shelf-life/CampanhaDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** lotes do produto/linha clicada (1..n) */
  lotes: LoteRisco[];
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

export function LoteDetalheDialog({ open, onOpenChange, lotes }: Props) {
  const tipos = useTiposAcao();
  const [sel, setSel] = useState(0);
  const [tipoId, setTipoId] = useState<string>("");
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [draft, setDraft] = useState<CampanhaDraft | null>(null);

  useEffect(() => {
    if (open) {
      setSel(0);
      setTipoId("");
    }
  }, [open, lotes]);

  const lote = lotes[sel];
  const tiposAtivos = useMemo(() => (tipos.data ?? []).filter((t) => t.ativo), [tipos.data]);

  if (!lote) return null;

  const gerarAcao = () => {
    const tipo = tiposAtivos.find((t) => t.id === tipoId);
    const valor = lote.valor;
    setDraft({
      sku: lote.sku,
      lote: lote.lote,
      descricao: lote.descricao,
      almoxarifado: lote.almoxarifado,
      data_validade: lote.data_validade,
      tipo_acao_id: tipo?.id ?? null,
      quantidade_enderecada: lote.quantidade,
      valor_estimado_recuperado: tipo?.categoria === "RECEITA" ? valor : 0,
      valor_estimado_saving: tipo && tipo.categoria !== "RECEITA" ? valor : 0,
      custo_acao: tipo?.custo_padrao ?? 0,
      status: "PLANEJADA",
      data_acao: new Date().toISOString().slice(0, 10),
      observacao: `Gerada pelo Farol de Shelf · ${FAIXA_LABEL[lote.faixa]}${
        lote.dias != null ? ` · ${lote.dias} dia(s)` : ""
      }`,
    } as CampanhaDraft);
    setCampanhaOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 truncate">{lote.descricao || lote.sku}</DialogTitle>
          </DialogHeader>

          {lotes.length > 1 && (
            <div>
              <Label className="text-xs">Lotes deste produto</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {lotes.map((l, i) => (
                  <Button key={`${l.lote}-${l.almoxarifado}-${i}`} size="sm" variant={i === sel ? "default" : "outline"}
                    onClick={() => setSel(i)}>
                    Lote {l.lote || "—"} · {formatBRL(l.valor)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="SKU" value={lote.sku} />
            <Info label="Lote" value={lote.lote || "—"} />
            <Info label="Almoxarifado" value={lote.almoxarifado || "—"} />
            <Info label="Grupo" value={lote.grupo || "—"} />
            <Info label="Família" value={lote.familia || "—"} />
            <Info label="Local" value={lote.id_local || "—"} />
            <Info label="Quantidade" value={`${lote.quantidade} ${lote.unidade || ""}`} />
            <Info label="Custo unitário" value={formatBRL(lote.custo_unitario)} />
            <Info label="Valor em risco" value={formatBRL(lote.valor)} />
            <Info label="Validade" value={lote.data_validade ? lote.data_validade.slice(0, 10).split("-").reverse().join("/") : "—"} />
            <Info label="Dias para vencer" value={lote.dias != null ? `${lote.dias}` : "—"} />
            <Info
              label="Faixa"
              value={<Badge variant="secondary" className={FAIXA_TONE[lote.faixa]}>{FAIXA_LABEL[lote.faixa]}</Badge>}
            />
          </div>

          <div>
            <Label className="text-xs">Tomada de decisão — escolha a ação</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {tiposAtivos.map((t) => (
                <Button key={t.id} size="sm" variant={tipoId === t.id ? "default" : "outline"}
                  onClick={() => setTipoId(t.id)}>
                  {t.nome}
                  <span className="ml-1 text-[10px] opacity-70">
                    {t.categoria === "RECEITA" ? "Receita" : "Saving"}
                  </span>
                </Button>
              ))}
              {!tiposAtivos.length && (
                <p className="text-xs text-muted-foreground">Nenhum tipo de ação cadastrado.</p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A ação já vem pré-preenchida com quantidade ({lote.quantidade}) e valor {formatBRL(lote.valor)}; você pode
              ajustar antes de salvar. O registro é gravado em Shelf Life → Ações de Lote.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button onClick={gerarAcao}>Gerar ação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampanhaDialog
        open={campanhaOpen}
        onOpenChange={(v) => {
          setCampanhaOpen(v);
          if (!v) onOpenChange(false);
        }}
        draft={draft}
      />
    </>
  );
}
