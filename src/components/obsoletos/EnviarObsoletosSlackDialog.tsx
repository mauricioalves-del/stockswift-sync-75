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
import { enviarObsoletosSlack } from "@/lib/obsoletos-slack.functions";
import { almoxDosItens, brl, dataBR, padraoPosicionamento, prazoPosicionamento, separarJaEnviados, tituloTrendObs, totalValor, type EnvioSlack, type Equipe, type ItemSlackObs } from "@/lib/obsoletos-slack";

export function EnviarObsoletosSlackDialog({ open, onOpenChange, itens: escolhidos, enviosPorItem, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; itens: ItemSlackObs[]; enviosPorItem: Map<string, EnvioSlack[]>; onSent: () => void;
}) {
  const [reenviar, setReenviar] = useState(false);
  const { novos, enviados } = useMemo(() => separarJaEnviados(escolhidos, enviosPorItem), [escolhidos, enviosPorItem]);
  const itens = reenviar ? escolhidos : novos;
  const trends = useMemo(() => { const m = new Map<string, { envio: EnvioSlack; qtd: number }>(); for (const e of enviados) { const x = m.get(e.envio.id) ?? { envio: e.envio, qtd: 0 }; x.qtd++; m.set(e.envio.id, x); } return [...m.values()].sort((a, b) => b.envio.numero - a.envio.numero); }, [enviados]);
  const enviar = useServerFn(enviarObsoletosSlack);
  const [obs, setObs] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>(["Comercial", "Produtos"]);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (open) { setReenviar(false); setEquipes(["Comercial", "Produtos"]); } }, [open]);

  const cad = useQuery({
    queryKey: ["shelf-slack-cadastro"], enabled: open,
    queryFn: async () => {
      const [d, r] = await Promise.all([supabase.from("shelf_slack_departamentos").select("id, nome, ativo, almoxarifados").eq("ativo", true).order("nome"), supabase.from("shelf_slack_responsaveis").select("departamento_id, user_id")]);
      if (d.error) throw d.error; return { deps: d.data ?? [], resp: r.data ?? [] };
    },
  });
  // Por padrão marca os departamentos de Comercial e Produtos
  useEffect(() => { if (open && cad.data) setDeps(cad.data.deps.filter((d) => /comercial|produto/i.test(d.nome)).map((d) => d.id)); }, [open, cad.data]);

  const almox = almoxDosItens(itens), total = totalValor(itens), prazo = useMemo(() => prazoPosicionamento(itens), [itens]);
  const qtdResp = (id: string) => cad.data?.resp.filter((r) => r.departamento_id === id).length ?? 0;

  async function confirmar() {
    if (!obs.trim()) return toast.error("Preencha a observação.");
    if (!equipes.length) return toast.error("Escolha ao menos uma equipe para se posicionar.");
    setEnviando(true);
    try {
      const r = await enviar({ data: { observacao: obs.trim(), departamentoIds: deps, equipes, itens: itens.map((l) => ({ sku: l.sku, lote: l.lote, almoxarifado: l.almoxarifado })), reenviar } });
      toast.success(`Trend ${r.numero ? `#${r.numero} ` : ""}criada no Slack com ${r.itens} item(ns) · posicionamento até ${r.prazo.split("-").reverse().join("/")}${r.jaEnviados ? ` · ${r.jaEnviados} já enviado(s) ficaram de fora` : ""}`, r.link ? { action: { label: "Abrir", onClick: () => window.open(r.link!, "_blank") } } : undefined);
      setObs(""); onSent(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar"); } finally { setEnviando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Risco sem Giro ao Slack</DialogTitle>
          <DialogDescription>{itens.length} item(ns) · {brl(total)} parado(s) · Almox: {almox || "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {enviados.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">{enviados.length} dos {escolhidos.length} item(ns) já estão em uma Trend{reenviar ? " e serão enviados de novo." : " e vão ficar de fora deste envio."}</p>
              <ul className="space-y-0.5">{trends.map(({ envio, qtd }) => <li key={envio.id}>{envio.link ? <a href={envio.link} target="_blank" rel="noreferrer" className="font-semibold underline">Trend #{envio.numero}</a> : <span className="font-semibold">Trend #{envio.numero}</span>} · {new Date(envio.created_at).toLocaleDateString("pt-BR")} · {qtd} item(ns) · {envio.observacao}</li>)}</ul>
              <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={reenviar} onCheckedChange={(v) => setReenviar(v === true)} />Reenviar mesmo assim (abre outra Trend)</label>
            </div>
          )}
          <div><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} placeholder="Ex.: Amêndoa do Pará parada há 77 dias — definir destino antes do próximo pacote de baixa" /></div>
          <div><Label>Equipes que precisam se posicionar</Label>
            <div className="mt-1 flex gap-4">{(["Comercial", "Produtos"] as Equipe[]).map((e) => <label key={e} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={equipes.includes(e)} onCheckedChange={(v) => setEquipes((p) => (v ? [...p, e] : p.filter((x) => x !== e)))} />{e}</label>)}</div></div>
          <div><Label>Departamentos marcados</Label>
            {cad.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : !cad.data?.deps.length ? <p className="text-sm text-muted-foreground">Nenhum departamento cadastrado em Configurações.</p> :
              <div className="mt-1 grid grid-cols-2 gap-2">{cad.data.deps.map((d) => <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={deps.includes(d.id)} onCheckedChange={(v) => setDeps((p) => (v ? [...p, d.id] : p.filter((x) => x !== d.id)))} />{d.nome} <span className="text-xs text-muted-foreground">({qtdResp(d.id)})</span></label>)}</div>}</div>
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            <p className="font-medium">Prévia da Trend</p>
            <p className="break-words font-mono">{tituloTrendObs(obs || "(observação)", almox, new Date(), 0).replace("*Risco sem Giro*", "*Risco sem Giro #(nº)*")}</p>
            <p className="text-muted-foreground">Fio: responsáveis marcados + tabela com {itens.length} item(ns), dias sem movimentação, faixa e valor parado.</p>
            <pre className="whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px]">{padraoPosicionamento(equipes, prazo)}</pre>
            <p className="text-muted-foreground">Prazo do posicionamento: <b>{dataBR(prazo.data)}</b> — {prazo.dias} dias úteis pela faixa mais crítica (+90 dias: 3 · 61–90: 5 · 30–60: 7).</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enviando || !itens.length}>{enviando ? "Enviando…" : itens.length ? `Enviar ${itens.length} item(ns) ao Slack` : "Nada novo para enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
