import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import {
  ALMOX_FAROL, almoxDoFarol, diaSP, diasDaSemana, movimentosPorDia, nivelServico, proximaSemana, semanaAnterior, situacaoDia,
  type AlmoxFarol, type Conferencia, type ItemConferido, type ItemMov, type MovLinha, type SituacaoDia,
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

  const q = useQuery({
    queryKey: ["farol-movimentados", ini, fim],
    queryFn: async () => {
      const [mov, conf, ult] = await Promise.all([
        fetchAll<MovLinha>((f, t) => sb.from("movimentacoes_diarias").select("data, desc_almox, id_produto, descricao, qtd, id_lote, desc_movimento")
          .gte("data", `${ini}T00:00:00-03:00`).lte("data", `${fim}T23:59:59-03:00`).order("data").range(f, t)),
        sb.from("conferencias_movimentados").select("*").gte("data_movimento", ini).lte("data_movimento", fim)
          .then((r: any) => ({ dados: (r.data ?? []) as Conferencia[], semTabela: !!r.error })),
        sb.from("movimentacoes_diarias").select("desc_almox, data").order("data", { ascending: false }).limit(2000)
          .then((r: any) => (r.data ?? []) as { desc_almox: string; data: string }[]),
      ]);
      return { mov, conf: conf.dados, semTabela: conf.semTabela, ult };
    },
  });

  const porDia = useMemo(() => movimentosPorDia(q.data?.mov ?? []), [q.data?.mov]);
  const confPor = useMemo(() => new Map<string, Conferencia>(((q.data?.conf ?? []) as Conferencia[]).map((c: Conferencia) => [`${c.almox}|${String(c.data_movimento).slice(0, 10)}`, c])), [q.data?.conf]);
  const sit = (a: AlmoxFarol, dia: string): SituacaoDia => situacaoDia(porDia.get(`${a}|${dia}`), confPor.get(`${a}|${dia}`), dia, hoje);
  // Última movimentação importada por almox (alerta de importação faltando) e nomes do ERP fora do processo.
  const ultimaImport = useMemo(() => {
    const m = new Map<AlmoxFarol, string>(); const fora = new Set<string>();
    for (const r of q.data?.ult ?? []) { const a = almoxDoFarol(r.desc_almox); if (!a) { fora.add(r.desc_almox); continue; } const d = diaSP(r.data); if (!m.has(a) || d > m.get(a)!) m.set(a, d); }
    return { m, fora: [...fora].filter(Boolean).sort() };
  }, [q.data?.ult]);

  const sitsSemana = ALMOX_FAROL.flatMap((a) => semana.map((d) => ({ a: a.id, d, s: sit(a.id, d) })));
  const geral = nivelServico(sitsSemana.map((x) => x.s));
  const divergencias = sitsSemana.reduce((acc, x) => acc + ("conferencia" in x.s && x.s.conferencia ? x.s.conferencia.divergentes : 0), 0);
  const falhas = sitsSemana.filter((x) => x.s.tipo === "FALHA" || x.s.tipo === "ATRASADO" || x.s.tipo === "PARCIAL");
  const tendencia = Array.from({ length: SEMANAS_TENDENCIA }, (_, i) => diasDaSemana(somaDias(semana[0], -7 * (SEMANAS_TENDENCIA - 1 - i))));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="size-6" /> Farol de Processo · Conferência de Movimentados</h1>
          <p className="text-sm text-muted-foreground">Almoxarifados Fábrica, Processo, Qualidade e Pará. Todo dia útil com movimentação no sistema exige a conferência física dos itens movimentados até o dia útil seguinte (D+1). Meta de nível de serviço: {pct(META)}.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setRef(semanaAnterior(ref))} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-48 text-center text-sm font-semibold">Semana {dm(semana[0])} a {dm(semana[4])}</span>
          <Button variant="outline" size="icon" onClick={() => setRef(proximaSemana(ref))} disabled={semana[0] > hoje} aria-label="Próxima semana"><ChevronRight className="size-4" /></Button>
          {!semana.includes(hoje) && <Button variant="ghost" size="sm" onClick={() => setRef(hoje)}>Esta semana</Button>}
        </div>
      </div>

      {q.data?.semTabela && <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">O registro de conferências ainda não está disponível no banco (migration 0055). As movimentações já aparecem; as conferências passam a contar assim que a migration for aplicada.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Nível de serviço da semana" valor={pct(geral.nivel)} detalhe={`${geral.cumpridos} de ${geral.vencidos} dias movimentados conferidos no prazo · meta ${pct(META)}`} cor={geral.nivel === null ? "" : geral.nivel >= META ? "text-emerald-600" : geral.nivel >= 0.8 ? "text-amber-600" : "text-destructive"} />
        <Kpi titulo="Falhas de rotina" valor={String(geral.falhas)} detalhe="Dias movimentados sem conferência no prazo" cor={geral.falhas ? "text-destructive" : "text-emerald-600"} />
        <Kpi titulo="Atrasadas ou parciais" valor={String(geral.atrasados + geral.parciais)} detalhe={`${geral.atrasados} após o prazo · ${geral.parciais} sem todos os itens`} cor={geral.atrasados + geral.parciais ? "text-amber-600" : "text-emerald-600"} />
        <Kpi titulo="Divergências encontradas" valor={String(divergencias)} detalhe={`${geral.pendentes} dia(s) ainda dentro do prazo`} cor={divergencias ? "text-amber-600" : ""} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimentado × Conferido na semana</CardTitle>
          <CardDescription>Clique num dia para registrar ou ver a conferência dos itens movimentados.</CardDescription>
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
                      <TableCell className="font-semibold">{a.nome}{!ultimaImport.m.has(a.id) && <span className="block text-[10px] font-normal text-amber-600">sem movimentação importada</span>}</TableCell>
                      {semana.map((d, i) => <TableCell key={d} className="p-1 text-center"><Celula s={sits[i]} futuro={d > hoje} onClick={() => setAberto({ almox: a.id, dia: d })} /></TableCell>)}
                      <TableCell className={`text-center font-semibold tabular-nums ${n.nivel === null ? "text-muted-foreground" : n.nivel >= META ? "text-emerald-600" : "text-destructive"}`}>{pct(n.nivel)}</TableCell>
                    </TableRow>,
                  ];
                })}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap gap-3 border-t p-3 text-[11px] text-muted-foreground">
            <span><b className="text-emerald-600">Sim</b> conferido no prazo</span><span><b className="text-amber-600">Parcial</b> conferido no prazo sem todos os itens</span>
            <span><b className="text-amber-600">Atrasada</b> conferido depois do D+1</span><span><b className="text-destructive">Não</b> movimentou e não conferiu no prazo</span>
            <span><b className="text-sky-600">Pendente</b> dentro do prazo</span><span><b>—</b> sem movimentação</span>
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
                const texto = s.tipo === "FALHA" ? `movimentou ${s.itens} item(ns) e não teve conferência até ${dm(s.prazo)}`
                  : s.tipo === "ATRASADO" ? `conferido em ${dm(diaSP(s.conferencia.conferido_em))}, depois do prazo (${dm(s.prazo)})`
                  : s.tipo === "PARCIAL" ? `conferidos ${s.conferencia.itens_conferidos} de ${s.itens} itens movimentados` : "";
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
        Movimentações: planilha diária do ERP importada em <Link to="/suprimentos/fefo/movimentacoes" className="underline">Controle FEFO › Importar Movimentação Diária</Link>.
        Última movimentação importada: {ALMOX_FAROL.map((a) => `${a.nome} ${ultimaImport.m.get(a.id) ? dm(ultimaImport.m.get(a.id)!) : "nenhuma"}`).join(" · ")}.
        {ultimaImport.fora.length > 0 && <> Almoxarifados da planilha fora deste processo: {ultimaImport.fora.join(", ")}.</>}
      </p>

      {aberto && <ConferenciaDialog almox={aberto.almox} dia={aberto.dia} itens={porDia.get(`${aberto.almox}|${aberto.dia}`) ?? []} conf={confPor.get(`${aberto.almox}|${aberto.dia}`) ?? null}
        situacao={sit(aberto.almox, aberto.dia)} hoje={hoje} onClose={() => setAberto(null)} />}
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe: string; cor: string }) {
  return <Card><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">{titulo}</p><p className={`text-3xl font-bold tabular-nums ${cor}`}>{valor}</p><p className="text-[11px] text-muted-foreground">{detalhe}</p></CardContent></Card>;
}

