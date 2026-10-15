import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Store, Download, AlertTriangle, PackagePlus, ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { CLASSES_PORTFOLIO } from "@/lib/abastecimento-portfolio";
import { TabelaRolavel } from "@/components/abast-dash/comum";
import { nomeCurtoLoja } from "@/lib/abastecimento-nomes";
import { montarItens, nk, type ItemRep } from "@/lib/abastecimento-dados";
import { STATUS2, LIMITE_COBERTURA_AVISO, resumirLoja2, type Status2, type Base2 } from "@/lib/abastecimento-motor2";
import { resolverParam } from "@/lib/abastecimento-cobertura";
import { passaFiltros, proximaOrdem, comparar, opcoesCategoria, filtroAtivo, type ColDef, type Filtro, type Ordem } from "@/lib/tabela-filtro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/reposicao")({
  component: ReposicaoPage,
  head: () => ({ meta: [{ title: "Reposição de Lojas — Abastecimento" }, { name: "description", content: "Planejamento de reposição por loja com classe do portfólio aprovado, pedidos e saldo do CD." }, { property: "og:title", content: "Reposição de Lojas — Abastecimento" }, { property: "og:description", content: "Planejamento por loja com classes validadas pelo gestor e atendimento pelo CD." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const COR: Record<Status2, string> = {
  ruptura: "bg-destructive/10 text-destructive border-destructive/20",
  abaixo: "bg-warning/10 text-warning border-warning/20",
  em_transito: "bg-info/10 text-info border-info/20",
  ok: "bg-success/10 text-success border-success/20",
  excesso: "bg-info/10 text-info border-info/20",
  semdemanda: "bg-muted text-muted-foreground border-border",
  cadastro: "bg-secondary/10 text-secondary border-secondary/20",
  conferir: "bg-warning/10 text-warning border-warning/20",
  fora: "bg-muted text-muted-foreground border-border",
};
const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const BASES: { v: Base2; r: string }[] = [{ v: "ajustada", r: "Malha do consenso × realizado" }, { v: "real", r: "Venda real (CMD)" }, { v: "consenso", r: "Malha do consenso (meta ÷ dias)" }, { v: "maior", r: "A maior das duas" }];

// Colunas da tabela: cada uma sabe ordenar e filtrar (clique no título; ícone de funil para filtrar).
const COLS: ColDef<ItemRep>[] = [
  { k: "sku", r: "SKU", t: "txt", v: (i) => i.sku },
  { k: "produto", r: "Produto", t: "txt", v: (i) => i.descricao },
  { k: "status", r: "Status", t: "cat", v: (i) => STATUS2[i.status].rotulo },
  { k: "estoque", r: "Estoque", t: "num", al: "right", v: (i) => i.estoque },
  { k: "expo", r: "Expo.", t: "num", al: "right", v: (i) => i.exposicao },
  { k: "caminho", r: "Transi", dica: "A caminho: unidades em trânsito + pedidos em aberto", t: "num", al: "right", v: (i) => i.emTransito + i.pedidoAberto },
  { k: "demanda", r: "CMD", dica: "CMD: demanda média por dia (unidades por dia)", t: "num", al: "right", v: (i) => i.demandaDia },
  { k: "meta", r: "Meta mês", t: "num", al: "right", v: (i) => i.metaMes },
  { k: "ideal", r: "Mín / Ideal", t: "num", al: "right", v: (i) => i.idealQ },
  { k: "sugestao", r: "Sugestão", t: "num", al: "right", v: (i) => i.sugestao },
  { k: "pedido", r: "Pedido", t: "num", al: "right", v: (i) => i.qtdPedido },
  { k: "atende", r: "CD atende", t: "num", al: "right", v: (i) => i.qtdAtendida },
  { k: "saldocd", r: "Saldo CD", t: "num", al: "right", v: (i) => i.saldoCD },
  { k: "cobpos", r: "Cobertura", dica: "Cobertura: dias de estoque depois do pedido", t: "num", al: "right", v: (i) => i.cobPosPedido },
];

function ReposicaoPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const gestor = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const bruto = useAbastBruto(pode);
  const [lojaSel, setLojaSel] = useState("");
  const [base, setBase] = useState<Base2>("ajustada");
  const [filtro, setFiltro] = useState<Status2 | "PEDIDO" | "COBALTA" | "TODOS">("TODOS");
  const [famFiltro, setFamFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [manuaisTxt, setManuaisTxt] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [famLinha, setFamLinha] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [filtros, setFiltros] = useState<Record<string, Filtro>>({});
  const [origemSel, setOrigemSel] = useState<Record<string, string>>({});
  const nFiltros = Object.values(filtros).filter((f) => filtroAtivo(f)).length;

  const manuais = useMemo(() => { const m: Record<string, number | null> = {}; for (const [k, v] of Object.entries(manuaisTxt)) { const n = Number(v.replace(",", ".")); if (v.trim() !== "" && Number.isFinite(n) && n >= 0) m[k] = n; } return m; }, [manuaisTxt]);
  const hojeIso = new Date().toLocaleDateString("en-CA");
  const mont = useMemo(() => (bruto.data ? montarItens(bruto.data, { base, denominador: "calendario", hojeIso, manuais }) : null), [bruto.data, base, manuais, hojeIso]);
  const loja = bruto.data?.lojas.find((l) => l.codigo === lojaSel) ?? bruto.data?.lojas[0];
  const classes = bruto.data?.portfolioClasses?.[loja?.codigo ?? ""];
  const classeDe = (i: ItemRep) => { const classe = classes?.[nk(i.sku)]; return classe ? CLASSES_PORTFOLIO[classe] : "Sem validação"; };
  const nomeLoja = (c: string) => bruto.data?.lojas.find((l) => l.codigo === c)?.nome ?? c;
  // Sobra de outras lojas para remanejamento: o que passa do Ideal (exposição + cobertura + segurança) de cada loja.
  const sobras = useMemo(() => {
    const m = new Map<string, { loja: string; sobra: number }[]>();
    if (!mont || !loja) return m;
    for (const [lc, lista] of Object.entries(mont.itens)) {
      if (lc === loja.codigo) continue;
      for (const o of lista) { const s = Math.floor((o.estoque ?? 0) - Math.max(0, o.idealQ ?? 0)); if (s > 0) { const k = nk(o.sku); m.set(k, [...(m.get(k) ?? []), { loja: lc, sobra: s }]); } }
    }
    return m;
  }, [mont, loja]);
  const origemDe = (i: ItemRep) => origemSel[`${i.loja}|${nk(i.sku)}`] ?? "CD";
  const sobraDe = (i: ItemRep, lc: string) => sobras.get(nk(i.sku))?.find((s) => s.loja === lc)?.sobra ?? 0;
  const qtdEnvio = (i: ItemRep) => { const o = origemDe(i); return o === "CD" ? i.qtdAtendida : Math.min(i.qtdPedido, sobraDe(i, o)); };
  const cols: ColDef<ItemRep>[] = COLS.flatMap((c) => c.k === "produto" ? [c, { k: "classe", r: "Classe", t: "cat", v: classeDe }] : c.k === "pedido" ? [c, { k: "origem", r: "Origem", t: "cat", v: (i: ItemRep) => origemDe(i) === "CD" ? "CD" : nomeLoja(origemDe(i)) }] : [c]);
  const itens: ItemRep[] = (mont && loja ? mont.itens[loja.codigo] : null) ?? [];
  const resumo = useMemo(() => resumirLoja2(itens), [itens]);
  const familias = useMemo(() => [...new Set(itens.map((i) => i.familia).filter(Boolean))].sort(), [itens]);
  const baseLinhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (filtro === "TODOS" ? true : filtro === "PEDIDO" ? i.qtdPedido > 0 : filtro === "COBALTA" ? i.avisoCobertura : i.status === filtro) && (!famFiltro || i.familia === famFiltro) && (!q || i.sku.includes(q) || i.descricao.toLowerCase().includes(q)));
  }, [itens, filtro, famFiltro, busca]);
  const linhas = useMemo(() => {
    const col = ordem ? cols.find((c) => c.k === ordem.k) : undefined;
    return baseLinhas.filter((i) => passaFiltros(i, cols, filtros)).sort((a, b) =>
      (col && ordem ? comparar(a, b, col, ordem.dir) : 0) || STATUS2[a.status].ordem - STATUS2[b.status].ordem || b.qtdPedido - a.qtdPedido);
  }, [baseLinhas, filtros, ordem, classes]);
  const ref = mont && loja ? mont.refPorLoja[loja.codigo] : null;
  const atraso = ref ? Math.round((Date.now() - new Date(ref + "T12:00:00").getTime()) / 86400000) : null;
  const paraPedido = useMemo(() => itens.filter((i) => qtdEnvio(i) > 0 && !fora.has(`${i.loja}|${nk(i.sku)}`)), [itens, fora, origemSel, sobras]);
  const totalPedido = paraPedido.reduce((a, b) => a + qtdEnvio(b), 0);

  // Quanto o CD consegue mandar: em caixas fechadas quando há caixa; senão, o saldo todo.
  const maxCD = (i: ItemRep) => { const d = i.disponivelCD ?? i.saldoCD ?? 0; return d <= 0 ? 0 : i.caixa > 1 && d >= i.caixa ? Math.floor(d / i.caixa) * i.caixa : d; };
  async function salvarExposicao(i: ItemRep, n: number) {
    const { error } = await (supabase as any).from("abast_produto_loja").upsert({ loja: i.loja, id_produto: i.sku, exposicao: n, atualizado_em: new Date().toISOString() }, { onConflict: "loja,id_produto" });
    if (error) toast.error("Não consegui salvar a exposição: " + error.message);
    else { toast.success(`Exposição de ${i.sku} salva: ${n} un.`); qc.invalidateQueries({ queryKey: ["abast-v2"] }); }
  }

  async function gerarPedido() {
    if (!loja || paraPedido.length === 0) return;
    setGerando(true);
    const msgs: string[] = [];
    try {
      const doCD = paraPedido.filter((i) => origemDe(i) === "CD");
      if (doCD.length) {
        const payload = doCD.map((i) => ({ id_produto: i.sku, descricao: i.descricao, qtd_sugerida: i.sugestao, qtd_pedida: i.qtdAtendida, caixa: i.caixa, origem: i.pedidoOrigem === "MANUAL" ? "MANUAL" : "SUGESTAO" }));
        const { data, error } = await (supabase as any).rpc("abast_criar_pedido", { p_loja: loja.codigo, p_base: base, p_obs: null, p_itens: payload });
        if (error) throw error;
        msgs.push(`Pedido do CD nº ${data?.numero} (${data?.itens} itens, requisição ${data?.requisicao_numero ?? ""})`);
      }
      const porOrigem = new Map<string, ItemRep[]>();
      for (const i of paraPedido) { const o = origemDe(i); if (o !== "CD") porOrigem.set(o, [...(porOrigem.get(o) ?? []), i]); }
      for (const [o, lista] of porOrigem) {
        const payload = lista.map((i) => ({ id_produto: i.sku, descricao: i.descricao, qtd_sugerida: i.sugestao, qtd_pedida: qtdEnvio(i), caixa: i.caixa }));
        const { data, error } = await (supabase as any).rpc("abast_criar_transferencia", { p_loja: loja.codigo, p_loja_origem: o, p_base: base, p_obs: null, p_itens: payload });
        if (error) throw error;
        msgs.push(`Transferência nº ${data?.numero} de ${nomeLoja(o)} (${data?.itens} itens, requisição ${data?.requisicao_numero ?? ""})`);
      }
      toast.success(`${msgs.join(" · ")} criado(s). Separação em Suprimentos → Requisições.`);
      setManuaisTxt({}); setFora(new Set()); setOrigemSel({});
      qc.invalidateQueries({ queryKey: ["abast-v2"] });
    } catch (err: any) { toast.error(`${msgs.length ? msgs.join(" · ") + " criado(s), mas " : ""}não consegui criar: ` + (err?.message ?? err)); if (msgs.length) qc.invalidateQueries({ queryKey: ["abast-v2"] }); }
    finally { setGerando(false); }
  }

  function exportar() {
    const f = (n: unknown) => (n == null ? "" : String(n).replace(".", ","));
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["SKU", "Produto", "Classe", "Status", "Estoque", "Exposição", "Em trânsito", "Pedido em aberto", "Demanda/dia", "Meta do mês", "Realizado no mês", "Mínimo", "Ideal", "Máximo", "Sugestão (un)", "Pedido (un)", "CD atende (un)", "Falta no CD", "Saldo CD"];
    const corpo = linhas.map((i) => [i.sku, i.descricao, classeDe(i), STATUS2[i.status].rotulo, f(i.estoque), f(i.exposicao), f(i.emTransito), f(i.pedidoAberto), f(i.demandaDia == null ? null : Math.round(i.demandaDia * 100) / 100), f(i.metaMes), f(i.realizadoMes), f(i.minQ), f(i.idealQ), f(i.maxQ), f(i.sugestao), f(i.qtdPedido), f(i.qtdAtendida), f(i.faltaCD), f(i.saldoCD)].map(esc).join(";"));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Reposicao_${loja?.codigo}_${hojeIso}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Família por linha: cadastra a família para todos os SKUs da linha que ainda não têm
  const semFamPorLinha = useMemo(() => { const m = new Map<string, { sku: string; descricao: string }[]>(); const vistos = new Set<string>(); for (const s of mont?.semFamilia ?? []) { const k = nk(s.sku); if (vistos.has(k)) continue; vistos.add(k); const l = s.linha || "(sem linha)"; m.set(l, [...(m.get(l) ?? []), { sku: s.sku, descricao: s.descricao }]); } return [...m.entries()]; }, [mont]);
  const famExistentes = useMemo(() => [...new Set((bruto.data?.familias ?? []).map((f) => f.familia))].sort(), [bruto.data]);
  async function cadastrarFamilia(linhaNome: string, lista: { sku: string; descricao: string }[]) {
    const fam = (famLinha[linhaNome] ?? "").trim();
    if (!fam) { toast.error("Escolha ou digite a família."); return; }
    const { error } = await (supabase as any).from("familias").insert(lista.map((s) => ({ codigo_produto: s.sku, descricao_produto: s.descricao, familia: fam })));
    if (error) toast.error("Não consegui cadastrar: " + error.message);
    else { toast.success(`Família "${fam}" cadastrada para ${lista.length} SKU(s) da linha ${linhaNome}.`); setFamLinha({ ...famLinha, [linhaNome]: "" }); qc.invalidateQueries({ queryKey: ["abast-v2"] }); }
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const semDados = !bruto.isLoading && !!mont && itens.length === 0;

  return (
    <div className="w-full min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="size-6" /> Reposição de Lojas</h1>
        {bruto.data && (() => { const d = bruto.data; const mes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7); const sem = d.lojas.filter((l) => !d.portfolioAprovado?.[l.codigo]); const herd = d.lojas.filter((l) => d.portfolioOrigem?.[l.codigo] && d.portfolioOrigem[l.codigo].competencia !== mes); return (sem.length || herd.length) ? <div className="my-2 space-y-1 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">{herd.map((l) => { const o = d.portfolioOrigem?.[l.codigo]; return <p key={l.codigo}><strong>{l.nome}: Pendente de validação — utilizando última versão aprovada</strong> ({o?.competencia} v{o?.versao}, aprovada por {o?.aprovador}).</p>; })}{sem.length > 0 && <p><strong>Sem portfólio validado</strong> para {sem.map((l) => l.nome).join(", ")}: lista operacional padrão exibida; essas lojas ficam fora do indicador de disponibilidade até a primeira validação.</p>}</div> : null; })()}
        <p className="text-sm text-muted-foreground">
          Só <strong>produto acabado com meta no consenso</strong>. Demanda pela <strong>malha do consenso</strong> (meta do mês ÷ dias do mês, que já traz a sazonalidade) ajustada pelo realizado (venda real ÷ malha), ou pelo faturamento (CMD 7/30/90 dias) ou só pela meta; o estoque vem do lote, ao vivo. <strong>Trânsito e pedidos em aberto abatem a sugestão</strong> (sem pedido duplicado e sem falsa ruptura). A exposição não conta como vendável, a sugestão só aparece quando o item cai <strong>abaixo do mínimo</strong> e é em caixa fechada; o CD limita o atendimento e o <strong>saldo do CD</strong> aparece em cada linha. Sem caixa fechada no CD, a loja em ruptura ou abaixo do mínimo recebe o <strong>saldo solto</strong>; granéis (sem caixa) são pedidos por consumo médio × cobertura; a linha é avisada quando a cobertura depois do pedido passa de 20 dias.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(bruto.data?.lojas ?? []).map((l) => <Button key={l.codigo} size="sm" title={l.nome} variant={loja?.codigo === l.codigo ? "default" : "outline"} onClick={() => { setLojaSel(l.codigo); setFiltro("TODOS"); setFamFiltro(""); setFora(new Set()); }}>{nomeCurtoLoja(l.codigo, l.nome)}</Button>)}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Base de demanda:</span>
        {BASES.map((b) => <Button key={b.v} size="sm" variant={base === b.v ? "default" : "outline"} onClick={() => setBase(b.v)}>{b.r}</Button>)}
        <span className={`text-xs ${atraso != null && atraso > 3 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {ref ? `Última venda carregada: ${dataBr(ref)}${atraso != null && atraso > 3 ? ` ⚠ defasada há ${atraso} dias — carregue o faturamento` : ""}` : "Sem faturamento carregado para esta loja: a demanda real é zero. Carregue o faturamento ou use a meta do consenso."}
        </span>
      </div>

      {bruto.data && loja && (() => {
        const rp = resolverParam(bruto.data.params, bruto.data.coberturas ?? [], loja.codigo, "");
        const nf = (bruto.data.coberturas ?? []).filter((c) => c.escopo === "FAMILIA").length;
        return (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Cobertura em uso ({loja.nome}): mínimo <strong>{rp.p.diasMin}</strong> · ideal <strong>{rp.p.diasIdeal}</strong> · máximo <strong>{rp.p.diasMax}</strong> · segurança <strong>{rp.p.diasSeguranca}</strong> dias{rp.origem === "loja" ? " (regra da loja)" : ""}{nf > 0 ? ` · ${nf} família(s) com cobertura própria` : ""}</span>
            <Link to="/abastecimento/cobertura" className="text-primary hover:underline">{isAdmin ? "Alterar" : "Ver"} parâmetros de cobertura</Link>
          </div>);
      })()}

      {semDados && <Card className="border-warning/30 bg-warning/10"><CardContent className="pt-4 text-sm text-foreground">Nenhum produto acabado com meta no consenso para esta loja. Envie o consenso em <strong>Projeção do CD</strong>.</CardContent></Card>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-10">
        <Kpi t="Disponibilidade" v={resumo.disponibilidade == null ? "—" : `${(resumo.disponibilidade * 100).toFixed(1)}%`} />
        <Kpi t="SKUs" v={String(resumo.ativos)} />
        <Kpi t="Ruptura" v={String(resumo.contagem.ruptura)} tom="text-destructive" />
        <Kpi t="Abaixo do mínimo" v={String(resumo.contagem.abaixo)} tom="text-warning" />
        <Kpi t="A caminho" v={String(resumo.contagem.em_transito)} tom="text-info" />
        <Kpi t="Excesso" v={String(resumo.contagem.excesso)} tom="text-info" />
        <Kpi t="A pedir" v={`${resumo.itensPedido} · ${resumo.unidadesPedido.toLocaleString("pt-BR")} un`} />
        <Kpi t="Valor a pedir" v={formatBRL(resumo.valorPedido)} />
        <Kpi t="Em trânsito" v={`${resumo.emTransito.toLocaleString("pt-BR")} un`} />
        <Kpi t="Falta no CD" v={`${resumo.faltaCD.toLocaleString("pt-BR")} un`} tom={resumo.faltaCD > 0 ? "text-destructive" : ""} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["TODOS", "PEDIDO", "COBALTA", "ruptura", "abaixo", "em_transito", "ok", "excesso", "semdemanda"] as const).map((s) => (
          <Button key={s} type="button" size="sm" variant={filtro === s ? "default" : "outline"} aria-pressed={filtro === s} onClick={() => setFiltro(s)}>
            {s === "TODOS" ? "Todos" : s === "PEDIDO" ? "Com pedido" : s === "COBALTA" ? `Cobertura > ${LIMITE_COBERTURA_AVISO} dias (${itens.filter((i) => i.avisoCobertura).length})` : STATUS2[s].rotulo}{s !== "TODOS" && s !== "PEDIDO" && s !== "COBALTA" ? ` (${resumo.contagem[s]})` : ""}
          </Button>))}
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={famFiltro} onChange={(e) => setFamFiltro(e.target.value)}><option value="">Todas as famílias</option>{familias.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <Input className="h-8 w-52" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={exportar}><Download className="size-4" /> CSV</Button>
        {gestor && <Button size="sm" className="gap-1" disabled={gerando || paraPedido.length === 0} onClick={gerarPedido}><PackagePlus className="size-4" /> {gerando ? "Gerando..." : `Gerar pedido (${paraPedido.length} itens · ${totalPedido.toLocaleString("pt-BR")} un)`}</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Mostrando <strong>{linhas.length}</strong> de {itens.length} itens</span>
        {(nFiltros > 0 || ordem) && <button className="rounded-full border px-3 py-1 hover:bg-muted" onClick={() => { setFiltros({}); setOrdem(null); }}>Limpar {nFiltros > 0 ? `filtros (${nFiltros})` : ""}{nFiltros > 0 && ordem ? " e " : ""}{ordem ? "ordem" : ""}</button>}
        <span>Clique no título para ordenar (números: do maior para o menor) e no funil para filtrar.</span>
      </div>
      <TabelaRolavel titulo={`Reposição de Lojas · ${nomeCurtoLoja(loja?.codigo ?? "", loja?.nome)} · ${linhas.length} itens`} altura="max-h-[68vh]"><table className="w-full caption-bottom bg-card text-sm text-card-foreground">
        <thead>
          <tr className="border-b">
            {gestor && <th className="sticky top-0 z-20 w-8 bg-muted" />}
            {cols.map((c) => <CabCol key={c.k} col={c} ordem={ordem} onOrdem={() => setOrdem(proximaOrdem(ordem, c))} filtro={filtros[c.k]} onFiltro={(f) => setFiltros({ ...filtros, [c.k]: f })} opcoes={c.t === "cat" ? opcoesCategoria(baseLinhas, c) : []} />)}
          </tr>
        </thead>
        <TableBody>
          {linhas.length === 0 && <TableRow><TableCell colSpan={cols.length + (gestor ? 1 : 0)} className="py-10 text-center text-muted-foreground">{bruto.isLoading ? "Carregando..." : "Nenhum item neste filtro."}</TableCell></TableRow>}
          {linhas.map((i) => {
            const k = `${i.loja}|${nk(i.sku)}`;
            return (
              <TableRow key={k} title={i.alertas.join(" · ")} className={fora.has(k) ? "opacity-40" : ""}>
                {gestor && <TableCell><input type="checkbox" disabled={qtdEnvio(i) <= 0} checked={qtdEnvio(i) > 0 && !fora.has(k)} onChange={() => { const n = new Set(fora); if (n.has(k)) n.delete(k); else n.add(k); setFora(n); }} /></TableCell>}
                <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                <TableCell className="min-w-[240px] text-xs leading-snug whitespace-normal break-words">{i.descricao || "—"}{i.semExposicao && <span className="ml-1 text-[10px] text-warning">sem exposição</span>}{i.semCaixa && <span className="ml-1 text-[10px] text-warning">sem caixa</span>}{i.solto && !i.caixaCadastrada && <span className="ml-1 text-[10px] text-muted-foreground">granel: sem caixa</span>}{i.solto && i.caixaCadastrada && <span className="ml-1 text-[10px] text-muted-foreground">granel</span>}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{classeDe(i)}</TableCell>
                <TableCell><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${COR[i.status]}`}>{STATUS2[i.status].rotulo}</span></TableCell>
                <TableCell className="text-right">{n1(i.estoque)}</TableCell><TableCell className="text-right">{isAdmin ? <CelulaEdit valor={i.semExposicao ? null : i.exposicao} placeholder="0" titulo="Exposição: unidades que ficam na vitrine (não contam como vendável)" aoSalvar={(n) => salvarExposicao(i, n)} /> : n1(i.exposicao)}</TableCell>
                <TableCell className="text-right">{i.emTransito + i.pedidoAberto > 0 ? n1(i.emTransito + i.pedidoAberto) : "—"}</TableCell>
                <TableCell className="text-right">{n2(i.demandaDia)}{i.fatorRealizacao !== null && i.baseUsada === "ajustada" && <span className="ml-1 text-[10px] text-muted-foreground" title="venda real ÷ malha do consenso">×{n2(i.fatorRealizacao)}</span>}</TableCell>
                <TableCell className="text-right text-xs">{i.metaMes > 0 ? `${n1(i.realizadoMes)} / ${n1(i.metaMes)}` : "—"}</TableCell>
                <TableCell className="text-right text-xs">{n1(i.minQ)} / {n1(i.idealQ)}</TableCell>
                <TableCell className="text-right font-semibold">{i.sugestao > 0 ? `${i.sugestao}${i.caixa > 1 ? ` (${i.sugestaoCaixas} cx)` : ""}` : "—"}</TableCell>
                <TableCell className="text-right">{gestor ? <div className="flex flex-col items-end gap-0.5"><Input className="h-7 w-20 text-right" inputMode="numeric" placeholder={i.sugestao > 0 ? String(i.sugestao) : "0"} value={manuaisTxt[`${i.loja}|${nk(i.sku)}`] ?? ""} onChange={(e) => setManuaisTxt({ ...manuaisTxt, [`${i.loja}|${nk(i.sku)}`]: e.target.value })} />{maxCD(i) > 0 && <button type="button" className="text-[10px] text-primary hover:underline" title="Preenche o pedido com o máximo que o CD consegue mandar (em caixas fechadas quando há caixa)" onClick={() => setManuaisTxt({ ...manuaisTxt, [`${i.loja}|${nk(i.sku)}`]: String(maxCD(i)) })}>usar CD: {n1(maxCD(i))}</button>}</div> : n1(i.qtdPedido)}</TableCell>
                <TableCell className="text-xs">{(() => { const op = sobras.get(nk(i.sku)) ?? []; const o = origemDe(i); if (!gestor || (op.length === 0 && o === "CD")) return <span className="text-muted-foreground">CD</span>; return <div className="flex flex-col gap-0.5"><select className="h-7 rounded-md border bg-background px-1 text-xs" title="De onde sai o estoque: CD (padrão) ou outra loja com sobra acima do Ideal" value={o} onChange={(e) => setOrigemSel({ ...origemSel, [k]: e.target.value })}><option value="CD">CD ({n1(i.saldoCD ?? 0)})</option>{op.map((s) => <option key={s.loja} value={s.loja}>{nomeLoja(s.loja)} (sobra {n1(s.sobra)})</option>)}</select>{o !== "CD" && <span className="text-[10px] text-primary">transferir {n1(qtdEnvio(i))}</span>}</div>; })()}</TableCell>
                <TableCell className="text-right">{i.qtdPedido > 0 ? <>{n1(i.qtdAtendida)}{i.faltaCD > 0 && <AlertTriangle className="inline size-3 ml-1 text-warning" aria-label="CD não cobre" />}{i.fracionado && <div className="text-[10px] text-primary" title="O CD não tem caixa fechada: enviando o saldo solto">solto</div>}{(i.saldoCD ?? 0) <= 0 && <div className="text-[10px] text-destructive" title="Sem saldo no CD: depende de produção (veja a Projeção do CD)">produzir</div>}</> : "—"}</TableCell>
                <TableCell className="text-right text-xs">{i.saldoCD == null ? "—" : `${n1(i.saldoCD)}${i.caixa > 1 ? ` (${i.caixasCD} cx)` : ""}`}{i.reservadoCD > 0 && <div className="text-[10px] text-muted-foreground" title="Pedidos ABERTOS (ainda não expedidos) já reservam parte do saldo do CD">reservado: {n1(i.reservadoCD)}</div>}{i.qtdPedido > 0 && i.disponivelCD != null && i.disponivelCD < i.qtdPedido && <div className="text-[10px] text-warning" title="O que sobra do CD para esta loja depois das lojas de maior prioridade">disp. p/ esta: {n1(i.disponivelCD)}</div>}</TableCell>
                <TableCell className={`text-right text-xs ${i.avisoCobertura ? "text-warning font-semibold" : ""}`} title={i.avisoCobertura ? `Mais de ${LIMITE_COBERTURA_AVISO} dias de cobertura depois do pedido (aviso: o pedido continua sugerido)` : ""}>{i.avisoCobertura && <AlertTriangle className="inline size-3 mr-1" aria-label="Cobertura alta" />}{i.cobPosPedido == null ? "—" : n1(i.cobPosPedido)}</TableCell>
              </TableRow>);
          })}
        </TableBody>
      </table></TabelaRolavel>
      <p className="text-xs text-muted-foreground">Origem: o CD é o padrão; quando ele não cobre, escolha outra loja com sobra (estoque acima do Ideal dela). Itens com outra origem viram um Pedido de Transferência entre Lojas separado. Pedido manual: digite a quantidade exata (ela substitui a sugestão; zero = não pedir) ou use "usar CD" para alocar o que o CD tem. O CD atende no máximo o seu saldo. O pedido gerado usa o que o CD atende e passa a contar como "a caminho" até ser recebido. Administradores podem corrigir Expo. direto na tabela.</p>

      {isAdmin && semFamPorLinha.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Produtos sem família ({mont?.semFamilia.length})</CardTitle>
          <CardDescription>Cadastre a família uma vez por linha: ela vale para todos os SKUs da linha que ainda não têm cadastro.</CardDescription></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead>Família</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{semFamPorLinha.map(([l, lista]) => (
              <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{lista.length}</TableCell>
                <TableCell><Input list="fam-lista" className="h-8 w-56" placeholder="escolha ou digite" value={famLinha[l] ?? ""} onChange={(e) => setFamLinha({ ...famLinha, [l]: e.target.value })} /></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => cadastrarFamilia(l, lista)}>Cadastrar</Button></TableCell></TableRow>))}</TableBody></Table>
            <datalist id="fam-lista">{famExistentes.map((f) => <option key={f} value={f} />)}</datalist></CardContent></Card>)}
    </div>
  );
}

