import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { riscoEnderecado, resumirLocal, type DashLinha, type TransitoLocal } from "@/lib/abastecimento-dash";
import { atingimento, farolRuptura, META_RUPTURA, resumoPeriodo, type HistLinha } from "@/lib/abastecimento-dash-hist";
import { FAROL, LOJAS, NOME, Pill, Secao, Th, brl, dm, escopoLocais, escopoRotulo, n0, n1, pct, type Escopo, type Filtro } from "@/components/abast-dash/comum";

type Props = { hoje: string; filtro: Filtro; setFiltro: (f: Filtro) => void; linhas: DashLinha[]; hist: HistLinha[]; transito?: Record<string, TransitoLocal> };
const semaforo = (ruptura: number, stockout: number) => (ruptura > 0 ? [true, false, false] : stockout > 0 ? [false, true, false] : [false, false, true]);

export function Kpis({ hoje, filtro, linhas, hist }: Omit<Props, "setFiltro">) {
  const locais = escopoLocais(filtro.escopo); const ls = linhas.filter((l) => locais.includes(l.local));
  const rs = resumirLocal(ls); const rp = resumoPeriodo(hist, { de: filtro.de, ate: filtro.ate, locais, categoria: null }, hoje);
  const hojeRupt = rs.skus ? rs.ruptura / rs.skus : null; const risco = riscoEnderecado(ls, hoje);
  const alertas = ls.filter((l) => l.alerta).sort((a, b) => (a.diasAteZerar ?? 0) - (b.diasAteZerar ?? 0));
  const f = rp.ruptura === null ? null : farolRuptura(rp.ruptura); const at = rp.ruptura === null ? null : atingimento(rp.ruptura);
  const possiveis = rs.skus * rp.diasPeriodo;
  const faltam = rp.diasSemRegistro.length > 6 ? `${rp.diasSemRegistro.slice(0, 5).map(dm).join(", ")}… (+${rp.diasSemRegistro.length - 5})` : rp.diasSemRegistro.map(dm).join(", ");
  const enderec = ls.filter((l) => l.status === "ruptura" && l.reposicao === "enderecado").length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">Indicadores do período ({dm(filtro.de)} a {dm(filtro.ate)}) · {escopoRotulo(filtro.escopo)}</span>
        {alertas.length > 0 ? <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700"><AlertTriangle className="size-3.5" /> {alertas.length} SKU(s) zeram em até 5 dias SEM reposição suficiente a caminho ({alertas[0].produto} · {NOME[alertas[0].local]})</span> : <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">Sem alertas críticos de ruptura nos próximos dias</span>}
        {enderec > 0 && <span className="flex items-center gap-1 font-semibold text-teal-700"><CheckCircle2 className="size-3.5" /> {enderec} ruptura(s) já endereçada(s)</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <div className={`col-span-2 rounded-xl border border-l-4 bg-card p-3 shadow-sm lg:col-span-2 xl:col-span-1 ${f ? FAROL[f].borda : "border-l-slate-300"}`}>
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Ruptura · acum. período</div>
          <div className={`mt-1 flex items-center gap-2 text-2xl font-bold ${f ? FAROL[f].texto : ""}`}>{pct(rp.ruptura)}{rp.parcial && <Pill cls="bg-orange-100 text-orange-700">PARCIAL · {rp.diasComRegistro.length} {rp.diasComRegistro.length === 1 ? "dia" : "dias"}</Pill>}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Meta ≤ {pct(META_RUPTURA, 1)} · Ating. {at === null ? "—" : `${(at * 100).toFixed(0)}%`}</div>
        </div>
        <Card t="Ruptura · hoje" v={pct(hojeRupt)} s={`${rs.ruptura} SKU(s) zerado(s) de ${rs.skus}`} cor="border-l-emerald-500" />
        <Card t="Stockout" v={n0(rs.stockout)} s={`${pct(rs.skus ? rs.stockout / rs.skus : null, 1)} do sortimento`} cor="border-l-yellow-500" vc="text-yellow-600" />
        <Card t="Stock Over" v={n0(rs.stockover)} s={`${brl(rs.excessoRs)} em excesso`} cor="border-l-violet-500" vc="text-violet-600" />
        <Card t="Cobertura média" v={rs.coberturaMedia === null ? "—" : `${n1(rs.coberturaMedia)} d`} s="Estoque líquido ÷ VBM" cor="border-l-slate-700" />
        <Card t="Risco endereçado" v={`${risco.enderecados} de ${risco.total}`} s="zerados ou ≤ 7 d com reposição a caminho" cor="border-l-teal-600" vc="text-teal-700" />
        <Card t="Dias com saldo" v={`${rp.diasComRegistro.length} de ${rp.diasPeriodo}`} s={`${n0(rp.itemDias)} de ${n0(possiveis)} item-dias${faltam ? ` · faltam ${faltam}` : ""}`} cor="border-l-orange-500" vc="text-orange-600" />
      </div>
      <p className="text-right text-[10px] italic text-muted-foreground">KPIs da meta = lojas. Selecionar Almox SP ou "Todos (lojas + CD)" recalcula os cards. Trânsito não reduz a ruptura: só indica se o risco já está endereçado.</p>
    </div>
  );
}
function Card({ t, v, s, cor, vc = "" }: { t: string; v: string; s: string; cor: string; vc?: string }) {
  return <div className={`rounded-xl border border-l-4 bg-card p-3 shadow-sm ${cor}`}><div className="text-[11px] font-semibold uppercase text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold ${vc}`}>{v}</div><div className="mt-1 text-[11px] text-muted-foreground">{s}</div></div>;
}

