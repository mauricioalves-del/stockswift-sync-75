import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Construction, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contarTabelasAtlas } from "@/lib/atlas-backup";
import { ATLAS_FASES, ATLAS_RENDER_URL, moduloAtlas } from "@/lib/atlas-modulos";

export const Route = createFileRoute("/_authenticated/atlas/modulo/$id")({
  component: AtlasModuloPage,
  head: () => ({ meta: [{ title: "Atlas" }] }),
});

const un = (n: number) => n.toLocaleString("pt-BR");

function AtlasModuloPage() {
  const { id } = Route.useParams();
  const m = moduloAtlas(id);
  const contQ = useQuery({ enabled: !!m, queryKey: ["atlas-contagens-modulo", id], queryFn: () => contarTabelasAtlas(m!.tabelas) });
  if (!m) return <div className="p-8 text-center text-muted-foreground">Módulo do Atlas não encontrado.</div>;
  const cont = contQ.data ?? {};

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div>
        <div className="text-xs text-muted-foreground"><Link to="/atlas/inicio" className="hover:underline">Atlas</Link> › {m.nome}</div>
        <h1 className="text-2xl font-bold">{m.nome}</h1>
        <p className="text-sm text-muted-foreground">{m.descricao}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-start gap-3 pt-4">
          <Construction className="mt-0.5 size-5 text-amber-600" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">Em migração · fase {m.fase}: {ATLAS_FASES[m.fase]}</div>
            <div className="text-muted-foreground">
              {m.unificadoCom
                ? <>Este módulo foi unificado com a tela <Link to={m.unificadoCom.rota as any} className="text-primary hover:underline">{m.unificadoCom.nome}</Link> do Stock Savvy. O histórico do Atlas abaixo fica preservado para consulta.</>
                : <>Até esta fase ser entregue, use o módulo no <a href={ATLAS_RENDER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">Atlas original <ArrowUpRight className="size-3" /></a>. O histórico dele já está guardado no Stock Savvy.</>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Database className="size-4" /> Histórico preservado</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border text-sm">
            {m.tabelas.map((t) => (
              <div key={t} className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-xs">atlas_{t}</span>
                <span className="text-muted-foreground">{contQ.isLoading ? "…" : cont[t] == null ? "sem acesso ou não importada" : `${un(cont[t]!)} registros`}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
