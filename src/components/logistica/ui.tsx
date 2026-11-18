// Peças visuais e utilitários do pilar Controle Logístico (padrão do Dashboard de Disponibilidade).
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export const sb = supabase as any;
export const brl = (v: number | null | undefined, d = 2) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d, minimumFractionDigits: d }));
export const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
export const dataBR = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—");
export const STATUS_COR: Record<string, string> = { cotacao: "bg-amber-100 text-amber-800", aprovada: "bg-sky-100 text-sky-800", programada: "bg-sky-100 text-sky-800", coletada: "bg-indigo-100 text-indigo-800", em_transito: "bg-indigo-100 text-indigo-800", em_transporte: "bg-indigo-100 text-indigo-800", entregue: "bg-emerald-100 text-emerald-800", encerrada: "bg-slate-200 text-slate-700", ocorrencia: "bg-red-100 text-red-800", cancelada: "bg-slate-200 text-slate-500 line-through", pendente: "bg-amber-100 text-amber-800", aprovado: "bg-emerald-100 text-emerald-800", rejeitado: "bg-red-100 text-red-800" };
export const ROT: Record<string, string> = { cotacao: "Em cotação", aprovada: "Aprovada", programada: "Programada", coletada: "Coletada", em_transito: "Em trânsito", em_transporte: "Em transporte", entregue: "Entregue", encerrada: "Encerrada", ocorrencia: "Ocorrência", cancelada: "Cancelada", pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };
export function Status({ s }: { s: string }) { return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COR[s] ?? "bg-muted"}`}>{ROT[s] ?? s}</span>; }

export function Hero({ titulo, sub, children }: { titulo: string; sub: string; children?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-slate-900 px-5 py-4 text-white">
    <div><h1 className="text-xl font-bold">{titulo}</h1><p className="mt-1 text-xs text-slate-300">{sub}</p></div><div className="flex items-center gap-2">{children}</div></div>;
}
export function CardKpi({ t, v, sub, borda = "border-l-slate-300", tom = "" }: { t: string; v: string; sub?: string; borda?: string; tom?: string }) {
  return <div className={`rounded-xl border border-l-4 bg-card p-3 shadow-sm ${borda}`}><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tom}`}>{v}</div>{sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}</div>;
}
export const inputCls = "mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm";
export function Campo({ l, children, className = "" }: { l: string; children: ReactNode; className?: string }) { return <label className={`text-[11px] font-semibold text-muted-foreground ${className}`}>{l}{children}</label>; }

/** Envia nota/comprovante ao bucket privado e devolve o caminho. */
export async function enviarDoc(pasta: string, f: File): Promise<string> {
  const path = `${pasta}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("logistica-docs").upload(path, f, { contentType: f.type || undefined });
  if (error) throw error; return path;
}
export async function abrirDoc(path: string) {
  const { data, error } = await supabase.storage.from("logistica-docs").createSignedUrl(path, 300);
  if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
}
