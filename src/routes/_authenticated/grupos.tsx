import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { normalizeSheetRows } from "@/lib/xlsx-utils";
import { fetchAll } from "@/lib/fetch-all";
import { lerPlanilhaGrupos, limparCodigo, planejarGrupos, chaveCodigo, type LinhaGrupo } from "@/lib/grupos-import";

import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/grupos")({
  component: GruposPage,
  head: () => ({
    meta: [
      { title: "Importador de Grupos de Produtos" },
      { name: "description", content: "Cadastre grupos de produto manualmente ou importe a planilha de cadastro de produtos do sistema." },
      { property: "og:title", content: "Importador de Grupos de Produtos" },
      { property: "og:description", content: "Cadastro manual e importação da planilha do sistema com Cód. Produto e Grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Existente = { id: string; grupo: string; codigo_produto: string; eh_produto_local?: boolean };

const STATUS_LABEL = { novo: "Novo", alterado: "Grupo alterado", igual: "Sem mudança" } as const;
const STATUS_VARIANT = { novo: "default", alterado: "secondary", igual: "outline" } as const;

function GruposPage() {
  const { canWrite, isAdmin } = useRole();
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<LinhaGrupo[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [mCodigo, setMCodigo] = useState("");
  const [mGrupo, setMGrupo] = useState("");
  const [salvandoManual, setSalvandoManual] = useState(false);

  const { data: existentes } = useQuery({
    queryKey: ["grupos", "todos"],
    queryFn: () =>
      fetchAll<Existente>((from, to) =>
        supabase.from("grupo_produtos").select("*").order("grupo").order("codigo_produto").range(from, to),
      ),
  });

  const resumo = (existentes ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.grupo] = (acc[r.grupo] ?? 0) + 1;
    return acc;
  }, {});
  const gruposConhecidos = Object.keys(resumo).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const plano = useMemo(() => planejarGrupos(linhas, existentes ?? []), [linhas, existentes]);

  const codigoManual = limparCodigo(mCodigo);
  const atualManual = codigoManual
    ? (existentes ?? []).find((e) => chaveCodigo(e.codigo_produto) === chaveCodigo(codigoManual))
    : undefined;

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["grupos"] });
    qc.invalidateQueries({ queryKey: ["grupos-distintos"] });
  }

  function limparArquivo() {
    setLinhas([]); setErrors([]); setAvisos([]); setFilename("");
  }

  async function handleFile(f: File) {
    setFilename(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) { setErrors(["Planilha vazia"]); setLinhas([]); return; }
    const data = normalizeSheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }));
    const cab = Object.keys(data[0] ?? {}).map((k) => k.trim().toLowerCase());
    const temCodigo = cab.some((k) => ["cód. produto", "cod. produto", "cód produto", "código produto", "codigo produto", "codigo_produto", "código", "id_produto"].includes(k));
    if (!temCodigo || !cab.includes("grupo")) {
      setLinhas([]); setAvisos([]);
      setErrors([`A planilha precisa das colunas "Cód. Produto" e "Grupo".`]);
      return;
    }
    const r = lerPlanilhaGrupos(data);
    const av: string[] = [];
    if (r.semGrupo.length) av.push(`${r.semGrupo.length} produto(s) sem grupo na planilha foram ignorados — o grupo atual deles não muda.`);
    if (r.repetidos) av.push(`${r.repetidos} código(s) repetido(s): vale o cadastro ativo.`);
    setLinhas(r.linhas);
    setErrors(r.erros);
    setAvisos(av);
  }

  async function gravar(rows: { codigo_produto: string; grupo: string }[]) {
    const CHUNK = 500;
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("grupo_produtos").upsert(slice, { onConflict: "codigo_produto" });
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }
    return { ok, fail };
  }

  async function importar() {
    if (!plano.gravar.length) return;
    setImporting(true);
    const { ok, fail } = await gravar(plano.gravar);
    setImporting(false);
    invalidar();
    if (fail === 0) {
      toast.success(`${plano.novos} cadastrado(s) e ${plano.alterados} atualizado(s)`);
      limparArquivo();
    } else toast.error(`${ok} gravado(s), ${fail} com falha`);
  }

  async function cadastrarManual(e: React.FormEvent) {
    e.preventDefault();
    const grupo = mGrupo.replace(/\s+/g, " ").trim();
    if (!codigoManual) return toast.error("Informe o código do produto");
    if (!grupo) return toast.error("Informe o grupo");
    const p = planejarGrupos([{ codigo: codigoManual, grupo }], existentes ?? []);
    if (!p.gravar.length) return toast.info(`O produto ${codigoManual} já está no grupo ${grupo}`);
    setSalvandoManual(true);
    const { fail } = await gravar(p.gravar);
    setSalvandoManual(false);
    if (fail) return toast.error("Não foi possível salvar. Verifique sua permissão.");
    invalidar();
    toast.success(p.novos ? `Produto ${codigoManual} cadastrado em ${grupo}` : `Produto ${codigoManual} movido para ${grupo}`);
    setMCodigo(""); setMGrupo("");
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("grupo_produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidar();
  }

  async function toggleLocal(id: string, atual: boolean) {
    const { error } = await (supabase as any).from("grupo_produtos").update({ eh_produto_local: !atual }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["grupos"] });
    qc.invalidateQueries({ queryKey: ["produtos-locais"] });
  }

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Grupos de Produtos</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre um produto manualmente ou importe a planilha de cadastro de produtos do sistema (colunas <strong>Cód. Produto</strong> e <strong>Grupo</strong>). Os grupos são usados como filtro em todo o sistema.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastro manual</CardTitle>
            <CardDescription>Inclua um produto ou troque o grupo de um produto já cadastrado.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cadastrarManual} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="g-codigo">Cód. Produto</Label>
                  <Input id="g-codigo" value={mCodigo} onChange={(e) => setMCodigo(e.target.value)} placeholder="Ex.: 05004148" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-grupo">Grupo</Label>
                  <Input id="g-grupo" list="grupos-conhecidos" value={mGrupo} onChange={(e) => setMGrupo(e.target.value)} placeholder="Escolha ou digite um novo" />
                  <datalist id="grupos-conhecidos">
                    {gruposConhecidos.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </div>
              </div>
              {atualManual && (
                <p className="text-xs text-muted-foreground">
                  Este produto já está cadastrado em <strong>{atualManual.grupo}</strong>. Ao salvar, o grupo será trocado.
                </p>
              )}
              <Button type="submit" disabled={salvandoManual}>
                {salvandoManual ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                {atualManual ? "Salvar alteração" : "Cadastrar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar planilha do sistema</CardTitle>
            <CardDescription>Use a exportação "Cadastro de Produto". As demais colunas são ignoradas.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:bg-accent/30">
              <Upload className="size-8 text-primary" />
              <div className="text-center">
                <div className="font-medium">Clique ou arraste o arquivo</div>
                <div className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</div>
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><FileSpreadsheet className="size-3.5" />{filename}</div>}
            </label>
          </CardContent>
        </Card>
      </div>

      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-destructive text-base"><AlertCircle className="size-4" /> {errors.length} erro(s)</CardTitle></CardHeader>
          <CardContent><ul className="text-sm space-y-1 max-h-40 overflow-y-auto">{errors.slice(0, 30).map((e, i) => <li key={i} className="text-destructive">• {e}</li>)}</ul></CardContent>
        </Card>
      )}

      {linhas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Prévia da importação ({linhas.length} produtos)</CardTitle>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{plano.novos} novos</Badge>
                <Badge variant="secondary">{plano.alterados} com grupo alterado</Badge>
                <Badge variant="outline">{plano.iguais} sem mudança</Badge>
              </div>
              {avisos.map((a, i) => <p key={i} className="text-xs text-muted-foreground">{a}</p>)}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={limparArquivo} disabled={importing}><X className="size-4 mr-1" /> Descartar</Button>
              <Button onClick={importar} disabled={importing || !plano.gravar.length}>
                {importing ? <><Loader2 className="size-4 animate-spin mr-2" /> Importando...</> : plano.gravar.length ? "Confirmar importação" : "Nada a atualizar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded-lg max-h-96">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10"><TableRow><TableHead>Código</TableHead><TableHead>Grupo</TableHead><TableHead>Grupo atual</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
                <TableBody>
                  {[...plano.itens].sort((a, b) => (a.status === b.status ? 0 : a.status === "igual" ? 1 : b.status === "igual" ? -1 : a.status === "novo" ? -1 : 1)).slice(0, 300).map((r) => (
                    <TableRow key={r.codigo}>
                      <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                      <TableCell>{r.grupo}</TableCell>
                      <TableCell className="text-muted-foreground">{r.grupoAtual ?? "—"}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">{STATUS_LABEL[r.status]}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {plano.itens.length > 300 && <p className="text-xs text-muted-foreground mt-2">Mostrando 300 de {plano.itens.length}. Todos serão gravados ao confirmar.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de Grupos</CardTitle>
          <CardDescription>{existentes?.length ?? 0} códigos cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(resumo).map(([g, n]) => (
              <Badge key={g} variant="secondary" className="text-sm">{g} <span className="ml-1.5 opacity-70">({n})</span></Badge>
            ))}
          </div>
          <div className="overflow-x-auto border rounded-lg max-h-96 overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="w-32">Produto Local?</TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {(existentes ?? []).slice(0, 500).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.grupo}</TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo_produto}</TableCell>
                    <TableCell>
                      <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={!!r.eh_produto_local}
                          disabled={!canWrite}
                          onChange={() => toggleLocal(r.id, !!r.eh_produto_local)}
                        />
                        {r.eh_produto_local ? <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[10px]">Local</Badge> : <span className="text-muted-foreground">—</span>}
                      </label>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => excluir(r.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
