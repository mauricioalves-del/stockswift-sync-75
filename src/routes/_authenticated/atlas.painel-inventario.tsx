import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FiltrosInv } from "@/components/atlas/FiltrosInv";
import { carregarInventario, evolucaoMensal, kpis, opcoesInv, porAlmox, porGrupo, rankingFinanceiro, rankingSku } from "@/lib/atlas-inventario";

export const Route = createFileRoute("/_authenticated/atlas/painel-inventario")({
  component: PainelInventario,
  head: () => ({ meta: [{ title: "Painel Inventário — Atlas" }] }),
});

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const mesRot = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

function PainelInventario() {
  const q = useQuery({ queryKey: ["atlas-inventario"], queryFn: carregarInventario, staleTime: 120000 });
  const [almox, setAlmox] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const r = useMemo(() => {
    if (!q.data) return null;
    const D = q.data, f = { almox, mes };
    return { k: kpis(D, f), grupo: porGrupo(D, f), almox: porAlmox(D, mes), fin: rankingFinanceiro(D, f), rec: rankingSku(D, almox, "recorrentes"), imp: rankingSku(D, almox, "impacto"), evo: evolucaoMensal(D, almox), op: opcoesInv(D) };
  }, [q.data, almox, mes]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="size-6" /> Painel Inventário</h1>
          <p className="text-sm text-muted-foreground">Resultado dos fechamentos de inventário (conciliação contábil × físico). Acurácia = % de itens sem divergência; o valor é o da planilha de fechamento.</p>
        </div>
        {r && <FiltrosInv almox={almox} setAlmox={setAlmox} mes={mes} setMes={setMes} op={r.op} />}
      </div>
      {!r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os fechamentos…</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[["Itens avaliados", un(r.k.total)], ["Divergentes", un(r.k.divergentes)], ["Acurácia", r.k.acuracia == null ? "—" : `${un(r.k.acuracia, 2)}%`], ["SKUs ≥ 95%", r.k.acima95 == null ? "—" : `${un(r.k.acima95, 2)}%`], ["Déficit (faltas)", brl(r.k.faltas)], ["Resultado líquido", brl(r.k.resultado)]].map(([rot, v]) => (
              <Card key={rot}><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{rot}</div><div className={`mt-1 text-xl font-semibold ${rot === "Resultado líquido" && r.k.resultado < 0 ? "text-destructive" : ""}`}>{v}</div></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Evolução mensal {almox ? `· ${almox}` : ""}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.evo}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="rotulo" tick={{ fontSize: 11 }} /><YAxis yAxisId="a" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><YAxis yAxisId="v" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any, n: any) => (n === "Acurácia" ? [`${un(v, 2)}%`, n] : [brl(v), n])} />
                  <Bar yAxisId="v" dataKey="valor" name="Valor divergente" fill="#C2763A" opacity={0.5} /><Line yAxisId="a" dataKey="acuracia" name="Acurácia" stroke="#4E7F84" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer></div>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">Mês</th><th className="p-1 text-right">Acurácia</th><th className="p-1 text-right">MoM</th><th className="p-1 text-right">Fechamentos</th><th className="p-1 text-right">Almox. avaliados</th><th className="p-1 text-right">Valor divergente</th></tr></thead>
                <tbody>{[...r.evo].reverse().map((m) => <tr key={m.mes} className="border-t"><td className="p-1">{mesRot(m.mes)}</td><td className="p-1 text-right">{un(m.acuracia, 2)}%</td><td className={`p-1 text-right ${m.varPp == null ? "" : m.varPp >= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varPp == null ? "—" : `${m.varPp > 0 ? "+" : ""}${un(m.varPp, 2)} p.p.`}</td><td className="p-1 text-right">{m.fechamentos}</td><td className="p-1 text-right">{m.almoxarifados}</td><td className="p-1 text-right">{brl(m.valor)}</td></tr>)}</tbody></table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Acurácia por grupo de produto</CardTitle></CardHeader>
              <CardContent style={{ height: Math.max(200, r.grupo.length * 26 + 40) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={r.grupo} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="chave" width={150} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: any, _n: any, p: any) => [`${un(v, 2)}% · ${un(p.payload.total)} itens · ${un(p.payload.acima95, 1)}% ≥ 95%`, "Acurácia"]} /><Bar dataKey="acuracia" fill="#4E7F84" /></BarChart></ResponsiveContainer></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Acurácia por almoxarifado {mes ? `· ${mesRot(mes)}` : ""}</CardTitle></CardHeader>
              <CardContent style={{ height: Math.max(200, r.almox.length * 30 + 40) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={r.almox} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="chave" width={150} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: any, _n: any, p: any) => [`${un(v, 2)}% · ${un(p.payload.total)} itens`, "Acurácia"]} /><Bar dataKey="acuracia" fill="#7A8F3B" /></BarChart></ResponsiveContainer></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["Maiores faltas (R$)", r.fin.faltas, "text-destructive"], ["Maiores sobras (R$)", r.fin.sobras, "text-emerald-700"]] as const).map(([t, l, cls]) => (
              <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-base">{t}</CardTitle></CardHeader>
                <CardContent><table className="w-full text-xs"><tbody>{l.map((x) => <tr key={x.sku} className="border-b last:border-0"><td className="p-1 font-mono">{x.sku}</td><td className="max-w-[260px] truncate p-1 text-muted-foreground">{x.descricao}</td><td className={`p-1 text-right ${cls}`}>{brl(x.valor)}</td></tr>)}</tbody></table></CardContent></Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["SKUs mais recorrentes em todos os fechamentos", r.rec, "ocorr."], ["Maior impacto financeiro em faltas (todos os fechamentos)", r.imp, "R$"]] as const).map(([t, l]) => (
              <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-base">{t}</CardTitle></CardHeader>
                <CardContent><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">SKU</th><th className="p-1">Produto</th><th className="p-1">Último almox.</th><th className="p-1 text-right">Vezes</th><th className="p-1 text-right">Valor</th></tr></thead><tbody>{l.map((x) => <tr key={x.sku} className="border-t"><td className="p-1 font-mono">{x.sku}</td><td className="max-w-[200px] truncate p-1 text-muted-foreground">{x.descricao}</td><td className="p-1">{x.almox}</td><td className="p-1 text-right">{x.ocorrencias}</td><td className="p-1 text-right">{brl(x.valor)}</td></tr>)}</tbody></table></CardContent></Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
