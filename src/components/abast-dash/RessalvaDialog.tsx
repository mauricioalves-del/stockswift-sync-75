import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Minus, PackagePlus, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { caixaDoProduto, chaveSku, erroQtdExtra, filtrarCatalogo, mapaSaldos, passoQtd, qtdInicial, qtdValida, resumoSugestoes, saldoParaExtra, type CatProduto, type SaldoProduto, type SugRessalva } from "@/lib/abastecimento-ressalva";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { ehSolto, lojaSemCaixa, nk } from "@/lib/abastecimento-dados";
import { catalogoComInsumos, GRUPOS_INSUMOS } from "@/lib/abastecimento-insumos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PedidoRessalva = { id: string; numero: number; loja: string; almox_origem?: string | null; itens: { id_produto: string; qtd_pedida: number; aceito: boolean | null; origem: string }[] };
const un = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Disp({ s, caixa = 1 }: { s?: SaldoProduto | null; caixa?: number }) {
  if (!s) return null;
  const v = s.saldo_inicial;
  const cx = caixa > 1 && v > 0 ? (v >= caixa ? ` · ${Math.floor(v / caixa)} cx` : " · solto") : "";
  return <span title={`Estoque ${un(s.estoque)} − ${un(s.reservado_outros)} em pedidos em andamento (inclui o que este pedido já leva)${caixa > 1 ? ` · caixa de ${caixa} un` : ""}`} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${v <= 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{v <= 0 ? "sem estoque" : `${un(v)} disponível${cx}`}</span>;
}

/** Aprovação comercial com justificativa e extras do catálogo aprovado; segue para separação. */
export function RessalvaDialog({ p, onClose, onOk }: { p: PedidoRessalva; onClose: () => void; onOk: () => void }) {
  const sb = supabase as any;
  const [obs, setObs] = useState(""); const [tentou, setTentou] = useState(false);
  const [sugs, setSugs] = useState<SugRessalva[]>([]);
  const [busca, setBusca] = useState(""); const [sel, setSel] = useState<CatProduto | null>(null); const [qtd, setQtd] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [fracionar, setFracionar] = useState(false);
  const [grupo, setGrupo] = useState("TODOS");
  const buscaRef = useRef<HTMLInputElement>(null);

  const cat = useQuery({
    queryKey: ["abast-catalogo-aprovado", p.loja],
    queryFn: async () => {
      const { data, error } = await sb.from("abast_validacoes_portfolio").select("itens, competencia").eq("loja", p.loja).eq("status", "VALIDADA").order("competencia", { ascending: false }).order("aprovado_em", { ascending: false }).limit(1);
      if (error) throw error;
      const itens = (data?.[0]?.itens ?? []) as any[];
      return itens.filter((i) => i.ativo !== false).map((i) => ({ sku: String(i.sku), descricao: String(i.descricao ?? i.sku) })) as CatProduto[];
    },
  });
  const bruto = useAbastBruto(true);
  const catalogo = useMemo(() => catalogoComInsumos(cat.data ?? [], bruto.data?.grupos ?? [], bruto.data?.estoque ?? []), [cat.data, bruto.data]);
  const catalogoFiltrado = useMemo(() => catalogo.filter((c) => grupo === "TODOS" || (grupo === "APROVADO" ? c.aprovado : c.grupo === grupo)), [catalogo, grupo]);
  const skus = useMemo(() => catalogo.map((c) => c.sku), [catalogo]);
  // quanto há disponível no origem de cada produto do catálogo (a tela segue sem a informação se a função não responder)
  const saldosQ = useQuery({
    enabled: skus.length > 0, staleTime: 30000, queryKey: ["abast-ressalva-saldos", p.id, skus],
    queryFn: async () => { const { data } = await sb.rpc("abast_saldo_produtos", { p_pedido: p.id, p_skus: skus }); return mapaSaldos(data); },
  });
  const saldos = saldosQ.data ?? new Map<string, SaldoProduto>();
  const validos = p.itens.filter((i) => i.aceito !== false && !(i.origem === "SUGESTAO_COMERCIAL" && i.aceito == null));
  // Caixaria: mesma regra do motor (abast_produto.full_case; família vendida solta não tem caixa). Dados já em cache na tela de Pedidos.
  const caixaDe = useMemo(() => {
    const fc = new Map<string, unknown>((bruto.data?.produtos ?? []).map((x) => [nk(x.id_produto), x.full_case]));
    const fam = new Map<string, string>((bruto.data?.familias ?? []).map((x) => [nk(x.codigo_produto), x.familia]));
    const fracionada = lojaSemCaixa(p.loja);   // loja abastecida sem caixa fechada (Jesuíno)
    return (sku: string) => (fracionada ? 1 : caixaDoProduto(fc.get(nk(sku)), ehSolto(fam.get(nk(sku)) ?? "")));
  }, [bruto.data, p.loja]);
  // Disponível no CD para extra = saldo do banco (já sem os outros pedidos) menos o que este pedido já leva do SKU
  const qtdNoPedido = useMemo(() => { const m = new Map<string, number>(); for (const i of validos) m.set(chaveSku(i.id_produto), (m.get(chaveSku(i.id_produto)) ?? 0) + Number(i.qtd_pedida)); return m; }, [p.itens]);
  const saldoDe = (sku: string) => saldoParaExtra(saldos.get(chaveSku(sku)), qtdNoPedido.get(chaveSku(sku)) ?? 0);
  const carregandoCaixa = bruto.isLoading;
  const noPedido = useMemo(() => new Set(validos.map((i) => chaveSku(i.id_produto))), [p.itens]);
  const jaSugeridos = useMemo(() => new Set(sugs.map((s) => chaveSku(s.id_produto))), [sugs]);
  const resultados = useMemo(() => filtrarCatalogo(catalogoFiltrado, busca, jaSugeridos), [catalogoFiltrado, busca, jaSugeridos]);
  const resumo = resumoSugestoes(sugs);
  const origem = p.almox_origem ?? "origem";
  const unidadesPedido = validos.reduce((a, i) => a + Number(i.qtd_pedida), 0);
  const n = qtdValida(qtd);
  const cxSel = sel ? caixaDe(sel.sku) : 1;
  const saldoSel = sel ? saldoDe(sel.sku) : null;
  const erroSel = sel ? erroQtdExtra(n, cxSel, saldoSel, fracionar) : null;
  const errosSugs = sugs.map((x) => erroQtdExtra(x.qtd, x.caixa ?? caixaDe(x.id_produto), saldoDe(x.id_produto), x.fracionar));

  function escolher(c: CatProduto) { setSel(c); setFracionar(false); setQtd(String(qtdInicial(caixaDe(c.sku), saldoDe(c.sku)))); }
  function adicionar() {
    if (!sel || carregandoCaixa || n === null) return;
    if (erroSel) { toast.error(erroSel); return; }
    setSugs([...sugs, { id_produto: sel.sku, descricao: sel.descricao, qtd: n, caixa: cxSel, fracionar }]); setSel(null); setQtd("1"); setBusca("");
    setTimeout(() => buscaRef.current?.focus(), 50);
  }
  async function enviar() {
    setTentou(true);
    if (!obs.trim()) { toast.error("Escreva as ressalvas na justificativa."); return; }
    if (errosSugs.some(Boolean)) { toast.error("Ajuste as quantidades dos produtos extras conforme a caixaria ou fracionamento, até o saldo disponível."); return; }
    setSalvando(true);
    try {
      const { error } = await sb.rpc("abast_aprovar_comercial", { p_id: p.id, p_aprovado: false, p_obs: obs.trim(), p_itens_sugeridos: sugs });
      if (error) throw error;
      toast.success(`Pedido ${p.numero} aprovado com ressalvas. A requisição de separação foi criada.`); onOk();
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
            Aprovação comercial com ressalvas
          </div>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between"><label htmlFor="ressalva-obs" className="text-sm font-semibold">Justificativa <span className="text-destructive">*</span></label><span className="text-[11px] text-muted-foreground">{obs.trim().length} caracteres</span></div>
            <Textarea id="ressalva-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={4} aria-invalid={tentou && !obs.trim()} className={tentou && !obs.trim() ? "border-destructive" : ""} placeholder="Justificativa das alterações ou da demanda extra" />
            {tentou && !obs.trim() && <p className="text-xs text-destructive">A justificativa é obrigatória.</p>}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><PackagePlus className="size-4" /> Produtos extras <span className="font-normal text-muted-foreground">(opcional)</span></h3>
              <p className="text-xs text-muted-foreground">{catalogo.length} produtos · Origem: {origem}</p>
            </div>
            <Select value={grupo} onValueChange={(v) => { setGrupo(v); setSel(null); setBusca(""); }}>
              <SelectTrigger aria-label="Grupo de produtos"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os produtos e insumos</SelectItem>
                <SelectItem value="APROVADO">Catálogo aprovado</SelectItem>
                {GRUPOS_INSUMOS.map((g) => <SelectItem key={g.valor} value={g.valor}>{g.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {cat.isLoading || bruto.isLoading ? <p className="text-xs text-muted-foreground">Carregando catálogo…</p> : cat.error || bruto.error ? <p className="text-xs text-destructive">Não foi possível carregar os produtos.</p> : !catalogo.length ? <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nenhum produto ou insumo cadastrado.</p> : (
              <div className="overflow-hidden rounded-md border">
                {sel ? (
                  <div className="space-y-2 bg-primary/5 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="font-mono text-[11px] text-muted-foreground">{sel.sku}</div><div className="truncate text-sm font-medium">{sel.descricao}</div></div>
                      <div className="flex items-center gap-2"><Disp s={saldoSel} caixa={cxSel} /><Button type="button" variant="ghost" size="sm" onClick={() => setSel(null)}>Trocar</Button></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Quantidade{cxSel > 1 ? ` · caixa de ${cxSel} un` : ""}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setQtd(String(passoQtd(n, -1, cxSel, saldoSel, fracionar)))} aria-label="Diminuir"><Minus className="size-4" /></Button>
                      <Input autoFocus inputMode="decimal" className="w-24 text-center" value={qtd} onChange={(e) => setQtd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }} aria-label="Quantidade" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setQtd(String(passoQtd(n, 1, cxSel, saldoSel, fracionar)))} aria-label="Aumentar"><Plus className="size-4" /></Button>
                      {cxSel > 1 && <label className="flex items-center gap-2 text-xs"><Checkbox checked={fracionar} onCheckedChange={(v) => setFracionar(v === true)} />Fracionar</label>}
                      {cxSel > 1 && n ? <span className="text-xs text-muted-foreground">{n % cxSel === 0 ? `${un(n / cxSel)} cx` : "solto"}</span> : null}
                      <Button type="button" onClick={adicionar} disabled={!!erroSel || carregandoCaixa} className="ml-auto gap-1"><Plus className="size-4" /> {carregandoCaixa ? "Carregando caixaria…" : "Adicionar à lista"}</Button>
                    </div>
                    {erroSel && <p className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3.5" /> {erroSel}</p>}
                  </div>
                ) : (
                  <>
                    <div className="relative border-b"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && resultados[0]) escolher(resultados[0]); }} placeholder="Buscar por nome ou SKU" aria-label="Buscar produto" className="h-10 rounded-none border-0 pl-9 focus-visible:ring-0" /></div>
                    <ul className="max-h-52 divide-y overflow-y-auto">
                      {resultados.map((c) => (
                        <li key={c.sku}><Button type="button" variant="ghost" onClick={() => escolher(c)} className="h-auto w-full justify-start rounded-none gap-3 px-3 py-2 text-left font-normal">
                          <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">{c.sku}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{c.descricao}</span>
                          {noPedido.has(chaveSku(c.sku)) && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">já no pedido</span>}
                          <Disp s={saldoDe(c.sku)} caixa={caixaDe(c.sku)} />
                        </Button></li>))}
                      {resultados.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">{busca ? "Nenhum produto encontrado para essa busca." : "Todos os produtos do catálogo já foram sugeridos."}</li>}
                    </ul>
                  </>
                )}
              </div>
            )}

            {sugs.length > 0 && (
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-medium"><span>Produtos extras aprovados</span><span className="text-muted-foreground">{resumo.produtos} produto{resumo.produtos > 1 ? "s" : ""} · {un(resumo.unidades)} un</span></div>
                <ul className="divide-y">
                  {sugs.map((s, k) => { const aviso = errosSugs[k]; const cx = s.caixa ?? caixaDe(s.id_produto); return (
                    <li key={s.id_produto} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">{s.id_produto}</span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={s.descricao}>{s.descricao}</span>
                      <Input inputMode="decimal" className="h-8 w-20 text-right" value={String(s.qtd)} aria-label={`Quantidade de ${s.id_produto}`} onChange={(e) => { const v = qtdValida(e.target.value); setSugs(sugs.map((x) => (x === s ? { ...x, qtd: v ?? 0 } : x))); }} />
                      {cx > 1 && <span className="w-16 text-[11px] text-muted-foreground">{s.qtd > 0 && s.qtd % cx === 0 ? `${un(s.qtd / cx)} cx` : `cx ${cx} un`}</span>}
                      {cx > 1 && <label className="flex items-center gap-2 text-xs"><Checkbox checked={s.fracionar ?? false} onCheckedChange={(v) => setSugs(sugs.map((x) => x === s ? { ...x, fracionar: v === true } : x))} aria-label={`Fracionar ${s.id_produto}`} />Fracionar</label>}
                      <Button size="sm" variant="ghost" onClick={() => setSugs(sugs.filter((x) => x !== s))} aria-label={`Remover ${s.id_produto}`}><Trash2 className="size-4" /></Button>
                      {aviso && <p className="flex w-full items-center gap-1 pl-[5.75rem] text-[11px] text-destructive"><AlertTriangle className="size-3" /> {aviso}</p>}
                    </li>); })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">{resumo.produtos ? `${resumo.produtos} produto${resumo.produtos > 1 ? "s" : ""} extra${resumo.produtos > 1 ? "s" : ""} · ${un(resumo.unidades)} un` : "Sem produtos extras"}</span>
          <div className="flex gap-2"><Button variant="ghost" disabled={salvando} onClick={onClose}>Voltar</Button><Button disabled={salvando || errosSugs.some(Boolean)} onClick={enviar} className="gap-2">{salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{salvando ? "Aprovando…" : "Aprovar com ressalvas"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
