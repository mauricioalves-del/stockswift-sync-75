import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtlasGrafico, atlasCores } from "@/components/atlas/AtlasGrafico";
import { BarChart3, Loader2 } from "lucide-react";
import { Secao, Th } from "@/components/abast-dash/comum";
import { FiltrosInv } from "@/components/atlas/FiltrosInv";
import { carregarInventario, evolucaoMensal, kpis, opcoesInv, porAlmox, porGrupo, rankingFinanceiro, rankingSku } from "@/lib/atlas-inventario";

export const Route = createFileRoute("/_authenticated/atlas/painel-inventario")({
  // A tela agora é uma aba do dashboard Acurácia Ponderada; links antigos continuam funcionando.
  beforeLoad: () => { throw redirect({ to: "/atlas/acuracia-ponderada", search: { visao: "painel-inventario" }, replace: true }); },
  component: () => <PainelInventario />,
  head: () => ({ meta: [{ title: "Painel de Inventário — Atlas" }, { name: "description", content: "Acurácia dos fechamentos, evolução mensal e rankings financeiros do inventário Atlas." }, { property: "og:title", content: "Painel de Inventário — Atlas" }, { property: "og:description", content: "Acurácia dos fechamentos, evolução mensal e rankings financeiros do inventário Atlas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const mesRot = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

export function PainelInventario({ embutido = false }: { embutido?: boolean }) {
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
      {!embutido && <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="size-6" /> Painel Inventário</h1>}
      {!r ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os fechamentos…</div> : (
        <>
          <Secao letra="A" titulo="Filtros">
            <div className="flex flex-wrap items-end gap-3">
              <FiltrosInv almox={almox} setAlmox={setAlmox} mes={mes} setMes={setMes} op={r.op} />
              <button type="button" onClick={() => { setAlmox(null); setMes(null); }} className="ml-auto h-9 rounded-md border bg-muted px-4 text-xs font-semibold hover:bg-muted/70">Limpar filtros</button>
            </div>
          </Secao>
          <Secao letra="B" titulo="Indicadores do período">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[["Itens avaliados", un(r.k.total)], ["Divergentes", un(r.k.divergentes)], ["Acurácia", r.k.acuracia == null ? "—" : `${un(r.k.acuracia, 2)}%`], ["SKUs ≥ 95%", r.k.acima95 == null ? "—" : `${un(r.k.acima95, 2)}%`], ["Déficit (faltas)", brl(r.k.faltas)], ["Resultado líquido", brl(r.k.resultado)]].map(([rot, v]) => (
              <div key={rot} className="rounded-lg border bg-background p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rot}</div><div className={`mt-1 text-2xl font-bold ${rot === "Resultado líquido" && r.k.resultado < 0 ? "text-destructive" : rot === "Déficit (faltas)" ? "text-destructive" : ""}`}>{v}</div></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground"><strong>Acurácia</strong> = % de itens sem divergência nos fechamentos (conciliação contábil × físico). <strong>SKUs ≥ 95%</strong> = itens com acurácia individual de 95% ou mais. <strong>Déficit</strong> soma as faltas; <strong>resultado líquido</strong> = sobras − faltas, pelo valor do fechamento.</p>
          </Secao>

          <Secao letra="C" titulo={`Evolução mensal${almox ? ` · ${almox}` : ""}`}>
            <div>
              <div className="h-64"><AtlasGrafico data={r.evo} category="rotulo" percent series={[{key: "acuracia", name: "Acurácia %", color: atlasCores.blue, percent: true},{key: "fechamentos", name: "Fechamentos realizados", color: atlasCores.warning, line: true, right: true}]} /></div>
              <table className="mt-3 w-full text-xs"><thead><tr><Th c="Mês" /><Th c="Acurácia" d /><Th c="MoM" d /><Th c="Fechamentos" d /><Th c="Almox. avaliados" d /><Th c="Valor divergente" d /></tr></thead>
                <tbody>{[...r.evo].reverse().map((m) => <tr key={m.mes} className="border-t"><td className="p-1">{mesRot(m.mes)}</td><td className="p-1 text-right">{un(m.acuracia, 2)}%</td><td className={`p-1 text-right ${m.varPp == null ? "" : m.varPp >= 0 ? "text-emerald-700" : "text-destructive"}`}>{m.varPp == null ? "—" : `${m.varPp > 0 ? "+" : ""}${un(m.varPp, 2)} p.p.`}</td><td className="p-1 text-right">{m.fechamentos}</td><td className="p-1 text-right">{m.almoxarifados}</td><td className="p-1 text-right">{brl(m.valor)}</td></tr>)}</tbody></table>
            </div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao letra="D" titulo="Acurácia por grupo de produto">
              <div style={{ height: Math.max(200, r.grupo.length * 26 + 40) }}><AtlasGrafico data={r.grupo} category="chave" horizontal percent legend={false} height={Math.max(260, r.grupo.length * 30)} series={[{key: "acuracia", name: "Acurácia %", color: atlasCores.success, percent: true}]} /></div>
            </Secao>
            <Secao letra="E" titulo={`Acurácia por almoxarifado${mes ? ` · ${mesRot(mes)}` : ""}`}>
              <div style={{ height: Math.max(200, r.almox.length * 30 + 40) }}><AtlasGrafico data={r.almox} category="chave" horizontal percent legend={false} height={Math.max(260, r.almox.length * 30)} series={[{key: "acuracia", name: "Acurácia %", color: atlasCores.success, percent: true}]} /></div>
            </Secao>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["F", "Maiores faltas (R$)", r.fin.faltas, "text-destructive"], ["G", "Maiores sobras (R$)", r.fin.sobras, "text-emerald-700"]] as const).map(([k, t, l, cls]) => (
              <Secao key={t} letra={k} titulo={t}>
                <div><AtlasGrafico data={l} category="sku" horizontal money legend={false} height={Math.max(220, l.length * 28)} series={[{key: "valor", name: "Valor (R$)", color: t === "Maiores sobras (R$)" ? atlasCores.success : atlasCores.danger, money: true}]} /><table className="w-full text-xs"><tbody>{l.map((x) => <tr key={x.sku} className="border-b last:border-0"><td className="p-1 font-mono">{x.sku}</td><td className="max-w-[260px] truncate p-1 text-muted-foreground">{x.descricao}</td><td className={`p-1 text-right ${cls}`}>{brl(x.valor)}</td></tr>)}</tbody></table></div></Secao>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {([["H", "SKUs mais recorrentes em todos os fechamentos", r.rec, "ocorr."], ["I", "Maior impacto financeiro em faltas (todos os fechamentos)", r.imp, "R$"]] as const).map(([k, t, l]) => (
              <Secao key={t} letra={k} titulo={t}>
                <div><table className="w-full text-xs"><thead><tr><Th c="SKU" /><Th c="Produto" /><Th c="Último almox." /><Th c="Vezes" d /><Th c="Valor" d /></tr></thead><tbody>{l.map((x) => <tr key={x.sku} className="border-t"><td className="p-1 font-mono">{x.sku}</td><td className="max-w-[200px] truncate p-1 text-muted-foreground">{x.descricao}</td><td className="p-1">{x.almox}</td><td className="p-1 text-right">{x.ocorrencias}</td><td className="p-1 text-right">{brl(x.valor)}</td></tr>)}</tbody></table></div></Secao>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
