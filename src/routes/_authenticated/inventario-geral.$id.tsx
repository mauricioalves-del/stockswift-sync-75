// Conferência do inventário: Contagem (lista cega da minha dupla), Recontagem (aba separada, vira contagem final)
// e Painel da gestão (progresso por dupla, divergências, resultado final e exportação).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, Download, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { sounds } from "@/lib/audio";
import { somarTransitoMissao, type NotaTransitoMissao, type TransitoMissao } from "@/lib/missao-transito";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAll } from "@/lib/fetch-all";
import { acuracidadePorItem } from "@/lib/inventario-acuracidade";
import { useRole } from "@/hooks/useRole";
import { dataHora, nomeUsuario, num, sb, StatusInv, type Usuario } from "@/components/inventario-geral/comum";

export const Route = createFileRoute("/_authenticated/inventario-geral/$id")({ component: Pagina, head: () => ({ meta: [{ title: "Contagem de Inventário · Inventário" }, { name: "description", content: "Contagem, recontagem e acuracidade por item do inventário." }, { property: "og:title", content: "Contagem de Inventário · Inventário" }, { property: "og:description", content: "Acompanhe os itens conferidos, acurados e divergentes do inventário." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

function Pagina() {
  const { id } = Route.useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inv", id], queryFn: async () => {
    const [inv, du, g, me] = await Promise.all([sb.from("inv_inventarios").select("*").eq("id", id).single(), sb.from("inv_duplas").select("*").eq("inventario_id", id).order("nome"), sb.rpc("inv_sou_gestor"), sb.auth.getUser()]);
    return { inv: inv.data as any, duplas: (du.data ?? []) as any[], gestor: g.data === true, uid: me.data.user?.id as string };
  } });
  const [tentou, setTentou] = useState(false);
  useEffect(() => { // gera a lista sozinho quando chega a data/hora planejada
    const v = q.data?.inv; if (!v || tentou || v.status !== "planejado" || Date.parse(v.data_geracao) > Date.now()) return;
    setTentou(true); sb.rpc("inv_gerar_lista", { p_inv: id }).then((r: any) => { if (!r.error) { toast.success(`Lista gerada: ${r.data} item(ns).`); qc.invalidateQueries({ queryKey: ["inv", id] }); } });
  }, [q.data, tentou, id, qc]);
  if (!q.data?.inv) return <p className="py-10 text-center text-muted-foreground">{q.isLoading ? "Carregando…" : "Inventário não encontrado."}</p>;
  const { inv, duplas, gestor, uid } = q.data;
  const minhas = duplas.filter((d) => [d.membro1, d.membro2].includes(uid));
  const r = () => qc.invalidateQueries({ queryKey: ["inv", id] });
  async function acao(fn: string, args: any, ok: string) { const res = await sb.rpc(fn, args); if (res.error) return toast.error(res.error.message); toast.success(ok); r(); qc.invalidateQueries({ queryKey: ["inv-tarefas", id] }); qc.invalidateQueries({ queryKey: ["inv-painel", id] }); }
  const abaPadrao = inv.status === "em_recontagem" && minhas.some((d) => d.reconta) ? "recontagem" : minhas.length ? "contagem" : "painel";
  return (
    <div className="space-y-4">
      <Link to="/inventario-geral" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="size-3" />Contagem de Inventário</Link>
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <div><h1 className="text-xl font-bold">#{inv.numero} · {inv.titulo}</h1><p className="text-xs text-slate-300">{inv.almoxarifado} · lista {inv.gerada_em ? `gerada em ${dataHora(inv.gerada_em)}` : `programada para ${dataHora(inv.data_geracao)}`}{inv.criterio_abc ? ` · classe ${inv.criterio_abc}` : ""}{minhas.length ? ` · você: ${minhas.map((d) => d.nome).join(", ")}` : ""}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusInv s={inv.status} />
          {gestor && inv.status === "planejado" && <Button size="sm" variant="secondary" onClick={() => acao("inv_gerar_lista", { p_inv: id }, "Lista gerada.")}>Gerar lista agora</Button>}
          {gestor && ["lista_gerada", "em_contagem"].includes(inv.status) && <Button size="sm" variant="secondary" onClick={() => confirm("Encerrar a 1ª contagem e apurar as divergências? Itens não contados contam como divergência.") && acao("inv_apurar", { p_inv: id }, "Contagem encerrada; divergências enviadas para recontagem.")}>Encerrar contagem e apurar</Button>}
          {gestor && inv.status === "em_recontagem" && <Button size="sm" variant="secondary" onClick={() => { const forcar = confirm("Finalizar o inventário? Se houver recontagem pendente, OK finaliza usando a 1ª contagem nesses itens."); if (forcar) acao("inv_finalizar", { p_inv: id, p_forcar: true }, "Inventário finalizado."); }}>Finalizar inventário</Button>}
        </div>
      </div>
      <Tabs defaultValue={abaPadrao}>
        <TabsList>{minhas.some((d) => d.conta) && <TabsTrigger value="contagem">Contagem</TabsTrigger>}{minhas.some((d) => d.reconta) && <TabsTrigger value="recontagem">Recontagem</TabsTrigger>}{gestor && <TabsTrigger value="painel">Painel da gestão</TabsTrigger>}</TabsList>
        {minhas.some((d) => d.conta) && <TabsContent value="contagem"><Conferencia inv={inv} fase="contagem" aberta={["lista_gerada", "em_contagem"].includes(inv.status)} /></TabsContent>}
        {minhas.some((d) => d.reconta) && <TabsContent value="recontagem"><Conferencia inv={inv} fase="recontagem" aberta={inv.status === "em_recontagem"} /></TabsContent>}
        {gestor && <TabsContent value="painel"><Painel inv={inv} duplas={duplas} /></TabsContent>}
      </Tabs>
      {!minhas.length && !gestor && <p className="text-sm text-muted-foreground">Você não está escalado neste inventário.</p>}
    </div>
  );
}

type Linha = { id: string; codigo_produto: string; descricao: string; lote: string; grupo: string | null; unidade: string | null; origem_item: string; qtd: number | null; identificado: boolean | null; registrado_em: string | null; sistema: number | null; observacao: string | null; criado_por_mim: boolean };
const TOL_PADRAO = 5;
function classe(cont: number, sis: number, tol: number) { if (!sis) return cont === 0 ? "OK" : "POS"; const d = ((cont - sis) / sis) * 100; return Math.abs(d) <= tol ? "OK" : d > 0 ? "POS" : "NEG"; }
const ROT_CLASSE: Record<string, [string, string]> = { OK: ["DENTRO DA TOLERÂNCIA", "bg-emerald-100 text-emerald-800"], POS: ["DIVERGÊNCIA (+)", "bg-amber-100 text-amber-800"], NEG: ["DIVERGÊNCIA (−)", "bg-red-100 text-red-700"] };

/** Sinal sonoro + vibração (celular) como na Contagem Cíclica. */
function feedback(tipo: "ok" | "divergente" | "erro" | "salvo") {
  try { if (tipo === "ok") sounds.success(); else if (tipo === "divergente") sounds.divergente(); else if (tipo === "erro") sounds.error(); else sounds.scan(); } catch { /* sem áudio */ }
  try { navigator.vibrate?.(tipo === "ok" ? 80 : tipo === "divergente" ? [200, 100, 200, 100, 350] : tipo === "erro" ? [400] : 40); } catch { /* sem vibração */ }
}

/** Lista de contagem no modelo da Contagem Cíclica: um SKU por linha, contagem por lote, trânsito, baixas em aprovação e status. */
function Conferencia({ inv, fase, aberta }: { inv: any; fase: "contagem" | "recontagem"; aberta: boolean }) {
  const qc = useQueryClient(); const tol = Number(inv.tolerancia_pct ?? TOL_PADRAO);
  const q = useQuery({ queryKey: ["inv-tarefas", inv.id, fase], queryFn: async () => { const r = await sb.rpc("inv_minhas_tarefas", { p_inv: inv.id, p_fase: fase }); if (r.error) throw r.error; return (r.data ?? []) as Linha[]; } });
  const linhas = q.data ?? []; const skus = useMemo(() => [...new Set(linhas.map((l) => l.codigo_produto))], [linhas]);
  const extras = useQuery({ queryKey: ["inv-extras", inv.id, skus.join(",")], enabled: skus.length > 0, staleTime: 60_000, queryFn: async () => {
    const fam = new Map<string, string>(), baixas = new Map<string, number>();
    for (let k = 0; k < skus.length; k += 200) {
      const lote = skus.slice(k, k + 200);
      const [f, b] = await Promise.all([sb.from("familias").select("codigo_produto, familia").in("codigo_produto", lote), sb.from("baixa_operacional").select("codigo_produto, quantidade").in("status_fluxo", ["PENDENTE", "AGUARDANDO_ADMIN"]).eq("id_local", inv.almoxarifado).in("codigo_produto", lote)]);
      for (const x of f.data ?? []) fam.set(x.codigo_produto, x.familia); for (const x of b.data ?? []) baixas.set(x.codigo_produto, (baixas.get(x.codigo_produto) ?? 0) + Number(x.quantidade || 0));
    }
    let transito = new Map<string, TransitoMissao>();
    try {
      const [notas, lojas, cfg] = await Promise.all([fetchAll<NotaTransitoMissao>((a, z) => sb.from("notas_transferencia_recebimento").select("cod_prod, almox, qtd, nr_nf, lote, recebimento, nota_cancelada").eq("recebimento", "Pendente").or("nota_cancelada.is.null,nota_cancelada.neq.S").order("id").range(a, z)),
        sb.from("abast_lojas").select("codigo, almoxarifado"), sb.from("abast_config").select("valor").eq("chave", "cd_almoxarifado").maybeSingle()]);
      transito = somarTransitoMissao(notas, inv.almoxarifado, skus, lojas.data ?? [], String(cfg.data?.valor || "Alm_SP_Fabrica"));
    } catch { /* trânsito é informativo */ }
    return { fam, baixas, transito };
  } });
  const [busca, setBusca] = useState(""); const [fGrupo, setFGrupo] = useState(""); const [fFam, setFFam] = useState(""); const [fStatus, setFStatus] = useState("");
  const [val, setVal] = useState<Record<string, string>>({}); const [ident, setIdent] = useState<Record<string, boolean>>({}); const [obs, setObs] = useState<Record<string, string>>({});
  const [novoLote, setNovoLote] = useState<Record<string, { lote: string; qtd: string } | undefined>>({}); const [add, setAdd] = useState(false);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["inv-tarefas", inv.id, fase] });
  const verSistema = linhas.some((l) => l.sistema != null);

  const porSku = useMemo(() => { const m = new Map<string, Linha[]>(); for (const l of linhas) m.set(l.codigo_produto, [...(m.get(l.codigo_produto) ?? []), l]); return [...m].map(([sku, ls]) => {
    const contadas = ls.filter((l) => l.qtd != null), total = contadas.reduce((a, l) => a + Number(l.qtd), 0), sis = ls.reduce((a, l) => a + Number(l.sistema ?? 0), 0);
    const pend = contadas.length < ls.length, st = pend ? "PENDENTE" : !verSistema ? "CONTADO" : classe(total, sis, tol) === "OK" ? "ACURADO" : "DIVERGENTE";
    return { sku, ls, desc: ls[0].descricao, grupo: ls[0].grupo, total, sis, st, ident: ls.find((l) => l.identificado != null)?.identificado ?? null, obs: ls.find((l) => l.observacao)?.observacao ?? "" }; }); }, [linhas, verSistema, tol]);
  const k = useMemo(() => { const conf = porSku.filter((x) => x.st !== "PENDENTE"), acur = porSku.filter((x) => x.st === "ACURADO"), div = porSku.filter((x) => x.st === "DIVERGENTE");
    return { total: porSku.length, pend: porSku.length - conf.length, conf: conf.length, acur: acur.length, div: div.length, pct: porSku.length ? Math.round((conf.length / porSku.length) * 100) : 0, ac: verSistema ? acuracidadePorItem(porSku) : null }; }, [porSku, verSistema]);
  const grupos = [...new Set(porSku.map((x) => x.grupo || "Sem grupo"))].sort(), familias = [...new Set(porSku.map((x) => extras.data?.fam.get(x.sku)).filter(Boolean) as string[])].sort();
  const lista = porSku.filter((x) => (!busca || `${x.sku} ${x.desc} ${x.ls.map((l) => l.lote).join(" ")}`.toLowerCase().includes(busca.toLowerCase())) && (!fGrupo || (x.grupo || "Sem grupo") === fGrupo) && (!fFam || extras.data?.fam.get(x.sku) === fFam) && (!fStatus || x.st === fStatus));

  async function salvarLinha(l: Linha, identSku: boolean | null) {
    const v = val[l.id]; if (v == null) return; const qtd = Number(String(v).replace(",", "."));
    if (v === "" || !(qtd >= 0)) { feedback("erro"); return toast.error("Quantidade inválida."); }
    if (fase === "recontagem" && identSku == null) { feedback("erro"); return toast.error("Marque se o produto foi identificado na 2ª contagem (Sim/Não)."); }
    const r = await sb.rpc("inv_registrar", { p_item: l.id, p_fase: fase, p_qtd: qtd, p_identificado: fase === "recontagem" ? identSku : null, p_obs: null });
    if (r.error) { feedback("erro"); return toast.error(r.error.message); }
    if (r.data === "OK") { feedback("ok"); toast.success("Dentro da tolerância"); }
    else if (r.data === "DIVERGENTE") { feedback("divergente"); toast.warning(fase === "recontagem" ? "Ainda divergente — confira antes de seguir" : "Divergência — reconfira a contagem deste SKU"); }
    else feedback("salvo");
    setVal((s) => { const n = { ...s }; delete n[l.id]; return n; }); recarregar();
  }
  async function salvarObs(x: typeof porSku[number]) { const o = obs[x.sku]; if (o == null) return; const r = await sb.rpc("inv_registrar", { p_item: x.ls[0].id, p_fase: fase, p_qtd: null, p_identificado: null, p_obs: o }); if (r.error) return toast.error(r.error.message); recarregar(); }
  async function salvarNovoLote(x: typeof porSku[number]) {
    const n = novoLote[x.sku]; if (!n) return; const qtd = Number(n.qtd.replace(",", ".")); if (!n.lote.trim() || n.qtd === "" || !(qtd >= 0)) { feedback("erro"); return toast.error("Informe lote e quantidade."); }
    const idt = ident[x.sku] ?? x.ident; if (fase === "recontagem" && idt == null) return toast.error("Marque se o produto foi identificado na 2ª contagem.");
    const r = await sb.rpc("inv_adicionar_manual", { p_inv: inv.id, p_codigo: x.sku, p_lote: n.lote.trim(), p_qtd: qtd, p_fase: fase, p_identificado: fase === "recontagem" ? idt : null });
    if (r.error) { feedback("erro"); return toast.error(r.error.message); } feedback("salvo"); setNovoLote({ ...novoLote, [x.sku]: undefined }); recarregar();
  }
  async function remover(l: Linha) { if (!confirm(`Remover o lote ${l.lote || "(sem lote)"} incluído manualmente?`)) return; const r = await sb.rpc("inv_remover_manual", { p_item: l.id }); if (r.error) return toast.error(r.error.message); recarregar(); }
  async function concluir() { if (k.pend > 0 && !confirm(`Faltam ${k.pend} SKU(s). Concluir mesmo assim?`)) return; const r = await sb.rpc("inv_concluir", { p_inv: inv.id, p_fase: fase }); if (r.error) return toast.error(r.error.message); toast.success("Etapa da sua dupla concluída."); }
  function exportar() {
    const cab = ["SKU", "Produto", "Grupo", "Família", "Lote", ...(verSistema ? ["Sistema"] : []), "Contado", ...(fase === "recontagem" ? ["Identificado na 2ª"] : []), "Observação"];
    const rows = linhas.map((l) => [l.codigo_produto, l.descricao, l.grupo ?? "", extras.data?.fam.get(l.codigo_produto) ?? "", l.lote, ...(verSistema ? [l.sistema ?? ""] : []), l.qtd ?? "", ...(fase === "recontagem" ? [l.identificado == null ? "" : l.identificado ? "Sim" : "Não"] : []), l.observacao ?? ""]);
    const csv = [cab, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `inventario-${inv.numero}-${fase}.csv`; a.click();
  }
  const Kpi = ({ t, v, tom = "" }: { t: string; v: string; tom?: string }) => <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm"><div className="text-[10px] font-semibold uppercase text-muted-foreground">{t}</div><div className={`text-2xl font-bold tabular-nums ${tom}`}>{v}</div></div>;
  const ST: Record<string, string> = { PENDENTE: "bg-slate-200 text-slate-700", CONTADO: "bg-sky-100 text-sky-800", ACURADO: "bg-emerald-100 text-emerald-800", DIVERGENTE: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={exportar}><Download className="mr-1 size-4" />Baixar Excel</Button>
        {aberta && <Button size="sm" variant="outline" onClick={() => setAdd(true)}><PackagePlus className="mr-1 size-4" />Produto fora da lista</Button>}
        {aberta && k.total > 0 && <Button size="sm" onClick={concluir}><Check className="mr-1 size-4" />Concluir {fase === "recontagem" ? "recontagem" : "contagem"} da dupla</Button>}
        <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs">Contagem restrita ao almoxarifado <b>{inv.almoxarifado}</b>{verSistema ? " · você vê o saldo (administrador)" : " · contagem cega"}</span>
      </div>
      {!aberta && <p className="rounded-md bg-muted p-2 text-xs">{fase === "recontagem" ? "A recontagem abre quando a gestão encerra a 1ª contagem." : inv.status === "planejado" ? `A lista será gerada em ${dataHora(inv.data_geracao)}.` : "A contagem está encerrada para lançamentos."}</p>}
      {fase === "recontagem" && <p className="text-xs text-muted-foreground">SKUs com divergência na 1ª contagem, feita por outra dupla. Conte sem consultar a contagem anterior; a sua quantidade vira a contagem final oficial.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi t="Total SKU" v={String(k.total)} /><Kpi t="Pendentes" v={String(k.pend)} /><Kpi t={fase === "recontagem" ? "Recontados" : "Conferidos"} v={String(k.conf)} />
        <Kpi t="Divergentes" v={verSistema ? String(k.div) : "—"} tom="text-red-600" /><Kpi t="Acurados" v={verSistema ? String(k.acur) : "—"} tom="text-emerald-700" />
        <Kpi t="% Concluído" v={`${k.pct}%`} tom="text-teal-700" /><Kpi t="Acuracidade" v={k.ac != null ? `${k.ac}%` : "—"} />
      </div>
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between"><b>{fase === "recontagem" ? "Itens a recontar" : "Itens a contar"}</b><span className="text-sm text-muted-foreground">{k.conf} de {k.total} · {k.pct}%</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar SKU, produto ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g}>{g}</option>)}</select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={fFam} onChange={(e) => setFFam(e.target.value)}><option value="">Todas as famílias</option>{familias.map((g) => <option key={g}>{g}</option>)}</select>
          <span className="text-xs text-muted-foreground">Status:</span>{(verSistema ? ["PENDENTE", "ACURADO", "DIVERGENTE"] : ["PENDENTE", "CONTADO"]).map((s) => <button key={s} onClick={() => setFStatus(fStatus === s ? "" : s)} className={`h-8 rounded-full border px-3 text-xs font-semibold ${fStatus === s ? "bg-slate-900 text-white" : "bg-muted"}`}>{s[0] + s.slice(1).toLowerCase()}</button>)}
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b text-xs text-muted-foreground"><tr>
          <th className="px-2 py-2 text-left">SKU</th><th className="px-2 py-2 text-left">Produto</th><th className="px-2 py-2 text-right">Estoque em trânsito</th><th className="px-2 py-2 text-right">Baixa em aprovação</th>{verSistema && <th className="px-2 py-2 text-right">Sistema</th>}<th className="px-2 py-2 text-left">Contagem por lote</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
          <tbody>{lista.map((x) => { const idt = ident[x.sku] ?? x.ident; const tr = extras.data?.transito.get(x.sku), bx = extras.data?.baixas.get(x.sku); return (
            <tr key={x.sku} className="border-b align-top">
              <td className="px-2 py-3 font-mono text-xs">{x.sku}{x.grupo && <div className="mt-1 inline-block rounded bg-muted px-1 font-sans text-[10px]">{x.grupo}</div>}</td>
              <td className="px-2 py-3">{x.desc}{extras.data?.fam.get(x.sku) && <div className="text-[11px] text-muted-foreground">{extras.data.fam.get(x.sku)}</div>}</td>
              <td className="px-2 py-3 text-right tabular-nums" title={tr?.detalhes.join("\n")}>{tr ? num(tr.qtd) : "0"}</td>
              <td className="px-2 py-3 text-right tabular-nums">{bx ? num(bx) : "—"}</td>
              {verSistema && <td className="px-2 py-3 text-right font-semibold tabular-nums">{num(x.sis)}</td>}
              <td className="w-[300px] px-2 py-3"><div className="space-y-2">
                {fase === "recontagem" && <div className="flex items-center gap-1 text-[11px]"><span className="text-muted-foreground">Identificado na 2ª contagem?</span>{[true, false].map((b) => <button key={String(b)} disabled={!aberta} onClick={() => setIdent({ ...ident, [x.sku]: b })} className={`rounded-md border px-2 py-0.5 font-semibold ${idt === b ? (b ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : ""}`}>{b ? "Sim" : "Não"}</button>)}</div>}
                {x.ls.map((l) => { const c = l.qtd != null && l.sistema != null ? classe(Number(l.qtd), Number(l.sistema), tol) : null; return (
                  <div key={l.id} className="rounded-lg border p-2">
                    <div className="flex items-center gap-2"><span className="flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-[11px]">{l.lote || "sem lote"}</span>{l.origem_item === "manual" && aberta && l.criado_por_mim && <button onClick={() => remover(l)} title="Remover lote manual"><Trash2 className="size-4 text-muted-foreground" /></button>}</div>
                    <Input disabled={!aberta} inputMode="decimal" className="mt-1 h-9 w-32" placeholder="Qtd" value={val[l.id] ?? (l.qtd != null ? String(l.qtd) : "")} onChange={(e) => setVal({ ...val, [l.id]: e.target.value })} onBlur={() => salvarLinha(l, idt)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    {l.sistema != null && <div className="mt-1 text-[11px] text-muted-foreground">Saldo Sistema: <b>{num(l.sistema)}</b></div>}
                    {c && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${ROT_CLASSE[c][1]}`}>{ROT_CLASSE[c][0]}</span>}
                    {l.origem_item === "manual" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">lote manual</span>}
                  </div>); })}
                {aberta && (novoLote[x.sku] ? <div className="flex gap-1"><Input className="h-8" placeholder="Lote" value={novoLote[x.sku]!.lote} onChange={(e) => setNovoLote({ ...novoLote, [x.sku]: { ...novoLote[x.sku]!, lote: e.target.value } })} /><Input className="h-8 w-20" placeholder="Qtd" value={novoLote[x.sku]!.qtd} onChange={(e) => setNovoLote({ ...novoLote, [x.sku]: { ...novoLote[x.sku]!, qtd: e.target.value } })} /><Button size="sm" onClick={() => salvarNovoLote(x)}>OK</Button></div>
                  : <Button size="sm" variant="secondary" className="w-full" onClick={() => setNovoLote({ ...novoLote, [x.sku]: { lote: "", qtd: "" } })}><Plus className="mr-1 size-4" />Adicionar lote manual</Button>)}
                <div className="text-[11px] text-muted-foreground">Total contado: <b>{num(x.total)}</b>{verSistema && <> · Total Sistema: <b>{num(x.sis)}</b></>}</div>
                <Input disabled={!aberta} className="h-8 text-xs" placeholder="Observação desta linha" value={obs[x.sku] ?? x.obs} onChange={(e) => setObs({ ...obs, [x.sku]: e.target.value })} onBlur={() => salvarObs(x)} />
              </div></td>
              <td className="px-2 py-3"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${ST[x.st]}`}>{x.st}</span></td>
            </tr>); })}</tbody></table></div>
        {!q.isLoading && !k.total && <p className="py-6 text-center text-sm text-muted-foreground">{fase === "recontagem" ? "Nenhum item para a sua dupla recontar." : "Nenhum item na lista da sua dupla."}</p>}
      </CardContent></Card>
      <AdicionarManual inv={inv} fase={fase} aberto={add} onFechar={() => setAdd(false)} onOk={recarregar} />
    </div>
  );
}

function AdicionarManual({ inv, fase, aberto, onFechar, onOk }: { inv: any; fase: string; aberto: boolean; onFechar: () => void; onOk: () => void }) {
  const [termo, setTermo] = useState(""); const [res, setRes] = useState<any[]>([]); const [sel, setSel] = useState<any>(null); const [lote, setLote] = useState(""); const [qtd, setQtd] = useState(""); const [ident, setIdent] = useState(true);
  async function buscar() {
    if (termo.trim().length < 2) return;
    const t = termo.trim().replace(/[%,]/g, "");
    const [a, e] = await Promise.all([sb.from("atlas_produtos").select("sku, descricao, unidade").or(`sku.ilike.%${t}%,descricao.ilike.%${t}%`).limit(25), sb.from("estoque_sistemico").select("id_produto, descricao, unidade").or(`id_produto.ilike.%${t}%,descricao.ilike.%${t}%`).limit(25)]);
    const m = new Map<string, any>(); for (const x of a.data ?? []) m.set(x.sku, { codigo: x.sku, descricao: x.descricao, unidade: x.unidade }); for (const x of e.data ?? []) if (!m.has(x.id_produto)) m.set(x.id_produto, { codigo: x.id_produto, descricao: x.descricao, unidade: x.unidade });
    setRes([...m.values()]);
  }
  async function incluir() {
    const n = Number(qtd.replace(",", ".")); if (!sel || !(n >= 0) || qtd === "") return toast.error("Escolha o produto e informe a quantidade.");
    const r = await sb.rpc("inv_adicionar_manual", { p_inv: inv.id, p_codigo: sel.codigo, p_lote: lote.trim(), p_qtd: n, p_fase: fase, p_identificado: fase === "recontagem" ? ident : null });
    if (r.error) return toast.error(r.error.message); toast.success("Produto incluído na lista da sua dupla."); setSel(null); setTermo(""); setRes([]); setLote(""); setQtd(""); onOk(); onFechar();
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Incluir produto fora da lista</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Busca em todo o cadastro, inclusive produtos zerados ou sem estoque neste almoxarifado.</p>
      <div className="flex gap-2"><Input placeholder="Código ou descrição" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} /><Button variant="outline" onClick={buscar}><Search className="size-4" /></Button></div>
      <div className="max-h-56 divide-y overflow-y-auto rounded border">{res.map((p) => <button key={p.codigo} onClick={() => setSel(p)} className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-muted ${sel?.codigo === p.codigo ? "bg-muted font-semibold" : ""}`}>{p.codigo} · {p.descricao}</button>)}</div>
      {sel && <div className="grid grid-cols-2 gap-2"><Input placeholder="Lote (opcional)" value={lote} onChange={(e) => setLote(e.target.value)} /><Input placeholder="Quantidade contada" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
        {fase === "recontagem" && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={ident} onChange={(e) => setIdent(e.target.checked)} />Produto identificado na 2ª contagem</label>}</div>}
      <div className="flex justify-end"><Button onClick={incluir} disabled={!sel}>Incluir</Button></div>
    </DialogContent></Dialog>
  );
}

function Painel({ inv, duplas }: { inv: any; duplas: any[] }) {
  const q = useQuery({ queryKey: ["inv-painel", inv.id], refetchInterval: 30000, queryFn: async () => {
    const [it, us] = await Promise.all([fetchAll<any>((f, t) => sb.from("inv_itens").select("*").eq("inventario_id", inv.id).order("grupo").order("descricao").range(f, t)), sb.from("profiles").select("id, nome, email")]);
    return { itens: it as any[], usuarios: new Map(((us.data ?? []) as Usuario[]).map((u) => [u.id, u])) };
  } });
  const [filtro, setFiltro] = useState("todos");
  const { isAdmin } = useRole();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [eQtd, setEQtd] = useState(""); const [eObs, setEObs] = useState(""); const [salvando, setSalvando] = useState(false);
  function abrirEdicao(i: any) { setEdit(i); setEQtd(i.qtd_final != null ? String(i.qtd_final) : ""); setEObs(i.observacao ?? ""); }
  async function salvarEdicao() {
    const n = Number(eQtd.replace(",", "."));
    if (!edit || eQtd.trim() === "" || !Number.isFinite(n) || n < 0) return toast.error("Informe uma quantidade válida.");
    setSalvando(true);
    const novo = { qtd_final: n, observacao: eObs.trim() || null, divergente: n !== Number(edit.qtd_sistema) };
    const { error } = await sb.from("inv_itens").update(novo).eq("id", edit.id);
    if (!error) { const u = await sb.auth.getUser(); await sb.from("auditoria").insert({ entidade: "inv_itens", entidade_id: edit.id, acao: "EDICAO_ADMIN", usuario: u.data.user?.id, dados_antes: { qtd_final: edit.qtd_final, observacao: edit.observacao }, observacao: `Inventário #${inv.numero}: ${edit.codigo_produto} lote ${edit.lote || "—"} final ${edit.qtd_final ?? "—"} → ${n}` }); }
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Item atualizado."); setEdit(null); qc.invalidateQueries({ queryKey: ["inv-painel", inv.id] });
  }
  if (!q.data) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  const it = q.data.itens, nomeD = new Map(duplas.map((d) => [d.id, d.nome]));
  const contados = it.filter((i) => i.qtd_contagem != null).length, div = it.filter((i) => i.divergente).length, rec = it.filter((i) => i.divergente && i.qtd_recontagem != null).length;
  const sim = it.filter((i) => i.identificado_recontagem === true).length, nao = it.filter((i) => i.identificado_recontagem === false).length;
  const finais = it.filter((i) => i.qtd_final != null), certos = finais.filter((i) => Number(i.qtd_final) === Number(i.qtd_sistema)).length;
  const valorDif = finais.reduce((s, i) => s + (Number(i.qtd_final) - Number(i.qtd_sistema)) * (Number(i.custo_unitario) || 0), 0);
  const lista = it.filter((i) => filtro === "todos" || (filtro === "divergentes" ? i.divergente : filtro === "pendentes" ? (i.qtd_contagem == null || (i.divergente && i.qtd_recontagem == null)) : i.origem_item === "manual"));
  function exportar() {
    const cab = ["Grupo", "Código", "Produto", "Lote", "Origem", "Dupla contagem", "Sistema", "1ª contagem", "Divergente", "Dupla recontagem", "2ª contagem", "Identificado na 2ª", "Final oficial", "Diferença", "Custo unit.", "Diferença R$"];
    const linhas = it.map((i) => [i.grupo, i.codigo_produto, i.descricao, i.lote, i.origem_item, nomeD.get(i.dupla_id) ?? "", i.qtd_sistema, i.qtd_contagem ?? "", i.divergente == null ? "" : i.divergente ? "Sim" : "Não", nomeD.get(i.dupla_recontagem_id) ?? "", i.qtd_recontagem ?? "", i.identificado_recontagem == null ? "" : i.identificado_recontagem ? "Sim" : "Não", i.qtd_final ?? "", i.qtd_final == null ? "" : Number(i.qtd_final) - Number(i.qtd_sistema), i.custo_unitario ?? "", i.qtd_final == null || i.custo_unitario == null ? "" : ((Number(i.qtd_final) - Number(i.qtd_sistema)) * Number(i.custo_unitario)).toFixed(2)]);
    const csv = [cab, ...linhas].map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `inventario-${inv.numero}.csv`; a.click();
  }
  const Kpi = ({ t, v, s }: { t: string; v: string; s?: string }) => <div className="rounded-xl border border-l-4 border-l-slate-800 bg-card p-3 shadow-sm"><div className="text-[10px] font-semibold uppercase text-muted-foreground">{t}</div><div className="text-xl font-bold tabular-nums">{v}</div>{s && <div className="text-[11px] text-muted-foreground">{s}</div>}</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi t="Itens na lista" v={num(it.length, 0)} s={`${it.filter((i) => i.origem_item === "manual").length} incluídos manualmente`} />
        <Kpi t="1ª contagem" v={`${it.length ? Math.round((contados / it.length) * 100) : 0}%`} s={`${contados} de ${it.length}`} />
        <Kpi t="Divergências" v={num(div, 0)} s={inv.apurado_em ? `apuradas em ${dataHora(inv.apurado_em)}` : "apuradas ao encerrar a contagem"} />
        <Kpi t="Recontagem" v={`${rec}/${div}`} s={`identificado: ${sim} sim · ${nao} não`} />
        <Kpi t="Acurácia final" v={finais.length ? `${Math.round((certos / finais.length) * 1000) / 10}%` : "—"} s="itens em que a contagem final = sistema" />
        <Kpi t="Diferença final (R$)" v={valorDif.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} s="final − sistema, pelo custo" />
      </div>
      <Card><CardContent className="p-3"><div className="mb-2 text-xs font-bold">Duplas</div>
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Dupla", "Integrantes", "Papel", "Contagem", "Recontagem"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{duplas.map((d) => { const c = it.filter((i) => i.dupla_id === d.id), r = it.filter((i) => i.dupla_recontagem_id === d.id); return (
            <tr key={d.id} className="border-t"><td className="px-2 py-1 font-semibold">{d.nome}</td><td className="px-2 py-1 text-xs">{[d.membro1, d.membro2].filter(Boolean).map((u: string) => nomeUsuario(q.data!.usuarios.get(u))).join(" e ")}</td><td className="px-2 py-1 text-xs">{[d.conta && "conta", d.reconta && "reconta"].filter(Boolean).join(" · ")}</td>
              <td className="px-2 py-1 text-xs tabular-nums">{d.conta ? `${c.filter((i) => i.qtd_contagem != null).length}/${c.length}${d.contagem_concluida_em ? " · concluída" : ""}` : "—"}</td><td className="px-2 py-1 text-xs tabular-nums">{d.reconta ? `${r.filter((i) => i.qtd_recontagem != null).length}/${r.length}${d.recontagem_concluida_em ? " · concluída" : ""}` : "—"}</td></tr>); })}</tbody></table></CardContent></Card>
      <Card><CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1">{[["todos", "Todos"], ["divergentes", "Divergentes"], ["pendentes", "Pendentes"], ["manuais", "Incluídos manualmente"]].map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} className={`h-7 rounded-md border px-2 text-xs font-semibold ${filtro === v ? "bg-slate-900 text-white" : ""}`}>{l}</button>)}
          <Button size="sm" variant="outline" className="ml-auto" onClick={exportar}><Download className="mr-1 size-4" />Exportar CSV</Button></div>
        <div className="max-h-[520px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{["Produto", "Lote", "Dupla", "Sistema", "1ª", "Div.", "Recontagem", "2ª", "Ident.", "Final", "Dif.", ...(isAdmin ? [""] : [])].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{lista.map((i) => { const dif = i.qtd_final == null ? null : Number(i.qtd_final) - Number(i.qtd_sistema); return (
            <tr key={i.id} className="border-t"><td className="px-2 py-1">{i.codigo_produto} · {i.descricao}{i.origem_item === "manual" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">manual</span>}</td><td className="px-2 py-1">{i.lote || "—"}</td><td className="px-2 py-1">{nomeD.get(i.dupla_id) ?? "—"}</td>
              <td className="px-2 py-1 tabular-nums">{num(i.qtd_sistema)}</td><td className="px-2 py-1 tabular-nums">{num(i.qtd_contagem)}</td><td className="px-2 py-1">{i.divergente == null ? "" : i.divergente ? "⚠" : "✓"}</td><td className="px-2 py-1">{nomeD.get(i.dupla_recontagem_id) ?? ""}</td>
              <td className="px-2 py-1 tabular-nums">{num(i.qtd_recontagem)}</td><td className="px-2 py-1">{i.identificado_recontagem == null ? "" : i.identificado_recontagem ? "Sim" : "Não"}</td><td className="px-2 py-1 font-semibold tabular-nums">{num(i.qtd_final)}</td>
              <td className={`px-2 py-1 tabular-nums ${dif != null && dif < 0 ? "text-red-600" : dif ? "text-sky-700" : ""}`}>{dif == null ? "" : `${dif > 0 ? "+" : ""}${num(dif)}`}</td>{isAdmin && <td className="px-1 py-1"><button aria-label="Editar item" title="Editar (administrador)" onClick={() => abrirEdicao(i)} className="rounded p-1 hover:bg-muted"><Pencil className="size-3.5" /></button></td>}</tr>); })}</tbody></table></div>
      </CardContent></Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>Editar item do inventário</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3 text-sm">
            <p><b>{edit.codigo_produto}</b> · {edit.descricao}<br /><span className="text-xs text-muted-foreground">Lote {edit.lote || "—"} · Sistema {num(edit.qtd_sistema)}</span></p>
            <label className="block text-xs font-semibold">Quantidade final oficial<Input inputMode="decimal" className="mt-1" value={eQtd} onChange={(e) => setEQtd(e.target.value)} /></label>
            <label className="block text-xs font-semibold">Observação<Input className="mt-1" value={eObs} onChange={(e) => setEObs(e.target.value)} /></label>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={salvarEdicao} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
