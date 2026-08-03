import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, Loader2, Tag } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { usePrecosVenda } from "@/hooks/usePrecosVenda";
import { formatBRL } from "@/lib/inventory";
import { normalizarSku, parseNumeroBR, parseBooleanBR } from "@/lib/precos-venda";

export const Route = createFileRoute("/_authenticated/shelf-life/precos")({
  component: PrecosVendaPage,
  head: () => ({
    meta: [
      { title: "Cadastro de Preço de Venda | Shelf Life" },
      { name: "description", content: "Cadastro e importação do preço de venda por SKU usado nas ações de Shelf Life." },
      { property: "og:title", content: "Cadastro de Preço de Venda | Shelf Life" },
      { property: "og:description", content: "Importe e mantenha o preço de venda por SKU para as ações de Desconto Colaborador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ParsedRow = {
  sku: string;
  descricao: string;
  prod_ref1: string;
  pr_venda: number;
  marca: string;
  pr_sugerido: number;
  vl_custo: number;
  percentual_desconto_tabela: number;
  percentual_margem: number;
  margem_real: number;
  ativo: boolean;
};

function PrecosVendaPage() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const precos = usePrecosVenda();

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [busca, setBusca] = useState("");
  const [soSemPreco, setSoSemPreco] = useState(false);
  const [editando, setEditando] = useState<Record<string, string>>({});

  function baixarModelo() {
    const ws = XLSX.utils.json_to_sheet([
      {
        "Ativo?": "Sim",
        Produto: "05104036",
        "Descrição": "Bombom SF Açaí 10g",
        "Prod. Ref1": "",
        "Pr. Venda": 8.5,
        Marca: "Magio",
        "Pr. Sugerido": 9.9,
        "Vl. Custo": 3.4,
        "% Desc.": 0,
        "% Margem": 60,
        "Margem Real": 60,
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Preço venda");
    XLSX.writeFile(wb, "modelo-preco-venda.xlsx");
  }

  async function handleFile(f: File) {
    setFilename(f.name);
    const wb = XLSX.read(await f.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeSheetRows(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }),
    );
    const errs: string[] = [];
    const parsed: ParsedRow[] = [];
    const vistos = new Set<string>();

    data.forEach((r, i) => {
      const sku = normalizarSku(pickCI(r, "Produto", "produto", "SKU", "Código", "Codigo"));
      if (!sku) {
        errs.push(`Linha ${i + 2}: Produto (SKU) vazio`);
        return;
      }
      if (vistos.has(sku)) {
        errs.push(`Linha ${i + 2}: SKU ${sku} duplicado na planilha — mantida a última ocorrência`);
      }
      vistos.add(sku);
      parsed.push({
        sku,
        descricao: pickCI(r, "Descrição", "Descricao", "descricao"),
        prod_ref1: pickCI(r, "Prod. Ref1", "Prod Ref1", "prod_ref1"),
        pr_venda: parseNumeroBR(pickCI(r, "Pr. Venda", "Pr Venda", "pr_venda", "Preço de Venda")),
        marca: pickCI(r, "Marca", "marca"),
        pr_sugerido: parseNumeroBR(pickCI(r, "Pr. Sugerido", "Pr Sugerido", "pr_sugerido")),
        vl_custo: parseNumeroBR(pickCI(r, "Vl. Custo", "Vl Custo", "vl_custo", "Custo")),
        percentual_desconto_tabela: parseNumeroBR(pickCI(r, "% Desc.", "% Desc", "Desc.", "percentual_desconto_tabela")),
        percentual_margem: parseNumeroBR(pickCI(r, "% Margem", "Margem", "percentual_margem")),
        margem_real: parseNumeroBR(pickCI(r, "Margem Real", "margem_real")),
        ativo: parseBooleanBR(pickCI(r, "Ativo?", "Ativo", "ativo")),
      });
    });

    // Última ocorrência vence, sem duplicar SKU
    const porSku = new Map<string, ParsedRow>();
    for (const p of parsed) porSku.set(p.sku, p);
    setRows(Array.from(porSku.values()));
    setErrors(errs);
  }

  async function importar() {
    if (!rows.length) return;
    setImporting(true);
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const agora = new Date().toISOString();
    const CHUNK = 400;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK).map((r) => ({ ...r, importado_por: uid, atualizado_em: agora }));
      const { error } = await (supabase as any).from("precos_venda").upsert(slice, { onConflict: "sku" });
      if (error) {
        fail += slice.length;
        console.error(error);
      } else ok += slice.length;
    }
    setImporting(false);
    setRows([]);
    setFilename("");
    qc.invalidateQueries({ queryKey: ["precos-venda"] });
    if (fail === 0) toast.success(`${ok} preços importados/atualizados`);
    else toast.error(`${fail} linhas falharam na importação`);
  }

  async function salvarPreco(id: string, sku: string) {
    const valor = parseNumeroBR(editando[id]);
    const { error } = await (supabase as any)
      .from("precos_venda")
      .update({ pr_venda: valor, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Preço do SKU ${sku} atualizado`);
    setEditando((e) => {
      const n = { ...e };
      delete n[id];
      return n;
    });
    qc.invalidateQueries({ queryKey: ["precos-venda"] });
  }

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (precos.data ?? []).filter((p) => {
      if (soSemPreco && Number(p.pr_venda) > 0) return false;
      if (!t) return true;
      return p.sku.toLowerCase().includes(t) || (p.descricao ?? "").toLowerCase().includes(t);
    });
  }, [precos.data, busca, soSemPreco]);

  const semPreco = (precos.data ?? []).filter((p) => !(Number(p.pr_venda) > 0)).length;

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Tag className="size-5" /> Cadastro de Preço de Venda
        </h1>
        <p className="text-sm text-muted-foreground">
          Preço praticado por SKU — base do cálculo da ação "Desconto Colaborador".
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar planilha "Preço venda"</CardTitle>
          <CardDescription>
            Colunas: Ativo?, Produto, Descrição, Prod. Ref1, Pr. Venda, Marca, Pr. Sugerido, Vl. Custo, % Desc., %
            Margem, Margem Real. A referência de preço é <strong>Pr. Venda</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={baixarModelo}>
              <Download className="mr-2 size-4" /> Baixar Modelo
            </Button>
            <Input
              type="file"
              accept=".xlsx,.xls"
              className="max-w-xs"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {filename && <span className="text-xs text-muted-foreground">{filename}</span>}
          </div>

          {errors.length > 0 && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {errors.slice(0, 8).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
              {errors.length > 8 && <div>... e mais {errors.length - 8} avisos</div>}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Pr. Venda</TableHead>
                      <TableHead className="text-right">Pr. Sugerido</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 300).map((r) => (
                      <TableRow key={r.sku}>
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{r.descricao || "—"}</TableCell>
                        <TableCell>{r.marca || "—"}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.pr_venda)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.pr_sugerido)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.vl_custo)}</TableCell>
                        <TableCell>
                          {r.pr_venda > 0 ? (
                            <Badge variant="secondary" className="bg-success/15 text-success">OK</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-warning/15 text-warning">Sem Preço de Venda</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={importar} disabled={importing}>
                  {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                  Importar {rows.length} SKUs
                </Button>
                <span className="text-xs text-muted-foreground">
                  {rows.filter((r) => !(r.pr_venda > 0)).length} sem preço de venda (serão importados mesmo assim)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preços cadastrados</CardTitle>
          <CardDescription>
            {(precos.data ?? []).length} SKUs · {semPreco} sem preço de venda
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Label className="text-xs">Buscar por SKU ou descrição</Label>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: 05104036 ou Bombom" />
            </div>
            <Button variant={soSemPreco ? "default" : "outline"} onClick={() => setSoSemPreco((v) => !v)}>
              Sem Preço de Venda
            </Button>
          </div>

          <div className="max-h-[520px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Preço de Venda</TableHead>
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">% Margem</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.slice(0, 500).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{p.descricao || "—"}</TableCell>
                    <TableCell>{p.marca || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          className="h-8 w-24 text-right"
                          value={editando[p.id] ?? String(p.pr_venda ?? 0)}
                          onChange={(e) => setEditando((s) => ({ ...s, [p.id]: e.target.value }))}
                        />
                        {editando[p.id] != null && (
                          <Button size="sm" className="h-8" onClick={() => salvarPreco(p.id, p.sku)}>
                            Salvar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(p.pr_sugerido)}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.vl_custo)}</TableCell>
                    <TableCell className="text-right">
                      {p.percentual_margem != null ? `${Number(p.percentual_margem).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={p.ativo ? "bg-success/15 text-success" : "bg-muted"}>
                        {p.ativo ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.atualizado_em ? p.atualizado_em.slice(0, 10).split("-").reverse().join("/") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!lista.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      Nenhum preço cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {lista.length > 500 && (
            <p className="text-xs text-muted-foreground">Exibindo os primeiros 500 de {lista.length} registros.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