function CabCol({ col, ordem, onOrdem, filtro, onFiltro, opcoes }: { col: ColDef<ItemRep>; ordem: Ordem; onOrdem: () => void; filtro: Filtro | undefined; onFiltro: (f: Filtro) => void; opcoes: { valor: string; n: number }[] }) {
  const [aberto, setAberto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ativo = filtroAtivo(filtro);
  const emOrdem = ordem?.k === col.k;
  const Seta = !emOrdem ? ArrowUpDown : ordem?.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={`sticky top-0 z-20 bg-muted h-11 px-2 align-middle font-medium whitespace-nowrap ${col.al === "right" ? "text-right" : "text-left"} ${emOrdem ? "text-foreground" : "text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={onOrdem} title={col.t === "num" ? "Ordenar (1º clique: maior → menor)" : "Ordenar (1º clique: A → Z)"} className="inline-flex items-center gap-1 hover:text-foreground">
          <span>{col.r}</span><Seta className={`size-3.5 ${emOrdem ? "text-primary" : "opacity-40"}`} />
        </button>
        <button type="button" ref={btn} onClick={() => setAberto(!aberto)} title="Filtrar esta coluna" aria-label={`Filtrar ${col.r}`} className={`rounded p-0.5 hover:bg-muted ${ativo ? "text-primary" : "opacity-40 hover:opacity-100"}`}>
          <Filter className="size-3.5" fill={ativo ? "currentColor" : "none"} />
        </button>
      </span>
      {aberto && <PainelFiltro col={col} ancora={btn.current} filtro={filtro} opcoes={opcoes} onChange={onFiltro} onFechar={() => setAberto(false)} />}
    </th>
  );
}

function PainelFiltro({ col, ancora, filtro, opcoes, onChange, onFechar }: { col: ColDef<ItemRep>; ancora: HTMLButtonElement | null; filtro: Filtro | undefined; opcoes: { valor: string; n: number }[]; onChange: (f: Filtro) => void; onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = ancora?.getBoundingClientRect();
  const esq = Math.max(8, Math.min((r?.left ?? 0) - 8, window.innerWidth - 268));
  const topo = (r?.bottom ?? 0) + 6;
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !ancora?.contains(e.target as Node)) onFechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [ancora, onFechar]);
  const f = filtro ?? {};
  const marcados = f.vals ?? opcoes.map((o) => o.valor);
  const alternar = (v: string) => { const s = new Set(marcados); if (s.has(v)) s.delete(v); else s.add(v); onChange({ ...f, vals: s.size === opcoes.length ? undefined : [...s] }); };
  return createPortal(
    <div ref={ref} style={{ position: "fixed", left: esq, top: topo, width: 260 }} className="z-[100] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <div className="mb-2 flex items-center justify-between"><strong>{col.r}</strong><button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({})}>Limpar</button></div>
      {col.t === "txt" && <Input autoFocus className="h-8" placeholder="contém…" value={f.txt ?? ""} onChange={(e) => onChange({ ...f, txt: e.target.value })} />}
      {col.t === "num" && <div className="flex items-center gap-2"><Input autoFocus className="h-8" inputMode="decimal" placeholder="de (≥)" value={f.min ?? ""} onChange={(e) => onChange({ ...f, min: e.target.value })} /><Input className="h-8" inputMode="decimal" placeholder="até (≤)" value={f.max ?? ""} onChange={(e) => onChange({ ...f, max: e.target.value })} /></div>}
      {col.t === "cat" && (<>
        <div className="mb-1 flex gap-3 text-xs"><button className="text-primary hover:underline" onClick={() => onChange({ ...f, vals: undefined })}>Marcar todos</button><button className="text-primary hover:underline" onClick={() => onChange({ ...f, vals: [] })}>Desmarcar todos</button></div>
        <div className="max-h-56 space-y-1 overflow-auto">{opcoes.map((o) => <label key={o.valor} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={marcados.includes(o.valor)} onChange={() => alternar(o.valor)} /><span className="flex-1 truncate">{o.valor || "(vazio)"}</span><span className="text-muted-foreground">{o.n}</span></label>)}</div>
      </>)}
    </div>, document.body);
}

function CelulaEdit({ valor, aoSalvar, titulo, placeholder }: { valor: number | null; aoSalvar: (n: number) => Promise<void>; titulo: string; placeholder: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mostrado = txt ?? (valor == null ? "" : String(valor));
  async function salvar() {
    if (txt === null) return;
    const n = Number(txt.replace(",", "."));
    setTxt(null);
    if (!Number.isFinite(n) || n < 0 || n === valor) return;
    setSalvando(true);
    try { await aoSalvar(n); } finally { setSalvando(false); }
  }
  return <Input className={`h-7 w-16 text-right ml-auto ${salvando ? "opacity-50" : ""}`} inputMode="decimal" title={titulo} placeholder={placeholder} value={mostrado} onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTxt(null); }} />;
}

function Kpi({ t, v, tom }: { t: string; v: string; tom?: string }) {
  return <Card className="min-w-0"><CardContent className="p-4"><div className="min-h-8 text-xs text-muted-foreground">{t}</div><div className={`mt-1 break-words text-base font-bold tabular-nums ${tom ?? ""}`}>{v}</div></CardContent></Card>;
}
