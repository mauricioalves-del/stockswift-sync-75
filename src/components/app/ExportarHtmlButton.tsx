import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportarDashboardHtml, type FiltroChip } from "@/lib/export-html";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** id do elemento raiz do dashboard a ser serializado */
  targetId: string;
  /** nome exibido no cabeçalho do HTML exportado e usado no nome do arquivo */
  titulo: string;
  /** filtros ativos, exibidos como chips no topo do arquivo */
  filtros?: FiltroChip[];
  className?: string;
};

/** Botão reutilizável de "Exportar HTML" — plugável em qualquer dashboard. */
export function ExportarHtmlButton({ targetId, titulo, filtros = [], className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    const el = document.getElementById(targetId);
    if (!el) return toast.error("Não foi possível localizar o conteúdo do dashboard.");
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const usuario = data.user?.email ?? undefined;
      // cede um frame para o indicador de progresso aparecer antes da serialização
      await new Promise((r) => setTimeout(r, 30));
      await exportarDashboardHtml({ titulo, elemento: el, filtros, usuario });
      toast.success("HTML exportado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={loading} className={className} data-export-hide>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Exportar HTML
    </Button>
  );
}
