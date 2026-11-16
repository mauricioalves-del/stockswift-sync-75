import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileSpreadsheet, ListChecks, Loader2, Mail, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { LISTAS, montarLista, nomeArquivo, planilha, type MovErp, type Saldo } from "../../../supabase/functions/lista-movimentados/logica";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import {
  ALMOX_FAROL, ORIGEM_SALDO, chaveSku, coberturaItens, diferencaConciliacao, saldoECustoPorSku, statusConciliacao, linhasPlanilhaErp, type LinhaErp, conciliacaoPorDia, diaSP, diasDaSemana, movimentoPelaConciliacao, movimentosPorDia, nivelServico, proximaSemana, semanaAnterior, situacaoDia,
  type AlmoxFarol, type StatusConc, type ConcDia, type ConcLinha, type Conferencia, type ItemMov, type MovLinha, type SituacaoDia,
} from "@/lib/farol-movimentados";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/gestao/farol-movimentados")({
  component: FarolMovimentadosPage,
  head: () => ({ meta: [{ title: "Farol de Processo · Conferência de Movimentados — Gestão" }] }),
});

const sb = supabase as any;
const META = 0.95;
const SEMANAS_TENDENCIA = 8;
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const dm = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const somaDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function FarolMovimentadosPage() {
  const hoje = diaSP(new Date());
  const [ref, setRef] = useState(hoje);
  const semana = diasDaSemana(ref);
  const ini = somaDias(semana[0], -7 * (SEMANAS_TENDENCIA - 1));
  const fim = semana[4];
  const [aberto, setAberto] = useState<{ almox: AlmoxFarol; dia: string } | null>(null);

  const ATLAS = ALMOX_FAROL.map((a) => a.atlas as string);
  const q = useQuery({
    queryKey: ["farol-movimentados", ini, fim],
    queryFn: async () => {
      const lerFaixa = <T,>(tab: string, cols: string, campoData: string, almox?: string) => fetchAll<T>((f, t) => {
        let x = sb.from(tab).select(cols).gte(campoData, ini).lte(campoData, `${fim}T23:59:59`);
        if (almox) x = x.in(almox, ATLAS);
        return x.order(campoData).range(f, t);
      });
      const [erp, erpPlanilha, brutas, porLote, hist, divs, lotes, conf, frescor] = await Promise.all([
        lerFaixa<any>("movimentacoes_diarias", "data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento", "data"),
        // Planilha do ERP importada aqui no farol (qualquer período). Antes da migration 0057 a tabela não existe: vazio.
        fetchAll<any>((f, t) => sb.from("movimentacoes_erp").select("data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento")
          .gte("data", ini).lte("data", fim).not("almox", "is", null).order("data").range(f, t)).catch(() => []),
        lerFaixa<any>("atlas_movimentacoes_brutas", "data, almoxarifado, sku, descricao, operacao, qtd_ent, qtd_sai, saldo", "data", "almoxarifado"),
        lerFaixa<any>("atlas_movimentacoes_lote_diaria", "data, almoxarifado_raw, sku, descricao_produto, quantidade, lote_movimentado", "data"),
        lerFaixa<any>("atlas_movimentacoes_historico", "data_movimento, almoxarifado, sku, origem, lote_importacao_id, entrada, saida, saldo_sistema", "data_movimento", "almoxarifado"),
        lerFaixa<any>("atlas_divergencias", "data_deteccao, almoxarifado, sku, origem, criado_em", "data_deteccao", "almoxarifado"),
        sb.from("atlas_lotes_importacao").select("id, criado_em").gte("criado_em", ini).then((r: any) => (r.data ?? []) as { id: number; criado_em: string }[]),
        sb.from("conferencias_movimentados").select("*").gte("data_movimento", ini).lte("data_movimento", fim).then((r: any) => (r.data ?? []) as Conferencia[]),
        // Última data de cada base por almox, para avisar quando uma base está desatualizada.
        Promise.all(ALMOX_FAROL.flatMap((a) => [
          sb.from("atlas_movimentacoes_brutas").select("data").eq("almoxarifado", a.atlas).order("data", { ascending: false }).limit(1).then((r: any) => ["Livro-caixa", a.id, r.data?.[0]?.data ?? null]),
          sb.from("atlas_movimentacoes_historico").select("data_movimento").eq("almoxarifado", a.atlas).order("data_movimento", { ascending: false }).limit(1).then((r: any) => ["Conciliação Atlas", a.id, r.data?.[0]?.data_movimento ?? null]),
        ])),
      ]);
      const loteEm = new Map<number, string>((lotes as { id: number; criado_em: string }[]).map((l) => [l.id, l.criado_em]));
      // Converte o horário "sem fuso" do Atlas (gravado em horário de Brasília) para ISO.
      const isoSP = (s: string | null | undefined) => (s ? `${String(s).replace(" ", "T").slice(0, 19)}-03:00` : null);
      const mov: MovLinha[] = [
        ...erp,
        ...erpPlanilha,
        ...brutas.filter((b: any) => !String(b.operacao ?? "").toLowerCase().includes("inventario"))
          .map((b: any) => ({ data: b.data, desc_almox: b.almoxarifado, id_produto: b.sku, descricao: b.descricao, qtd: (Number(b.qtd_ent) || 0) + (Number(b.qtd_sai) || 0), desc_movimento: b.operacao, saldo: b.saldo })),
        ...porLote.map((l: any) => ({ data: l.data, desc_almox: l.almoxarifado_raw, id_produto: l.sku, descricao: l.descricao_produto, qtd: Number(l.quantidade) || 0, id_lote: l.lote_movimentado })),
      ];
      const conc: ConcLinha[] = [
        ...hist.filter((h: any) => h.origem !== "fechamento_inventario").map((h: any) => ({ almoxarifado: h.almoxarifado, data: h.data_movimento, sku: h.sku, divergente: false, em: isoSP(loteEm.get(h.lote_importacao_id)), qtd: Math.abs(Number(h.entrada) || 0) + Math.abs(Number(h.saida) || 0), saldo: h.saldo_sistema == null ? null : Number(h.saldo_sistema) })),
        ...divs.filter((d: any) => d.origem !== "fechamento_inventario").map((d: any) => ({ almoxarifado: d.almoxarifado, data: d.data_deteccao, sku: d.sku, divergente: true, em: isoSP(d.criado_em) })),
      ];
      // Dias sem nenhuma base de movimento (ex.: antes da importação diária do ERP): o movimento vem da própria conciliação do Atlas.
      const movAtlas = movimentoPelaConciliacao(mov, conc);
      mov.push(...movAtlas);
      return { mov, conc, conf, frescor: frescor as [string, AlmoxFarol, string | null][], bases: { erp: erp.length + erpPlanilha.length, brutas: brutas.length, lote: porLote.length, atlas: movAtlas.length } };
    },
  });

  const porDia = useMemo(() => movimentosPorDia(q.data?.mov ?? []), [q.data?.mov]);
  const concPor = useMemo(() => conciliacaoPorDia(q.data?.conc ?? []), [q.data?.conc]);
  const confPor = useMemo(() => new Map<string, Conferencia>(((q.data?.conf ?? []) as Conferencia[]).map((c: Conferencia) => [`${c.almox}|${String(c.data_movimento).slice(0, 10)}`, c])), [q.data?.conf]);
  const sit = (a: AlmoxFarol, dia: string): SituacaoDia => situacaoDia(porDia.get(`${a}|${dia}`), concPor.get(`${a}|${dia}`), dia, hoje);
  const ultimaMov = useMemo(() => {
    const m = new Map<AlmoxFarol, string>();
    for (const k of porDia.keys()) { const [a, d] = k.split("|") as [AlmoxFarol, string]; if (!m.has(a) || d > m.get(a)!) m.set(a, d); }
    return m;
  }, [porDia]);

  const sitsSemana = ALMOX_FAROL.flatMap((a) => semana.map((d) => ({ a: a.id, d, s: sit(a.id, d) })));
  const geral = nivelServico(sitsSemana.map((x) => x.s));
  const divergencias = sitsSemana.reduce((acc, x) => acc + ("divergentes" in x.s ? x.s.divergentes : 0), 0);
  const falhas = sitsSemana.filter((x) => x.s.tipo === "FALHA" || x.s.tipo === "ATRASADO");
  const cobertura = coberturaItens(sitsSemana.map((x) => x.s));
  const [importando, setImportando] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const tendencia = Array.from({ length: SEMANAS_TENDENCIA }, (_, i) => diasDaSemana(somaDias(semana[0], -7 * (SEMANAS_TENDENCIA - 1 - i))));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="size-6" /> Farol de Processo · Conferência de Movimentados</h1>
          <p className="text-sm text-muted-foreground">Almoxarifados Fábrica, Processo, Qualidade e Pará. Cruza todas as bases de movimentação ativas com a conciliação do indicador de Movimentados do Atlas: todo item movimentado num dia útil precisa ser conciliado (contagem × sistema) até o dia útil seguinte (D+1). Meta de nível de serviço: {pct(META)}.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setRef(semanaAnterior(ref))} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-48 text-center text-sm font-semibold">Semana {dm(semana[0])} a {dm(semana[4])}</span>
          <Button variant="outline" size="icon" onClick={() => setRef(proximaSemana(ref))} disabled={semana[0] > hoje} aria-label="Próxima semana"><ChevronRight className="size-4" /></Button>
          {!semana.includes(hoje) && <Button variant="ghost" size="sm" onClick={() => setRef(hoje)}>Esta semana</Button>}
          <Button variant="outline" size="sm" className="ml-2 gap-1" onClick={() => setImportando(true)}><Upload className="size-4" />Importar movimentação (ERP)</Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setListaAberta(true)}><ListChecks className="size-4" />Lista de movimentados</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Nível de serviço da semana" valor={pct(geral.nivel)} detalhe={`${geral.cumpridos} de ${geral.vencidos} dias movimentados conciliados no prazo · meta ${pct(META)}`} cor={geral.nivel === null ? "" : geral.nivel >= META ? "text-emerald-600" : geral.nivel >= 0.8 ? "text-amber-600" : "text-destructive"} />
        <Kpi titulo="Falhas de rotina" valor={String(geral.falhas)} detalhe="Dias movimentados sem conciliação no prazo" cor={geral.falhas ? "text-destructive" : "text-emerald-600"} />
        <Kpi titulo="Conferências atrasadas" valor={String(geral.atrasados)} detalhe="Upload do histórico depois do D+1 útil" cor={geral.atrasados ? "text-amber-600" : "text-emerald-600"} />
        <Kpi titulo="Cobertura de itens" valor={pct(cobertura.pct)} detalhe={`${cobertura.conciliados} de ${cobertura.itens} SKUs movimentados aparecem na conciliação · ${divergencias} divergência(s)`} cor={cobertura.pct === null ? "" : cobertura.pct >= 0.95 ? "text-emerald-600" : "text-amber-600"} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimentado × Conciliado na semana</CardTitle>
          <CardDescription>Clique num dia para ver os itens movimentados, o que já foi conciliado no Atlas e registrar a conferência do restante.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {q.isLoading ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</div> : (
            <Table>
              <TableHeader><TableRow><TableHead className="w-40" />{semana.map((d, i) => <TableHead key={d} className="text-center">{DIAS[i]} <span className="text-[10px] text-muted-foreground">{dm(d)}</span></TableHead>)}<TableHead className="text-center">Nível</TableHead></TableRow></TableHeader>
              <TableBody>
                {ALMOX_FAROL.map((a) => {
                  const sits = semana.map((d) => sit(a.id, d)); const n = nivelServico(sits);
                  return [
                    <TableRow key={a.id + "m"} className="bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">Movimentado</TableCell>
                      {semana.map((d, i) => { const it = porDia.get(`${a.id}|${d}`); return <TableCell key={d} className="text-center text-xs">{d > hoje ? "" : it?.length ? <span className="font-semibold">Sim <span className="font-normal text-muted-foreground">({it.length})</span></span> : <span className="text-muted-foreground">Não</span>}</TableCell>; })}
                      <TableCell />
                    </TableRow>,
                    <TableRow key={a.id + "c"} className="border-b-2">
                      <TableCell className="font-semibold">{a.nome}<span className={`block text-[10px] font-normal ${ultimaMov.get(a.id) && ultimaMov.get(a.id)! >= semana[0] ? "text-muted-foreground" : "text-amber-600"}`}>{ultimaMov.get(a.id) ? `movimento na base até ${dm(ultimaMov.get(a.id)!)}` : "sem movimento nas bases"}</span></TableCell>
                      {semana.map((d, i) => <TableCell key={d} className="p-1 text-center"><Celula s={sits[i]} futuro={d > hoje} onClick={() => setAberto({ almox: a.id, dia: d })} /></TableCell>)}
                      <TableCell className={`text-center font-semibold tabular-nums ${n.nivel === null ? "text-muted-foreground" : n.nivel >= META ? "text-emerald-600" : "text-destructive"}`}>{pct(n.nivel)}</TableCell>
                    </TableRow>,
                  ];
                })}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap gap-3 border-t p-3 text-[11px] text-muted-foreground">
            <span><b className="text-emerald-600">Sim</b> conferido e histórico enviado ao Atlas no prazo (abaixo: SKUs conciliados/movimentados)</span>
            <span><b className="text-amber-600">Atrasada</b> histórico enviado depois do D+1</span><span><b className="text-destructive">Não</b> movimentou e não houve upload até o prazo</span>
            <span><b className="text-sky-600">Pendente</b> dentro do prazo</span><span><b>—</b> sem movimentação nas bases (conciliado* = conciliado no Atlas sem movimento nas bases)</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-destructive" />Possíveis falhas operacionais</CardTitle></CardHeader>
          <CardContent>
            {!falhas.length ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />Nenhuma falha de rotina na semana.</p> : (
              <ul className="space-y-1.5 text-sm">{falhas.map((x) => {
                const nome = ALMOX_FAROL.find((a) => a.id === x.a)!.nome; const s = x.s as Exclude<SituacaoDia, { tipo: "SEM_MOV" }>;
                const texto = s.tipo === "FALHA" ? `movimentou ${s.itens} item(ns) e não teve upload de conferência até ${dm(s.prazo)}`
                  : s.tipo === "ATRASADO" ? `histórico enviado em ${s.em ? dm(diaSP(s.em)) : "—"}, depois do prazo (${dm(s.prazo)}) · ${s.conciliados}/${s.itens} SKUs`
                  : "";
                return <li key={x.a + x.d}><button type="button" className="text-left hover:underline" onClick={() => setAberto({ almox: x.a, dia: x.d })}><b>{nome}</b> · {DIAS[semana.indexOf(x.d)]} {dm(x.d)}: {texto}</button></li>;
              })}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Nível de serviço · últimas {SEMANAS_TENDENCIA} semanas</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Almox</TableHead>{tendencia.map((s) => <TableHead key={s[0]} className="text-center text-[11px]">{dm(s[0])}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{ALMOX_FAROL.map((a) => <TableRow key={a.id}><TableCell className="text-xs font-semibold">{a.nome}</TableCell>{tendencia.map((s) => { const n = nivelServico(s.map((d) => sit(a.id, d))); return <TableCell key={s[0]} className={`text-center text-xs tabular-nums ${n.nivel === null ? "text-muted-foreground" : n.nivel >= META ? "text-emerald-600" : "font-semibold text-destructive"}`}>{pct(n.nivel)}</TableCell>; })}</TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bases de movimentação lidas na janela: livro-caixa do Atlas ({q.data?.bases.brutas ?? 0} linhas, importado em <Link to="/atlas/importar" className="underline">Atlas › Importar</Link>),
        planilha diária do ERP ({q.data?.bases.erp ?? 0}, em <Link to="/suprimentos/fefo/movimentacoes" className="underline">Controle FEFO › Importar Movimentação Diária</Link>) e movimentação por lote ({q.data?.bases.lote ?? 0}). Dias sem nenhuma dessas bases usam os itens da conciliação do Atlas como movimento ({q.data?.bases.atlas ?? 0} linhas).
        Conciliação = indicador de Movimentados do Atlas (itens sem divergência e divergências de origem movimentação).
        {" "}Últimas datas: {ALMOX_FAROL.map((a) => `${a.nome}: ${(q.data?.frescor ?? []).filter((f) => f[1] === a.id).map((f) => `${f[0]} ${f[2] ? dm(String(f[2]).slice(0, 10)) : "—"}`).join(", ")}`).join(" · ")}.
      </p>

      {importando && <ImportarErpDialog onClose={() => setImportando(false)} />}
      {listaAberta && <ListaMovimentadosDialog hoje={hoje} onClose={() => setListaAberta(false)} />}
      {aberto && <ConferenciaDialog almox={aberto.almox} dia={aberto.dia} itens={porDia.get(`${aberto.almox}|${aberto.dia}`) ?? []} conf={confPor.get(`${aberto.almox}|${aberto.dia}`) ?? null}
        conc={concPor.get(`${aberto.almox}|${aberto.dia}`)} situacao={sit(aberto.almox, aberto.dia)} hoje={hoje} onClose={() => setAberto(null)} />}
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe: string; cor: string }) {
  return <Card><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">{titulo}</p><p className={`text-3xl font-bold tabular-nums ${cor}`}>{valor}</p><p className="text-[11px] text-muted-foreground">{detalhe}</p></CardContent></Card>;
}

function Celula({ s, futuro, onClick }: { s: SituacaoDia; futuro: boolean; onClick: () => void }) {
  if (futuro) return null;
  const cfg: Record<SituacaoDia["tipo"], { t: string; c: string }> = {
    SEM_MOV: { t: s.tipo === "SEM_MOV" && s.conciliados ? "Conciliado*" : "—", c: "text-muted-foreground" },
    PENDENTE: { t: "Pendente", c: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200" },
    FALHA: { t: "Não", c: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
    CONFERIDO: { t: "Sim", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
    ATRASADO: { t: "Atrasada", c: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
    PARCIAL: { t: "Parcial", c: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  };
  const x = cfg[s.tipo];
  const sub = s.tipo === "SEM_MOV" ? (s.conciliados ? `${s.conciliados} itens` : "") : s.tipo === "PENDENTE" ? `até ${dm(s.prazo)}` : `${s.conciliados}/${s.itens}${s.divergentes ? ` · ${s.divergentes} div.` : ""}`;
  const clicavel = s.tipo !== "SEM_MOV" || s.conciliados > 0;
  return <button type="button" disabled={!clicavel} onClick={onClick} className={`w-full rounded px-1 py-1 text-xs font-semibold ${x.c} ${clicavel ? "hover:ring-1 hover:ring-primary" : "cursor-default"}`}>{x.t}{sub && <span className="block text-[10px] font-normal">{sub}</span>}</button>;
}

type LinhaConf = ItemMov & { status: StatusConc; ja_conciliado: boolean; saldo_sistema: number | null; qtd_contada: number | null; obs: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const corDif = (v: number | null) => (v === null || v === 0 ? "text-muted-foreground" : v < 0 ? "text-destructive" : "text-emerald-600");
const fmtDif = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")}`;

function ConferenciaDialog({ almox, dia, itens, conf, conc, situacao, hoje, onClose }: {
  almox: AlmoxFarol; dia: string; itens: ItemMov[]; conf: Conferencia | null; conc: ConcDia | undefined; situacao: SituacaoDia; hoje: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const nome = ALMOX_FAROL.find((a) => a.id === almox)!.nome;
  const anterior = new Map(((conf?.itens ?? []) as any[]).map((i) => [chaveSku(i.sku), i]));
  // Saldo sistêmico e custo contábil do almoxarifado (mesma base da ficha de contagem e das listas de movimentados).
  const estoqueQ = useQuery({
    queryKey: ["farol-movimentados", "saldo-custo", almox],
    queryFn: async () => saldoECustoPorSku(await fetchAll<any>((f, t) => sb.from("estoque_sistemico")
      .select("id_produto, quantidade, custo_contabil, custo_unitario").eq("origem", ORIGEM_SALDO[almox]).order("id").range(f, t))),
  });
  // Itens já conciliados por outra fonte (importação do Atlas) aparecem travados; o restante é conferido aqui.
  const base: LinhaConf[] = itens.map((i) => {
    const c = conc?.get(chaveSku(i.sku)); const a = anterior.get(chaveSku(i.sku));
    const daqui = a && !a.ja_conciliado;
    const externo = !!c && !daqui;
    const saldo = a?.saldo_sistema ?? i.saldo ?? null;
    const contada = a?.qtd_contada ?? (a?.status === "OK" ? saldo : null);
    return { ...i, ja_conciliado: externo, status: externo ? (c!.divergente ? "DIVERGENTE" : "OK") : statusConciliacao(saldo, contada),
      saldo_sistema: saldo, qtd_contada: externo ? null : contada, obs: a?.obs ?? null };
  });
  const [linhas, setLinhas] = useState<LinhaConf[]>(base);
  const [obs, setObs] = useState(conf?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const set = (sku: string, p: Partial<LinhaConf>) => setLinhas((ls) => ls.map((l) => (l.sku === sku ? { ...l, ...p } : l)));
  const sistemaDe = (l: LinhaConf) => l.saldo_sistema ?? estoqueQ.data?.get(chaveSku(l.sku))?.saldo ?? null;
  const custoDe = (l: LinhaConf) => estoqueQ.data?.get(chaveSku(l.sku))?.custo ?? null;
  const calc = linhas.map((l) => {
    const sistema = sistemaDe(l);
    const status: StatusConc = l.ja_conciliado ? l.status : statusConciliacao(sistema, l.qtd_contada);
    const dif = l.ja_conciliado ? { qtd: null, custo: null } : diferencaConciliacao(sistema, l.qtd_contada, custoDe(l));
    return { l, sistema, status, dif };
  });
  const conferidos = calc.filter((c) => c.status !== "NAO_CONFERIDO").length;
  const divergentes = calc.filter((c) => c.status === "DIVERGENTE").length;
  const novos = calc.filter((c) => !c.l.ja_conciliado && c.status !== "NAO_CONFERIDO").length;
  const totalDifQtd = calc.reduce((s, c) => s + (c.dif.qtd ?? 0), 0);
  const totalDifCusto = calc.reduce((s, c) => s + (c.dif.custo ?? 0), 0);
  const prazo = "prazo" in situacao ? situacao.prazo : null;
  const semSaldo = calc.some((c) => !c.l.ja_conciliado && c.l.qtd_contada !== null && c.sistema === null);
  async function salvar() {
    setSalvando(true);
    try {
      const p_itens = calc.map(({ l, sistema, status }) => ({ ...l, status, saldo_sistema: sistema }));
      const { data, error } = await sb.rpc("registrar_conferencia_movimentados", { p_almox: almox, p_data: dia, p_itens, p_observacao: obs });
      if (error) throw error;
      toast.success(`Conciliação de ${nome} · ${dm(dia)} registrada no Atlas`, { description: `${data?.atlas_historico ?? 0} item(ns) sem divergência e ${data?.atlas_divergencias ?? 0} divergência(s) para investigar em Atlas › Divergências.` });
      await qc.invalidateQueries({ queryKey: ["farol-movimentados"] }); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível registrar a conferência"); } finally { setSalvando(false); }
  }
  const STATUS: Record<StatusConc, { t: string; c: string }> = {
    OK: { t: "OK", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
    DIVERGENTE: { t: "Divergente", c: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
    NAO_CONFERIDO: { t: "Pendente", c: "bg-muted text-muted-foreground" },
  };
  return <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Conciliação de movimentados · {nome} · {dm(dia)}</DialogTitle>
        <DialogDescription>
          {itens.length} item(ns) movimentado(s) nas bases{prazo ? ` · prazo: ${dm(prazo)}${hoje > prazo ? " (vencido)" : ""}` : ""}.
          {" "}Como na ficha de contagem: informe a contagem e o sistema compara com o saldo sistêmico (Dif. = Contagem − Sistema, custo contábil total = Dif. × custo contábil). Itens já conciliados no Atlas ficam travados.
          {conf && ` Última conferência no farol: ${conf.conferente_nome ?? "—"} em ${new Date(conf.conferido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{conferidos} de {linhas.length} conciliado(s) · {divergentes} divergente(s)
          {estoqueQ.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />lendo saldo sistêmico…</span>}
          {estoqueQ.isError && <span className="ml-2 text-xs text-destructive">Saldo sistêmico indisponível</span>}</span>
        <Button size="sm" variant="outline" onClick={() => setLinhas((ls) => ls.map((l) => { const s = sistemaDe(l); return !l.ja_conciliado && l.qtd_contada === null && s !== null ? { ...l, qtd_contada: s } : l; }))}>Marcar pendentes como OK</Button>
      </div>
      <div className="max-h-[45vh] overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow>
            <TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Qtd mov.</TableHead>
            <TableHead className="text-right">Saldo sistêmico</TableHead><TableHead className="w-28 text-right">Contagem</TableHead>
            <TableHead className="text-right">Dif. qtd</TableHead><TableHead className="text-right">Custo contábil total</TableHead><TableHead className="text-center">Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>{calc.map(({ l, sistema, status, dif }) => <TableRow key={l.sku} className={l.ja_conciliado ? "bg-muted/40" : ""}>
            <TableCell className="font-mono text-xs">{l.sku}</TableCell>
            <TableCell className="text-xs">{l.descricao}{l.lotes?.length ? <span className="block text-[10px] text-muted-foreground">Lotes: {l.lotes.join(", ")}</span> : null}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{l.qtd.toLocaleString("pt-BR")}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{l.ja_conciliado ? <span className="text-muted-foreground">—</span>
              : sistema !== null ? <span className="font-semibold">{sistema.toLocaleString("pt-BR")}</span>
              : estoqueQ.isLoading ? <span className="text-muted-foreground">…</span>
              : <Input type="number" className="ml-auto h-7 w-24 text-right text-xs" value={l.saldo_sistema ?? ""} placeholder="saldo" onChange={(e) => set(l.sku, { saldo_sistema: e.target.value === "" ? null : Number(e.target.value) })} />}</TableCell>
            <TableCell className="text-right">{l.ja_conciliado ? <span className="text-xs text-muted-foreground">—</span>
              : <Input type="number" min={0} className="ml-auto h-7 w-24 text-right text-xs" value={l.qtd_contada ?? ""} placeholder="qtd" aria-label={`Contagem ${l.sku}`} onChange={(e) => set(l.sku, { qtd_contada: e.target.value === "" ? null : Number(e.target.value) })} />}</TableCell>
            <TableCell className={`text-right text-xs font-semibold tabular-nums ${corDif(dif.qtd)}`}>{dif.qtd === null ? "—" : fmtDif(dif.qtd)}</TableCell>
            <TableCell className={`text-right text-xs font-semibold tabular-nums ${corDif(dif.custo)}`} title={custoDe(l) == null ? "SKU sem custo contábil no estoque sistêmico" : `Custo contábil unitário: ${brl(custoDe(l)!)}`}>
              {dif.qtd === null ? "—" : dif.custo === null ? "sem custo" : brl(dif.custo)}</TableCell>
            <TableCell className="text-center">{l.ja_conciliado
              ? <span className={`text-[11px] font-semibold ${status === "DIVERGENTE" ? "text-destructive" : "text-emerald-600"}`}>Atlas · {status === "DIVERGENTE" ? "divergente" : "OK"}</span>
              : <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS[status].c}`}>{STATUS[status].t}</span>}</TableCell>
          </TableRow>)}
          {!linhas.length && <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">Nenhum item movimentado nas bases neste dia{conc?.size ? ` (${conc.size} item(ns) conciliado(s) no Atlas sem movimento registrado nas bases)` : ""}.</TableCell></TableRow>}
          {linhas.length > 0 && <TableRow className="sticky bottom-0 bg-muted font-semibold">
            <TableCell colSpan={5} className="text-right text-xs">Total</TableCell>
            <TableCell className={`text-right text-xs tabular-nums ${corDif(totalDifQtd)}`}>{fmtDif(Math.round(totalDifQtd * 10000) / 10000)}</TableCell>
            <TableCell className={`text-right text-xs tabular-nums ${corDif(totalDifCusto)}`}>{brl(totalDifCusto)}</TableCell>
            <TableCell />
          </TableRow>}</TableBody>
        </Table>
      </div>
      {semSaldo && <p className="text-xs text-amber-700">Há itens contados sem saldo sistêmico: informe o saldo para comparar com a contagem.</p>}
      <Textarea placeholder="Observação (opcional): o que foi encontrado, tratativa das divergências…" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-16" />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando || !novos || semSaldo}>{salvando && <Loader2 className="size-4 animate-spin" />}Registrar conciliação ({novos})</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Importa a planilha de movimentação do ERP (aba "Planilha2" ou a primeira) como base do farol. */
function ImportarErpDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaErp[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  async function ler(f: File) {
    setArquivo(f.name); setLinhas([]); setErros([]);
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const aba = wb.SheetNames.find((n) => n.trim().toLowerCase() === "planilha2") ?? wb.SheetNames[0];
      const r = linhasPlanilhaErp(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[aba], { defval: "" }));
      if (!r.linhas.length) r.erros.unshift(`Nenhuma linha válida na aba "${aba}" (colunas esperadas: id_produto, descricao, Data, doc, desc_movimento, desc_almox, qtd, id_lote).`);
      setLinhas(r.linhas); setErros(r.erros.slice(0, 20));
    } catch (e) { setErros([(e as Error).message]); }
  }
  const resumo = useMemo(() => {
    const m = new Map<string, { almox: string; dias: Set<string>; linhas: number; skus: Set<string> }>();
    for (const l of linhas) {
      const k = l.almox ?? "OUTROS"; const x = m.get(k) ?? { almox: k, dias: new Set(), linhas: 0, skus: new Set() };
      x.dias.add(l.data); x.linhas++; x.skus.add(l.id_produto); m.set(k, x);
    }
    return [...m.values()];
  }, [linhas]);
  async function importar() {
    setSalvando(true);
    try {
      const pares = [...new Map(linhas.map((l) => [`${l.desc_almox}|${l.data}`, { desc_almox: l.desc_almox, data: l.data }])).values()];
      const { error: e1 } = await sb.rpc("limpar_movimentacoes_erp", { p_pares: pares });
      if (e1) throw e1;
      const payload = linhas.map((l) => ({ ...l, arquivo }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await sb.from("movimentacoes_erp").insert(payload.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`${payload.length} movimentações importadas`, { description: `${pares.length} combinação(ões) de almoxarifado e dia atualizadas.` });
      await qc.invalidateQueries({ queryKey: ["farol-movimentados"] }); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao importar"); } finally { setSalvando(false); }
  }
  const nome = (id: string) => ALMOX_FAROL.find((a) => a.id === id)?.nome ?? "Outros almoxarifados (não entram no farol)";
  return <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5" />Importar movimentação do ERP</DialogTitle>
        <DialogDescription>Planilha com a aba "Planilha2" (id_produto, descricao, Data, doc, desc_movimento, desc_almox, qtd, id_lote). Pode conter vários dias; reimportar substitui o mesmo almoxarifado e dia. Não altera o FEFO.</DialogDescription>
      </DialogHeader>
      <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); }} />
      {resumo.length > 0 && <Table>
        <TableHeader><TableRow><TableHead>Almoxarifado</TableHead><TableHead>Dias</TableHead><TableHead className="text-right">Linhas</TableHead><TableHead className="text-right">SKUs</TableHead></TableRow></TableHeader>
        <TableBody>{resumo.map((r) => <TableRow key={r.almox} className={r.almox === "OUTROS" ? "text-muted-foreground" : ""}>
          <TableCell className="text-xs font-semibold">{nome(r.almox)}</TableCell>
          <TableCell className="text-xs">{[...r.dias].sort().map(dm).join(", ")}</TableCell>
          <TableCell className="text-right text-xs tabular-nums">{r.linhas.toLocaleString("pt-BR")}</TableCell>
          <TableCell className="text-right text-xs tabular-nums">{r.skus.size}</TableCell></TableRow>)}</TableBody>
      </Table>}
      {erros.length > 0 && <ul className="max-h-24 overflow-auto text-xs text-destructive">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void importar()} disabled={salvando || !linhas.length}>{salvando && <Loader2 className="size-4 animate-spin" />}Importar {linhas.length ? `${linhas.length.toLocaleString("pt-BR")} linhas` : ""}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Gera as listas de contagem (Geral, Processo, Qualidade, Pará) no formato das planilhas de Movimentação. Envio automático: 18h, dias úteis. */
function ListaMovimentadosDialog({ hoje, onClose }: { hoje: string; onClose: () => void }) {
  const [dia, setDia] = useState(hoje);
  const [ocupado, setOcupado] = useState<null | "baixar" | "enviar">(null);
  const [resultado, setResultado] = useState<{ almox: string; linhas: number }[] | null>(null);
  // Baixar: gera no próprio navegador (mesma lógica da função das 18h). Enviar: usa a função do servidor.
  async function baixar() {
    const [movs, saldos, grupos] = await Promise.all([
      fetchAll<MovErp>((f, t) => sb.from("movimentacoes_erp").select("data, desc_almox, id_produto, descricao, doc, desc_movimento, qtd").eq("data", dia).range(f, t)),
      fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, origem, quantidade, id_local, unidade, custo_unitario").in("origem", LISTAS.map((l) => l.saldo)).range(f, t)),
      fetchAll<any>((f, t) => sb.from("grupo_produtos").select("codigo_produto, grupo").range(f, t)),
    ]);
    if (!movs.length) { toast.warning(`Nenhuma movimentação do ERP importada para ${dm(dia)}. Importe a planilha primeiro.`); setResultado(LISTAS.map((l) => ({ almox: l.arquivo, linhas: 0 }))); return; }
    const un = (r: any) => (/^(KG|PC|UN|UND|UNI|LT|CX|G|ML|L)$/i.test(String(r.id_local ?? "")) ? String(r.id_local).toUpperCase() : (r.unidade || null));
    const sal: Saldo[] = saldos.map((r) => ({ id_produto: r.id_produto, almox: r.origem, quantidade: Number(r.quantidade) || 0, unidade: un(r), custo: r.custo_unitario ?? null }));
    const mapa = new Map<string, string>(grupos.map((g) => [String(g.codigo_produto).replace(/^0+/, ""), g.grupo]));
    const res: { almox: string; linhas: number }[] = [];
    for (const l of LISTAS) {
      const linhas = montarLista(l.id, dia, movs, sal, mapa);
      res.push({ almox: l.arquivo, linhas: linhas.length });
      if (!linhas.length) continue;
      const p = planilha(linhas);
      const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([p.cabecalho]);
      p.linhas.forEach((row, i) => row.forEach((v, c) => {
        const ref = XLSX.utils.encode_cell({ r: i + 1, c });
        if (v && typeof v === "object") ws[ref] = { t: "s", f: (v as { f: string }).f } as any;
        else if (v === null) return;
        else if (c === 1) ws[ref] = { t: "d", v: new Date(`${v}T12:00:00`), z: "dd/mm/yyyy" } as any;
        else ws[ref] = (typeof v === "number" ? { t: "n", v } : { t: "s", v: String(v) }) as any;
      }));
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: p.linhas.length, c: p.cabecalho.length - 1 } });
      ws["!cols"] = [{ wch: 20 }, { wch: 11 }, { wch: 13 }, { wch: 42 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { hidden: true }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movimentados");
      XLSX.writeFile(wb, nomeArquivo(l.id, dia));
    }
    setResultado(res);
  }
  async function executar(acao: "baixar" | "enviar") {
    setOcupado(acao);
    try {
      if (acao === "baixar") { await baixar(); return; }
      const { data, error } = await supabase.functions.invoke("lista-movimentados", { body: { acao, data: dia } });
      if (error) throw new Error("O envio por e-mail ainda não está disponível: a função lista-movimentados precisa ser publicada no Lovable. Enquanto isso, use \"Baixar listas\".");
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao enviar as listas");
      setResultado(data.listas.map((l: any) => ({ almox: l.almox, linhas: l.linhas })));
      toast.success(`Listas enviadas para ${data.destinatarios.length} destinatário(s)`);
    } catch (e: any) { toast.error(e?.message ?? "Falha ao gerar as listas"); } finally { setOcupado(null); }
  }
  return <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ListChecks className="size-5" />Lista de movimentados para contagem</DialogTitle>
        <DialogDescription>Mesmo formato das planilhas "Movimentação - Geral / Processo / Qualidade / Pará": itens movimentados no dia (planilha do ERP importada aqui) com o saldo atual do sistema. O envio por e-mail é automático às 18h dos dias úteis: cada lista vai para os cadastrados em Cadastros › E-mails com a finalidade do seu almoxarifado ("Lista de Movimentados - Fabrica", "- Processo", "- Qualidade" ou "- Pará").</DialogDescription>
      </DialogHeader>
      <label className="text-xs font-semibold text-muted-foreground">Dia da movimentação
        <Input type="date" value={dia} max={hoje} onChange={(e) => e.target.value && setDia(e.target.value)} className="mt-1 w-44" />
      </label>
      {resultado && <ul className="text-sm">{resultado.map((r) => <li key={r.almox} className="flex justify-between border-b py-1"><span>{r.almox}</span><span className="text-muted-foreground">{r.linhas ? `${r.linhas} SKU(s)` : "sem movimentação"}</span></li>)}</ul>}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={!!ocupado}>Fechar</Button>
        <Button variant="outline" onClick={() => void executar("enviar")} disabled={!!ocupado}>{ocupado === "enviar" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Enviar por e-mail agora</Button>
        <Button onClick={() => void executar("baixar")} disabled={!!ocupado}>{ocupado === "baixar" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Baixar listas</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
