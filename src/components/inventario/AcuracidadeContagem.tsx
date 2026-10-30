import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, Coins, Download, Scale, Search, Target, X } from "lucide-react";
import { META_ACURACIDADE, acuracidadeContagem, csvDivergencias, type ItemLinha, type MissaoLinha } from "@/lib/indicador-inventario";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const pct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const cor = (v: number | null) => (v == null ? "" : v >= META_ACURACIDADE ? "text-emerald-600" : v >= META_ACURACIDADE - 0.05 ? "text-amber-600" : "text-red-600");
const corValor = (v: number | null) => (v == null || Math.abs(v) < 0.005 ? "" : v < 0 ? "text-red-600" : "text-blue-600");

export function AcuracidadeContagem({ missoes, itens, custos, mes }: { missoes: MissaoLinha[]; itens: ItemLinha[]; custos: Map<string, number>; mes: string }) {
  const r = useMemo(() => acuracidadeContagem(missoes, itens, custos, mes), [missoes, itens, custos, mes]);
  const [dia, setDia] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [diasExpandido, setDiasExpandido] = useState(false);
  const [divExpandido, setDivExpandido] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return r.divergencias.filter((l) => (!dia || l.data === dia) && (!q || l.sku.toLowerCase().includes(q) || (l.descricao ?? "").toLowerCase().includes(q) || (l.lote ?? "").toLowerCase().includes(q)));
  }, [r.divergencias, dia, busca]);
  const okComDif = r.divergencias.filter((l) => l.okComDiferenca).length;

  const baixar = () => {
    const url = URL.createObjectURL(new Blob([csvDivergencias(lista)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Divergencias_Contagem_${dia ?? mes}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (!r.mes.itens) return null;
  const m = r.mes;
  const diasVisiveis = diasExpandido ? r.dias : r.dias.slice(0, 10);
  const divVisiveis = divExpandido ? lista : lista.slice(0, 10);
  const diasRolagem = diasExpandido && r.dias.length > 10;
  const divRolagem = divExpandido && lista.length > 10;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Acuracidade da contagem diária</h2>
        <p className="text-sm text-muted-foreground">
          Mesmas definições do Atlas: item a item (itens sem diferença), IAQ (ponderada pela quantidade) e IAP (ponderada pelo custo contábil). Divergência = quantidade contada diferente da do sistema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Scale} titulo="IAQ — por quantidade" valor={pct(m.iaq)} cls={cor(m.iaq)} detalhe={`Meta ${pct(META_ACURACIDADE, 0)} · ${m.itens} itens contados`} />
        <Kpi icon={Coins} titulo="IAP — por valor" valor={pct(m.iap)} cls={cor(m.iap)} detalhe={`Cobertura de custo: ${pct(m.cobertura, 0)} dos itens`} />
        <Kpi icon={Target} titulo="Item a item" valor={pct(m.item)} cls={cor(m.item)} detalhe={`${m.divergentes} de ${m.itens} itens com diferença`} />
        <Kpi icon={Coins} titulo="Impacto contábil no mês" valor={brl(m.liquido)} cls={corValor(m.liquido)} detalhe={`Falta ${brl(m.falta)} · sobra ${brl(m.sobra)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado por dia de contagem</CardTitle>
          <CardDescription>Clique em um dia para ver só as divergências dele na tabela abaixo.</CardDescription>
        </CardHeader>
        <CardContent className={diasRolagem ? "[&>div.relative]:max-h-[26rem] [&>div.relative]:overflow-auto" : "overflow-x-auto"}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Dia</TableHead><TableHead className="text-right">Missões</TableHead><TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Divergentes</TableHead><TableHead className="text-right">Item a item</TableHead>
                <TableHead className="text-right">IAQ</TableHead><TableHead className="text-right">IAP</TableHead>
                <TableHead className="text-right">Falta</TableHead><TableHead className="text-right">Sobra</TableHead><TableHead className="text-right">Impacto líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diasVisiveis.map((d) => (
                <TableRow key={d.data} onClick={() => { setDia(dia === d.data ? null : d.data); setDivExpandido(true); }}
                  className={`cursor-pointer ${dia === d.data ? "bg-primary/10" : ""}`} title="Filtrar divergências deste dia">
                  <TableCell className="text-xs font-medium">{dataBr(d.data)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{d.missoes}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{d.itens}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{d.divergentes}</TableCell>
                  <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(d.item)}`}>{pct(d.item)}</TableCell>
                  <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(d.iaq)}`}>{pct(d.iaq)}</TableCell>
                  <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(d.iap)}`}>{pct(d.iap)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-red-600">{brl(-d.falta)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-blue-600">{brl(d.sobra)}</TableCell>
                  <TableCell className={`text-right text-xs font-semibold tabular-nums ${corValor(d.liquido)}`}>{brl(d.liquido)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold">Mês</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{m.missoes}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{m.itens}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{m.divergentes}</TableCell>
                <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(m.item)}`}>{pct(m.item)}</TableCell>
                <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(m.iaq)}`}>{pct(m.iaq)}</TableCell>
                <TableCell className={`text-right text-xs font-semibold tabular-nums ${cor(m.iap)}`}>{pct(m.iap)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums text-red-600">{brl(-m.falta)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums text-blue-600">{brl(m.sobra)}</TableCell>
                <TableCell className={`text-right text-xs font-semibold tabular-nums ${corValor(m.liquido)}`}>{brl(m.liquido)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {r.dias.length > 10 && (
            <div className="mt-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setDiasExpandido((v) => !v)}>
                {diasExpandido ? `Mostrar menos (primeiras 10 de ${r.dias.length})` : `Mostrar todos os ${r.dias.length} dias`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Divergências identificadas</CardTitle>
            <CardDescription>
              {lista.length} de {r.divergencias.length} itens, do maior para o menor impacto. O SKU abre a Visão Geral de Estoque filtrada nele.
              {okComDif > 0 && <> <span className="text-amber-600">{okComDif} itens foram marcados OK na missão, mas têm diferença de quantidade.</span></>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dia && (
              <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => setDia(null)}>
                Dia {dataBr(dia)} <X className="size-3" />
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU, produto ou lote"
                className="h-8 w-52 rounded-md border bg-background pl-7 pr-2 text-xs" />
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={baixar} disabled={!lista.length}><Download className="size-3.5" />CSV</Button>
          </div>
        </CardHeader>
        <CardContent className={divRolagem ? "[&>div.relative]:max-h-[32rem] [&>div.relative]:overflow-auto" : "overflow-x-auto"}>
          {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma divergência para este filtro.</p> : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Lote</TableHead>
                  <TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Acur. item</TableHead><TableHead className="text-right">Custo un.</TableHead><TableHead className="text-right">Impacto</TableHead>
                  <TableHead>Status</TableHead><TableHead>Observação</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {divVisiveis.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">{dataBr(l.data)}</TableCell>
                    <TableCell className="text-xs">
                      <Link to="/abastecimento/estoque" search={{ sku: l.sku }} className="font-mono text-primary hover:underline" title="Abrir na Visão Geral de Estoque">{l.sku}</Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-xs" title={l.descricao ?? ""}>{l.descricao ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[11px]">{l.lote ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{qtd(l.sistema)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{qtd(l.contado)}</TableCell>
                    <TableCell className={`text-right text-xs font-semibold tabular-nums ${l.diferenca < 0 ? "text-red-600" : "text-blue-600"}`}>{l.diferenca > 0 ? "+" : ""}{qtd(l.diferenca)}</TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${cor(l.acuracidadeItem)}`}>{pct(l.acuracidadeItem)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{brl(l.custo)}</TableCell>
                    <TableCell className={`text-right text-xs font-semibold tabular-nums ${corValor(l.impacto)}`} title={l.custo == null ? "SKU sem custo contábil cadastrado" : undefined}>{l.custo == null ? "sem custo" : brl(l.impacto)}</TableCell>
                    <TableCell>
                      {l.okComDiferenca
                        ? <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-300" title="Marcado OK na missão, mas a quantidade contada difere do sistema">OK com diferença</Badge>
                        : <Badge variant="outline" className="text-[10px]">{l.status.replace(/_/g, " ").toLowerCase()}</Badge>}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground" title={l.observacao ?? ""}>{l.observacao ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <Link to="/missoes/$id" params={{ id: l.missao_id }} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary hover:underline" title={l.missao}>
                        Missão <ArrowUpRight className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.length > 10 && (
            <div className="mt-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setDivExpandido((v) => !v)}>
                {divExpandido ? `Mostrar menos (primeiras 10 de ${lista.length})` : `Mostrar todas as ${lista.length} linhas`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, titulo, valor, detalhe, cls }: { icon: typeof Scale; titulo: string; valor: string; detalhe: string; cls?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1"><CardDescription>{titulo}</CardDescription><Icon className="size-4 text-muted-foreground" /></CardHeader>
      <CardContent><div className={`text-3xl font-bold tabular-nums ${cls ?? ""}`}>{valor}</div><p className="mt-1 text-xs text-muted-foreground">{detalhe}</p></CardContent>
    </Card>
  );
}
