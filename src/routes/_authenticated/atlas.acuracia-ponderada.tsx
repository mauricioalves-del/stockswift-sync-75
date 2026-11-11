import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtlasGrafico, atlasCores } from "@/components/atlas/AtlasGrafico";
import { BarChart3, CalendarCheck, ChevronDown, ChevronUp, ListChecks, Loader2, MousePointerClick, Scale } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PainelInventario } from "@/routes/_authenticated/atlas.painel-inventario";
import { FechamentoInventario } from "@/routes/_authenticated/atlas.fechamento-inventario";
import { PreInventarioPage } from "@/routes/_authenticated/gestao.pre-inventario";
import { Secao, Th } from "@/components/abast-dash/comum";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FiltrosInv } from "@/components/atlas/FiltrosInv";
import { carregarInventario, comparativo, comparativoPorAlmox, comparativoPorGrupo, concentracao, detalhesFaixa, evolucaoPonderada, faixaAcuracia, faltaSobra, magnitude, opcoesInv, rankingSku, type DetalheDivergencia } from "@/lib/atlas-inventario";

export const Route = createFileRoute("/_authenticated/atlas/acuracia-ponderada")({
  component: AcuraciaPonderada,
  validateSearch: (s: Record<string, unknown>): { visao?: Visao; fechamento?: number } => {
    const visao = VISOES.includes(s.visao as Visao) ? (s.visao as Visao) : undefined;
    const n = Number(s.fechamento);
    return { ...(visao ? { visao } : {}), ...(Number.isInteger(n) && n > 0 ? { fechamento: n } : {}) };
  },
  head: () => ({ meta: [{ title: "Acurácia Ponderada — Atlas" }, { name: "description", content: "Comparativo dos modelos de acurácia, Pareto, magnitude e evolução mensal do Atlas." }, { property: "og:title", content: "Acurácia Ponderada — Atlas" }, { property: "og:description", content: "Comparativo dos modelos de acurácia, Pareto, magnitude e evolução mensal do Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const VISOES = ["acuracia", "painel-inventario", "fechamento", "pre-inventario"] as const;
type Visao = (typeof VISOES)[number];

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const brl2 = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${un(n, 2)}%`);
const pp = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${un(n, 2)} p.p.`);
const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

const COR_FAIXA = { vermelho: atlasCores.danger, amarelo: atlasCores.warning, verde: atlasCores.success } as const;
const corAcuracia = (v: unknown) => { const f = faixaAcuracia(typeof v === "number" ? v : null); return f ? COR_FAIXA[f] : atlasCores.muted; };

/** Percentual destacado pelo farol (vermelho < 60%, amarelo até 95%, verde ≥ 95%). */
function PctFarol({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const cor = corAcuracia(v);
  return <span className="rounded px-1.5 py-0.5 font-semibold" style={{ color: cor, backgroundColor: `color-mix(in srgb, ${cor} 14%, transparent)` }}>{pct(v)}</span>;
}

function BotaoDetalhes({ aberto, onClick }: { aberto: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={aberto} className="flex items-center gap-1 rounded-md border bg-muted px-3 py-1 text-xs font-semibold hover:bg-muted/70">
      {aberto ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} {aberto ? "Ocultar detalhes" : "Ver detalhes"}
    </button>
  );
}

function LegendaFarol() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {([["vermelho", "abaixo de 60%"], ["amarelo", "60% a 95%"], ["verde", "95% ou mais"]] as const).map(([f, t]) => (
        <span key={f} className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ backgroundColor: COR_FAIXA[f] }} />{t}</span>
      ))}
    </div>
  );
}

function TabelaDivergencias({ linhas, destaque }: { linhas: (DetalheDivergencia & { posicao?: number; pctValor?: number })[]; destaque?: number | null }) {
  const pareto = linhas.some((l) => l.posicao != null);
  return (
    <div className="max-h-[55vh] overflow-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10"><tr>{pareto && <Th c="#" />}<Th c="Produto" /><Th c="Almox" /><Th c="Fechamento" /><Th c="Sistema" d /><Th c="Contagem" d /><Th c="Divergência" d /><Th c="Valor" d />{pareto && <Th c="% acum." d />}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} id={`div-${l.id}`} className={`border-t ${destaque === l.id ? "bg-accent/40 font-semibold" : ""}`}>
              {pareto && <td className="p-1.5 text-muted-foreground">{l.posicao}</td>}
              <td className="p-1.5"><div className="font-mono">{l.sku}</div><div className="max-w-[260px] text-muted-foreground">{l.descricao || "Sem descrição"}</div></td>
              <td className="p-1.5">{l.almox}</td>
              <td className="p-1.5">{dmy(l.data)}</td>
              <td className="p-1.5 text-right">{un(l.sistema, 2)}</td>
              <td className="p-1.5 text-right">{un(l.contagem, 2)}</td>
              <td className="p-1.5 text-right font-semibold" style={{ color: l.divergencia < 0 ? atlasCores.danger : atlasCores.success }}>{l.divergencia > 0 ? "+" : ""}{un(l.divergencia, 2)} <span className="font-normal text-muted-foreground">{l.divergencia < 0 ? "falta" : "sobra"}</span></td>
              <td className="p-1.5 text-right">{brl2(l.valor)}</td>
              {pareto && <td className="p-1.5 text-right">{l.pctValor == null ? "—" : `${un(l.pctValor, 1)}%`}</td>}
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhuma divergência nesta seleção.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const modelosMoM = {
  iap: { nome: "IAP (valor)", valor: "iap", variacao: "varIap" },
  iaq: { nome: "IAQ (quantidade)", valor: "iaq", variacao: "varIaq" },
  item: { nome: "Item a item", valor: "item", variacao: "varItem" },
  valorMod: { nome: "Valor Mod (R$)", valor: "valorMod", variacao: "varMod" },
} as const;


function AcuraciaPonderada() {
  const busca = Route.useSearch();
  const [visao, setVisao] = useState<Visao>(busca.visao ?? "acuracia");
  useEffect(() => { if (busca.visao) setVisao(busca.visao); }, [busca.visao]);
  const q = useQuery({ queryKey: ["atlas-inventario"], queryFn: carregarInventario, staleTime: 120000 });
  const [almox, setAlmox] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [modeloMoM, setModeloMoM] = useState<keyof typeof modelosMoM>("iap");
  const [detalhes, setDetalhes] = useState<Record<string, boolean>>({});
  const [paretoSel, setParetoSel] = useState<number | null>(null);
  const [faixaSel, setFaixaSel] = useState<string | null>(null);
  const alternar = (k: string) => setDetalhes((d) => ({ ...d, [k]: !d[k] }));
  const modelo = modelosMoM[modeloMoM];
  const momMonetario = modeloMoM === "valorMod";
  const r = useMemo(() => {
    if (!q.data) return null;
    const D = q.data, f = { almox, mes };
    return { c: comparativo(D, f), grupo: comparativoPorGrupo(D, f), porAlmox: comparativoPorAlmox(D, mes), conc: concentracao(D, f), mag: magnitude(D, f), fs: faltaSobra(D, f), evo: evolucaoPonderada(D, almox), risco: rankingSku(D, almox, "risco"), op: opcoesInv(D) };
  }, [q.data, almox, mes]);
  const listaFaixa = useMemo(() => (q.data && faixaSel ? detalhesFaixa(q.data, { almox, mes }, faixaSel) : []), [q.data, almox, mes, faixaSel]);
  const periodo = `${mes ? `${mes.slice(5)}/${mes.slice(0, 4)}` : "todo o histórico"} · ${almox ?? "todos os almoxarifados"}`;
  const itemPareto = r && paretoSel != null ? r.conc.curva.find((x) => x.id === paretoSel) ?? null : null;
  const resumoFaixa = { qtd: listaFaixa.length, valor: listaFaixa.reduce((s, l) => s + l.valor, 0), faltas: listaFaixa.filter((l) => l.divergencia < 0).length, sobras: listaFaixa.filter((l) => l.divergencia > 0).length };
  // D e E com a mesma proporção: altura única pelo maior número de linhas.
  const alturaDE = r ? Math.max(260, Math.max(r.grupo.length, r.porAlmox.length) * 62) : 260;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Scale className="size-5" /> Acurácia Ponderada <span className="ml-2 text-sm font-normal text-slate-300">Item a item · IAQ · IAP</span></h1>
        <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)}>
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value="acuracia" className="text-xs"><Scale className="mr-1 size-3.5" /> Acurácia Ponderada</TabsTrigger>
            <TabsTrigger value="painel-inventario" className="text-xs"><BarChart3 className="mr-1 size-3.5" /> Painel Inventário</TabsTrigger>
            <TabsTrigger value="fechamento" className="text-xs"><CalendarCheck className="mr-1 size-3.5" /> Fechamento Inventário</TabsTrigger>
            <TabsTrigger value="pre-inventario" className="text-xs"><ListChecks className="mr-1 size-3.5" /> Pré-inventário</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-slate-300">Competência: {mes ? `${mes.slice(5)}/${mes.slice(0, 4)}` : "todas"} · Leitura: {q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}</div>
      </div>
      {visao === "painel-inventario" ? <PainelInventario embutido /> : visao === "fechamento" ? <FechamentoInventario embutido fechamentoUrl={busca.fechamento} /> : visao === "pre-inventario" ? <PreInventarioPage embutido /> : !r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os fechamentos…</div> : (
        <>
          <Secao letra="A" titulo="Filtros">
            <div className="flex flex-wrap items-end gap-3">
              <FiltrosInv almox={almox} setAlmox={setAlmox} mes={mes} setMes={setMes} op={r.op} />
              <button type="button" onClick={() => { setAlmox(null); setMes(null); }} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
            </div>
          </Secao>
          <Secao letra="B" titulo="Indicadores do período">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([["Item a item", pct(r.c.item), null], ["IAQ (por quantidade)", pct(r.c.iaq), `${pp(r.c.iaq != null && r.c.item != null ? r.c.iaq - r.c.item : null)} vs. item a item`], ["IAP (por valor)", pct(r.c.iap), `${pp(r.c.iap != null && r.c.item != null ? r.c.iap - r.c.item : null)} vs. item a item`], ["Valor ponderado do inventário", brl(r.c.divergenteTotal), null]] as const).map(([t, v, sub]) => (
                <div key={t} className="rounded-lg border bg-background p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className="mt-1 text-2xl font-bold">{v}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground"><strong>Item a item</strong> conta SKUs sem divergência. <strong>IAQ</strong> pondera pela quantidade: 1 − |divergência| ÷ quantidade em sistema. <strong>IAP</strong> pondera pelo valor: 1 − valor divergente ÷ valor do estoque avaliado, só SKUs com custo cadastrado.</p>
          </Secao>

          <Secao letra="C" titulo="Os três modelos, lado a lado"><AtlasGrafico data={[{ modelo: "Item a item", valor: r.c.item }, { modelo: "IAQ", valor: r.c.iaq }, { modelo: "IAP", valor: r.c.iap }]} category="modelo" horizontal percent legend={false} height={180} series={[{key: "valor", name: "Acurácia", color: atlasCores.success, percent: true}]} /></Secao>
          <div className="grid gap-4 lg:grid-cols-2">
            {([["D", "Por grupo de produto", r.grupo, "Grupo"], ["E", `Por almoxarifado${mes ? ` · ${mes.slice(5)}/${mes.slice(0, 4)}` : ""}`, r.porAlmox, "Almoxarifado"]] as const).map(([k, t, l, rotulo]) => (
              <Secao key={k} letra={k} titulo={t} acao={<BotaoDetalhes aberto={!!detalhes[k]} onClick={() => alternar(k)} />}>
                <div className="overflow-x-auto"><AtlasGrafico data={l} category="chave" horizontal percent height={alturaDE} series={[{key: "item", name: "Item a item", color: atlasCores.warning, percent: true, labels: false},{key: "iaq", name: "IAQ (quantidade)", color: atlasCores.success, percent: true, labels: false},{key: "iap", name: "IAP (valor)", color: atlasCores.blue, percent: true, labels: false}]} /></div>
                {detalhes[k] && (
                  <div className="mt-3 space-y-2">
                    <LegendaFarol />
                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <table className="w-full text-xs"><thead className="sticky top-0 z-10"><tr><Th c={rotulo} /><Th c="Item a item" d /><Th c="IAQ" d /><Th c="IAP" d /><Th c="Valor divergente" d /></tr></thead>
                        <tbody>{l.map((x) => <tr key={x.chave} className="border-t"><td className="p-1.5">{x.chave}</td><td className="p-1.5 text-right"><PctFarol v={x.item} /></td><td className="p-1.5 text-right"><PctFarol v={x.iaq} /></td><td className="p-1.5 text-right"><PctFarol v={x.iap} /></td><td className="p-1.5 text-right" style={{ color: atlasCores.danger }}>{brl(x.divergenteTotal)}</td></tr>)}</tbody></table>
                    </div>
                  </div>
                )}
              </Secao>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao letra="F" titulo="Concentração do valor divergente">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Os {r.conc.topN} maiores itens somam <strong className="text-foreground">{r.conc.topNPct == null ? "—" : `${un(r.conc.topNPct, 1)}%`}</strong> do valor divergente ({brl(r.conc.valorTotal)} em {un(r.conc.total)} itens).</p>
                <div className="h-56"><AtlasGrafico data={r.conc.curva} category="posicao" money rightPercent height={224} onPontoClick={(row) => setParetoSel(Number(row.id))} series={[{key: "valor", name: "Valor (R$)", color: atlasCores.accent, money: true, labels: false, opacity: 0.6},{key: "pctValor", name: "% acumulado do valor", color: atlasCores.warning, line: true, right: true, percent: true}]} /></div>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MousePointerClick className="size-3.5" /> Clique em uma barra para ver o produto e a divergência.</p>
              </div>
            </Secao>
            <Secao letra="G" titulo="Divergências por tamanho (unidades)">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{r.mag.pctPequenas == null ? "—" : `${un(r.mag.pctPequenas, 1)}%`} das divergências são pequenas (até 5 un.).</p>
                <div className="h-56"><AtlasGrafico data={r.mag.faixas} category="faixa" height={224} onPontoClick={(row) => setFaixaSel(String(row.faixa))} series={[{key: "itens", name: "Nº de itens", color: atlasCores.blue},{key: "valor", name: "Valor (R$)", color: atlasCores.danger, line: true, right: true, money: true}]} /></div>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MousePointerClick className="size-3.5" /> Clique em uma faixa para ver a lista de divergências.</p>
              </div>
            </Secao>
          </div>

          <Secao letra="H" titulo="Análise MoM — Acurácia Ponderada" acao={<Select value={modeloMoM} onValueChange={(valor) => { if (valor === "iap" || valor === "iaq" || valor === "item" || valor === "valorMod") setModeloMoM(valor); }}>
                <SelectTrigger className="w-44" aria-label="Indicador da análise MoM"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(modelosMoM).map(([valor, opcao]) => <SelectItem key={valor} value={valor}>{opcao.nome}</SelectItem>)}</SelectContent>
              </Select>}>
            <AtlasGrafico data={r.evo} category="rotulo" percent={!momMonetario} money={momMonetario} series={[
              { key: modelo.valor, name: momMonetario ? "Valor divergente do mês (R$)" : `Acurácia do mês — ${modelo.nome}`, color: momMonetario ? atlasCores.danger : atlasCores.success, percent: !momMonetario, money: momMonetario, cores: momMonetario ? () => atlasCores.danger : (row) => corAcuracia(row[modelo.valor]) },
              { key: modelo.variacao, name: momMonetario ? "Variação MoM (R$)" : "Variação MoM (p.p.)", color: atlasCores.blue, line: true, right: true, money: momMonetario },
            ]} />
            {!momMonetario && <div className="mt-2"><LegendaFarol /></div>}
          </Secao>
          <Secao letra="I" titulo={`Evolução mensal dos três modelos${almox ? ` · ${almox}` : ""}`} acao={<BotaoDetalhes aberto={!!detalhes.I} onClick={() => alternar("I")} />}>
            <div>
              <div className="h-64"><AtlasGrafico data={r.evo} category="rotulo" percent series={[{key: "item", name: "Item a item", color: atlasCores.blue, line: true, percent: true},{key: "iaq", name: "IAQ", color: atlasCores.success, line: true, percent: true},{key: "iap", name: "IAP", color: atlasCores.warning, line: true, percent: true}]} /></div>
              {detalhes.I && (
                <div className="mt-3 space-y-2">
                  <LegendaFarol />
                  <div className="max-h-[420px] overflow-auto rounded-md border">
                    <table className="w-full text-xs"><thead className="sticky top-0 z-10"><tr><Th c="Mês" /><Th c="Item a item" d /><Th c="IAQ" d /><Th c="IAP" d /><Th c="Valor divergente" d /><Th c="Δ valor" d /></tr></thead>
                      <tbody>{[...r.evo].reverse().map((m) => <tr key={m.mes} className="border-t"><td className="p-1.5">{m.rotulo}</td><td className="p-1.5 text-right"><PctFarol v={m.item} /> <span className="text-muted-foreground">{pp(m.varItem)}</span></td><td className="p-1.5 text-right"><PctFarol v={m.iaq} /> <span className="text-muted-foreground">{pp(m.varIaq)}</span></td><td className="p-1.5 text-right"><PctFarol v={m.iap} /> <span className="text-muted-foreground">{pp(m.varIap)}</span></td><td className="p-1.5 text-right" style={{ color: atlasCores.danger }}>{brl(m.valorMod)}</td><td className="p-1.5 text-right" style={m.varMod == null ? undefined : { color: m.varMod <= 0 ? atlasCores.success : atlasCores.danger }}>{m.varMod == null ? "—" : brl(m.varMod)}</td></tr>)}</tbody></table>
                  </div>
                </div>
              )}
            </div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-3">
            {([["J", "Maiores faltas", r.fs.falta, `${un(r.fs.qtdFalta)} itens · ${brl(r.fs.valorFalta)}`, "text-destructive"], ["K", "Maiores sobras", r.fs.sobra, `${un(r.fs.qtdSobra)} itens · ${brl(r.fs.valorSobra)}`, "text-emerald-700"]] as const).map(([k, t, l, sub, cls]) => (
              <Secao key={t} letra={k} titulo={t}><p className="mb-2 text-xs text-muted-foreground">{sub}</p>
                <table className="w-full text-xs"><tbody>{l.map((x, i) => <tr key={i} className="border-b last:border-0"><td className="p-1"><div className="font-mono">{x.sku}</div><div className="max-w-[170px] truncate text-muted-foreground">{x.descricao}</div></td><td className="p-1 text-right">{un(x.divergencia, 2)}</td><td className={`p-1 text-right ${cls}`}>{brl(x.valor)}</td></tr>)}</tbody></table></Secao>
            ))}
            <Secao letra="L" titulo="Recorrentes de maior risco"><p className="mb-2 text-xs text-muted-foreground">SKUs com divergência em 2+ fechamentos; score = vezes × valor</p>
              <table className="w-full text-xs"><tbody>{r.risco.map((x) => <tr key={x.sku} className="border-b last:border-0"><td className="p-1"><div className="font-mono">{x.sku}</div><div className="max-w-[150px] truncate text-muted-foreground">{x.descricao}</div></td><td className="p-1 text-right">{x.ocorrencias}×</td><td className="p-1 text-right">{brl(x.valor)}</td></tr>)}</tbody></table></Secao>
          </div>

          <Dialog open={paretoSel != null} onOpenChange={(o) => !o && setParetoSel(null)}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Pareto do valor divergente</DialogTitle>
                <DialogDescription>Período analisado: {periodo} · {un(r.conc.curva.length)} maiores de {un(r.conc.total)} itens divergentes.</DialogDescription>
              </DialogHeader>
              {itemPareto && (
                <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-xs sm:grid-cols-4">
                  <div className="sm:col-span-4"><div className="text-[11px] uppercase text-muted-foreground">#{itemPareto.posicao} · <span className="font-mono">{itemPareto.sku}</span></div><div className="text-sm font-bold">{itemPareto.descricao || "Sem descrição"}</div><div className="text-muted-foreground">{itemPareto.almox} · fechamento de {dmy(itemPareto.data)}</div></div>
                  <div><div className="text-[11px] uppercase text-muted-foreground">Sistema × contagem</div><div className="text-base font-bold">{un(itemPareto.sistema, 2)} × {un(itemPareto.contagem, 2)}</div></div>
                  <div><div className="text-[11px] uppercase text-muted-foreground">Divergência</div><div className="text-base font-bold" style={{ color: itemPareto.divergencia < 0 ? atlasCores.danger : atlasCores.success }}>{itemPareto.divergencia > 0 ? "+" : ""}{un(itemPareto.divergencia, 2)} un. · {itemPareto.divergencia < 0 ? "falta" : "sobra"}</div></div>
                  <div><div className="text-[11px] uppercase text-muted-foreground">Valor divergente</div><div className="text-base font-bold">{brl2(itemPareto.valor)}</div></div>
                  <div><div className="text-[11px] uppercase text-muted-foreground">Acumulado até aqui</div><div className="text-base font-bold">{un(itemPareto.pctValor, 1)}% do valor</div></div>
                </div>
              )}
              <TabelaDivergencias linhas={r.conc.curva} destaque={paretoSel} />
            </DialogContent>
          </Dialog>

          <Dialog open={faixaSel != null} onOpenChange={(o) => !o && setFaixaSel(null)}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Divergências de {faixaSel}</DialogTitle>
                <DialogDescription>Período analisado: {periodo} · {un(resumoFaixa.qtd)} itens ({un(resumoFaixa.faltas)} faltas, {un(resumoFaixa.sobras)} sobras) · {brl2(resumoFaixa.valor)} divergente.</DialogDescription>
              </DialogHeader>
              <TabelaDivergencias linhas={listaFaixa} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
