import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gem } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MultiSelect } from "@/components/ui/multi-select";

export const Route = createFileRoute("/_authenticated/shelf-life/premium")({
  component: DashboardPremiumPage,
  head: () => ({
    meta: [
      { title: "Dashboard Premium | Shelf Life" },
      { name: "description", content: "Controle dos SKUs top de linha: estoque, custo, validade e Shelf por almoxarifado." },
    ],
  }),
});

type Faixa = "Follow-up" | "Atenção";
type FiltroFaixa = "Todas" | Faixa;
type Premium = { id_produto: string; descricao: string | null; faixa: Faixa; doi_dias: number };
type LinhaEstoque = {
  id_produto: string; origem: string | null; lote: string | null;
  data_validade: string | null; quantidade: number | string | null; custo_unitario: number | string | null;
};
type Sem = "verde" | "amarelo" | "vermelho";

const MS_DIA = 86400000;
// Mesmos limites padrão do Farol Premium (fração da vida útil consumida).
const LIMITE_AMARELO = 0.5;
const LIMITE_VERMELHO = 0.75;

const COR_TXT: Record<Sem, string> = { verde: "text-emerald-300", amarelo: "text-amber-300", vermelho: "text-red-400" };
const BOLA: Record<Sem, string> = { verde: "🟢", amarelo: "🟡", vermelho: "🔴" };
const COR_FAIXA: Record<Faixa, string> = { "Follow-up": "#5eead4", "Atenção": "#fbbf24" };

