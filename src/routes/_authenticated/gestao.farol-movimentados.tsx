import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import {
  ALMOX_FAROL, chaveSku, conciliacaoPorDia, diaSP, diasDaSemana, movimentosPorDia, nivelServico, proximaSemana, semanaAnterior, situacaoDia,
  type AlmoxFarol, type ConcDia, type ConcLinha, type Conferencia, type ItemMov, type MovLinha, type SituacaoDia,
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

function FarolMovimentadosPage() {
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
      const [erp, brutas, porLote, hist, divs, lotes, conf, frescor] = await Promise.all([
        lerFaixa<any>("movimentacoes_diarias", "data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento", "data"),
        lerFaixa<any>("atlas_movimentacoes_brutas", "data, almoxarifado, sku, descricao, operacao, qtd_ent, qtd_sai, saldo", "data", "almoxarifado"),
        lerFaixa<any>("atlas_movimentacoes_lote_diaria", "data, almoxarifado_raw, sku, descricao_produto, quantidade, lote_movimentado", "data"),
        lerFaixa<any>("atlas_movimentacoes_historico", "data_movimento, almoxarifado, sku, origem, lote_importacao_id", "data_movimento", "almoxarifado"),
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
        ...brutas.filter((b: any) => !String(b.operacao ?? "").toLowerCase().includes("inventario"))
          .map((b: any) => ({ data: b.data, desc_almox: b.almoxarifado, id_produto: b.sku, descricao: b.descricao, qtd: (Number(b.qtd_ent) || 0) + (Number(b.qtd_sai) || 0), desc_movimento: b.operacao, saldo: b.saldo })),
        ...porLote.map((l: any) => ({ data: l.data, desc_almox: l.almoxarifado_raw, id_produto: l.sku, descricao: l.descricao_produto, qtd: Number(l.quantidade) || 0, id_lote: l.lote_movimentado })),
      ];
      const conc: ConcLinha[] = [
        ...hist.filter((h: any) => h.origem !== "fechamento_inventario").map((h: any) => ({ almoxarifado: h.almoxarifado, data: h.data_movimento, sku: h.sku, divergente: false, em: isoSP(loteEm.get(h.lote_importacao_id)) })),
        ...divs.filter((d: any) => d.origem !== "fechamento_inventario").map((d: any) => ({ almoxarifado: d.almoxarifado, data: d.data_deteccao, sku: d.sku, divergente: true, em: isoSP(d.criado_em) })),
      ];
      return { mov, conc, conf, frescor: frescor as [string, AlmoxFarol, string | null][], bases: { erp: erp.length, brutas: brutas.length, lote: porLote.length } };
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
  const falhas = sitsSemana.filter((x) => x.s.tipo === "FALHA" || x.s.tipo === "ATRASADO" || x.s.tipo === "PARCIAL");
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
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Nível de serviço da semana" valor={pct(geral.nivel)} detalhe={`${geral.cumpridos} de ${geral.vencidos} dias movimentados conciliados no prazo · meta ${pct(META)}`} cor={geral.nivel === null ? "" : geral.nivel >= META ? "text-emerald-600" : geral.nivel >= 0.8 ? "text-amber-600" : "text-destructive"} />
        <Kpi titulo="Falhas de rotina" valor={String(geral.falhas)} detalhe="Dias movimentados sem conciliação no prazo" cor={geral.falhas ? "text-destructive" : "text-emerald-600"} />
        <Kpi titulo="Atrasadas ou parciais" valor={String(geral.atrasados + geral.parciais)} detalhe={`${geral.atrasados} após o prazo · ${geral.parciais} sem todos os itens movimentados`} cor={geral.atrasados + geral.parciais ? "text-amber-600" : "text-emerald-600"} />
        <Kpi titulo="Divergências encontradas" valor={String(divergencias)} detalhe={`${geral.pendentes} dia(s) ainda dentro do prazo`} cor={divergencias ? "text-amber-600" : ""} />
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
            <span><b className="text-emerald-600">Sim</b> todos os itens conciliados no prazo</span><span><b className="text-amber-600">Parcial</b> prazo vencido sem todos os itens</span>
            <span><b className="text-amber-600">Atrasada</b> conciliado depois do D+1</span><span><b className="text-destructive">Não</b> movimentou e nada foi conciliado no prazo</span>
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
                const texto = s.tipo === "FALHA" ? `movimentou ${s.itens} item(ns) e nada foi conciliado até ${dm(s.prazo)}`
                  : s.tipo === "ATRASADO" ? `conciliado em ${s.em ? dm(diaSP(s.em)) : "—"}, depois do prazo (${dm(s.prazo)})`
                  : s.tipo === "PARCIAL" ? `conciliados ${s.conciliados} de ${s.itens} itens movimentados até ${dm(s.prazo)}` : "";
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
        planilha diária do ERP ({q.data?.bases.erp ?? 0}, em <Link to="/suprimentos/fefo/movimentacoes" className="underline">Controle FEFO › Importar Movimentação Diária</Link>) e movimentação por lote ({q.data?.bases.lote ?? 0}).
        Conciliação = indicador de Movimentados do Atlas (itens sem divergência e divergências de origem movimentação).
        {" "}Últimas datas: {ALMOX_FAROL.map((a) => `${a.nome}: ${(q.data?.frescor ?? []).filter((f) => f[1] === a.id).map((f) => `${f[0]} ${f[2] ? dm(String(f[2]).slice(0, 10)) : "—"}`).join(", ")}`).join(" · ")}.
      </p>

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
  const sub = s.tipo === "SEM_MOV" ? (s.conciliados ? `${s.conciliados} itens` : "") : s.tipo === "CONFERIDO" ? (s.divergentes ? `${s.divergentes} diverg.` : "") : `${s.conciliados}/${s.itens}`;
  const clicavel = s.tipo !== "SEM_MOV" || s.conciliados > 0;
  return <button type="button" disabled={!clicavel} onClick={onClick} className={`w-full rounded px-1 py-1 text-xs font-semibold ${x.c} ${clicavel ? "hover:ring-1 hover:ring-primary" : "cursor-default"}`}>{x.t}{sub && <span className="block text-[10px] font-normal">{sub}</span>}</button>;
}

type LinhaConf = ItemMov & { status: "OK" | "DIVERGENTE" | "NAO_CONFERIDO"; ja_conciliado: boolean; saldo_sistema: number | null; qtd_contada: number | null; obs: string | null };

function ConferenciaDialog({ almox, dia, itens, conf, conc, situacao, hoje, onClose }: {
  almox: AlmoxFarol; dia: string; itens: ItemMov[]; conf: Conferencia | null; conc: ConcDia | undefined; situacao: SituacaoDia; hoje: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const nome = ALMOX_FAROL.find((a) => a.id === almox)!.nome;
  const anterior = new Map(((conf?.itens ?? []) as any[]).map((i) => [chaveSku(i.sku), i]));
  // Itens já conciliados por outra fonte (importação do Atlas) aparecem travados; o restante é conferido aqui.
  const base: LinhaConf[] = itens.map((i) => {
    const c = conc?.get(chaveSku(i.sku)); const a = anterior.get(chaveSku(i.sku));
    const daqui = a && !a.ja_conciliado;
    const externo = !!c && !daqui;
    return { ...i, ja_conciliado: externo, status: externo ? (c!.divergente ? "DIVERGENTE" : "OK") : (a?.status ?? "NAO_CONFERIDO"),
      saldo_sistema: a?.saldo_sistema ?? i.saldo ?? null, qtd_contada: a?.qtd_contada ?? null, obs: a?.obs ?? null };
  });
  const [linhas, setLinhas] = useState<LinhaConf[]>(base);
  const [obs, setObs] = useState(conf?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const set = (sku: string, p: Partial<LinhaConf>) => setLinhas((ls) => ls.map((l) => (l.sku === sku ? { ...l, ...p } : l)));
  const conferidos = linhas.filter((l) => l.status !== "NAO_CONFERIDO").length;
  const novos = linhas.filter((l) => !l.ja_conciliado && l.status !== "NAO_CONFERIDO").length;
  const prazo = "prazo" in situacao ? situacao.prazo : null;
  const semSaldo = linhas.some((l) => !l.ja_conciliado && l.status === "DIVERGENTE" && (l.saldo_sistema === null || l.qtd_contada === null));
  async function salvar() {
    setSalvando(true);
    try {
      const { data, error } = await sb.rpc("registrar_conferencia_movimentados", { p_almox: almox, p_data: dia, p_itens: linhas, p_observacao: obs });
      if (error) throw error;
      toast.success(`Conciliação de ${nome} · ${dm(dia)} registrada no Atlas`, { description: `${data?.atlas_historico ?? 0} item(ns) sem divergência e ${data?.atlas_divergencias ?? 0} divergência(s) para investigar em Atlas › Divergências.` });
      await qc.invalidateQueries({ queryKey: ["farol-movimentados"] }); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível registrar a conferência"); } finally { setSalvando(false); }
  }
  return <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Conciliação de movimentados · {nome} · {dm(dia)}</DialogTitle>
        <DialogDescription>
          {itens.length} item(ns) movimentado(s) nas bases{prazo ? ` · prazo: ${dm(prazo)}${hoje > prazo ? " (vencido)" : ""}` : ""}.
          {" "}Itens já conciliados no Atlas ficam travados; os demais, ao registrar, entram no indicador de Movimentados do Atlas (sem divergência no histórico, divergentes em Divergências).
          {conf && ` Última conferência no farol: ${conf.conferente_nome ?? "—"} em ${new Date(conf.conferido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{conferidos} de {linhas.length} conciliado(s) · {linhas.filter((l) => l.status === "DIVERGENTE").length} divergente(s)</span>
        <Button size="sm" variant="outline" onClick={() => setLinhas((ls) => ls.map((l) => (l.status === "NAO_CONFERIDO" ? { ...l, status: "OK" } : l)))}>Marcar pendentes como OK</Button>
      </div>
      <div className="max-h-[45vh] overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-muted"><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Qtd mov.</TableHead><TableHead className="w-24 text-right">Sistema</TableHead><TableHead>Resultado</TableHead><TableHead className="w-24">Contado</TableHead></TableRow></TableHeader>
          <TableBody>{linhas.map((l) => <TableRow key={l.sku} className={l.ja_conciliado ? "bg-muted/40" : ""}>
            <TableCell className="font-mono text-xs">{l.sku}</TableCell>
            <TableCell className="text-xs">{l.descricao}{l.lotes?.length ? <span className="block text-[10px] text-muted-foreground">Lotes: {l.lotes.join(", ")}</span> : null}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{l.qtd.toLocaleString("pt-BR")}</TableCell>
            <TableCell className="text-right">{l.ja_conciliado ? <span className="text-xs text-muted-foreground">—</span>
              : <Input type="number" className="h-7 text-right text-xs" value={l.saldo_sistema ?? ""} placeholder="saldo" onChange={(e) => set(l.sku, { saldo_sistema: e.target.value === "" ? null : Number(e.target.value) })} />}</TableCell>
            <TableCell>{l.ja_conciliado
              ? <span className={`text-[11px] font-semibold ${l.status === "DIVERGENTE" ? "text-destructive" : "text-emerald-600"}`}>Conciliado no Atlas · {l.status === "DIVERGENTE" ? "divergente" : "OK"}</span>
              : <div className="flex gap-1">{(["OK", "DIVERGENTE", "NAO_CONFERIDO"] as const).map((st) => <button key={st} type="button" onClick={() => set(l.sku, { status: st })}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${l.status === st ? (st === "OK" ? "border-emerald-600 bg-emerald-600 text-white" : st === "DIVERGENTE" ? "border-destructive bg-destructive text-white" : "border-slate-500 bg-slate-500 text-white") : "text-muted-foreground"}`}>
                {st === "OK" ? "OK" : st === "DIVERGENTE" ? "Divergente" : "Não conferido"}</button>)}</div>}</TableCell>
            <TableCell>{!l.ja_conciliado && l.status === "DIVERGENTE" && <Input type="number" className="h-7 text-xs" value={l.qtd_contada ?? ""} placeholder="físico" onChange={(e) => set(l.sku, { qtd_contada: e.target.value === "" ? null : Number(e.target.value) })} />}</TableCell>
          </TableRow>)}
          {!linhas.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhum item movimentado nas bases neste dia{conc?.size ? ` (${conc.size} item(ns) conciliado(s) no Atlas sem movimento registrado nas bases)` : ""}.</TableCell></TableRow>}</TableBody>
        </Table>
      </div>
      {semSaldo && <p className="text-xs text-amber-700">Informe o saldo do sistema e a quantidade contada dos itens divergentes: é o que vira a divergência no Atlas.</p>}
      <Textarea placeholder="Observação (opcional): o que foi encontrado, tratativa das divergências…" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-16" />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando || !novos || semSaldo}>{salvando && <Loader2 className="size-4 animate-spin" />}Registrar conciliação ({novos})</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
