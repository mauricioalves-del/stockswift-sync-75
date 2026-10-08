import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchCheck, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatBRL } from "@/lib/inventory";
import { classificarCusto, type CasoCusto } from "@/lib/custo-contabil";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/custo-contabil")({
  component: InvestigacaoCustoPage,
  head: () => ({
    meta: [
      { title: "Investigação de Custo Contábil" },
      { name: "description", content: "Lotes em que o custo contábil (CMV) destoa do custo padrão, ou que ainda não têm custo contábil." },
    ],
  }),
});

type Linha = {
  id_produto: string;
  descricao: string | null;
  origem: string | null;
  lote: string | null;
  unidade: string | null;
  quantidade: number;
  custo_padrao: number | null;
  custo_contabil: number | null;
  custo_unitario: number | null;
  origem_custo: string | null;
};

type FiltroCaso = "INVESTIGAR" | CasoCusto | "TUDO";

const ROTULO_CASO: Record<CasoCusto, string> = {
  CONTABIL_MUITO_MAIOR: "Contábil muito maior",
  CONTABIL_MUITO_MENOR: "Contábil muito menor",
  SEM_CONTABIL: "Sem contábil (usa o padrão)",
  SEM_CUSTO: "Sem nenhum custo",
  NORMAL: "Normal",
};

function badgeCaso(c: CasoCusto) {
  const cor =
    c === "CONTABIL_MUITO_MAIOR" ? "bg-red-100 text-red-700 border-red-200"
    : c === "CONTABIL_MUITO_MENOR" ? "bg-amber-100 text-amber-800 border-amber-200"
    : c === "SEM_CUSTO" ? "bg-slate-200 text-slate-700 border-slate-300"
    : c === "SEM_CONTABIL" ? "bg-sky-100 text-sky-700 border-sky-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cor}`}>{ROTULO_CASO[c]}</span>;
}

const num = (v: number | null | undefined) => (v == null ? "—" : formatBRL(v));

