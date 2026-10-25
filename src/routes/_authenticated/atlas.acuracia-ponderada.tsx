import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FiltrosInv } from "@/components/atlas/FiltrosInv";
import { carregarInventario, comparativo, comparativoPorAlmox, comparativoPorGrupo, concentracao, evolucaoPonderada, faltaSobra, magnitude, opcoesInv, rankingSku } from "@/lib/atlas-inventario";

export const Route = createFileRoute("/_authenticated/atlas/acuracia-ponderada")({
  component: AcuraciaPonderada,
  head: () => ({ meta: [{ title: "Acurácia Ponderada — Atlas" }] }),
});

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${un(n, 2)}%`);
const pp = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${un(n, 2)} p.p.`);
const C = { item: "#9A9A9A", iaq: "#3F6FA8", iap: "#4E7F84" };

function AcuraciaPonderada() {
  const q = useQuery({ queryKey: ["atlas-inventario"], queryFn: carregarInventario, staleTime: 120000 });
  const [almox, setAlmox] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const r = useMemo(() => {
    if (!q.data) return null;
    const D = q.data, f = { almox, mes };
    return { c: comparativo(D, f), grupo: comparativoPorGrupo(D, f), porAlmox: comparativoPorAlmox(D, mes), conc: concentracao(D, f), mag: magnitude(D, f), fs: faltaSobra(D, f), evo: evolucaoPonderada(D, almox), risco: rankingSku(D, almox, "risco"), op: opcoesInv(D) };
  }, [q.data, almox, mes]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Scale className="size-6" /> Acurácia Ponderada</h1>
          <p className="max-w-4xl text-sm text-muted-foreground"><strong>Item a item</strong> conta SKUs sem divergência. <strong>IAQ</strong> pondera pela quantidade: 1 − |divergência| ÷ quantidade em sistema. <strong>IAP</strong> pondera pelo valor: 1 − valor divergente ÷ valor do estoque avaliado, só SKUs com custo cadastrado. Muitos erros pequenos derrubam o item a item e quase não mexem no IAP.</p>
        </div>
        {r && <FiltrosInv almox={almox} setAlmox={setAlmox} mes={mes} setMes={setMes} op={r.op} />}
      </div>
      {!r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os fechamentos…</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Item a item</div><div className="mt-1 text-2xl font-semibold">{pct(r.c.item)}</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">IAQ (por quantidade)</div><div className="mt-1 text-2xl font-semibold">{pct(r.c.iaq)}</div><div className="text-[11px] text-muted-foreground">{pp(r.c.iaq != null && r.c.item != null ? r.c.iaq - r.c.item : null)} vs. item a item</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">IAP (por valor)</div><div className="mt-1 text-2xl font-semibold">{pct(r.c.iap)}</div><div className="text-[11px] text-muted-foreground">{pp(r.c.iap != null && r.c.item != null ? r.c.iap - r.c.item : null)} vs. item a item</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Cobertura de custo</div><div className="mt-1 text-2xl font-semibold">{pct(r.c.cobertura)}</div><div className="text-[11px] text-muted-foreground">{brl(r.c.divergenteValor)} divergente de {brl(r.c.portfolio)} avaliado</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Evolução mensal dos três modelos {almox ? `· ${almox}` : ""}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.evo}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="rotulo" tick={{ fontSize: 11 }} /><YAxis yAxisId="a" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><YAxis yAxisId="v" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any, n: any) => (n === "Valor divergente" ? [brl(v), n] : [pct(v), n])} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="v" dataKey="valorMod" name="Valor divergente" fill="#C2763A" opacity={0.4} />
                  <Line yAxisId="a" dataKey="item" name="Item a item" stroke={C.item} strokeWidth={2} /><Line yAxisId="a" dataKey="iaq" name="IAQ" stroke={C.iaq} strokeWidth={2} /><Line yAxisId="a" dataKey="iap" name="IAP" stroke={C.iap} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer></div>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">Mês</th><th className="p-1 text-right">Item a item</th><th className="p-1 text-right">IAQ</th><th className="p-1 text-right">IAP</th><th className="p-1 text-right">Valor divergente</th><th className="p-1 text-right">Δ valor</th></tr></thead>
                <tbody>{[...r.evo].reverse().map((m) => <tr key={m.mes} className="border-t"><td className="p-1">{m.rotulo}</td><td className="p-1 text-right">{pct(m.item)} <span className="text-muted-foreground">{pp(m.varItem)}</span></td><td className="p-1 text-right">{pct(m.iaq)} <span className="text-muted-foreground">{pp(m.varIaq)}</span></td><td className="p-1 text-right">{pct(m.iap)} <span className="text-muted-foreground">{pp(m.varIap)}</span></td><td className="p-1 text-right">{brl(m.valorMod)}</td><td className={`p-1 text-right ${m.varMod == null ? "" : m.varMod <= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varMod == null ? "—" : brl(m.varMod)}</td></tr>)}</tbody></table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["Por grupo de produto", r.grupo], [`Por almoxarifado${mes ? ` · ${mes.slice(5)}/${mes.slice(0, 4)}` : ""}`, r.porAlmox]] as const).map(([t, l]) => (
              <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-base">{t}</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1" /><th className="p-1 text-right">Item a item</th><th className="p-1 text-right">IAQ</th><th className="p-1 text-right">IAP</th></tr></thead>
                  <tbody>{l.map((x) => <tr key={x.chave} className="border-t"><td className="p-1">{x.chave}</td><td className="p-1 text-right">{pct(x.item)}</td><td className="p-1 text-right">{pct(x.iaq)}</td><td className="p-1 text-right">{pct(x.iap)}</td></tr>)}</tbody></table></CardContent></Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Concentração do valor divergente</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">Os {r.conc.topN} maiores itens somam <strong className="text-foreground">{r.conc.topNPct == null ? "—" : `${un(r.conc.topNPct, 1)}%`}</strong> do valor divergente ({brl(r.conc.valorTotal)} em {un(r.conc.total)} itens).</p>
                <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={r.conc.curva}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="posicao" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><Tooltip formatter={(v: any) => [`${un(v, 1)}% do valor`, "Acumulado"]} labelFormatter={(_, p: any) => (p?.[0] ? `${p[0].payload.posicao}º · ${p[0].payload.sku} · ${brl(p[0].payload.valor)}` : "")} /><Line dataKey="pctValor" stroke={C.iap} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Divergências por tamanho (unidades)</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">{r.mag.pctPequenas == null ? "—" : `${un(r.mag.pctPequenas, 1)}%`} das divergências são pequenas (até 5 un.).</p>
                <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={r.mag.faixas}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="faixa" tick={{ fontSize: 11 }} /><YAxis yAxisId="i" tick={{ fontSize: 11 }} /><YAxis yAxisId="v" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any, n: any) => (n === "Valor" ? [brl(v), n] : [un(v), n])} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar yAxisId="i" dataKey="itens" name="Itens" fill={C.iaq} /><Bar yAxisId="v" dataKey="valor" name="Valor" fill="#C2763A" /></BarChart></ResponsiveContainer></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {([["Maiores faltas", r.fs.falta, `${un(r.fs.qtdFalta)} itens · ${brl(r.fs.valorFalta)}`, "text-destructive"], ["Maiores sobras", r.fs.sobra, `${un(r.fs.qtdSobra)} itens · ${brl(r.fs.valorSobra)}`, "text-emerald-700"]] as const).map(([t, l, sub, cls]) => (
              <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-base">{t}</CardTitle><p className="text-xs text-muted-foreground">{sub}</p></CardHeader>
                <CardContent><table className="w-full text-xs"><tbody>{l.map((x, i) => <tr key={i} className="border-b last:border-0"><td className="p-1"><div className="font-mono">{x.sku}</div><div className="max-w-[170px] truncate text-muted-foreground">{x.descricao}</div></td><td className="p-1 text-right">{un(x.divergencia, 2)}</td><td className={`p-1 text-right ${cls}`}>{brl(x.valor)}</td></tr>)}</tbody></table></CardContent></Card>
            ))}
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recorrentes de maior risco</CardTitle><p className="text-xs text-muted-foreground">SKUs com divergência em 2+ fechamentos; score = vezes × valor</p></CardHeader>
              <CardContent><table className="w-full text-xs"><tbody>{r.risco.map((x) => <tr key={x.sku} className="border-b last:border-0"><td className="p-1"><div className="font-mono">{x.sku}</div><div className="max-w-[150px] truncate text-muted-foreground">{x.descricao}</div></td><td className="p-1 text-right">{x.ocorrencias}×</td><td className="p-1 text-right">{brl(x.valor)}</td></tr>)}</tbody></table></CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}
