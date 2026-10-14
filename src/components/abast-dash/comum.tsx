import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Farol } from "@/lib/abastecimento-dash-hist";
import type { Cluster, DashLinha, Reposicao } from "@/lib/abastecimento-dash";

export const NOME: Record<string, string> = { ELDORADO: "Eldorado", JESUINO: "Jesuino", PATIO: "Patio Paulista", CD: "Almox SP (CD)" };
export const LOJAS = ["ELDORADO", "JESUINO", "PATIO"];
export type Escopo = "LOJAS" | "TODOS" | "ELDORADO" | "JESUINO" | "PATIO" | "CD";
export type Categoria = "AMBAS" | "Produto Acabado" | "Mercadoria de Revenda";
export type Filtro = { de: string; ate: string; escopo: Escopo; categoria: Categoria };
export const escopoLocais = (e: Escopo): string[] => (e === "LOJAS" ? LOJAS : e === "TODOS" ? [...LOJAS, "CD"] : [e]);
export const escopoRotulo = (e: Escopo) => (e === "LOJAS" ? "Lojas (meta)" : e === "TODOS" ? "Todos (lojas + CD)" : NOME[e]);

export const FAROL: Record<Farol, { pill: string; borda: string; texto: string; hex: string; nome: string }> = {
  verde: { pill: "bg-emerald-100 text-emerald-700", borda: "border-l-emerald-500", texto: "text-emerald-600", hex: "#16a34a", nome: "Verde" },
  amarelo: { pill: "bg-yellow-100 text-yellow-700", borda: "border-l-yellow-500", texto: "text-yellow-600", hex: "#eab308", nome: "Amarelo" },
  laranja: { pill: "bg-orange-100 text-orange-700", borda: "border-l-orange-500", texto: "text-orange-600", hex: "#f97316", nome: "Laranja" },
  vermelho: { pill: "bg-red-100 text-red-700", borda: "border-l-red-500", texto: "text-red-600", hex: "#dc2626", nome: "Vermelho" },
};
export const CLUSTER_PILL: Record<Cluster, string> = {
  ruptura: "bg-red-900 text-white", critico: "bg-red-600 text-white", urgente: "bg-red-400 text-white", alerta: "bg-orange-500 text-white",
  atencao: "bg-yellow-400 text-yellow-950", monitorar: "bg-blue-100 text-blue-700 border border-blue-300", ok: "bg-emerald-100 text-emerald-700 border border-emerald-300",
};
export const CLUSTER_ROTULO: Record<Cluster, string> = { ruptura: "RUPTURA", critico: "CRÍTICO", urgente: "URGENTE", alerta: "ALERTA", atencao: "ATENÇÃO", monitorar: "MONITORAR", ok: "OK" };
export const STATUS_PILL: Record<string, { c: string; r: string }> = {
  ruptura: { c: "bg-red-100 text-red-700", r: "Ruptura" }, stockout: { c: "bg-yellow-100 text-yellow-700", r: "Stockout" },
  ok: { c: "bg-emerald-100 text-emerald-700", r: "OK" }, stockover: { c: "bg-violet-100 text-violet-700", r: "Stock Over" },
};

export const pct = (v: number | null | undefined, casas = 2) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);
export const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("pt-BR"));
export const n1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
export const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
export const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
export const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function repTexto(l: DashLinha): { t: string; c: string } {
  const r: Reposicao = l.reposicao; const un = l.entradaTotal;
  if (r === "enderecado") return { t: `✓ Endereçado · ${n0(un)} un chegam ${dm(l.chegaEm)}`, c: "bg-teal-50 text-teal-700" };
  if (r === "tarde") return { t: `⚠ Chega tarde · ${l.diasSemEstoque} d sem estoque`, c: "bg-orange-50 text-orange-700" };
  if (r === "sem_pedido") return { t: "✗ Sem pedido", c: "bg-red-50 text-red-700" };
  return { t: "Fora do horizonte", c: "bg-slate-100 text-slate-500" };
}
export function Pill({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
export function Chip({ ativo, onClick, children, cls = "" }: { ativo: boolean; onClick: () => void; children: React.ReactNode; cls?: string }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs transition ${ativo ? "bg-slate-900 text-white border-slate-900 font-semibold" : "bg-background hover:bg-muted"} ${cls}`}>{children}</button>;
}
export function Secao({ letra, titulo, children, acao }: { letra: string; titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">{letra}</span><h2 className="text-sm font-bold">{titulo}</h2></div>{acao}</div>
      {children}
    </section>
  );
}
export const Th = ({ c, d }: { c: string; d?: boolean }) => <th className={`bg-muted px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${d ? "text-right" : "text-left"}`}>{c}</th>;

// Tabela com altura fixa e rolagem interna (cabeçalho fixo) + opção de maximizar em tela cheia.
export function TabelaRolavel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [max, setMax] = useState(false);
  const botao = (
    <button type="button" onClick={() => setMax(!max)} className="flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted">
      {max ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />} {max ? "Restaurar" : "Maximizar"}
    </button>
  );
  if (max) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-4">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{titulo}</h3>{botao}</div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">{children}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex justify-end">{botao}</div>
      <div className="max-h-[520px] overflow-auto rounded-lg border">{children}</div>
    </div>
  );
}