function InvestigacaoCustoPage() {
  const [limite, setLimite] = useState("10");
  const [soComSaldo, setSoComSaldo] = useState(true);
  const [almox, setAlmox] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<FiltroCaso>("INVESTIGAR");

  const q = useQuery({
    queryKey: ["investigacao-custo", soComSaldo],
    staleTime: 0,
    queryFn: async (): Promise<Linha[]> => {
      const rows = await fetchAll<any>((from, to) => {
        let qy = (supabase as any)
          .from("estoque_sistemico")
          .select("id_produto, descricao, origem, lote, unidade, quantidade, custo_padrao, custo_contabil, custo_unitario, origem_custo")
          .range(from, to);
        if (soComSaldo) qy = qy.gt("quantidade", 0);
        return qy;
      });
      return rows.map((r: any) => ({
        id_produto: String(r.id_produto ?? ""),
        descricao: r.descricao ?? null,
        origem: r.origem ?? null,
        lote: r.lote ?? null,
        unidade: r.unidade ?? null,
        quantidade: Number(r.quantidade) || 0,
        custo_padrao: r.custo_padrao == null ? null : Number(r.custo_padrao),
        custo_contabil: r.custo_contabil == null ? null : Number(r.custo_contabil),
        custo_unitario: r.custo_unitario == null ? null : Number(r.custo_unitario),
        origem_custo: r.origem_custo ?? null,
      }));
    },
  });

  const lim = Math.max(1.01, Number(String(limite).replace(",", ".")) || 10);
  const base = q.data ?? [];
  const origens = useMemo(() => Array.from(new Set(base.map((r) => r.origem ?? "—"))).sort(), [base]);

  const classificadas = useMemo(
    () => base
      .filter((r) => almox.length === 0 || almox.includes(r.origem ?? "—"))
      .map((r) => ({ r, c: classificarCusto(r, lim) })),
    [base, almox, lim],
  );

  const contagem = useMemo(() => {
    const m: Record<CasoCusto, number> = { CONTABIL_MUITO_MAIOR: 0, CONTABIL_MUITO_MENOR: 0, SEM_CONTABIL: 0, SEM_CUSTO: 0, NORMAL: 0 };
    let impactoSuspeitos = 0;
    let comContabil = 0;
    for (const { r, c } of classificadas) {
      m[c.caso] += 1;
      if ((r.custo_contabil ?? 0) > 0) comContabil += 1;
      if (c.caso === "CONTABIL_MUITO_MAIOR" || c.caso === "CONTABIL_MUITO_MENOR") impactoSuspeitos += c.impacto;
    }
    return { m, impactoSuspeitos, comContabil };
  }, [classificadas]);

  const linhas = useMemo(() => {
    const lista = classificadas.filter(({ c }) =>
      filtro === "TUDO" ? true
      : filtro === "INVESTIGAR" ? (c.caso === "CONTABIL_MUITO_MAIOR" || c.caso === "CONTABIL_MUITO_MENOR")
      : c.caso === filtro,
    );
    return lista.sort((a, b) => Math.abs(b.c.impacto) - Math.abs(a.c.impacto) || b.r.quantidade - a.r.quantidade);
  }, [classificadas, filtro]);

  const MAX_LINHAS = 500;
  const semDadosContabeis = !q.isLoading && base.length > 0 && contagem.comContabil === 0;

  function exportarCsv() {
    const cab = ["SKU", "Produto", "Almoxarifado", "Lote", "Qtd", "Custo padrão", "Custo contábil", "Custo usado", "Razão (contábil/padrão)", "Impacto (R$)", "Caso", "Origem do custo"];
    const f = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const corpo = linhas.map(({ r, c }) => [
      r.id_produto, r.descricao, r.origem, r.lote, f(r.quantidade), f(r.custo_padrao), f(r.custo_contabil), f(r.custo_unitario),
      c.razao == null ? "" : f(Math.round(c.razao * 100) / 100), f(Math.round(c.impacto * 100) / 100), ROTULO_CASO[c.caso], r.origem_custo ?? "",
    ].map(esc).join(";"));
    const csv = "\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Investigacao_Custo_Contabil_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><SearchCheck className="size-6" /> Investigação de Custo Contábil</h1>
        <p className="text-sm text-muted-foreground">
          O sistema usa o <strong>Custo Contábil (CMV)</strong> quando ele existe e é maior que zero; sem contábil, usa o custo padrão.
          Almoxarifados do Pará usam <code>Custo_Contabil_Para</code>; os demais, <code>Custo_Contabil_SP</code>.
          Aqui aparecem os lotes em que o contábil destoa muito do padrão, que podem indicar unidade de medida ou valor errado na base.
        </p>
      </div>

      {semDadosContabeis && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 text-sm text-amber-900">
            Nenhum lote tem custo contábil gravado ainda. Os lotes continuam com o custo padrão. Assim que o envio do custo contábil
            (<code>Enviar_CustoContabil_API</code>) rodar, esta tela passa a mostrar as comparações.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        <Kpi titulo="Lotes analisados" valor={String(classificadas.length)} />
        <Kpi titulo="Usando contábil" valor={String(contagem.comContabil)} />
        <Kpi titulo="Contábil muito maior" valor={String(contagem.m.CONTABIL_MUITO_MAIOR)} tom="text-red-600" />
        <Kpi titulo="Contábil muito menor" valor={String(contagem.m.CONTABIL_MUITO_MENOR)} tom="text-amber-600" />
        <Kpi titulo="Sem contábil (usa padrão)" valor={String(contagem.m.SEM_CONTABIL)} />
        <Kpi titulo="Sem nenhum custo" valor={String(contagem.m.SEM_CUSTO)} tom="text-slate-600" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Impacto dos casos suspeitos: <strong>{formatBRL(contagem.impactoSuspeitos)}</strong> (quantidade × (contábil − padrão)).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Considerar suspeito a partir de (vezes)</Label>
            <Input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Caso</Label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroCaso)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INVESTIGAR">Para investigar (maior ou menor)</SelectItem>
                <SelectItem value="CONTABIL_MUITO_MAIOR">Contábil muito maior</SelectItem>
                <SelectItem value="CONTABIL_MUITO_MENOR">Contábil muito menor</SelectItem>
                <SelectItem value="SEM_CONTABIL">Sem contábil (usa o padrão)</SelectItem>
                <SelectItem value="SEM_CUSTO">Sem nenhum custo</SelectItem>
                <SelectItem value="TUDO">Todos os lotes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Almoxarifado</Label>
            <MultiSelect options={origens.map((o) => ({ value: o, label: o }))} value={almox} onChange={setAlmox} placeholder="Todos" allLabel="Todos" />
          </div>
          <div className="flex items-end justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={soComSaldo} onCheckedChange={setSoComSaldo} /> Só lotes com saldo
            </label>
            <Button variant="outline" size="sm" className="gap-1" onClick={exportarCsv} disabled={linhas.length === 0}>
              <Download className="size-4" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {linhas.length} lote(s) {linhas.length > MAX_LINHAS ? `(mostrando os ${MAX_LINHAS} de maior impacto; o CSV traz todos)` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Almox</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Padrão</TableHead>
                <TableHead className="text-right">Contábil</TableHead>
                <TableHead className="text-right">Razão</TableHead>
                <TableHead className="text-right">Impacto</TableHead>
                <TableHead>Caso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  {q.isLoading ? "Carregando..." : "Nenhum lote neste filtro."}
                </TableCell></TableRow>
              )}
              {linhas.slice(0, MAX_LINHAS).map(({ r, c }, i) => (
                <TableRow key={`${r.id_produto}-${r.origem}-${r.lote}-${i}`}>
                  <TableCell className="font-mono text-xs">{r.id_produto}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.descricao ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.origem ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.lote ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.quantidade.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{num(r.custo_padrao)}</TableCell>
                  <TableCell className="text-right font-semibold">{num(r.custo_contabil)}</TableCell>
                  <TableCell className="text-right">{c.razao == null ? "—" : `${c.razao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`}</TableCell>
                  <TableCell className="text-right">{c.impacto === 0 ? "—" : formatBRL(c.impacto)}</TableCell>
                  <TableCell>{badgeCaso(c.caso)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        O custo usado nos demais módulos (Shelf Life, Baixas, Fechamento, Farol Premium) já segue a regra do contábil. Para corrigir um caso suspeito, ajuste o valor na base de origem:
        a próxima importação atualiza o lote. <Badge variant="outline" className="ml-1">Fonte: estoque_sistemico</Badge>
      </p>
    </div>
  );
}

function Kpi({ titulo, valor, tom }: { titulo: string; valor: string; tom?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground truncate">{titulo}</div>
        <div className={`text-2xl font-bold mt-1 ${tom ?? ""}`}>{valor}</div>
      </CardContent>
    </Card>
  );
}
