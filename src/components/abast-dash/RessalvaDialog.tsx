import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Minus, PackagePlus, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { avisoDisponibilidade, chaveSku, filtrarCatalogo, mapaSaldos, qtdValida, resumoSugestoes, type CatProduto, type SaldoProduto, type SugRessalva } from "@/lib/abastecimento-ressalva";

type PedidoRessalva = { id: string; numero: number; loja: string; almox_origem?: string | null; itens: { id_produto: string; qtd_pedida: number; aceito: boolean | null; origem: string }[] };
const un = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Disp({ s }: { s?: SaldoProduto | null }) {
  if (!s) return null;
  const v = s.saldo_inicial;
  return <span title={`Estoque ${un(s.estoque)} − ${un(s.reservado_outros)} em outros pedidos em andamento`} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${v <= 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{v <= 0 ? "sem estoque" : `${un(v)} disponível`}</span>;
}

/** Ressalvas do gerente comercial: justificativa obrigatória + produtos extras do catálogo aprovado da loja. O pedido segue para o Diretor de Operações. */
export function RessalvaDialog({ p, onClose, onOk }: { p: PedidoRessalva; onClose: () => void; onOk: () => void }) {
  const sb = supabase as any;
  const [obs, setObs] = useState(""); const [tentou, setTentou] = useState(false);
  const [sugs, setSugs] = useState<SugRessalva[]>([]);
  const [busca, setBusca] = useState(""); const [sel, setSel] = useState<CatProduto | null>(null); const [qtd, setQtd] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  const cat = useQuery({
    queryKey: ["abast-catalogo-aprovado", p.loja],
    queryFn: async () => {
      const { data } = await sb.from("abast_validacoes_portfolio").select("itens, competencia").eq("loja", p.loja).eq("status", "VALIDADA").order("competencia", { ascending: false }).order("aprovado_em", { ascending: false }).limit(1);
      const itens = (data?.[0]?.itens ?? []) as any[];
      return itens.filter((i) => i.ativo !== false).map((i) => ({ sku: String(i.sku), descricao: String(i.descricao ?? i.sku) })) as CatProduto[];
    },
  });
  const catalogo = cat.data ?? [];
  const skus = useMemo(() => catalogo.map((c) => c.sku), [catalogo]);
  // quanto há disponível no origem de cada produto do catálogo (a tela segue sem a informação se a função não responder)
  const saldosQ = useQuery({
    enabled: skus.length > 0, staleTime: 30000, queryKey: ["abast-ressalva-saldos", p.id, skus.length],
    queryFn: async () => { const { data } = await sb.rpc("abast_saldo_produtos", { p_pedido: p.id, p_skus: skus }); return mapaSaldos(data); },
  });
  const saldos = saldosQ.data ?? new Map<string, SaldoProduto>();
  const validos = p.itens.filter((i) => i.aceito !== false && !(i.origem === "SUGESTAO_COMERCIAL" && i.aceito == null));
  const noPedido = useMemo(() => new Set(validos.map((i) => chaveSku(i.id_produto))), [p.itens]);
  const jaSugeridos = useMemo(() => new Set(sugs.map((s) => chaveSku(s.id_produto))), [sugs]);
  const resultados = useMemo(() => filtrarCatalogo(catalogo, busca, jaSugeridos), [catalogo, busca, jaSugeridos]);
  const resumo = resumoSugestoes(sugs);
  const origem = p.almox_origem ?? "origem";
  const unidadesPedido = validos.reduce((a, i) => a + Number(i.qtd_pedida), 0);
  const n = qtdValida(qtd);
  const avisoSel = sel && n ? avisoDisponibilidade(n, saldos.get(chaveSku(sel.sku))) : null;

  function adicionar() {
    if (!sel || !n) { toast.error("Escolha o produto e uma quantidade maior que zero."); return; }
    setSugs([...sugs, { id_produto: sel.sku, descricao: sel.descricao, qtd: n }]); setSel(null); setQtd("1"); setBusca("");
    setTimeout(() => buscaRef.current?.focus(), 50);
  }
  async function enviar() {
    setTentou(true);
    if (!obs.trim()) { toast.error("Escreva as ressalvas na justificativa."); return; }
    setSalvando(true);
    try {
      const { error } = await sb.rpc("abast_aprovar_comercial", { p_id: p.id, p_aprovado: false, p_obs: obs.trim(), p_itens_sugeridos: sugs });
      if (error) throw error;
      toast.success(`Pedido ${p.numero} enviado ao Diretor de Operações.`); onOk();
    } catch (err: any) { toast.error("Não consegui registrar: " + (err?.message ?? err)); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle className="text-xl">Ressalvas · Pedido {p.numero}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-foreground">{p.loja}</span><span>{validos.length} itens · {un(unidadesPedido)} un</span><span>origem <span className="font-mono">{p.almox_origem ?? "—"}</span></span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Ao enviar, o pedido sai da sua aprovação e vai para o <strong>Diretor de Operações</strong>, que decide se atende com ou sem as sugestões.
          </div>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between"><label htmlFor="ressalva-obs" className="text-sm font-semibold">Justificativa <span className="text-destructive">*</span></label><span className="text-[11px] text-muted-foreground">{obs.trim().length} caracteres</span></div>
            <Textarea id="ressalva-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={4} aria-invalid={tentou && !obs.trim()} className={tentou && !obs.trim() ? "border-destructive" : ""} placeholder="Explique ao Diretor por que o pedido precisa de ajuste ou de demanda extra (ex.: campanha, evento, ruptura prevista)." />
            {tentou && !obs.trim() && <p className="text-xs text-destructive">A justificativa é obrigatória.</p>}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><PackagePlus className="size-4" /> Produtos extras <span className="font-normal text-muted-foreground">(opcional)</span></h3>
              <p className="text-xs text-muted-foreground">Catálogo aprovado de {p.loja}{catalogo.length ? ` · ${catalogo.length} produtos` : ""}. “Disponível” = estoque de {origem} menos o que está em outros pedidos em andamento; é só informativo, a decisão é do Diretor.</p>
            </div>
            {cat.isLoading ? <p className="text-xs text-muted-foreground">Carregando catálogo…</p> : !catalogo.length ? <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Esta loja não tem portfólio aprovado; não é possível sugerir produtos.</p> : (
              <div className="overflow-hidden rounded-md border">
                {sel ? (
                  <div className="space-y-2 bg-primary/5 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="font-mono text-[11px] text-muted-foreground">{sel.sku}</div><div className="truncate text-sm font-medium">{sel.descricao}</div></div>
                      <div className="flex items-center gap-2"><Disp s={saldos.get(chaveSku(sel.sku))} /><Button type="button" variant="ghost" size="sm" onClick={() => setSel(null)}>Trocar</Button></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Quantidade</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setQtd(String(Math.max(1, (n ?? 1) - 1)))} aria-label="Diminuir"><Minus className="size-4" /></Button>
                      <Input autoFocus inputMode="decimal" className="w-24 text-center" value={qtd} onChange={(e) => setQtd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }} aria-label="Quantidade" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setQtd(String((n ?? 0) + 1))} aria-label="Aumentar"><Plus className="size-4" /></Button>
                      <Button type="button" onClick={adicionar} disabled={!n} className="ml-auto gap-1"><Plus className="size-4" /> Adicionar à lista</Button>
                    </div>
                    {avisoSel && <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" /> {avisoSel}</p>}
                  </div>
                ) : (
                  <>
                    <div className="relative border-b"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && resultados[0]) setSel(resultados[0]); }} placeholder="Buscar por nome ou SKU" aria-label="Buscar produto" className="h-10 rounded-none border-0 pl-9 focus-visible:ring-0" /></div>
                    <ul className="max-h-52 divide-y overflow-y-auto">
                      {resultados.map((c) => (
                        <li key={c.sku}><button type="button" onClick={() => setSel(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                          <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">{c.sku}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{c.descricao}</span>
                          {noPedido.has(chaveSku(c.sku)) && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">já no pedido</span>}
                          <Disp s={saldos.get(chaveSku(c.sku))} />
                        </button></li>))}
                      {resultados.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">{busca ? "Nenhum produto encontrado para essa busca." : "Todos os produtos do catálogo já foram sugeridos."}</li>}
                    </ul>
                  </>
                )}
              </div>
            )}

            {sugs.length > 0 && (
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-medium"><span>Sugestões para o Diretor</span><span className="text-muted-foreground">{resumo.produtos} produto{resumo.produtos > 1 ? "s" : ""} · {un(resumo.unidades)} un</span></div>
                <ul className="divide-y">
                  {sugs.map((s) => { const aviso = avisoDisponibilidade(s.qtd, saldos.get(chaveSku(s.id_produto))); return (
                    <li key={s.id_produto} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">{s.id_produto}</span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={s.descricao}>{s.descricao}</span>
                      <Input inputMode="decimal" className="h-8 w-20 text-right" value={String(s.qtd)} aria-label={`Quantidade de ${s.id_produto}`} onChange={(e) => { const v = qtdValida(e.target.value); setSugs(sugs.map((x) => (x === s ? { ...x, qtd: v ?? 0 } : x))); }} />
                      <Button size="sm" variant="ghost" onClick={() => setSugs(sugs.filter((x) => x !== s))} aria-label={`Remover ${s.id_produto}`}><Trash2 className="size-4" /></Button>
                      {aviso && <p className="flex w-full items-center gap-1 pl-[5.75rem] text-[11px] text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3" /> {aviso}</p>}
                    </li>); })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">{resumo.produtos ? `${resumo.produtos} produto${resumo.produtos > 1 ? "s" : ""} extra${resumo.produtos > 1 ? "s" : ""} · ${un(resumo.unidades)} un` : "Sem produtos extras"}</span>
          <div className="flex gap-2"><Button variant="ghost" disabled={salvando} onClick={onClose}>Voltar</Button><Button disabled={salvando || sugs.some((s) => !(s.qtd > 0))} onClick={enviar} className="gap-2">{salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{salvando ? "Enviando…" : "Enviar ao Diretor"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