function msDe(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function emojiDe(descricao: string): string {
  const d = descricao.toLowerCase();
  if (d.includes("mini ovos")) return "🐰";
  if (d.includes("ovo") || d.includes("bombons")) return "🍫";
  return "🎁";
}
function semaforo(dias: number, doi: number): { sem: Sem; shelf: number } {
  const shelf = 1 - dias / doi;
  if (dias < 0 || shelf > LIMITE_VERMELHO) return { sem: "vermelho", shelf };
  if (shelf >= LIMITE_AMARELO) return { sem: "amarelo", shelf };
  return { sem: "verde", shelf };
}
function shelfTxt(shelf: number): string {
  const p = Math.round(shelf * 100);
  return p > 100 ? ">100%" : `${Math.max(p, 0)}%`;
}

type Filtros = { faixa: FiltroFaixa; produtos: string[] };

/** Monta tudo o que o painel mostra. Função pura (testável): filtros, cartões, gráfico e tabelas por SKU. */
function montarPainel(prios: Premium[], estoque: LinhaEstoque[], hoje: string, f: Filtros) {
  const ordem = (x: Faixa) => (x === "Atenção" ? 0 : 1);
  const selecionados = prios
    .filter((p) => (f.faixa === "Todas" || p.faixa === f.faixa) && (f.produtos.length === 0 || f.produtos.includes(p.id_produto)))
    .sort((a, b) => ordem(a.faixa) - ordem(b.faixa) || a.id_produto.localeCompare(b.id_produto));

  const skus = selecionados.map((p) => {
    const brutos = estoque.filter((e) => e.id_produto === p.id_produto && Number(e.quantidade) > 0 && e.data_validade);
    // Como na tabela do Power BI: agrupa por almoxarifado + validade e soma a quantidade.
    const grupos = new Map<string, { origem: string; validade: string; qtd: number; custo: number }>();
    for (const e of brutos) {
      const origem = e.origem ?? "—";
      const validade = String(e.data_validade).slice(0, 10);
      const qtd = Number(e.quantidade) || 0;
      const g = grupos.get(`${origem}|${validade}`) ?? { origem, validade, qtd: 0, custo: 0 };
      g.qtd += qtd;
      g.custo += qtd * (Number(e.custo_unitario) || 0);
      grupos.set(`${origem}|${validade}`, g);
    }
    const linhas = [...grupos.values()]
      .map((g) => {
        const dias = Math.round((msDe(g.validade) - msDe(hoje)) / MS_DIA);
        return { ...g, dias, ...semaforo(dias, p.doi_dias) };
      })
      .sort((a, b) => a.validade.localeCompare(b.validade) || a.origem.localeCompare(b.origem));
    return {
      p, linhas,
      qtd: linhas.reduce((s, l) => s + l.qtd, 0),
      custo: linhas.reduce((s, l) => s + l.custo, 0),
    };
  });

  const grafico = skus
    .filter((s) => s.linhas.length > 0)
    .map((s) => ({ nome: s.p.descricao ?? s.p.id_produto, custo: s.custo, faixa: s.p.faixa }))
    .sort((a, b) => b.custo - a.custo);

  return {
    skus,
    grafico,
    totalQtd: skus.reduce((s, x) => s + x.qtd, 0),
    totalCusto: skus.reduce((s, x) => s + x.custo, 0),
  };
}

const VIDRO = "rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm";

function DashboardPremiumPage() {
  const [faixa, setFaixa] = useState<FiltroFaixa>("Todas");
  const [produtos, setProdutos] = useState<string[]>([]);

  const priosQ = useQuery({
    queryKey: ["premium-dash-prios"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("premium_prioridades").select("id_produto, descricao, faixa, doi_dias").eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as Premium[];
    },
  });
  const prios = priosQ.data ?? [];
  const idsKey = prios.map((p) => p.id_produto).sort().join(",");

  const estoqueQ = useQuery({
    queryKey: ["premium-dash-estoque", idsKey],
    enabled: prios.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_sistemico")
        .select("id_produto, origem, lote, data_validade, quantidade, custo_unitario")
        .in("id_produto", prios.map((p) => p.id_produto)).gt("quantidade", 0).limit(5000);
      if (error) throw error;
      return (data ?? []) as LinhaEstoque[];
    },
  });

  const hoje = hojeISO();
  const painel = useMemo(
    () => montarPainel(prios, estoqueQ.data ?? [], hoje, { faixa, produtos }),
    [prios, estoqueQ.data, hoje, faixa, produtos],
  );
  const opcoesProduto = useMemo(
    () => [...prios].sort((a, b) => (a.descricao ?? "").localeCompare(b.descricao ?? ""))
      .map((p) => ({ value: p.id_produto, label: p.descricao ?? p.id_produto })),
    [prios],
  );
  const carregando = priosQ.isLoading || estoqueQ.isLoading;

  return (
    <div className="rounded-2xl p-4 md:p-6 space-y-4 text-white bg-gradient-to-br from-neutral-950 via-neutral-800 to-stone-900">
      <div className="flex items-center gap-2">
        <Gem className="size-6 text-amber-300" />
        <div>
          <h1 className="text-2xl font-bold leading-tight">Dashboard Premium</h1>
          <p className="text-xs text-white/60">SKUs top de linha: estoque, custo, validade e Shelf por almoxarifado.</p>
        </div>
      </div>

      {/* Linha de filtros e cartões (como a faixa superior do Power BI) */}
      <div className="grid gap-3 md:grid-cols-12">
        <div className={`${VIDRO} p-3 md:col-span-3`}>
          <div className="text-[11px] uppercase tracking-wide text-white/60 mb-2">Prioridade</div>
          <div className="flex flex-wrap gap-2">
            {(["Todas", "Follow-up", "Atenção"] as FiltroFaixa[]).map((o) => (
              <button
                key={o} type="button" onClick={() => setFaixa(o)}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  faixa === o ? "bg-amber-300 text-neutral-900 border-amber-300 font-semibold" : "border-white/25 text-white/80 hover:bg-white/10"
                }`}
              >{o}</button>
            ))}
          </div>
        </div>
        <div className={`${VIDRO} p-3 md:col-span-4`}>
          <div className="text-[11px] uppercase tracking-wide text-white/60 mb-2">Produto</div>
          <MultiSelect
            options={opcoesProduto} value={produtos} onChange={setProdutos}
            placeholder="Buscar produto..." allLabel="Todos os produtos"
            className="bg-white/90 text-neutral-900 hover:bg-white"
          />
        </div>
        <div className={`${VIDRO} p-3 md:col-span-2`}>
          <div className="text-[11px] uppercase tracking-wide text-white/60">Total de Itens 🍫</div>
          <div className="text-3xl font-bold mt-1">{num(painel.totalQtd)}</div>
        </div>
        <div className={`${VIDRO} p-3 md:col-span-3`}>
          <div className="text-[11px] uppercase tracking-wide text-white/60">Custo Total 💸</div>
          <div className="text-3xl font-bold mt-1">{brl(painel.totalCusto)}</div>
        </div>
      </div>

      {/* Gráfico: Custo Operacional por produto */}
      <div className={`${VIDRO} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Custo Operacional</h2>
          <div className="flex gap-3 text-[11px] text-white/70">
            {(["Atenção", "Follow-up"] as Faixa[]).map((f) => (
              <span key={f} className="flex items-center gap-1">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: COR_FAIXA[f] }} /> {f}
              </span>
            ))}
          </div>
        </div>
        {painel.grafico.length === 0 ? (
          <p className="text-sm text-white/60 py-6 text-center">{carregando ? "Carregando..." : "Nenhum SKU com estoque no filtro atual."}</p>
        ) : (
          <div style={{ height: Math.max(180, painel.grafico.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={painel.grafico} layout="vertical" margin={{ left: 8, right: 90, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={230} tick={{ fill: "#ffffff", fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [brl(v), "Custo"]}
                  contentStyle={{ background: "#171717", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, color: "#fff" }}
                  cursor={{ fill: "rgba(255,255,255,.06)" }}
                />
                <Bar dataKey="custo" radius={[0, 6, 6, 0]}>
                  {painel.grafico.map((g) => <Cell key={g.nome} fill={COR_FAIXA[g.faixa]} />)}
                  <LabelList dataKey="custo" position="right" formatter={(v: number) => brl(v)} style={{ fill: "#ffffff", fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Uma tabela por SKU */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {painel.skus.map((s) => (
          <div key={s.p.id_produto} className={`${VIDRO} p-3`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-sm leading-snug">{s.p.descricao ?? s.p.id_produto} {emojiDe(s.p.descricao ?? "")}</h3>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border"
                style={{ borderColor: COR_FAIXA[s.p.faixa], color: COR_FAIXA[s.p.faixa] }}>{s.p.faixa}</span>
            </div>
            {s.linhas.length === 0 ? (
              <p className="text-xs text-amber-300 py-4">⚠️ Sem estoque em nenhum almoxarifado.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/60 text-[10px] uppercase">
                    <th className="text-left py-1 pr-2">Origem</th>
                    <th className="text-left py-1 pr-2">Validade</th>
                    <th className="text-right py-1 pr-2">Qtd</th>
                    <th className="text-right py-1 pr-2">Dias p/ vencer</th>
                    <th className="text-right py-1">Shelf</th>
                  </tr>
                </thead>
                <tbody>
                  {s.linhas.map((l) => (
                    <tr key={`${l.origem}-${l.validade}`} className="border-t border-white/10">
                      <td className="py-1 pr-2">{l.origem}</td>
                      <td className="py-1 pr-2">{dataBR(l.validade)}</td>
                      <td className="py-1 pr-2 text-right">{num(l.qtd)}</td>
                      <td className={`py-1 pr-2 text-right font-semibold ${COR_TXT[l.sem]}`}>{l.dias < 0 ? "vencido" : l.dias}</td>
                      <td className={`py-1 text-right font-semibold whitespace-nowrap ${COR_TXT[l.sem]}`}>{BOLA[l.sem]} {shelfTxt(l.shelf)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/30 font-bold">
                    <td className="py-1 pr-2" colSpan={2}>Total</td>
                    <td className="py-1 pr-2 text-right">{num(s.qtd)}</td>
                    <td className="py-1 text-right" colSpan={2}>{brl(s.custo)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {painel.skus.length === 0 && !carregando && (
        <p className="text-sm text-white/60 text-center py-6">Nenhum SKU encontrado para os filtros escolhidos.</p>
      )}

      <p className="text-[11px] text-white/50">
        🟢 Shelf consumido abaixo de {Math.round(LIMITE_AMARELO * 100)}% · 🟡 de {Math.round(LIMITE_AMARELO * 100)}% a {Math.round(LIMITE_VERMELHO * 100)}% ·
        🔴 acima de {Math.round(LIMITE_VERMELHO * 100)}% ou vencido. Shelf = 1 − dias para vencer ÷ DOI (cadastrado em Shelf Life → Cadastro de DOI).
        Custo = quantidade × custo unitário do estoque do sistema.
      </p>
    </div>
  );
}
