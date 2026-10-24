import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, Circle, DatabaseBackup, Orbit } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contarTabelasAtlas } from "@/lib/atlas-backup";
import { ATLAS_TABELAS } from "@/lib/atlas-tabelas";
import { ATLAS_FASES, ATLAS_MODULOS, ATLAS_RENDER_URL } from "@/lib/atlas-modulos";

export const Route = createFileRoute("/_authenticated/atlas/inicio")({
  component: AtlasInicio,
  head: () => ({ meta: [{ title: "Atlas — Início" }] }),
});

const un = (n: number) => n.toLocaleString("pt-BR");
const TABELAS = Object.keys(ATLAS_TABELAS);

function AtlasInicio() {
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const contQ = useQuery({ queryKey: ["atlas-contagens"], queryFn: () => contarTabelasAtlas(TABELAS) });
  const cont = contQ.data ?? {};
  const noBanco = Object.values(cont).reduce<number>((a, v) => a + (v ?? 0), 0);
  const noBackup = Object.values(ATLAS_TABELAS).reduce((a, t) => a + t.linhas, 0);
  const historicoOk = contQ.isSuccess && TABELAS.every((t) => (cont[t] ?? -1) >= ATLAS_TABELAS[t].linhas);
  const faseAtual = historicoOk ? 2 : 1;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Orbit className="size-6" /> Atlas</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Os módulos do Atlas Operações BI estão sendo trazidos para o Stock Savvy em fases. O histórico completo fica guardado nas tabelas do Atlas desde a fase 1; enquanto um módulo não é reescrito aqui, ele segue disponível no <a href={ATLAS_RENDER_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">Atlas original</a>.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Histórico no Stock Savvy</div><div className="mt-1 text-xl font-semibold">{contQ.isLoading ? "…" : `${un(noBanco)} / ${un(noBackup)} linhas`}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Fase em andamento</div><div className="mt-1 text-xl font-semibold">{faseAtual}. {ATLAS_FASES[faseAtual].split(":")[0].split(" (")[0]}</div></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between pt-4">
          <div><div className="text-xs text-muted-foreground">Backup</div><div className="mt-1 text-sm">{historicoOk ? "Importado e conferido" : "Ainda não importado por completo"}</div></div>
          {gestor && <Link to="/atlas/importar-backup" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><DatabaseBackup className="size-4" /> Importar</Link>}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fases da migração</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {Object.entries(ATLAS_FASES).map(([n, nome]) => {
            const f = Number(n); const feita = f < faseAtual;
            return <div key={n} className="flex items-center gap-2">{feita ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className={`size-4 ${f === faseAtual ? "text-primary" : "text-muted-foreground"}`} />}<span className={f === faseAtual ? "font-medium" : feita ? "text-muted-foreground" : ""}>{f}. {nome}</span></div>;
          })}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ATLAS_MODULOS.filter((m) => m.id !== "inicio").map((m) => {
          const linhas = m.tabelas.reduce((a, t) => a + (cont[t] ?? 0), 0);
          return (
            <Link key={m.id} to="/atlas/modulo/$id" params={{ id: m.id }} className="rounded-lg border bg-card p-3 transition hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{m.nome}</span><span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">fase {m.fase}</span></div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.descricao}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{un(linhas)} registros de histórico</span><ArrowUpRight className="size-3.5" /></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
