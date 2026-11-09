import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtlasGrafico, atlasCores } from "@/components/atlas/AtlasGrafico";
import { Loader2, Scale } from "lucide-react";
import { Secao, Th } from "@/components/abast-dash/comum";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FiltrosInv } from "@/components/atlas/FiltrosInv";
import { carregarInventario, comparativo, comparativoPorAlmox, comparativoPorGrupo, concentracao, evolucaoPonderada, faltaSobra, magnitude, opcoesInv, rankingSku } from "@/lib/atlas-inventario";

export const Route = createFileRoute("/_authenticated/atlas/acuracia-ponderada")({
  component: AcuraciaPonderada,
  head: () => ({ meta: [{ title: "Acurácia Ponderada — Atlas" }, { name: "description", content: "Comparativo dos modelos de acurácia, Pareto, magnitude e evolução mensal do Atlas." }, { property: "og:title", content: "Acurácia Ponderada — Atlas" }, { property: "og:description", content: "Comparativo dos modelos de acurácia, Pareto, magnitude e evolução mensal do Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${un(n, 2)}%`);
const pp = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${un(n, 2)} p.p.`);

const modelosMoM = {
  iap: { nome: "IAP (valor)", valor: "iap", variacao: "varIap" },
  iaq: { nome: "IAQ (quantidade)", valor: "iaq", variacao: "varIaq" },
  item: { nome: "Item a item", valor: "item", variacao: "varItem" },
  valorMod: { nome: "Valor Mod (R$)", valor: "valorMod", variacao: "varMod" },
} as const;


function AcuraciaPonderada() {
  const q = useQuery({ queryKey: ["atlas-inventario"], queryFn: carregarInventario, staleTime: 120000 });
  const [almox, setAlmox] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [modeloMoM, setModeloMoM] = useState<keyof typeof modelosMoM>("iap");
  const modelo = modelosMoM[modeloMoM];
  const momMonetario = modeloMoM === "valorMod";
  const r = useMemo(() => {
    if (!q.data) return null;
    const D = q.data, f = { almox, mes };
    return { c: comparativo(D, f), grupo: comparativoPorGrupo(D, f), porAlmox: comparativoPorAlmox(D, mes), conc: concentracao(D, f), mag: magnitude(D, f), fs: faltaSobra(D, f), evo: evolucaoPonderada(D, almox), risco: rankingSku(D, almox, "risco"), op: opcoesInv(D) };
  }, [q.data, almox, mes]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Scale className="size-5" /> Acurácia Ponderada <span className="ml-2 text-sm font-normal text-slate-300">Item a item · IAQ · IAP</span></h1>
        <div className="text-xs text-slate-300">Competência: {mes ? `${mes.slice(5)}/${mes.slice(0, 4)}` : "todas"} · Leitura: {q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}</div>
      </div>
      {!r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os fechamentos…</div> : (
        <>
          <Secao letra="A" titulo="Filtros">
            <div className="flex flex-wrap items-end gap-3">
              <FiltrosInv almox={almox} setAlmox={setAlmox} mes={mes} setMes={setMes} op={r.op} />
              <button type="button" onClick={() => { setAlmox(null); setMes(null); }} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
            </div>
          </Secao>
          <Secao letra="B" titulo="Indicadores do período">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([["Item a item", pct(r.c.item), null], ["IAQ (por quantidade)", pct(r.c.iaq), `${pp(r.c.iaq != null && r.c.item != null ? r.c.iaq - r.c.item : null)} vs. item a item`], ["IAP (por valor)", pct(r.c.iap), `${pp(r.c.iap != null && r.c.item != null ? r.c.iap - r.c.item : null)} vs. item a item`], ["Cobertura de custo", pct(r.c.cobertura), `${brl(r.c.divergenteValor)} divergente de ${brl(r.c.portfolio)} avaliado`]] as const).map(([t, v, sub]) => (
                <div key={t} className="rounded-lg border bg-background p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className="mt-1 text-2xl font-bold">{v}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground"><strong>Item a item</strong> conta SKUs sem divergência. <strong>IAQ</strong> pondera pela quantidade: 1 − |divergência| ÷ quantidade em sistema. <strong>IAP</strong> pondera pelo valor: 1 − valor divergente ÷ valor do estoque avaliado, só SKUs com custo cadastrado.</p>
          </Secao>

          <Secao letra="C" titulo="Os três modelos, lado a lado"><AtlasGrafico data={[{ modelo: "Item a item", valor: r.c.item }, { modelo: "IAQ", valor: r.c.iaq }, { modelo: "IAP", valor: r.c.iap }]} category="modelo" horizontal percent legend={false} height={180} series={[{key: "valor", name: "Acurácia", color: atlasCores.success, percent: true}]} /></Secao>
          <div className="grid gap-4 lg:grid-cols-2">
            {([["D", "Por grupo de produto", r.grupo], ["E", `Por almoxarifado${mes ? ` · ${mes.slice(5)}/${mes.slice(0, 4)}` : ""}`, r.porAlmox]] as const).map(([k, t, l]) => (
              <Secao key={t} letra={k} titulo={t}>
                <div className="overflow-x-auto"><AtlasGrafico data={l} category="chave" horizontal percent height={Math.max(260, l.length * 62)} series={[{key: "item", name: "Item a item", color: atlasCores.warning, percent: true, labels: false},{key: "iaq", name: "IAQ (quantidade)", color: atlasCores.success, percent: true, labels: false},{key: "iap", name: "IAP (valor)", color: atlasCores.blue, percent: true, labels: false}]} /><table className="w-full text-xs"><thead><tr><Th c="" /><Th c="Item a item" d /><Th c="IAQ" d /><Th c="IAP" d /></tr></thead>
                  <tbody>{l.map((x) => <tr key={x.chave} className="border-t"><td className="p-1">{x.chave}</td><td className="p-1 text-right">{pct(x.item)}</td><td className="p-1 text-right">{pct(x.iaq)}</td><td className="p-1 text-right">{pct(x.iap)}</td></tr>)}</tbody></table></div></Secao>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao letra="F" titulo="Concentração do valor divergente">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Os {r.conc.topN} maiores itens somam <strong className="text-foreground">{r.conc.topNPct == null ? "—" : `${un(r.conc.topNPct, 1)}%`}</strong> do valor divergente ({brl(r.conc.valorTotal)} em {un(r.conc.total)} itens).</p>
                <div className="h-56"><AtlasGrafico data={r.conc.curva} category="posicao" money rightPercent height={224} series={[{key: "valor", name: "Valor (R$)", color: atlasCores.accent, money: true, labels: false, opacity: 0.6},{key: "pctValor", name: "% acumulado do valor", color: atlasCores.warning, line: true, right: true, percent: true}]} /></div>
              </div>
            </Secao>
            <Secao letra="G" titulo="Divergências por tamanho (unidades)">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{r.mag.pctPequenas == null ? "—" : `${un(r.mag.pctPequenas, 1)}%`} das divergências são pequenas (até 5 un.).</p>
                <div className="h-56"><AtlasGrafico data={r.mag.faixas} category="faixa" height={224} series={[{key: "itens", name: "Nº de itens", color: atlasCores.blue},{key: "valor", name: "Valor (R$)", color: atlasCores.danger, line: true, right: true, money: true}]} /></div>
              </div>
            </Secao>
          </div>

          <Secao letra="H" titulo="Análise MoM — Acurácia Ponderada" acao={<Select value={modeloMoM} onValueChange={(valor) => { if (valor === "iap" || valor === "iaq" || valor === "item" || valor === "valorMod") setModeloMoM(valor); }}>
                <SelectTrigger className="w-44" aria-label="Indicador da análise MoM"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(modelosMoM).map(([valor, opcao]) => <SelectItem key={valor} value={valor}>{opcao.nome}</SelectItem>)}</SelectContent>
              </Select>}>
            <AtlasGrafico data={r.evo} category="rotulo" percent={!momMonetario} money={momMonetario} series={[
              { key: modelo.valor, name: momMonetario ? "Valor divergente do mês (R$)" : `Acurácia do mês — ${modelo.nome}`, color: atlasCores.success, percent: !momMonetario, money: momMonetario },
              { key: modelo.variacao, name: momMonetario ? "Variação MoM (R$)" : "Variação MoM (p.p.)", color: atlasCores.warning, line: true, right: true, money: momMonetario },
            ]} />
          </Secao>
          <Secao letra="I" titulo={`Evolução mensal dos três modelos${almox ? ` · ${almox}` : ""}`}>
            <div>
              <div className="h-64"><AtlasGrafico data={r.evo} category="rotulo" percent series={[{key: "item", name: "Item a item", color: atlasCores.blue, line: true, percent: true},{key: "iaq", name: "IAQ", color: atlasCores.success, line: true, percent: true},{key: "iap", name: "IAP", color: atlasCores.warning, line: true, percent: true}]} /></div>
              <table className="mt-2 w-full text-xs"><thead><tr><Th c="Mês" /><Th c="Item a item" d /><Th c="IAQ" d /><Th c="IAP" d /><Th c="Valor divergente" d /><Th c="Δ valor" d /></tr></thead>
                <tbody>{[...r.evo].reverse().map((m) => <tr key={m.mes} className="border-t"><td className="p-1">{m.rotulo}</td><td className="p-1 text-right">{pct(m.item)} <span className="text-muted-foreground">{pp(m.varItem)}</span></td><td className="p-1 text-right">{pct(m.iaq)} <span className="text-muted-foreground">{pp(m.varIaq)}</span></td><td className="p-1 text-right">{pct(m.iap)} <span className="text-muted-foreground">{pp(m.varIap)}</span></td><td className="p-1 text-right">{brl(m.valorMod)}</td><td className={`p-1 text-right ${m.varMod == null ? "" : m.varMod <= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varMod == null ? "—" : brl(m.varMod)}</td></tr>)}</tbody></table>
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
        </>
      )}
    </div>
  );
}
