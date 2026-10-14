import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { CLUSTERS, estoqueNoDia, HORIZONTE_FAROL, resumirLocal, type Cluster, type DashLinha } from "@/lib/abastecimento-dash";
import { somaDias } from "@/lib/abastecimento-dash-hist";
import { CLUSTER_PILL, CLUSTER_ROTULO, Chip, LOJAS, NOME, Pill, Secao, Th, dm, dmy, escopoLocais, n0, n1, repTexto, type Escopo, type Filtro } from "@/components/abast-dash/comum";

export type ChipG = "TODOS" | "SEMACAO" | Cluster;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const CHIPS: { c: ChipG; r: string; cls?: string }[] = [{ c: "TODOS", r: "Todos" }, { c: "SEMACAO", r: "Sem ação", cls: "border-red-300 text-red-700" }, { c: "ruptura", r: "Ruptura" }, { c: "critico", r: "≤ 3 d" }, { c: "urgente", r: "4–5 d" }, { c: "alerta", r: "6–7 d" }, { c: "atencao", r: "8–10 d" }, { c: "monitorar", r: "11–15 d" }, { c: "ok", r: "OK" }];

export function Farol({ hoje, filtro, setFiltro, linhas, chip, setChip }: { hoje: string; filtro: Filtro; setFiltro: (f: Filtro) => void; linhas: DashLinha[]; chip: ChipG; setChip: (c: ChipG) => void }) {
  const [dia, setDia] = useState(hoje); const [busca, setBusca] = useState("");
  const k = Math.max(0, Math.min(HORIZONTE_FAROL, Math.round((Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)) - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))) / 86400000)));
  const locais = escopoLocais(filtro.escopo); const base = useMemo(() => linhas.filter((l) => locais.includes(l.local)), [linhas, filtro.escopo]);
  const q = norm(busca.trim()); const cnt = (c: ChipG) => (c === "TODOS" ? base.length : c === "SEMACAO" ? base.filter((l) => l.semAcao).length : base.filter((l) => l.cluster === c).length);
  const lista = useMemo(() => base.filter((l) => (chip === "TODOS" ? true : chip === "SEMACAO" ? l.semAcao : l.cluster === chip) && (!q || norm(l.produto).includes(q) || l.sku.includes(q)))
    .sort((a, b) => (a.diasAteZerar ?? 99) - (b.diasAteZerar ?? 99) || b.vbm - a.vbm), [base, chip, q]);
  const alerta = base.filter((l) => l.alerta).sort((a, b) => (a.diasAteZerar ?? 0) - (b.diasAteZerar ?? 0))[0]; const enderec = base.filter((l) => l.status === "ruptura" && l.reposicao === "enderecado").length;
  const atalhos = [0, 3, 5, 7, 10, 15];
  const escolhe = (e: Escopo) => setFiltro({ ...filtro, escopo: filtro.escopo === e ? "LOJAS" : e });
  return (
    <Secao letra="G" titulo="Farol de ruptura futura">
      <p className="mb-3 text-xs text-muted-foreground">Estoque projetado no dia escolhido, considerando o que está em trânsito. Clique num local para filtrar a tabela.</p>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">{CLUSTERS.map((c) => <span key={c.k} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: c.cor }} />{c.k === "ruptura" ? "Ruptura" : c.faixa}</span>)}</div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <div className="min-w-[150px]"><div className="text-[11px] text-muted-foreground">Dia</div><div className="text-sm font-bold">{k === 0 ? "Hoje" : `+${k} d`} · {dmy(somaDias(hoje, k))}</div></div>
        <input type="range" min={0} max={HORIZONTE_FAROL} value={k} onChange={(e) => setDia(somaDias(hoje, +e.target.value))} className="min-w-[160px] flex-1 accent-slate-900" />
        <input type="date" value={somaDias(hoje, k)} min={hoje} max={somaDias(hoje, HORIZONTE_FAROL)} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
        <div className="flex gap-1">{atalhos.map((a) => <button key={a} type="button" onClick={() => setDia(somaDias(hoje, a))} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${k === a ? "bg-slate-900 text-white" : "bg-background hover:bg-muted"}`}>{a === 0 ? "Hoje" : `+${a} d`}</button>)}</div></div>
      {alerta && <div className="mb-3 flex items-start gap-2 rounded-lg border-l-4 border-l-red-600 bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>ALERTA · {alerta.produto} ({NOME[alerta.local]}) {alerta.status === "ruptura" ? "está zerado" : `zera em ${dm(alerta.zeraEm)}`} e {alerta.reposicao === "tarde" ? "a reposição chega tarde" : "não tem reposição a caminho"}. Sugestão: {n0(alerta.sugestao)} un no abastecimento desta semana.</span></div>}
      {enderec > 0 && <p className="mb-2 text-right text-xs font-semibold text-teal-700">✓ {enderec} ruptura(s) já endereçada(s)</p>}
      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[...LOJAS, "CD"].map((c) => { const ls = linhas.filter((l) => l.local === c); const r = resumirLocal(ls); const n = (cl: Cluster) => ls.filter((l) => l.cluster === cl).length; const sel = filtro.escopo === c;
        return <button key={c} type="button" onClick={() => escolhe(c as Escopo)} className={`rounded-xl border p-3 text-left transition hover:shadow ${sel ? "border-2 border-slate-900 shadow" : "bg-card"}`}><div className="flex items-center justify-between"><span className="text-sm font-bold">{c === "CD" ? "Almox SP (CD)" : `Loja ${NOME[c]}`}</span>{r.alertas > 0 && <AlertTriangle className="size-4 text-red-600" />}</div>
          <div className="text-[11px] text-muted-foreground">{r.ruptura ? <b className="text-red-600">{r.ruptura} em ruptura</b> : "Sem ruptura"} · {r.semAcao} sem ação</div>
          <div className="mt-2 flex gap-1 text-[11px] font-semibold"><span className="rounded-full border px-2 py-0.5">≤3 d {n("critico")}</span><span className="rounded-full border px-2 py-0.5">4–5 d {n("urgente")}</span><span className="rounded-full border border-orange-300 px-2 py-0.5 text-orange-600">6–7 d {n("alerta")}</span></div></button>; })}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2">{CHIPS.map((x) => <Chip key={x.c} ativo={chip === x.c} onClick={() => setChip(x.c)} cls={x.cls}>{x.r} <b>{cnt(x.c)}</b></Chip>)}
        <div className="relative ml-auto"><Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou produto" className="h-8 w-56 rounded-md border bg-background pl-7 pr-2 text-xs" /></div></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40"><Th c="Farol" /><Th c="Produto" /><Th c="Local" /><Th c="Est. hoje" d /><Th c="Venda/d" d /><Th c="Est. no dia" d /><Th c="Cobert. líq." d /><Th c="Em trânsito" d /><Th c="Chega em" d /><Th c="Zera em" d /><Th c="Situação da reposição" /><Th c="Sugestão" d /></tr></thead>
        <tbody>{lista.slice(0, 100).map((l) => { const en = estoqueNoDia(l.estoque, l.vbm, l.entradas, hoje, somaDias(hoje, k)); const cob = l.vbm > 0 ? Math.max(0, en - l.exposicao) / l.vbm : null; const r = repTexto(l); const fora = l.cluster === "ok" && l.status !== "ruptura";
          return (<tr key={l.local + l.sku} className={`border-b ${l.alerta ? "bg-red-50" : ""} ${fora ? "text-muted-foreground" : ""}`}><td className="px-2 py-2"><Pill cls={CLUSTER_PILL[l.cluster]}>{CLUSTER_ROTULO[l.cluster]}</Pill></td><td className="px-2 py-2"><div className="max-w-[250px] truncate font-semibold" title={l.produto}>{l.produto}</div><div className="text-[11px] text-muted-foreground">SKU {l.sku}</div></td><td className="px-2 py-2 whitespace-nowrap">{NOME[l.local]}</td>
            <td className="px-2 py-2 text-right">{n0(l.estoque)}</td><td className="px-2 py-2 text-right">{n1(l.vbm)}</td><td className="px-2 py-2 text-right font-semibold">{n1(en)}</td><td className="px-2 py-2 text-right">{cob === null ? "—" : `${n1(cob)} d`}</td><td className="px-2 py-2 text-right font-semibold text-teal-700">{l.emTransito ? `${n0(l.emTransito)} un` : "—"}</td><td className="px-2 py-2 text-right font-semibold text-teal-700">{l.chegaNotaEm ? dm(l.chegaNotaEm) : "—"}</td>
            <td className="px-2 py-2 text-right">{l.status === "ruptura" || l.zeraEm ? <div className="flex flex-col items-end"><Pill cls={CLUSTER_PILL[l.cluster]}>{l.status === "ruptura" ? "já zerado" : `${dm(l.zeraEm)} · ${l.diasAteZerar} d`}</Pill>{l.entradaTotal > 0 && l.zeraSemTransito && l.zeraSemTransito !== l.zeraEm && <span className="text-[10px] text-muted-foreground">s/ reposição: {dm(l.zeraSemTransito)}</span>}</div> : <span className="text-[11px]">{">"} 15 d</span>}</td>
            <td className="px-2 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.c}`}>{r.t}</span></td><td className="px-2 py-2 text-right font-semibold">{l.sugestao ? n0(l.sugestao) : "—"}</td></tr>); })}
          {lista.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Nenhum SKU neste filtro.</td></tr>}</tbody></table></div>
      <p className="mt-2 text-[11px] italic text-muted-foreground">{lista.length > 100 ? `Mostrando 100 de ${n0(lista.length)}. ` : ""}O alerta destaca (vermelho) só SKUs que zeram em até 5 dias sem reposição a caminho ou com chegada depois de zerar. Itens além de 15 dias aparecem em cinza. Almox SP: demanda = soma das lojas; ainda sem fonte de entradas (compras/produção).</p>
    </Secao>
  );
}
