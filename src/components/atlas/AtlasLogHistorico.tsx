// Log de auditoria histórico do Atlas (atlas_log_auditoria), exibido dentro da Auditoria do Stock Savvy.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Orbit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Log = { id: number; username: string | null; acao: string | null; entidade: string | null; entidade_id: string | null; detalhes: unknown; criado_em: string | null };
const POR_PAGINA = 100;

export function AtlasLogHistorico() {
  const [busca, setBusca] = useState(""); const [pag, setPag] = useState(0);
  const q = useQuery({
    queryKey: ["atlas-log-auditoria"],
    queryFn: async () => {
      const out: Log[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await (supabase as any).from("atlas_log_auditoria").select("*").order("criado_em", { ascending: false }).range(de, de + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const l = q.data ?? [];
    return b ? l.filter((x) => `${x.username} ${x.acao} ${x.entidade} ${x.entidade_id} ${JSON.stringify(x.detalhes ?? "")}`.toLowerCase().includes(b)) : l;
  }, [q.data, busca]);
  if (q.error) return null;
  const pagina = filtrados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const fmt = (s: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString("pt-BR") : "—");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Orbit className="size-4" /> Histórico do Atlas</CardTitle>
        <CardDescription>Ações registradas no Atlas Operações BI até a migração ({(q.data?.length ?? 0).toLocaleString("pt-BR")} eventos). Somente leitura.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input placeholder="Buscar por usuário, ação, entidade ou detalhe" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(0); }} className="max-w-md" />
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Quando</th><th className="p-2">Usuário</th><th className="p-2">Ação</th><th className="p-2">Entidade</th><th className="p-2">Detalhes</th></tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {pagina.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="p-2 whitespace-nowrap text-xs">{fmt(l.criado_em)}</td>
                  <td className="p-2 text-xs">{l.username || "—"}</td>
                  <td className="p-2 text-xs">{l.acao || "—"}</td>
                  <td className="p-2 text-xs">{l.entidade || "—"}{l.entidade_id ? ` #${l.entidade_id}` : ""}</td>
                  <td className="p-2 max-w-md truncate text-xs text-muted-foreground" title={l.detalhes ? JSON.stringify(l.detalhes) : ""}>{l.detalhes ? JSON.stringify(l.detalhes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtrados.length > POR_PAGINA && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button type="button" disabled={pag === 0} onClick={() => setPag(pag - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Anterior</button>
            <span>{pag * POR_PAGINA + 1}–{Math.min((pag + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length}</span>
            <button type="button" disabled={(pag + 1) * POR_PAGINA >= filtrados.length} onClick={() => setPag(pag + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Próxima</button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
