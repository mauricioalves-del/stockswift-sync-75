export function calcAcuracidade(contada: number, sistemico: number): number {
  if (!sistemico) return contada === 0 ? 100 : 999;
  return Math.round(((contada / sistemico) * 100) * 100) / 100;
}

export function acuracidadeColor(ac: number | null | undefined): {
  bg: string; text: string; label: string; key: "verde" | "amarelo" | "vermelho";
} {
  if (ac == null) return { bg: "bg-muted", text: "text-muted-foreground", label: "—", key: "verde" };
  if (ac >= 97 && ac <= 100) return { bg: "bg-success/15", text: "text-success", label: `${ac.toFixed(1)}%`, key: "verde" };
  if (ac > 100) return { bg: "bg-warning/20", text: "text-warning-foreground", label: `${ac.toFixed(1)}%`, key: "amarelo" };
  return { bg: "bg-destructive/15", text: "text-destructive", label: `${ac.toFixed(1)}%`, key: "vermelho" };
}

export function statusLabel(s: string): { label: string; tone: "success" | "warning" | "destructive" | "info" | "muted" } {
  switch (s) {
    case "OK": return { label: "Acurado", tone: "success" };
    case "DIVERGENCIA_POSITIVA": return { label: "Divergência (+)", tone: "warning" };
    case "RECONTAGEM_NECESSARIA": return { label: "Recontagem", tone: "destructive" };
    case "AGUARDANDO_APROVACAO": return { label: "Aprovação", tone: "info" };
    case "APROVADO": return { label: "Aprovado", tone: "success" };
    case "PENDENTE": return { label: "Pendente", tone: "muted" };
    default: return { label: s, tone: "muted" };
  }
}

export function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNum(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
