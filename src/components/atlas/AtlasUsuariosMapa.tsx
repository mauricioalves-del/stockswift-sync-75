// Usuários do Atlas → usuários do Stock Savvy. O login é sempre o do Stock Savvy; aqui cada um dos usuários históricos do
// Atlas é ligado a um perfil do Stock Savvy (atlas_usuarios.profile_id), para que autoria, assinaturas e responsáveis
// do histórico apontem para a pessoa certa. O papel é o do Stock Savvy; a coluna "Papel sugerido" só orienta.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Orbit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sb = supabase as any;
type AtlasUser = { id: number; username: string; nome_exibicao: string | null; papel: string; ativo: boolean | null; profile_id: string | null };
type Perfil = { id: string; nome: string | null; email: string };

const ROTULO: Record<string, string> = {
  ADMINISTRADOR: "Administrador", GERENTE: "Gerente", COORDENADOR_CONTROLE: "Coordenador de Controle", DIRETOR_OPERACOES: "Diretor de Operações",
  COORDENADOR_FINANCEIRO: "Coordenador Financeiro", AUDITOR: "Auditor", OPERADOR_ESTOQUE: "Operador de Estoque", VENDEDOR: "Vendedor",
  INVENTARIANTE: "Inventariante", CONSULTA: "Consulta",
};
const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Papel do Stock Savvy que corresponde ao usuário do Atlas (pelo papel e pela função escrita no nome de exibição). */
export function papelSugerido(u: Pick<AtlasUser, "papel" | "nome_exibicao">): string {
  const f = sem(u.nome_exibicao ?? "");
  if (f.includes("diretor de operacoes")) return "DIRETOR_OPERACOES";   // assina o Fechamento de Inventário
  if (f.includes("coordenador financeiro")) return "COORDENADOR_FINANCEIRO";   // assina o Fechamento de Inventário
  if (u.papel === "admin") return "ADMINISTRADOR";
  if (f.includes("controle")) return "COORDENADOR_CONTROLE";
  if (/geren|coordenador|responsavel/.test(f)) return "GERENTE";   // "geren" pega também a grafia "Gerene" do cadastro
  if (u.papel === "leitura") return "CONSULTA";
  return "INVENTARIANTE";
}

/** Perfil do Stock Savvy com o mesmo nome (todas as palavras do login do Atlas aparecem no nome ou e-mail). */
function perfilParecido(u: AtlasUser, perfis: Perfil[]): Perfil | undefined {
  const partes = sem(u.username).split(/[\s._-]+/).filter((p) => p.length > 2);
  if (!partes.length) return undefined;
  const cands = perfis.filter((p) => { const alvo = sem(`${p.nome ?? ""} ${p.email}`); return partes.every((x) => alvo.includes(x)); });
  return cands.length === 1 ? cands[0] : undefined;
}

export function AtlasUsuariosMapa() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlas-usuarios-mapa"],
    queryFn: async () => {
      const [a, p, r] = await Promise.all([
        sb.from("atlas_usuarios").select("id, username, nome_exibicao, papel, ativo, profile_id").order("id"),
        sb.from("profiles").select("id, nome, email").order("nome"),
        sb.from("user_roles").select("user_id, role"),
      ]);
      if (a.error) throw a.error;
      return { atlas: (a.data ?? []) as AtlasUser[], perfis: (p.data ?? []) as Perfil[], roles: new Map<string, string>((r.data ?? []).map((x: any) => [x.user_id, x.role])) };
    },
  });
  const atlas = q.data?.atlas ?? []; const perfis = q.data?.perfis ?? [];
  const nVinc = atlas.filter((u) => u.profile_id).length;
  const sugestoes = useMemo(() => new Map(atlas.filter((u) => !u.profile_id).map((u) => [u.id, perfilParecido(u, perfis)])), [atlas, perfis]);

  async function vincular(u: AtlasUser, profileId: string | null) {
    const { error } = await sb.from("atlas_usuarios").update({ profile_id: profileId }).eq("id", u.id);
    if (error) toast.error("Não consegui vincular: " + error.message);
    else { toast.success(profileId ? `${u.username} vinculado.` : `Vínculo de ${u.username} removido.`); qc.invalidateQueries({ queryKey: ["atlas-usuarios-mapa"] }); }
  }
  async function aplicarSugestoes() {
    const lista = [...sugestoes.entries()].filter(([, p]) => p);
    for (const [id, p] of lista) { const { error } = await sb.from("atlas_usuarios").update({ profile_id: p!.id }).eq("id", id); if (error) { toast.error(error.message); return; } }
    toast.success(`${lista.length} usuário(s) do Atlas vinculados pelo nome.`); qc.invalidateQueries({ queryKey: ["atlas-usuarios-mapa"] });
  }

  if (q.error) return null;   // sem acesso às tabelas do Atlas (não gestor): a seção não aparece
  const nSug = [...sugestoes.values()].filter(Boolean).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Orbit className="size-4" /> Usuários do Atlas</CardTitle>
        <CardDescription>Os {atlas.length} logins do Atlas entram pelo Stock Savvy. Ligue cada um ao usuário daqui: o histórico (responsáveis, assinaturas de fechamento, auditoria) passa a apontar para ele. O papel que vale é o do Stock Savvy; ajuste-o acima se for diferente do sugerido. {nVinc}/{atlas.length} vinculados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {nSug > 0 && <button type="button" onClick={aplicarSugestoes} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><Link2 className="size-4" /> Vincular {nSug} pelo nome</button>}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Login no Atlas</th><th className="p-2">Função</th><th className="p-2">Usuário do Stock Savvy</th><th className="p-2">Papel atual</th><th className="p-2">Papel sugerido</th></tr></thead>
            <tbody>
              {atlas.map((u) => {
                const atual = u.profile_id ? q.data?.roles.get(u.profile_id) : undefined; const sug = papelSugerido(u); const sp = sugestoes.get(u.id);
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="p-2">{u.username}{u.ativo === false && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}<div className="text-[11px] text-muted-foreground">papel Atlas: {u.papel}</div></td>
                    <td className="p-2 text-xs">{u.nome_exibicao || "—"}</td>
                    <td className="p-2 min-w-[220px]">
                      <Select value={u.profile_id ?? "nenhum"} onValueChange={(v) => vincular(u, v === "nenhum" ? null : v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="nenhum">Não vinculado</SelectItem>{perfis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>)}</SelectContent>
                      </Select>
                      {!u.profile_id && sp && <div className="mt-0.5 text-[11px] text-muted-foreground">sugestão: {sp.nome || sp.email}</div>}
                    </td>
                    <td className="p-2 text-xs">{u.profile_id ? (ROTULO[atual ?? ""] ?? atual ?? "sem papel") : "—"}</td>
                    <td className={`p-2 text-xs ${u.profile_id && atual && atual !== sug ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{ROTULO[sug]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
