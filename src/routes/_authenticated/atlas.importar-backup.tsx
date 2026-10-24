import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, DatabaseBackup, FileArchive, Loader2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { abrirBackup, contarTabelasAtlas, loteDe, ordemImportacao, type ConteudoBackup } from "@/lib/atlas-backup";
import { ATLAS_TABELAS } from "@/lib/atlas-tabelas";

export const Route = createFileRoute("/_authenticated/atlas/importar-backup")({
  component: ImportarBackupAtlas,
  head: () => ({ meta: [{ title: "Importar backup — Atlas" }] }),
});

const sb = supabase as any;
const TABELAS = Object.keys(ATLAS_TABELAS);
const un = (n: number) => n.toLocaleString("pt-BR");

function ImportarBackupAtlas() {
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const qc = useQueryClient();
  const contQ = useQuery({ queryKey: ["atlas-contagens"], queryFn: () => contarTabelasAtlas(TABELAS) });
  const [backup, setBackup] = useState<ConteudoBackup | null>(null);
  const [nomeArq, setNomeArq] = useState("");
  const [lendo, setLendo] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [prog, setProg] = useState<{ tabela: string; feitas: number; total: number; geral: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const totalBackup = useMemo(() => (backup ? Object.values(backup.manifesto.linhas_por_tabela).reduce((a, b) => a + b, 0) : 0), [backup]);
  const cont = contQ.data ?? {};
  const semTabelas = Object.values(cont).length > 0 && Object.values(cont).every((v) => v === null);

  async function escolher(f: File | undefined) {
    if (!f) return;
    setLendo(true); setErro(null); setBackup(null);
    try { setBackup(await abrirBackup(await f.arrayBuffer())); setNomeArq(f.name); }
    catch (e: any) { setErro(e?.message ?? String(e)); }
    finally { setLendo(false); }
  }

  async function importar() {
    if (!backup || !gestor) return;
    if (!confirm(`Importar ${un(totalBackup)} linhas de ${backup.tabelas.size} tabelas do backup de ${backup.manifesto.gerado_em.slice(0, 16).replace("T", " ")}?\n\nRegistros com o mesmo id são atualizados; nada é duplicado.`)) return;
    setRodando(true); setErro(null);
    let geral = 0;
    try {
      for (const t of ordemImportacao([...backup.tabelas.keys()])) {
        const linhas = backup.tabelas.get(t)!; const pk = ATLAS_TABELAS[t].pk; const lote = loteDe(t);
        for (let i = 0; i < linhas.length; i += lote) {
          setProg({ tabela: t, feitas: i, total: linhas.length, geral });
          const { error } = await sb.from(`atlas_${t}`).upsert(linhas.slice(i, i + lote), { onConflict: pk });
          if (error) throw new Error(`${t} (linhas ${i + 1}–${Math.min(i + lote, linhas.length)}): ${error.message}`);
          geral += Math.min(lote, linhas.length - i);
        }
        await sb.from("atlas_importacoes").insert({ tabela: t, linhas_backup: backup.manifesto.linhas_por_tabela[t] ?? null, linhas_importadas: linhas.length, gerado_em: backup.manifesto.gerado_em });
      }
      const { error } = await sb.rpc("atlas_ajustar_sequencias");
      if (error) throw new Error("Ajuste das sequências: " + error.message);
      setProg({ tabela: "", feitas: 0, total: 0, geral });
      toast.success(`Backup do Atlas importado: ${un(geral)} linhas.`);
    } catch (e: any) {
      setErro((e?.message ?? String(e)) + " — pode importar de novo: o que já entrou é só atualizado.");
    } finally {
      setRodando(false);
      qc.invalidateQueries({ queryKey: ["atlas-contagens"] });
    }
  }

  if (!gestor) return <div className="p-8 text-center text-muted-foreground">A importação do backup do Atlas é restrita a gestores.</div>;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><DatabaseBackup className="size-6" /> Importar backup do Atlas</h1>
        <p className="text-sm text-muted-foreground">Traz todo o histórico do Atlas Operações BI para o Stock Savvy. Escolha o zip gerado pelo backup do Atlas (com <code>manifesto.json</code> e a pasta <code>dados/</code>). Senhas e tokens de integração do Atlas não são importados.</p>
      </div>

      {semTabelas && <Card><CardContent className="py-4 text-sm text-destructive">As tabelas do Atlas ainda não existem no banco. Aplique a migration <code>20261024150000_atlas_historico.sql</code> antes de importar.</CardContent></Card>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">1. Escolher o backup</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <FileArchive className="size-4" /> {nomeArq || "Selecionar arquivo .zip"}
            <input type="file" accept=".zip" className="hidden" disabled={lendo || rodando} onChange={(e) => escolher(e.target.files?.[0])} />
          </label>
          {lendo && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lendo o backup…</span>}
          {backup && <span className="text-sm text-muted-foreground">Backup de <strong className="text-foreground">{backup.manifesto.gerado_em.slice(0, 16).replace("T", " ")}</strong> · {backup.tabelas.size} tabelas · {un(totalBackup)} linhas</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">2. Importar e conferir</CardTitle>
          <CardDescription>Cada tabela é gravada em lotes; no fim, a contagem no banco é comparada com o manifesto do backup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={importar} disabled={!backup || rodando || semTabelas} className="gap-1">{rodando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{rodando ? "Importando…" : "Importar tudo"}</Button>
            {prog && rodando && <span className="text-sm text-muted-foreground">{prog.tabela}: {un(prog.feitas)} / {un(prog.total)} · total {un(prog.geral)} / {un(totalBackup)}</span>}
          </div>
          {prog && totalBackup > 0 && <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary transition-all" style={{ width: `${Math.min(100, (prog.geral / totalBackup) * 100)}%` }} /></div>}
          {erro && <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</div>}

          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Tabela</th><th className="p-2 text-right">No backup</th><th className="p-2 text-right">No Stock Savvy</th><th className="p-2 text-center">Conferência</th></tr></thead>
              <tbody>
                {ordemImportacao(TABELAS).reverse().map((t) => {
                  const esperado = backup?.manifesto.linhas_por_tabela[t] ?? ATLAS_TABELAS[t].linhas; const atual = cont[t];
                  const ok = atual != null && atual >= esperado;
                  return (
                    <tr key={t} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">atlas_{t}</td>
                      <td className="p-2 text-right">{un(esperado)}</td>
                      <td className="p-2 text-right">{atual == null ? "—" : un(atual)}</td>
                      <td className="p-2 text-center">{atual == null ? <span className="text-xs text-muted-foreground">sem tabela</span> : ok ? <CheckCircle2 className="mx-auto size-4 text-emerald-600" /> : <XCircle className="mx-auto size-4 text-amber-600" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
