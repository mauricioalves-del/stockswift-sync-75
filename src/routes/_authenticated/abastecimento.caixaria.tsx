import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Trash2, Download, Plus, ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarCaixaria, idCanonico, type LinhaCaixaria } from "@/lib/abastecimento-caixaria";
import { passaFiltros, proximaOrdem, comparar, opcoesCategoria, filtroAtivo, type ColDef, type Filtro, type Ordem } from "@/lib/tabela-filtro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/caixaria")({
  component: CaixariaPage,
  head: () => ({ meta: [{ title: "Caixaria e Exposição — Abastecimento" }] }),
});

const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function CaixariaPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();
  const bruto = useAbastBruto(pode);
  const lojas = bruto.data?.lojas ?? [];
  const [quick, setQuick] = useState<"TODOS" | "SEM_CAIXA" | "SEM_EXPO" | "FORA">("TODOS");
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [filtros, setFiltros] = useState<Record<string, Filtro>>({});
  const [novo, setNovo] = useState({ sku: "", descricao: "", caixa: "" });
  const [criando, setCriando] = useState(false);

  const todas = useMemo(() => (bruto.data ? montarCaixaria(bruto.data) : []), [bruto.data]);
  const cols: ColDef<LinhaCaixaria>[] = useMemo(() => [
    { k: "sku", r: "SKU", t: "txt", v: (l) => l.id },
    { k: "produto", r: "Produto", t: "txt", v: (l) => l.descricao },
    { k: "familia", r: "Família", t: "cat", v: (l) => l.familia || "(sem família)" },
    { k: "cadastro", r: "Cadastro", t: "cat", v: (l) => (l.caixa == null ? (l.solto ? "Solto (granel)" : "Sem caixa") : l.noUniverso ? "Com caixa" : "Fora do universo") },
    { k: "saldocd", r: "Saldo CD", t: "num", al: "right", v: (l) => l.saldoCD },
    { k: "caixa", r: "Unid./caixa", t: "num", al: "right", v: (l) => l.caixa },
    ...lojas.map((x) => ({ k: "expo_" + x.codigo, r: "Expo. " + x.nome.replace(/^Loja /, ""), t: "num" as const, al: "right" as const, v: (l: LinhaCaixaria) => l.expo[x.codigo]?.valor ?? null })),
  ], [lojas]);

  const baseLinhas = useMemo(() => todas.filter((l) => quick === "TODOS" ? true : quick === "SEM_CAIXA" ? l.caixa == null && !l.solto : quick === "SEM_EXPO" ? lojas.some((x) => l.expo[x.codigo]?.valor == null) : !l.noUniverso), [todas, quick, lojas]);
  const linhas = useMemo(() => {
    const col = ordem ? cols.find((c) => c.k === ordem.k) : undefined;
    return baseLinhas.filter((l) => passaFiltros(l, cols, filtros)).sort((a, b) => (col && ordem ? comparar(a, b, col, ordem.dir) : 0));
  }, [baseLinhas, filtros, ordem, cols]);
  const nFiltros = Object.values(filtros).filter((f) => filtroAtivo(f)).length;
  const semCaixa = todas.filter((l) => l.caixa == null && !l.solto).length;
  const semExpo = todas.filter((l) => lojas.some((x) => l.expo[x.codigo]?.valor == null)).length;
  const fora = todas.filter((l) => !l.noUniverso).length;

  const atualizar = () => qc.invalidateQueries({ queryKey: ["abast-v2"] });
  async function salvarCaixa(l: LinhaCaixaria, n: number | null) {
    if (n === null) return;
    if (!Number.isInteger(n) || n < 1) { toast.error("Informe um número inteiro de unidades por caixa (mínimo 1). Para remover o cadastro, use a lixeira."); return; }
    const { error } = await (supabase as any).from("abast_produto").upsert({ id_produto: l.idCaixaDb ?? l.id, descricao: l.descricao || null, full_case: n, atualizado_em: new Date().toISOString() }, { onConflict: "id_produto" });
    if (error) toast.error("Não consegui salvar a caixa: " + error.message); else { toast.success(`Caixa de ${l.id} salva: ${n} un.`); atualizar(); }
  }
  async function salvarExpo(l: LinhaCaixaria, loja: string, n: number | null) {
    if (n !== null && n < 0) { toast.error("A exposição não pode ser negativa."); return; }
    const { error } = await (supabase as any).from("abast_produto_loja").upsert({ loja, id_produto: l.expo[loja]?.idDb ?? l.id, exposicao: n, atualizado_em: new Date().toISOString() }, { onConflict: "loja,id_produto" });
    if (error) toast.error("Não consegui salvar a exposição: " + error.message); else { toast.success(n === null ? `Exposição de ${l.id} removida.` : `Exposição de ${l.id} salva: ${n} un.`); atualizar(); }
  }
  async function excluir(l: LinhaCaixaria) {
    if (!l.idCaixaDb) return;
    if (!window.confirm(`Excluir a caixaria de ${l.id} (${l.descricao || "sem descrição"})?\n\nO item volta a ser tratado como "sem caixa" (1 unidade) na Reposição. A exposição por loja não é apagada.`)) return;
    const { error } = await (supabase as any).from("abast_produto").delete().eq("id_produto", l.idCaixaDb);
    if (error) toast.error("Não consegui excluir: " + error.message); else { toast.success(`Caixaria de ${l.id} excluída.`); atualizar(); }
  }
  async function criar() {
    const sku = novo.sku.trim(); const n = Number(novo.caixa.replace(",", "."));
    if (!sku) { toast.error("Informe o SKU."); return; }
    if (!Number.isInteger(n) || n < 1) { toast.error("Informe um número inteiro de unidades por caixa (mínimo 1)."); return; }
    const k = sku.replace(/^0+/, "");
    const ja = todas.find((l) => l.chave === k);
    const id = ja?.idCaixaDb ?? ja?.id ?? idCanonico(k, bruto.data?.estoque.find((e) => e.id_produto.replace(/^0+/, "") === k)?.id_produto);
    setCriando(true);
    const { error } = await (supabase as any).from("abast_produto").upsert({ id_produto: id, descricao: novo.descricao.trim() || ja?.descricao || null, full_case: n, atualizado_em: new Date().toISOString() }, { onConflict: "id_produto" });
    setCriando(false);
    if (error) toast.error("Não consegui cadastrar: " + error.message);
    else { toast.success(ja?.caixa != null ? `Caixa de ${id} atualizada para ${n} un.` : `Caixaria de ${id} cadastrada: ${n} un.`); setNovo({ sku: "", descricao: "", caixa: "" }); atualizar(); }
  }
  function exportar() {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["SKU", "Produto", "Família", "Cadastro", "Saldo CD", "Unidades por caixa", ...lojas.map((x) => "Exposição " + x.nome)];
    const corpo = linhas.map((l) => [l.id, l.descricao, l.familia, l.caixa == null ? (l.solto ? "Solto (granel)" : "Sem caixa") : "Com caixa", String(l.saldoCD).replace(".", ","), l.caixa ?? "", ...lojas.map((x) => l.expo[x.codigo]?.valor ?? "")].map(esc).join(";"));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "Caixaria_Exposicao.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="size-6" /> Caixaria e Exposição</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro das <strong>unidades por caixa</strong> (a Reposição sugere em caixa fechada) e da <strong>exposição por loja</strong> (unidades que ficam na vitrine e não contam como vendável). Vale para produto acabado com meta no consenso. {isAdmin ? "Edite direto nas células (Enter ou sair do campo salva); a lixeira exclui a caixaria do item." : "Somente o administrador edita; você pode consultar e exportar."}
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi t="Itens na lista" v={String(todas.length)} />
        <Kpi t="Sem caixa cadastrada" v={String(semCaixa)} tom={semCaixa > 0 ? "text-amber-600" : ""} />
        <Kpi t="Sem exposição em alguma loja" v={String(semExpo)} tom={semExpo > 0 ? "text-amber-600" : ""} />
        <Kpi t="Fora do universo (excluir?)" v={String(fora)} />
      </div>

      {isAdmin && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Novo item de caixaria</CardTitle><CardDescription>Cadastra (ou atualiza) as unidades por caixa de um SKU, mesmo que ele ainda não apareça na lista.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div><div className="text-xs text-muted-foreground mb-1">SKU</div><Input className="w-40" placeholder="ex.: 05104027" value={novo.sku} onChange={(e) => setNovo({ ...novo, sku: e.target.value })} /></div>
            <div className="flex-1 min-w-[220px]"><div className="text-xs text-muted-foreground mb-1">Descrição (opcional)</div><Input placeholder="se vazio, usa a do estoque" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Unidades por caixa</div><Input className="w-32" inputMode="numeric" placeholder="ex.: 50" value={novo.caixa} onChange={(e) => setNovo({ ...novo, caixa: e.target.value })} /></div>
            <Button onClick={criar} disabled={criando} className="gap-1"><Plus className="size-4" /> {criando ? "Salvando..." : "Cadastrar"}</Button>
          </CardContent></Card>)}

      <div className="flex flex-wrap items-center gap-2">
        {([["TODOS", "Todos"], ["SEM_CAIXA", `Sem caixa (${semCaixa})`], ["SEM_EXPO", `Sem exposição (${semExpo})`], ["FORA", `Fora do universo (${fora})`]] as const).map(([k, r]) => (
          <button key={k} onClick={() => setQuick(k)} className={`rounded-full border px-3 py-1 text-xs ${quick === k ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>{r}</button>))}
        <span className="text-xs text-muted-foreground">Mostrando <strong>{linhas.length}</strong> de {todas.length}</span>
        {(nFiltros > 0 || ordem) && <button className="rounded-full border px-3 py-1 text-xs hover:bg-muted" onClick={() => { setFiltros({}); setOrdem(null); }}>Limpar filtros e ordem</button>}
        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={exportar}><Download className="size-4" /> CSV</Button>
      </div>

      <Card><CardContent className="p-0"><div className="max-h-[68vh] overflow-auto"><table className="w-full caption-bottom text-sm">
        <thead><tr className="border-b">
          {cols.map((c) => <CabColG key={c.k} col={c} ordem={ordem} onOrdem={() => setOrdem(proximaOrdem(ordem, c))} filtro={filtros[c.k]} onFiltro={(f) => setFiltros({ ...filtros, [c.k]: f })} opcoes={c.t === "cat" ? opcoesCategoria(baseLinhas, c) : []} />)}
          {isAdmin && <th className="sticky top-0 z-20 w-10 bg-card" />}
        </tr></thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={cols.length + 1} className="py-10 text-center text-muted-foreground">{bruto.isLoading ? "Carregando..." : "Nenhum item neste filtro."}</td></tr>}
          {linhas.slice(0, 600).map((l) => (
            <tr key={l.chave} className="border-b hover:bg-muted/40">
              <td className="p-2 font-mono text-xs">{l.id}</td>
              <td className="p-2 max-w-[260px] truncate" title={l.descricao}>{l.descricao || "—"}</td>
              <td className="p-2 text-xs">{l.familia || <span className="text-amber-600">sem família</span>}</td>
              <td className="p-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${l.caixa == null ? (l.solto ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-amber-100 text-amber-800 border-amber-200") : l.noUniverso ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{l.caixa == null ? (l.solto ? "Solto (granel)" : "Sem caixa") : l.noUniverso ? "Com caixa" : "Fora do universo"}</span></td>
              <td className="p-2 text-right">{n1(l.saldoCD)}{l.caixa && l.caixa > 1 ? <span className="ml-1 text-[10px] text-muted-foreground">({Math.floor(l.saldoCD / l.caixa)} cx)</span> : null}</td>
              <td className="p-2 text-right">{isAdmin ? <CelulaNum valor={l.caixa} placeholder="1" titulo="Unidades por caixa fechada" aoSalvar={(n) => salvarCaixa(l, n)} /> : n1(l.caixa)}</td>
              {lojas.map((x) => <td key={x.codigo} className="p-2 text-right">{isAdmin ? <CelulaNum valor={l.expo[x.codigo]?.valor ?? null} placeholder="0" vazioLimpa titulo={`Exposição na loja ${x.nome} (vazio remove)`} aoSalvar={(n) => salvarExpo(l, x.codigo, n)} /> : n1(l.expo[x.codigo]?.valor ?? null)}</td>)}
              {isAdmin && <td className="p-2 text-right">{l.idCaixaDb ? <button type="button" title="Excluir a caixaria deste item" aria-label={`Excluir caixaria de ${l.id}`} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600" onClick={() => excluir(l)}><Trash2 className="size-4" /></button> : null}</td>}
            </tr>))}
        </tbody>
      </table></div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Item sem caixa cadastrada é tratado como caixa de 1 unidade. Granéis são vendidos soltos: não têm padrão de caixa e são pedidos por consumo médio × cobertura. Excluir a caixaria não apaga vendas, estoque nem a exposição.</p>
    </div>
  );
}

function CelulaNum({ valor, aoSalvar, titulo, placeholder, vazioLimpa }: { valor: number | null; aoSalvar: (n: number | null) => Promise<void>; titulo: string; placeholder: string; vazioLimpa?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mostrado = txt ?? (valor == null ? "" : String(valor));
  async function salvar() {
    if (txt === null) return;
    const bruto = txt.trim(); setTxt(null);
    if (bruto === "") { if (vazioLimpa && valor !== null) { setSalvando(true); try { await aoSalvar(null); } finally { setSalvando(false); } } return; }
    const n = Number(bruto.replace(",", "."));
    if (!Number.isFinite(n) || n === valor) return;
    setSalvando(true); try { await aoSalvar(n); } finally { setSalvando(false); }
  }
  return <Input className={`h-7 w-16 text-right ml-auto ${salvando ? "opacity-50" : ""}`} inputMode="decimal" title={titulo} placeholder={placeholder} value={mostrado} onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTxt(null); }} />;
}

function CabColG<T>({ col, ordem, onOrdem, filtro, onFiltro, opcoes }: { col: ColDef<T>; ordem: Ordem; onOrdem: () => void; filtro: Filtro | undefined; onFiltro: (f: Filtro) => void; opcoes: { valor: string; n: number }[] }) {
  const [aberto, setAberto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ativo = filtroAtivo(filtro);
  const emOrdem = ordem?.k === col.k;
  const Seta = !emOrdem ? ArrowUpDown : ordem!.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={`sticky top-0 z-20 bg-card h-11 px-2 align-middle font-medium whitespace-nowrap ${col.al === "right" ? "text-right" : "text-left"} ${emOrdem ? "text-foreground" : "text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={onOrdem} title={col.t === "num" ? "Ordenar (1º clique: maior → menor)" : "Ordenar (1º clique: A → Z)"} className="inline-flex items-center gap-1 hover:text-foreground"><span>{col.r}</span><Seta className={`size-3.5 ${emOrdem ? "text-primary" : "opacity-40"}`} /></button>
        <button type="button" ref={btn} onClick={() => setAberto(!aberto)} title="Filtrar esta coluna" aria-label={`Filtrar ${col.r}`} className={`rounded p-0.5 hover:bg-muted ${ativo ? "text-primary" : "opacity-40 hover:opacity-100"}`}><Filter className="size-3.5" fill={ativo ? "currentColor" : "none"} /></button>
      </span>
      {aberto && <PainelFiltroG col={col} ancora={btn.current} filtro={filtro} opcoes={opcoes} onChange={onFiltro} onFechar={() => setAberto(false)} />}
    </th>
  );
}

function PainelFiltroG<T>({ col, ancora, filtro, opcoes, onChange, onFechar }: { col: ColDef<T>; ancora: HTMLButtonElement | null; filtro: Filtro | undefined; opcoes: { valor: string; n: number }[]; onChange: (f: Filtro) => void; onFechar: () => void }) {
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

function Kpi({ t, v, tom }: { t: string; v: string; tom?: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground truncate">{t}</div><div className={`text-lg font-bold mt-1 ${tom ?? ""}`}>{v}</div></CardContent></Card>;
}