export function ResumoLocais({ hoje, filtro, setFiltro, linhas, hist, transito = {} }: Props) {
  const trLocais = (locais: string[]) => locais.reduce((a, l) => { const x = transito[l]; return x ? { un: a.un + x.un, rs: a.rs + x.rs, notas: a.notas + x.notas, maior: Math.max(a.maior, x.maiorAtrasoDiasUteis) } : a; }, { un: 0, rs: 0, notas: 0, maior: 0 });
  const escolhe = (e: Escopo) => setFiltro({ ...filtro, escopo: filtro.escopo === e ? "LOJAS" : e });
  const fh = (locais: string[]) => ({ de: filtro.de, ate: filtro.ate, locais, categoria: null as string | null });
  const dados = (locais: string[]) => {
    const ls = linhas.filter((l) => locais.includes(l.local)); const r = resumirLocal(ls); const p = resumoPeriodo(hist, fh(locais), hoje);
    return { ls, r, p, hoje: r.skus ? r.ruptura / r.skus : null, periodo: p.ruptura };
  };
  const cards: { e: Escopo; nome: string; locais: string[] }[] = [{ e: "TODOS", nome: "Todos (lojas + CD)", locais: [...LOJAS, "CD"] }, ...[...LOJAS, "CD"].map((c) => ({ e: c as Escopo, nome: c === "CD" ? "Almox SP (CD)" : `Loja ${NOME[c]}`, locais: [c] }))];
  const linhasTab: { e: Escopo | null; nome: string; locais: string[]; total?: boolean; forte?: boolean }[] = [
    ...LOJAS.map((c) => ({ e: c as Escopo, nome: NOME[c], locais: [c] })),
    { e: "LOJAS", nome: "Total lojas (meta)", locais: LOJAS, total: true },
    { e: "CD", nome: "Almox SP (CD)", locais: ["CD"] },
    { e: "TODOS", nome: "Total geral (lojas + CD)", locais: [...LOJAS, "CD"], total: true, forte: true },
  ];
  const Pl = ({ v }: { v: number | null }) => v === null ? <span className="text-muted-foreground">—</span> : <Pill cls={FAROL[farolRuptura(v)].pill}>● {pct(v)}</Pill>;
  return (
    <Secao letra="C" titulo="Resumo por local">
      <p className="mb-3 text-right text-xs font-semibold">Clique num card ou numa linha para filtrar a tela inteira</p>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => {
          const d = dados(c.locais); const [v, a, g] = semaforo(d.r.ruptura, d.r.stockout); const sel = filtro.escopo === c.e; const aler = d.r.alertas > 0;
          return (
            <button key={c.e} type="button" onClick={() => escolhe(c.e)} className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition hover:shadow ${sel ? "border-2 border-slate-900 bg-slate-50 shadow" : "bg-card"}`}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 rounded-md bg-slate-900 p-1.5">{[v, a, g].map((on, i) => <span key={i} className={`size-2.5 rounded-full ${i === 0 ? (on ? "bg-red-500" : "bg-red-950") : i === 1 ? (on ? "bg-yellow-400" : "bg-yellow-950") : on ? "bg-emerald-500" : "bg-emerald-950"}`} />)}</div>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1"><span className="truncate text-sm font-bold">{c.nome}</span>{aler && <AlertTriangle className="size-4 shrink-0 text-red-600" />}</div>
                  <div className={`text-[11px] ${d.r.ruptura ? "font-semibold text-red-600" : "text-muted-foreground"}`}>{d.r.ruptura ? `${d.r.ruptura} em ruptura` : "Sem ruptura"} · {d.r.stockout} abaixo do mínimo</div></div>
              </div>
              <div className="flex items-center justify-between">{sel ? <span className="text-[11px] font-semibold text-slate-700">✓ selecionado</span> : <span />}<span className="flex gap-1"><Pill cls="bg-red-600 text-white">{d.r.ruptura}</Pill><Pill cls="bg-amber-400 text-amber-950">{d.r.stockout}</Pill><Pill cls="bg-emerald-600 text-white">{d.r.ok + d.r.stockover}</Pill></span></div>
            </button>);
        })}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40"><Th c="Local" /><Th c="SKUs ativos" d /><Th c="Ruptura hoje" d /><Th c="Ruptura período" d /><Th c="Ating. meta" d /><Th c="Stockout" d /><Th c="Stock Over" d /><Th c="Excesso R$" d /><Th c="Em trânsito" d /><Th c="Cobertura" d /></tr></thead>
        <tbody>{linhasTab.map((t) => { const d = dados(t.locais); const at = d.periodo === null ? null : atingimento(d.periodo); const sel = t.e !== null && filtro.escopo === t.e;
          return (<tr key={t.nome} onClick={() => t.e && escolhe(t.e)} className={`cursor-pointer border-b hover:bg-muted/50 ${t.total ? "bg-muted/40 font-semibold" : ""} ${t.forte ? "border-t-2 border-t-slate-700 bg-slate-100" : ""} ${sel ? "outline outline-2 outline-slate-700" : ""}`}>
            <td className="px-2 py-2 font-medium">{t.nome}</td><td className="px-2 py-2 text-right">{n0(d.r.skus)}</td><td className="px-2 py-2 text-right"><Pl v={d.hoje} /></td><td className="px-2 py-2 text-right"><Pl v={d.periodo} /></td>
            <td className={`px-2 py-2 text-right font-semibold ${d.periodo === null ? "text-muted-foreground" : FAROL[farolRuptura(d.periodo)].texto}`}>{at === null ? "—" : `${(at * 100).toFixed(0)}%`}</td>
            <td className="px-2 py-2 text-right">{n0(d.r.stockout)}</td><td className="px-2 py-2 text-right">{n0(d.r.stockover)}</td><td className="px-2 py-2 text-right">{brl(d.r.excessoRs)}</td>
            <td className="px-2 py-2 text-right text-teal-700">{(() => { const x = trLocais(t.locais); return x.notas ? <span className="whitespace-nowrap">{n0(x.un)} un · {brl(x.rs)} <span className="text-[10px] text-muted-foreground">· {x.notas} NF</span>{x.maior > 5 && <Pill cls="ml-1 bg-red-100 text-red-700">{x.maior} d úteis</Pill>}</span> : <span className="text-muted-foreground">—</span>; })()}</td><td className="px-2 py-2 text-right">{d.r.coberturaMedia === null ? "—" : `${n1(d.r.coberturaMedia)} d`}</td></tr>); })}</tbody></table></div>
      <p className="mt-2 text-[11px] italic text-muted-foreground">Total lojas = base da meta (o saldo do Almox SP não entra no % das lojas). <b>Em trânsito</b> = notas de transferência pendentes de recebimento, a mesma fonte da tela <Link to="/suprimentos/farol-recebimento" className="font-semibold text-primary underline">Farol de Recebimento Pendente</Link>: nas lojas, transferências do CD já expedidas; no Almox SP, compras/produção a receber (notas para a Fábrica SP). Selo vermelho = nota aberta há mais de 5 dias úteis. Pedidos ainda não expedidos não entram no trânsito (aparecem na situação da reposição).</p>
    </Secao>
  );
}
