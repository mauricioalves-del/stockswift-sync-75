import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { normalizeSheetRows, pickCI } from "@/lib/xlsx-utils";

import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings2, Plus, Loader2, Save, Upload, FileSpreadsheet, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatNum, formatBRL } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/abastecimento/parametros")({
  component: ParametrosPage,
  head: () => ({ meta: [{ title: "Parâmetros de Abastecimento" }] }),
});

type Parametro = {
  id: string;
  origem: string;
  origem_abastecimento: string;
  cobertura_dias: number;
  dias_seguranca: number;
  frequencia_abastecimento: string;
  ativo: boolean;
};

type ProdutoRep = {
  id: string;
  id_produto: string;
  descricao: string;
  unidade: string;
  custo_referencia: number;
  cobertura_dias: number;
  estoque_minimo: number;
  estoque_ideal: number;
  estoque_maximo: number;
  ativo: boolean;
};


type EstoqueRow = { id_produto: string; origem: string; quantidade: number; custo_unitario: number; descricao: string | null };

type ImportRow = { id_produto: string; descricao: string; unidade: string; custo_referencia: number; cobertura_dias: number; estoque_minimo: number; estoque_ideal: number; estoque_maximo: number };

function ParametrosPage() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const [novaOrigem, setNovaOrigem] = useState("");

  const paramsQ = useQuery({
    queryKey: ["parametros_abastecimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_abastecimento" as never)
        .select("*")
        .order("origem");
      if (error) throw error;
      return (data ?? []) as unknown as Parametro[];
    },
  });

  const origensQ = useQuery({
    queryKey: ["origens_disponiveis_param"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem").order("codigo_origem");
      return (data ?? []).map((o) => o.codigo_origem);
    },
  });

  async function criar() {
    if (!novaOrigem) return;
    const { error } = await supabase.from("parametros_abastecimento" as never).insert({
      origem: novaOrigem,
      origem_abastecimento: "Alm_SP_Fabrica",
      cobertura_dias: 8,
      dias_seguranca: 1,
      frequencia_abastecimento: "SEMANAL",
      ativo: true,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Almox habilitado");
    setNovaOrigem("");
    qc.invalidateQueries({ queryKey: ["parametros_abastecimento"] });
  }

  async function salvar(p: Parametro) {
    const { error } = await supabase
      .from("parametros_abastecimento" as never)
      .update({
        origem_abastecimento: p.origem_abastecimento,
        cobertura_dias: p.cobertura_dias,
        dias_seguranca: p.dias_seguranca,
        frequencia_abastecimento: p.frequencia_abastecimento,
        ativo: p.ativo,
      } as never)
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Parâmetro atualizado");
    qc.invalidateQueries({ queryKey: ["parametros_abastecimento"] });
  }

  if (!canWrite) return <div className="p-8 text-center text-muted-foreground">Sem permissão.</div>;

  const origensExistentes = new Set((paramsQ.data ?? []).map((p) => p.origem));
  const origensLivres = (origensQ.data ?? []).filter((o) => !origensExistentes.has(o));

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="size-6" /> Parâmetros de Abastecimento
        </h1>
        <p className="text-sm text-muted-foreground">
          Cobertura desejada, dias de segurança e frequência de reposição por almoxarifado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="size-4" /> Habilitar novo almoxarifado
          </CardTitle>
          <CardDescription>Selecione um almox para participar do planejamento de cobertura.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Select value={novaOrigem} onValueChange={setNovaOrigem}>
            <SelectTrigger className="sm:w-80"><SelectValue placeholder="Selecione um almox…" /></SelectTrigger>
            <SelectContent>
              {origensLivres.length === 0
                ? <div className="px-3 py-2 text-xs text-muted-foreground">Todos os almox já estão habilitados</div>
                : origensLivres.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={criar} disabled={!novaOrigem}><Plus className="size-4 mr-1" /> Habilitar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Almoxarifados habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          {paramsQ.isLoading ? <Loader2 className="animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem (Destino)</TableHead>
                    <TableHead className="w-56">Origem de Abastecimento</TableHead>
                    <TableHead className="w-32">Cobertura (dias)</TableHead>
                    <TableHead className="w-32">Segurança (dias)</TableHead>
                    <TableHead className="w-40">Frequência</TableHead>
                    <TableHead className="w-24">Ativo</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paramsQ.data ?? []).map((p) => (
                    <LinhaParam key={p.id} p={p} onSalvar={salvar} origens={origensQ.data ?? []} />
                  ))}
                  {(paramsQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">
                      Nenhum almox habilitado.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProdutosReposicaoCard />
    </div>
  );
}

function LinhaParam({ p, onSalvar, origens }: { p: Parametro; onSalvar: (p: Parametro) => void; origens: string[] }) {
  const [local, setLocal] = useState(p);
  return (
    <TableRow>
      <TableCell className="font-medium">{p.origem}</TableCell>
      <TableCell>
        <Select value={local.origem_abastecimento} onValueChange={(v) => setLocal({ ...local, origem_abastecimento: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {origens.filter((o) => o !== p.origem).map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input type="number" min={1} value={local.cobertura_dias}
          onChange={(e) => setLocal({ ...local, cobertura_dias: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Input type="number" min={0} value={local.dias_seguranca}
          onChange={(e) => setLocal({ ...local, dias_seguranca: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Select value={local.frequencia_abastecimento} onValueChange={(v) => setLocal({ ...local, frequencia_abastecimento: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="DIARIA">Diária</SelectItem>
            <SelectItem value="SEMANAL">Semanal</SelectItem>
            <SelectItem value="QUINZENAL">Quinzenal</SelectItem>
            <SelectItem value="MENSAL">Mensal</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch checked={local.ativo} onCheckedChange={(v) => setLocal({ ...local, ativo: v })} />
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={() => onSalvar(local)}><Save className="size-3.5" /></Button>
      </TableCell>
    </TableRow>
  );
}

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  return pickCI(r, ...keys);
}


function ProdutosReposicaoCard() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [busca, setBusca] = useState("");

  const produtosQ = useQuery({
    queryKey: ["produtos_reposicao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos_reposicao" as never)
        .select("*").order("id_produto");
      if (error) throw error;
      return (data ?? []) as unknown as ProdutoRep[];
    },
  });

  const skus = (produtosQ.data ?? []).map((p) => p.id_produto);

  const estoqueQ = useQuery({
    queryKey: ["produtos_reposicao_estoque", skus.join(",")],
    enabled: skus.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_sistemico")
        .select("id_produto, origem, quantidade, custo_unitario, descricao")
        .in("id_produto", skus);
      if (error) throw error;
      return (data ?? []) as unknown as EstoqueRow[];
    },
  });

  const saldoPorSku = useMemo(() => {
    const m = new Map<string, { qtd: number; custo: number; almox: Set<string>; descricao: string }>();
    for (const e of (estoqueQ.data ?? [])) {
      const prev = m.get(e.id_produto) ?? { qtd: 0, custo: 0, almox: new Set(), descricao: "" };
      prev.qtd += Number(e.quantidade);
      if (Number(e.custo_unitario) > 0) prev.custo = Number(e.custo_unitario);
      if (e.origem) prev.almox.add(e.origem);
      if (!prev.descricao && e.descricao) prev.descricao = e.descricao;
      m.set(e.id_produto, prev);
    }
    return m;
  }, [estoqueQ.data]);

  const filtrados = (produtosQ.data ?? []).filter((p) => {
    if (!busca) return true;
    const t = busca.toLowerCase();
    return p.id_produto.toLowerCase().includes(t) || p.descricao.toLowerCase().includes(t);
  });

  async function handleFile(f: File) {
    setFilename(f.name);
    setPreview([]);
    setErrors([]);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (data.length === 0) { setErrors(["Planilha vazia"]); return; }

      const errs: string[] = [];
      const rows: ImportRow[] = [];
      data.forEach((r, idx) => {
        const id = pick(r, "Id_produto", "id_produto", "SKU", "sku", "Codigo", "Código", "codigo");
        if (!id) { errs.push(`Linha ${idx + 2}: SKU vazio`); return; }
        const num = (v: unknown) => Number(String(v ?? 0).replace(",", ".")) || 0;
        rows.push({
          id_produto: id,
          descricao: pick(r, "descricao", "Descricao", "Descrição", "descricao_produto", "Descricao_Produto", "Produto", "produto", "Nome", "nome", "Nome_Produto"),
          unidade: pick(r, "UM", "um", "Unidade", "unidade", "UN") || "UN",
          custo_referencia: num(r["Custo"] ?? r["custo"] ?? r["Custo_Vlr"] ?? r["custo_referencia"] ?? r["Custo Referencia"]),
          cobertura_dias: num(r["Cobertura"] ?? r["cobertura"] ?? r["Cobertura_Dias"] ?? r["cobertura_dias"]) || 8,
          estoque_minimo: num(r["Minimo"] ?? r["minimo"] ?? r["Mínimo"] ?? r["mínimo"] ?? r["estoque_minimo"] ?? r["Estoque_Minimo"] ?? r["Estoque Mínimo"] ?? r["Min"] ?? r["min"]),
          estoque_ideal: num(r["Ideal"] ?? r["ideal"] ?? r["estoque_ideal"] ?? r["Estoque_Ideal"] ?? r["Estoque Ideal"]),
          estoque_maximo: num(r["Maximo"] ?? r["maximo"] ?? r["Máximo"] ?? r["máximo"] ?? r["estoque_maximo"] ?? r["Estoque_Maximo"] ?? r["Estoque Máximo"] ?? r["Max"] ?? r["max"]),
        });
      });
      setPreview(rows);
      setErrors(errs);
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  }

  async function importar() {
    if (preview.length === 0) return;
    setImporting(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const payload = preview.map((r) => ({ ...r, ativo: true, importado_por: uid }));

    let ok = 0, fail = 0;
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabase.from("produtos_reposicao" as never)
        .upsert(slice as never, { onConflict: "id_produto" });
      if (error) { fail += slice.length; console.error(error); }
      else ok += slice.length;
    }
    setImporting(false);
    if (fail === 0) toast.success(`${ok} produtos importados`);
    else toast.error(`${fail} falhas na importação`);
    setPreview([]);
    setFilename("");
    qc.invalidateQueries({ queryKey: ["produtos_reposicao"] });
  }

  async function toggleAtivo(p: ProdutoRep, ativo: boolean) {
    await supabase.from("produtos_reposicao" as never).update({ ativo } as never).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["produtos_reposicao"] });
  }

  async function remover(p: ProdutoRep) {
    if (!confirm(`Remover ${p.id_produto}?`)) return;
    await supabase.from("produtos_reposicao" as never).delete().eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["produtos_reposicao"] });
  }

  async function limparTudo() {
    const produtos = produtosQ.data ?? [];
    if (produtos.length === 0) { toast.info("Nenhum produto para remover"); return; }
    if (!confirm(`Tem certeza que deseja remover todos os ${produtos.length} produtos cadastrados?\n\nEsta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("produtos_reposicao" as never).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) { toast.error(error.message); return; }
    toast.success(`${produtos.length} produtos removidos`);
    qc.invalidateQueries({ queryKey: ["produtos_reposicao"] });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Produtos para Reposição
            </CardTitle>
            <CardDescription>
              Importe a lista de SKUs monitorados. O saldo é atualizado automaticamente conforme sincronização do estoque.
              Colunas aceitas: <b>Id_produto</b>, Descricao, UM, Custo, Cobertura, <b>Minimo</b>, <b>Ideal</b>, <b>Maximo</b>.
            </CardDescription>
          </div>
          {(produtosQ.data ?? []).length > 0 && (
            <Button variant="outline" size="sm" onClick={limparTudo}>
              <Trash2 className="size-3.5 mr-1.5 text-destructive" /> Limpar tudo
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-accent/30 transition-colors">
          <Upload className="size-7 text-primary" />
          <div className="text-center text-sm">
            <div className="font-medium">Selecione a planilha de produtos</div>
            <div className="text-xs text-muted-foreground">.xlsx / .xls</div>
          </div>
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {filename && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><FileSpreadsheet className="size-3.5" />{filename}</div>}
        </label>

        {errors.length > 0 && (
          <div className="text-xs text-destructive flex items-start gap-2 p-3 border border-destructive/40 rounded-md">
            <AlertCircle className="size-4 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">{errors.length} erro(s)</div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm">Preview: <b>{preview.length}</b> registros</div>
              <Button size="sm" onClick={importar} disabled={importing}>
                {importing ? <><Loader2 className="size-3.5 animate-spin mr-1" /> Importando…</> : <><Upload className="size-3.5 mr-1" /> Confirmar importação</>}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Exemplos: {preview.slice(0, 3).map((p) => p.id_produto).join(", ")}{preview.length > 3 ? "…" : ""}
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Buscar</Label>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU ou descrição…" />
        </div>

        {produtosQ.isLoading ? <Loader2 className="animate-spin" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>UM</TableHead>
                <TableHead className="text-right">Cob. (d)</TableHead>
                <TableHead className="text-right w-20">Mín</TableHead>
                <TableHead className="text-right w-20">Ideal</TableHead>
                <TableHead className="text-right w-20">Máx</TableHead>
                <TableHead className="text-right">Custo Ref.</TableHead>
                <TableHead className="text-right">Saldo Atual</TableHead>
                <TableHead className="text-right">Almox</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtrados.slice(0, 500).map((p) => {
                  const s = saldoPorSku.get(p.id_produto);
                  const qtd = s?.qtd ?? 0;
                  return <LinhaProduto key={p.id} p={p} qtd={qtd} almox={s?.almox.size ?? 0} descricaoFallback={s?.descricao ?? ""} onToggle={toggleAtivo} onRemover={remover} onQc={() => qc.invalidateQueries({ queryKey: ["produtos_reposicao"] })} />;
                })}
                {filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground text-sm py-6">
                    Nenhum produto cadastrado. Importe uma planilha acima.
                  </TableCell></TableRow>
                )}

              </TableBody>
            </Table>
            {filtrados.length > 500 && (
              <div className="text-xs text-muted-foreground p-2 text-center">
                … exibindo 500 de {filtrados.length}.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaProduto({ p, qtd, almox, descricaoFallback, onToggle, onRemover, onQc }: {
  p: ProdutoRep; qtd: number; almox: number; descricaoFallback: string;
  onToggle: (p: ProdutoRep, ativo: boolean) => void;
  onRemover: (p: ProdutoRep) => void;
  onQc: () => void;
}) {
  const [minV, setMinV] = useState(String(p.estoque_minimo ?? 0));
  const [idealV, setIdealV] = useState(String(p.estoque_ideal ?? 0));
  const [maxV, setMaxV] = useState(String(p.estoque_maximo ?? 0));
  const dirty =
    Number(minV) !== Number(p.estoque_minimo ?? 0) ||
    Number(idealV) !== Number(p.estoque_ideal ?? 0) ||
    Number(maxV) !== Number(p.estoque_maximo ?? 0);

  async function salvar() {
    const { error } = await supabase.from("produtos_reposicao" as never).update({
      estoque_minimo: Number(minV) || 0,
      estoque_ideal: Number(idealV) || 0,
      estoque_maximo: Number(maxV) || 0,
    } as never).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Parâmetros atualizados");
    onQc();
  }

  const descricao = p.descricao?.trim() || descricaoFallback || "—";
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{p.id_produto}</TableCell>
      <TableCell className="text-xs max-w-xs truncate" title={descricao}>{descricao}</TableCell>
      <TableCell className="text-xs">{p.unidade}</TableCell>
      <TableCell className="text-right tabular-nums text-xs">{p.cobertura_dias}</TableCell>
      <TableCell><Input className="h-7 text-right text-xs" type="number" min={0} value={minV} onChange={(e) => setMinV(e.target.value)} /></TableCell>
      <TableCell><Input className="h-7 text-right text-xs" type="number" min={0} value={idealV} onChange={(e) => setIdealV(e.target.value)} /></TableCell>
      <TableCell><Input className="h-7 text-right text-xs" type="number" min={0} value={maxV} onChange={(e) => setMaxV(e.target.value)} /></TableCell>
      <TableCell className="text-right tabular-nums text-xs">{formatBRL(p.custo_referencia)}</TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        {qtd > 0 ? formatNum(qtd)
          : <Badge className="bg-destructive/15 text-destructive border-destructive/30">Sem saldo</Badge>}
      </TableCell>
      <TableCell className="text-right text-xs">{almox}</TableCell>
      <TableCell><Switch checked={p.ativo} onCheckedChange={(v) => onToggle(p, v)} /></TableCell>
      <TableCell className="flex gap-1">
        {dirty && (
          <Button size="icon" variant="ghost" onClick={salvar} title="Salvar mín/ideal/máx">
            <Save className="size-3.5 text-primary" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={() => onRemover(p)}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

