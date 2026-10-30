import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { enviarRiscoShelfSlack } from "@/lib/shelf-slack.functions";
import { almoxDosLotes, brl, tituloTrend, totalCusto, type LoteSlack } from "@/lib/shelf-slack";

export function EnviarSlackDialog({ open, onOpenChange, lotes, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; lotes: LoteSlack[]; onSent: () => void;
}) {
  const enviar = useServerFn(enviarRiscoShelfSlack);
  const [obs, setObs] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const cad = useQuery({
    queryKey: ["shelf-slack-cadastro"],
    enabled: open,
    queryFn: async () => {
      const [d, r] = await Promise.all([
        supabase.from("shelf_slack_departamentos").select("id, nome, ativo").eq("ativo", true).order("nome"),
        supabase.from("shelf_slack_responsaveis").select("departamento_id, user_id"),
      ]);
      if (d.error) throw d.error;
      return { deps: d.data ?? [], resp: r.data ?? [] };
    },
  });
  useEffect(() => { if (open && cad.data) setDeps(cad.data.deps.map((d) => d.id)); }, [open, cad.data]);

  const almox = almoxDosLotes(lotes);
  const total = useMemo(() => totalCusto(lotes), [lotes]);
  const qtdResp = (id: string) => cad.data?.resp.filter((r) => r.departamento_id === id).length ?? 0;

  async function confirmar() {
    if (!obs.trim()) return toast.error("Preencha a observação.");
    setEnviando(true);
    try {
      const r = await enviar({ data: {
        observacao: obs.trim(), departamentoIds: deps,
        lotes: lotes.map((l) => ({ sku: l.sku, lote: l.lote, almoxarifado: l.almoxarifado })),
      } });
      toast.success(`Trend criada no Slack com ${r.lotes} lote(s)`, r.link ? { action: { label: "Abrir", onClick: () => window.open(r.link!, "_blank") } } : undefined);
      setObs(""); onSent(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally { setEnviando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar Risco de Shelf ao Slack</DialogTitle>
          <DialogDescription>{lotes.length} lote(s) · {brl(total)} de custo contábil · Almox: {almox || "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} placeholder="Ex.: Priorizar venda em loja" />
          </div>
          <div>
            <Label>Departamentos marcados</Label>
            {cad.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
              !cad.data?.deps.length ? <p className="text-sm text-muted-foreground">Nenhum departamento cadastrado em Configurações.</p> :
              <div className="grid grid-cols-2 gap-2 mt-1">
                {cad.data.deps.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={deps.includes(d.id)} onCheckedChange={(v) => setDeps((p) => v ? [...p, d.id] : p.filter((x) => x !== d.id))} />
                    {d.nome} <span className="text-muted-foreground text-xs">({qtdResp(d.id)})</span>
                  </label>
                ))}
              </div>}
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-medium">Prévia da Trend</p>
            <p className="font-mono break-words">{tituloTrend(obs || "(observação)", almox, new Date())}</p>
            <p className="text-muted-foreground">Comentário: responsáveis marcados + tabela com {lotes.length} lote(s), dias para vencer e custo contábil.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enviando || !lotes.length}>{enviando ? "Enviando…" : "Enviar ao Slack"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
