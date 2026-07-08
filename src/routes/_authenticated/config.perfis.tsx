import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Save, Shield, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/config/perfis")({
  component: PerfisPage,
  head: () => ({ meta: [{ title: "Perfis e Permissões" }] }),
});

type Perfil = { id: string; nome: string; descricao: string | null; ativo: boolean };
type Modulo = { id: string; chave: string; nome: string; rota: string | null; modulo_pai_id: string | null; ordem: number };
type Permissao = {
  id?: string; perfil_id: string; modulo_id: string;
  pode_visualizar: boolean; pode_criar: boolean; pode_editar: boolean; pode_aprovar: boolean; pode_excluir: boolean;
};

const CAMPOS = [
  { key: "pode_visualizar", label: "Visualizar" },
  { key: "pode_criar", label: "Criar" },
  { key: "pode_editar", label: "Editar" },
  { key: "pode_aprovar", label: "Aprovar" },
  { key: "pode_excluir", label: "Excluir" },
] as const;

function PerfisPage() {
  const { role, loading } = useRole();
  const qc = useQueryClient();

  const perfisQ = useQuery({
    queryKey: ["perfis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("perfis").select("*").order("nome");
      if (error) throw error;
      return data as Perfil[];
    },
  });

  const modulosQ = useQuery({
    queryKey: ["modulos_sistema"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("modulos_sistema").select("*").order("ordem");
      if (error) throw error;
      return data as Modulo[];
    },
  });

  const [perfilId, setPerfilId] = useState<string>("");
  const perfilAtual = perfisQ.data?.find((p) => p.id === perfilId) ?? perfisQ.data?.[0];
  const perfilAtivoId = perfilAtual?.id ?? "";

  const permissoesQ = useQuery({
    queryKey: ["permissoes", perfilAtivoId],
    queryFn: async () => {
      if (!perfilAtivoId) return [] as Permissao[];
      const { data, error } = await (supabase as any).from("permissoes").select("*").eq("perfil_id", perfilAtivoId);
      if (error) throw error;
      return data as Permissao[];
    },
    enabled: !!perfilAtivoId,
  });

  const [draft, setDraft] = useState<Record<string, Permissao>>({});
  const permMap = useMemo(() => {
    const m: Record<string, Permissao> = {};
    (permissoesQ.data ?? []).forEach((p) => { m[p.modulo_id] = p; });
    return m;
  }, [permissoesQ.data]);

  function get(moduloId: string, field: keyof Permissao): boolean {
    const d = draft[moduloId] ?? permMap[moduloId];
    return d ? (d as any)[field] === true : false;
  }
  function set(moduloId: string, field: (typeof CAMPOS)[number]["key"], value: boolean) {
    setDraft((s) => {
      const base = s[moduloId] ?? permMap[moduloId] ?? {
        perfil_id: perfilAtivoId, modulo_id: moduloId,
        pode_visualizar: false, pode_criar: false, pode_editar: false, pode_aprovar: false, pode_excluir: false,
      };
      return { ...s, [moduloId]: { ...base, [field]: value } };
    });
  }

  const [saving, setSaving] = useState(false);
  async function salvar() {
    const rows = Object.values(draft).map((d) => ({
      perfil_id: perfilAtivoId, modulo_id: d.modulo_id,
      pode_visualizar: d.pode_visualizar, pode_criar: d.pode_criar,
      pode_editar: d.pode_editar, pode_aprovar: d.pode_aprovar, pode_excluir: d.pode_excluir,
    }));
    if (rows.length === 0) return toast.info("Nenhuma alteração.");
    setSaving(true);
    const { error } = await (supabase as any).from("permissoes").upsert(rows, { onConflict: "perfil_id,modulo_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Salvo (${rows.length} módulos).`);
    setDraft({});
    qc.invalidateQueries({ queryKey: ["permissoes", perfilAtivoId] });
    qc.invalidateQueries({ queryKey: ["my-permissions"] });
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (role !== "COORDENADOR_CONTROLE" && role !== "ADMINISTRADOR") {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Somente <b>Administrador</b> ou <b>Coordenador de Controle</b> podem alterar a matriz de permissões.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/config"><ArrowLeft className="size-4 mr-1.5" /> Voltar</Link></Button>
      </div>
    );
  }

  const modulosPai = (modulosQ.data ?? []).filter((m) => !m.modulo_pai_id);
  const filhosDe = (id: string) => (modulosQ.data ?? []).filter((m) => m.modulo_pai_id === id);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="size-6" /> Perfis e Permissões</h1>
          <p className="text-sm text-muted-foreground">
            Matriz por perfil × módulo. Cada tela do sistema consulta esta matriz para decidir o que exibir.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/config"><ArrowLeft className="size-4 mr-1.5" /> Voltar</Link></Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm">Perfil:</span>
            <Select value={perfilAtivoId} onValueChange={setPerfilId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {(perfisQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {perfilAtual?.descricao && <span className="text-xs text-muted-foreground">{perfilAtual.descricao}</span>}
          </div>
          <Button onClick={salvar} disabled={saving || Object.keys(draft).length === 0} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar {Object.keys(draft).length > 0 && `(${Object.keys(draft).length})`}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Módulo</TableHead>
                {CAMPOS.map((c) => <TableHead key={c.key} className="text-center w-24">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modulosPai.map((pai) => {
                const filhos = filhosDe(pai.id);
                return (
                  <>
                    <TableRow key={pai.id} className="bg-muted/50">
                      <TableCell className="font-semibold">{pai.nome}</TableCell>
                      {CAMPOS.map((c) => (
                        <TableCell key={c.key} className="text-center">
                          <Checkbox
                            checked={get(pai.id, c.key as keyof Permissao)}
                            onCheckedChange={(v) => set(pai.id, c.key, !!v)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                    {filhos.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="pl-8 text-sm">
                          <span className="text-muted-foreground">└</span> {f.nome}
                          {f.rota && <span className="text-[10px] text-muted-foreground ml-2 font-mono">{f.rota}</span>}
                        </TableCell>
                        {CAMPOS.map((c) => (
                          <TableCell key={c.key} className="text-center">
                            <Checkbox
                              checked={get(f.id, c.key as keyof Permissao)}
                              onCheckedChange={(v) => set(f.id, c.key, !!v)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        As telas ainda usam as checagens de papel atuais; os valores desta matriz passarão a ser consultados por elas nas próximas etapas.
      </p>
    </div>
  );
}
