import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Store, Download, AlertTriangle, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarItens, nk, type ItemRep } from "@/lib/abastecimento-dados";
import { STATUS2, resumirLoja2, type Status2, type Base2 } from "@/lib/abastecimento-motor2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/reposicao")({
  component: ReposicaoPage,
  head: () => ({ meta: [{ title: "Reposição de Lojas" }, { name: "description", content: "Reposição do CD para as lojas, com trânsito, pedido manual e limite pelo saldo do CD." }] }),
});

const COR: Record<Status2, string> = {
  ruptura: "bg-red-100 text-red-700 border-red-200", abaixo: "bg-amber-100 text-amber-800 border-amber-200", em_transito: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ok: "bg-emerald-100 text-emerald-700 border-emerald-200", excesso: "bg-sky-100 text-sky-700 border-sky-200", semdemanda: "bg-slate-100 text-slate-600 border-slate-200",
  cadastro: "bg-violet-100 text-violet-700 border-violet-200", conferir: "bg-orange-100 text-orange-700 border-orange-200", fora: "bg-slate-100 text-slate-500 border-slate-200",
};
const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const BASES: { v: Base2; r: string }[] = [{ v: "real", r: "Venda real (CMD × sazonalidade)" }, { v: "consenso", r: "Meta do consenso" }, { v: "maior", r: "A maior das duas" }];

function ReposicaoPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const gestor = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const bruto = useAbastBruto(pode);
  const [lojaSel, setLojaSel] = useState("");
  const [base, setBase] = useState<Base2>("real");
  const [filtro, setFiltro] = useState<Status2 | "PEDIDO" | "TODOS">("TODOS");
  const [famFiltro, setFamFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [manuaisTxt, setManuaisTxt] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [famLinha, setFamLinha] = useState<Record<string, string>>({});

  const manuais = useMemo(() => { const m: Record<string, number | null> = {}; for (const [k, v] of Object.entries(manuaisTxt)) { const n = Number(v.replace(",", ".")); if (v.trim() !== "" && Number.isFinite(n) && n >= 0) m[k] = n; } return m; }, [manuaisTxt]);
  const hojeIso = new Date().toLocaleDateString("en-CA");
  const mont = useMemo(() => (bruto.data ? montarItens(bruto.data, { base, denominador: "calendario", hojeIso, manuais }) : null), [bruto.data, base, manuais, hojeIso]);
  const loja = bruto.data?.lojas.find((l) => l.codigo === lojaSel) ?? bruto.data?.lojas[0];
  const itens: ItemRep[] = (mont && loja ? mont.itens[loja.codigo] : null) ?? [];
  const resumo = useMemo(() => resumirLoja2(itens), [itens]);
  const familias = useMemo(() => [...new Set(itens.map((i) => i.familia).filter(Boolean))].sort(), [itens]);
  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (filtro === "TODOS" ? true : filtro === "PEDIDO" ? i.qtdPedido > 0 : i.status === filtro) && (!famFiltro || i.familia === famFiltro) && (!q || i.sku.includes(q) || i.descricao.toLowerCase().includes(q)))
      .sort((a, b) => STATUS2[a.status].ordem - STATUS2[b.status].ordem || b.qtdPedido - a.qtdPedido);
  }, [itens, filtro, famFiltro, busca]);
  const ref = mont && loja ? mont.refPorLoja[loja.codigo] : null;
  const atraso = ref ? Math.round((Date.now() - new Date(ref + "T12:00:00").getTime()) / 86400000) : null;
  const paraPedido = useMemo(() => itens.filter((i) => i.qtdAtendida > 0 && !fora.has(`${i.loja}|${nk(i.sku)}`)), [itens, fora]);
  const totalPedido = paraPedido.reduce((a, b) => a + b.qtdAtendida, 0);

  async function gerarPedido() {
    if (!loja || paraPedido.length === 0) return;
    setGerando(true);
    try {
      const payload = paraPedido.map((i) => ({ id_produto: i.sku, descricao: i.descricao, qtd_sugerida: i.sugestao, qtd_pedida: i.qtdAtendida, caixa: i.caixa, origem: i.pedidoOrigem === "MANUAL" ? "MANUAL" : "SUGESTAO" }));
      const { data, error } = await (supabase as any).rpc("abast_criar_pedido", { p_loja: loja.codigo, p_base: base, p_obs: null, p_itens: payload });
      if (error) throw error;
      toast.success(`Pedido nº ${data?.numero} criado: ${data?.itens} itens, ${totalPedido.toLocaleString("pt-BR")} un. Ele já abate as próximas sugestões.`);
      setManuaisTxt({}); setFora(new Set());
      qc.invalidateQueries({ queryKey: ["abast-v2"] });
    } catch (err: any) { toast.error("Não consegui criar o pedido: " + (err?.message ?? err)); }
    finally { setGerando(false); }
  }

  function exportar() {
    const f = (n: unknown) => (n == null ? "" : String(n).replace(".", ","));
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["SKU", "Produto", "Grupo", "Família", "Status", "Estoque", "Exposição", "Em trânsito", "Pedido em aberto", "Demanda/dia", "Meta do mês", "Realizado no mês", "Mínimo", "Ideal", "Máximo", "Caixa", "Sugestão (un)", "Pedido (un)", "CD atende (un)", "Falta no CD", "Saldo CD"];
    const corpo = linhas.map((i) => [i.sku, i.descricao, i.grupo, i.familia, STATUS2[i.status].rotulo, f(i.estoque), f(i.exposicao), f(i.emTransito), f(i.pedidoAberto), f(i.demandaDia == null ? null : Math.round(i.demandaDia * 100) / 100), f(i.metaMes), f(i.realizadoMes), f(i.minQ), f(i.idealQ), f(i.maxQ), f(i.caixa), f(i.sugestao), f(i.qtdPedido), f(i.qtdAtendida), f(i.faltaCD), f(i.saldoCD)].map(esc).join(";"));
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
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="size-6" /> Reposição de Lojas</h1>
        <p className="text-sm text-muted-foreground">
          Só <strong>produto acabado com meta no consenso</strong>. Demanda pelo faturamento carregado (CMD 7/30/90 dias × sazonalidade) ou pela meta; o estoque vem do lote, ao vivo. <strong>Trânsito e pedidos em aberto abatem a sugestão</strong> (sem pedido duplicado e sem falsa ruptura). A exposição não conta como vendável, a sugestão é em caixa fechada e o CD limita o atendimento.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(bruto.data?.lojas ?? []).map((l) => <Button key={l.codigo} size="sm" variant={loja?.codigo === l.codigo ? "default" : "outline"} onClick={() => { setLojaSel(l.codigo); setFiltro("TODOS"); setFamFiltro(""); setFora(new Set()); }}>{l.nome}</Button>)}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Base de demanda:</span>
        {BASES.map((b) => <Button key={b.v} size="sm" variant={base === b.v ? "default" : "outline"} onClick={() => setBase(b.v)}>{b.r}</Button>)}
        <span className={`text-xs ${atraso != null && atraso > 3 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
          {ref ? `Última venda carregada: ${dataBr(ref)}${atraso != null && atraso > 3 ? ` ⚠ defasada há ${atraso} dias — carregue o faturamento` : ""}` : "Sem faturamento carregado para esta loja: a demanda real é zero. Carregue o faturamento ou use a meta do consenso."}
        </span>
      </div>

      {semDados && <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900">Nenhum produto acabado com meta no consenso para esta loja. Envie o consenso em <strong>Projeção do CD</strong>.</CardContent></Card>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        <Kpi t="Disponibilidade" v={resumo.disponibilidade == null ? "—" : `${(resumo.disponibilidade * 100).toFixed(1)}%`} />
        <Kpi t="SKUs" v={String(resumo.ativos)} />
        <Kpi t="Ruptura" v={String(resumo.contagem.ruptura)} tom="text-red-600" />
        <Kpi t="Abaixo do mínimo" v={String(resumo.contagem.abaixo)} tom="text-amber-600" />
        <Kpi t="A caminho" v={String(resumo.contagem.em_transito)} tom="text-indigo-600" />
        <Kpi t="Excesso" v={String(resumo.contagem.excesso)} tom="text-sky-600" />
        <Kpi t="A pedir" v={`${resumo.itensPedido} · ${resumo.unidadesPedido.toLocaleString("pt-BR")} un`} />
        <Kpi t="Valor a pedir" v={formatBRL(resumo.valorPedido)} />
        <Kpi t="Em trânsito" v={`${resumo.emTransito.toLocaleString("pt-BR")} un`} />
        <Kpi t="Falta no CD" v={`${resumo.faltaCD.toLocaleString("pt-BR")} un`} tom={resumo.faltaCD > 0 ? "text-red-600" : ""} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["TODOS", "PEDIDO", "ruptura", "abaixo", "em_transito", "ok", "excesso", "semdemanda"] as const).map((s) => (
          <button key={s} onClick={() => setFiltro(s)} className={`rounded-full border px-3 py-1 text-xs ${filtro === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>
            {s === "TODOS" ? "Todos" : s === "PEDIDO" ? "Com pedido" : STATUS2[s].rotulo}{s !== "TODOS" && s !== "PEDIDO" ? ` (${resumo.contagem[s]})` : ""}
          </button>))}
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={famFiltro} onChange={(e) => setFamFiltro(e.target.value)}><option value="">Todas as famílias</option>{familias.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <Input className="h-8 w-52" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={exportar}><Download className="size-4" /> CSV</Button>
        {gestor && <Button size="sm" className="gap-1" disabled={gerando || paraPedido.length === 0} onClick={gerarPedido}><PackagePlus className="size-4" /> {gerando ? "Gerando..." : `Gerar pedido (${paraPedido.length} itens · ${totalPedido.toLocaleString("pt-BR")} un)`}</Button>}
      </div>

      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow>
          {gestor && <TableHead className="w-8" />}<TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Grupo</TableHead><TableHead>Família</TableHead><TableHead>Status</TableHead>
          <TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Expo.</TableHead><TableHead className="text-right">A caminho</TableHead><TableHead className="text-right">Demanda/dia</TableHead>
          <TableHead className="text-right">Meta mês</TableHead><TableHead className="text-right">Mín / Ideal</TableHead><TableHead className="text-right">Sugestão</TableHead><TableHead className="text-right w-24">Pedido</TableHead><TableHead className="text-right">CD atende</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.length === 0 && <TableRow><TableCell colSpan={15} className="py-10 text-center text-muted-foreground">{bruto.isLoading ? "Carregando..." : "Nenhum item neste filtro."}</TableCell></TableRow>}
          {linhas.slice(0, 500).map((i) => {
            const k = `${i.loja}|${nk(i.sku)}`;
            return (
              <TableRow key={k} title={i.alertas.join(" · ")} className={fora.has(k) ? "opacity-40" : ""}>
                {gestor && <TableCell><input type="checkbox" disabled={i.qtdAtendida <= 0} checked={i.qtdAtendida > 0 && !fora.has(k)} onChange={() => { const n = new Set(fora); if (n.has(k)) n.delete(k); else n.add(k); setFora(n); }} /></TableCell>}
                <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                <TableCell className="max-w-[220px] truncate">{i.descricao || "—"}{i.semExposicao && <span className="ml-1 text-[10px] text-amber-600">sem exposição</span>}</TableCell>
                <TableCell className="text-xs">{i.grupo}</TableCell><TableCell className="text-xs">{i.familia || <span className="text-amber-600">sem família</span>}</TableCell>
                <TableCell><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${COR[i.status]}`}>{STATUS2[i.status].rotulo}</span></TableCell>
                <TableCell className="text-right">{n1(i.estoque)}</TableCell><TableCell className="text-right">{n1(i.exposicao)}</TableCell>
                <TableCell className="text-right">{i.emTransito + i.pedidoAberto > 0 ? n1(i.emTransito + i.pedidoAberto) : "—"}</TableCell>
                <TableCell className="text-right">{n2(i.demandaDia)}{i.indiceSazonal !== 1 && <span className="ml-1 text-[10px] text-muted-foreground">×{n2(i.indiceSazonal)}</span>}</TableCell>
                <TableCell className="text-right text-xs">{i.metaMes > 0 ? `${n1(i.realizadoMes)} / ${n1(i.metaMes)}` : "—"}</TableCell>
                <TableCell className="text-right text-xs">{n1(i.minQ)} / {n1(i.idealQ)}</TableCell>
                <TableCell className="text-right font-semibold">{i.sugestao > 0 ? `${i.sugestao}${i.caixa > 1 ? ` (${i.sugestaoCaixas} cx)` : ""}` : "—"}</TableCell>
                <TableCell className="text-right">{gestor ? <Input className="h-7 w-20 text-right ml-auto" inputMode="numeric" placeholder={i.sugestao > 0 ? String(i.sugestao) : "0"} value={manuaisTxt[`${i.loja}|${nk(i.sku)}`] ?? ""} onChange={(e) => setManuaisTxt({ ...manuaisTxt, [`${i.loja}|${nk(i.sku)}`]: e.target.value })} /> : n1(i.qtdPedido)}</TableCell>
                <TableCell className="text-right">{i.qtdPedido > 0 ? <>{n1(i.qtdAtendida)}{i.faltaCD > 0 && <AlertTriangle className="inline size-3 ml-1 text-amber-600" aria-label="CD não cobre" />}</> : "—"}</TableCell>
              </TableRow>);
          })}
        </TableBody>
      </Table></CardContent></Card>
      <p className="text-xs text-muted-foreground">Pedido manual: digite a quantidade (vira múltiplo da caixa) e ela substitui a sugestão; zero = não pedir. O pedido gerado usa o que o CD atende e passa a contar como "a caminho" até ser recebido.</p>

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

function Kpi({ t, v, tom }: { t: string; v: string; tom?: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground truncate">{t}</div><div className={`text-base font-bold mt-1 ${tom ?? ""}`}>{v}</div></CardContent></Card>;
}