function Celula({ s, futuro, onClick }: { s: SituacaoDia; futuro: boolean; onClick: () => void }) {
  if (futuro) return null;
  const cfg: Record<SituacaoDia["tipo"], { t: string; c: string }> = {
    SEM_MOV: { t: s.tipo === "SEM_MOV" && s.conferencia ? "Conferido*" : "—", c: "text-muted-foreground" },
    PENDENTE: { t: "Pendente", c: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200" },
    FALHA: { t: "Não", c: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
    CONFERIDO: { t: "Sim", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
    ATRASADO: { t: "Atrasada", c: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
    PARCIAL: { t: "Parcial", c: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  };
  const x = cfg[s.tipo];
  const sub = s.tipo === "PARCIAL" ? `${s.conferencia.itens_conferidos}/${s.itens}` : s.tipo === "PENDENTE" ? `até ${dm(s.prazo)}` : "";
  const clicavel = s.tipo !== "SEM_MOV" || !!s.conferencia;
  return <button type="button" disabled={!clicavel} onClick={onClick} className={`w-full rounded px-1 py-1 text-xs font-semibold ${x.c} ${clicavel ? "hover:ring-1 hover:ring-primary" : "cursor-default"}`}>{x.t}{sub && <span className="block text-[10px] font-normal">{sub}</span>}</button>;
}

function ConferenciaDialog({ almox, dia, itens, conf, situacao, hoje, onClose }: {
  almox: AlmoxFarol; dia: string; itens: ItemMov[]; conf: Conferencia | null; situacao: SituacaoDia; hoje: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const nome = ALMOX_FAROL.find((a) => a.id === almox)!.nome;
  const anterior = new Map((conf?.itens ?? []).map((i) => [i.sku, i]));
  // Lista = itens movimentados no sistema + itens que só constam na conferência já registrada.
  const base: ItemConferido[] = [
    ...itens.map((i) => ({ ...i, status: anterior.get(i.sku)?.status ?? "NAO_CONFERIDO", qtd_contada: anterior.get(i.sku)?.qtd_contada ?? null, obs: anterior.get(i.sku)?.obs ?? null }) as ItemConferido),
    ...(conf?.itens ?? []).filter((i) => !itens.some((m) => m.sku === i.sku)),
  ];
  const [linhas, setLinhas] = useState<ItemConferido[]>(base);
  const [obs, setObs] = useState(conf?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const set = (sku: string, p: Partial<ItemConferido>) => setLinhas((ls) => ls.map((l) => (l.sku === sku ? { ...l, ...p } : l)));
  const conferidos = linhas.filter((l) => l.status !== "NAO_CONFERIDO").length;
  const prazo = "prazo" in situacao ? situacao.prazo : null;
  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await sb.rpc("registrar_conferencia_movimentados", { p_almox: almox, p_data: dia, p_itens: linhas, p_observacao: obs });
      if (error) throw error;
      toast.success(`Conferência de ${nome} · ${dm(dia)} registrada (${conferidos} de ${linhas.length} itens)`);
      await qc.invalidateQueries({ queryKey: ["farol-movimentados"] }); onClose();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível registrar a conferência"); } finally { setSalvando(false); }
  }
  return <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Conferência de movimentados · {nome} · {dm(dia)}</DialogTitle>
        <DialogDescription>
          {itens.length} item(ns) movimentado(s) no sistema{prazo ? ` · prazo da conferência: ${dm(prazo)}${hoje > prazo ? " (vencido)" : ""}` : ""}.
          {conf && ` Última conferência registrada por ${conf.conferente_nome ?? "—"} em ${new Date(conf.conferido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{conferidos} de {linhas.length} conferido(s) · {linhas.filter((l) => l.status === "DIVERGENTE").length} divergente(s)</span>
        <Button size="sm" variant="outline" onClick={() => setLinhas((ls) => ls.map((l) => (l.status === "NAO_CONFERIDO" ? { ...l, status: "OK" } : l)))}>Marcar pendentes como OK</Button>
      </div>
      <div className="max-h-[45vh] overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-muted"><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Qtd mov.</TableHead><TableHead>Resultado</TableHead><TableHead className="w-24">Contado</TableHead></TableRow></TableHeader>
          <TableBody>{linhas.map((l) => <TableRow key={l.sku}>
            <TableCell className="font-mono text-xs">{l.sku}</TableCell>
            <TableCell className="text-xs">{l.descricao}{l.lotes?.length ? <span className="block text-[10px] text-muted-foreground">Lotes: {l.lotes.join(", ")}</span> : null}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{l.qtd.toLocaleString("pt-BR")}</TableCell>
            <TableCell><div className="flex gap-1">{(["OK", "DIVERGENTE", "NAO_CONFERIDO"] as const).map((st) => <button key={st} type="button" onClick={() => set(l.sku, { status: st })}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${l.status === st ? (st === "OK" ? "border-emerald-600 bg-emerald-600 text-white" : st === "DIVERGENTE" ? "border-destructive bg-destructive text-white" : "border-slate-500 bg-slate-500 text-white") : "text-muted-foreground"}`}>
              {st === "OK" ? "OK" : st === "DIVERGENTE" ? "Divergente" : "Não conferido"}</button>)}</div></TableCell>
            <TableCell>{l.status === "DIVERGENTE" && <Input type="number" className="h-7 text-xs" value={l.qtd_contada ?? ""} onChange={(e) => set(l.sku, { qtd_contada: e.target.value === "" ? null : Number(e.target.value) })} />}</TableCell>
          </TableRow>)}
          {!linhas.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Nenhum item movimentado neste dia.</TableCell></TableRow>}</TableBody>
        </Table>
      </div>
      <Textarea placeholder="Observação (opcional): o que foi encontrado, tratativa das divergências…" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-16" />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando || !conferidos}>{salvando && <Loader2 className="size-4 animate-spin" />}{conf ? "Atualizar conferência" : "Registrar conferência"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
