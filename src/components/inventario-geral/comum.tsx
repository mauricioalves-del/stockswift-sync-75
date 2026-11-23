// Contagem de Inventário (inventário geral) — utilitários e peças compartilhadas.
import { supabase } from "@/integrations/supabase/client";
export const sb = supabase as any;
export const STATUS_INV: Record<string, [string, string]> = {
  planejado: ["Planejado", "bg-slate-200 text-slate-700"], lista_gerada: ["Lista gerada", "bg-sky-100 text-sky-800"], em_contagem: ["Em contagem", "bg-indigo-100 text-indigo-800"],
  em_recontagem: ["Em recontagem", "bg-amber-100 text-amber-800"], finalizado: ["Finalizado", "bg-emerald-100 text-emerald-800"], cancelado: ["Cancelado", "bg-red-100 text-red-700"],
};
export function StatusInv({ s }: { s: string }) { const [t, c] = STATUS_INV[s] ?? [s, "bg-muted"]; return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{t}</span>; }
export const dataHora = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
export type Usuario = { id: string; nome: string | null; email: string | null };
export const nomeUsuario = (u?: Usuario | null) => (u ? u.nome || u.email || u.id.slice(0, 8) : "—");
