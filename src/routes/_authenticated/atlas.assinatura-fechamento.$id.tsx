import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PenLine } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { FechamentoDetalhe, sb } from "@/components/atlas/FechamentoDetalhe";

// Tela própria de assinatura de um fechamento — destino do link do alerta diário (e-mail e tarefa no sino).
// ?papel=<código> já deixa selecionado o papel que falta assinar.
export const Route = createFileRoute("/_authenticated/atlas/assinatura-fechamento/$id")({
  component: AssinaturaFechamento,
  validateSearch: (s: Record<string, unknown>): { papel?: string } => (typeof s.papel === "string" && s.papel ? { papel: s.papel } : {}),
  head: () => ({ meta: [{ title: "Assinatura do fechamento — Atlas" }] }),
});

function AssinaturaFechamento() {
  const { id } = Route.useParams();
  const { papel } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const assina = gestor || role === "DIRETOR_OPERACOES" || role === "COORDENADOR_FINANCEIRO";
  const n = Number(id);
  const almox = useQuery({
    queryKey: ["atlas-almoxarifados-lista"],
    queryFn: async () => ((await sb.from("atlas_almoxarifados").select("codigo, nome_exibicao").order("codigo")).data ?? []) as { codigo: string; nome_exibicao: string }[],
  });
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["atlas-fechamentos"] }); qc.invalidateQueries({ queryKey: ["atlas-fechamento"] }); qc.invalidateQueries({ queryKey: ["atlas-inventario"] }); };

  if (!Number.isInteger(n) || n <= 0) return <div className="p-8 text-center text-muted-foreground">Fechamento inválido.</div>;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PenLine className="size-6" /> Assinatura do fechamento de inventário</h1>
        <Link to="/atlas/fechamento-inventario" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Todos os fechamentos</Link>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <FechamentoDetalhe id={n} gestor={gestor} assina={assina} almoxes={almox.data ?? []} papelInicial={papel} comoPagina
          onMudou={recarregar} onClose={() => navigate({ to: "/atlas/fechamento-inventario" })} />
      </div>
    </div>
  );
}
