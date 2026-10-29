import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ClipboardCheck, Gauge, Loader2, Plus, Target, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import {
  ETAPAS, META_ACURACIDADE, META_ADERENCIA, acaoAberta, acaoVencida, diaBR, resumir,
  type Acao, type EtapaId, type ItemLinha, type MissaoLinha,
} from "@/lib/indicador-inventario";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/gestao/indicador-inventario")({
  component: IndicadorInventarioPage,
  head: () => ({ meta: [{ title: "Indicador do Processo de Inventário — Gestão" }] }),
});

const sb = supabase as any;
const TODOS = "__todos__";
const pct = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const corMeta = (v: number | null, meta: number) => (v === null ? "" : v >= meta ? "text-emerald-600" : v >= meta - 0.05 ? "text-amber-600" : "text-red-600");
const STATUS_ACAO: Record<Acao["status"], string> = { ABERTA: "Aberta", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const nomeEtapa = (id: string) => ETAPAS.find((e) => e.id === id)?.nome ?? id;

function IndicadorInventarioPage() {
  const { isAdmin, role } = useRole();
  const gestorRole = isAdmin || role === "GERENTE";
  const { almoxes } = useMeusAlmoxarifados();
  const qc = useQueryClient();
  const hoje = diaBR(new Date());
  const [mes, setMes] = useState(() => hoje.slice(0, 7));
  const [almox, setAlmox] = useState(TODOS);
  const [filtroEtapa, setFiltroEtapa] = useState<EtapaId | "TODAS">("TODAS");
  const [mostrarFechadas, setMostrarFechadas] = useState(false);
  const [novaAcao, setNovaAcao] = useState<{ etapa: EtapaId; missao_id?: string; titulo?: string } | null>(null);

  const q = useQuery({
    queryKey: ["indicador-inventario", mes, almoxes?.join(",") ?? "all"],
    refetchInterval: 300000,
    queryFn: async () => {
      const [a, m] = mes.split("-").map(Number);
      const ini = `${mes}-01`, fim = `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
      const buscar = (cols: string) => {
        let qm = sb.from("missoes").select(cols).gte("data_execucao", ini).lte("data_execucao", fim);
        if (almoxes) qm = qm.in("origem", almoxes.length ? almoxes : ["__nenhum__"]);
        return qm;
      };
      // Sem a migration 0042, a coluna concluida_em ainda não existe: segue sem ela (conclusão conta como no prazo).
      let semMigration = false;
      let { data: missoes, error } = await buscar("id, titulo, tipo, origem, data_execucao, status, concluida_em");
      if (error?.code === "42703") {
        semMigration = true;
        ({ data: missoes, error } = await buscar("id, titulo, tipo, origem, data_execucao, status"));
      }
      if (error) throw error;
      const ids = (missoes as MissaoLinha[]).map((x) => x.id);
      const itens: ItemLinha[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e2 } = await sb.from("missoes_itens").select("missao_id, status_item, observacao").in("missao_id", ids.slice(i, i + 200));
        if (e2) throw e2;
        itens.push(...(data as ItemLinha[]));
      }
      const { data: acoes, error: e3 } = await sb.from("processo_inventario_acoes").select("*").order("prazo", { ascending: true, nullsFirst: false });
      if (e3) semMigration = true;
      return { missoes: (missoes as MissaoLinha[]).map((m) => ({ ...m, concluida_em: m.concluida_em ?? null })), itens, acoes: (acoes ?? []) as Acao[], semMigration };
    },
  });

  const gestor = gestorRole && !q.data?.semMigration;
  const origens = useMemo(() => [...new Set((q.data?.missoes ?? []).map((m) => m.origem).filter(Boolean) as string[])].sort(), [q.data]);
  const missoes = useMemo(() => (q.data?.missoes ?? []).filter((m) => almox === TODOS || m.origem === almox), [q.data, almox]);
  const r = useMemo(() => resumir(missoes, q.data?.itens ?? [], mes, hoje), [missoes, q.data, mes, hoje]);
  const acoes = useMemo(() => (q.data?.acoes ?? []).filter((a) => almox === TODOS || !a.origem || a.origem === almox), [q.data, almox]);
  const acoesAbertas = acoes.filter(acaoAberta);
  const acoesVencidas = acoes.filter((a) => acaoVencida(a, hoje));
  const pendencias = [
    ...r.atrasadasAbertas.map((m) => ({ m, motivo: "Atrasada em aberto", etapa: "EXECUCAO" as EtapaId })),
    ...r.encerradasIncompletas.map((m) => ({ m, motivo: "Concluída com itens pendentes", etapa: "ENCERRAMENTO" as EtapaId })),
  ];
  const listaAcoes = acoes.filter((a) => (filtroEtapa === "TODAS" || a.etapa === filtroEtapa) && (mostrarFechadas || acaoAberta(a)));

  const etapaMetricas: Record<EtapaId, { label: string; valor: string; alerta?: boolean }[]> = {
    PLANEJAMENTO: [
      { label: "Programadas no mês", valor: String(r.universo + r.futuras) },
      { label: "Ainda por vencer", valor: String(r.futuras) },
    ],
    EXECUCAO: [
      { label: "No prazo", valor: `${r.noPrazo} de ${r.universo}` },
      { label: "Atrasadas em aberto", valor: String(r.atrasadasAbertas.length), alerta: r.atrasadasAbertas.length > 0 },
      { label: "Concluídas com atraso", valor: String(r.comAtraso), alerta: r.comAtraso > 0 },
    ],
    DIVERGENCIA: [
      { label: "Acuracidade", valor: pct(r.acuracidade), alerta: r.acuracidade !== null && r.acuracidade < META_ACURACIDADE },
      { label: "Itens divergentes", valor: String(r.itensDiv), alerta: r.itensDiv > 0 },
      { label: "Quebras FEFO", valor: String(r.itensFefo), alerta: r.itensFefo > 0 },
    ],
    AJUSTE: [
      { label: "Divergências sem justificativa", valor: String(r.divSemJustificativa), alerta: r.divSemJustificativa > 0 },
      { label: "Itens contados sem avaliação", valor: String(r.itensSemAvaliacao) },
    ],
    ENCERRAMENTO: [
      { label: "Concluídas com itens pendentes", valor: String(r.encerradasIncompletas.length), alerta: r.encerradasIncompletas.length > 0 },
      { label: "Itens pendentes no mês", valor: String(r.itensPendentes) },
    ],
  };

  async function mudarStatus(a: Acao, status: Acao["status"]) {
    const { error } = await sb.from("processo_inventario_acoes").update({ status }).eq("id", a.id);
    if (error) return toast.error("Não consegui atualizar: " + error.message);
    qc.invalidateQueries({ queryKey: ["indicador-inventario"] });
  }
  async function excluir(a: Acao) {
    if (!confirm(`Excluir a ação "${a.titulo}"?`)) return;
    const { error } = await sb.from("processo_inventario_acoes").delete().eq("id", a.id);
    if (error) return toast.error("Não consegui excluir: " + error.message);
    toast.success("Ação excluída."); qc.invalidateQueries({ queryKey: ["indicador-inventario"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Indicador do Processo de Inventário</h1>
          <p className="text-sm text-muted-foreground">
            Aderência ao plano de contagem = missões concluídas no prazo ÷ missões programadas que já venceram. Meta mensal ≥ {pct(META_ADERENCIA, 0)}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">Mês</Label><Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="w-40" /></div>
          <div className="space-y-1">
            <Label className="text-xs">Almoxarifado</Label>
            <Select value={almox} onValueChange={setAlmox}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {origens.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</div>}
      {q.error && <div className="text-sm text-red-600">Erro ao carregar: {(q.error as Error).message}</div>}

      {q.data?.semMigration && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          A migration <code>0042_indicador_processo_inventario</code> ainda não foi aplicada no banco. O indicador funciona, mas o prazo
          de conclusão das missões ainda não é medido e o plano de ação fica indisponível até a aplicação.
        </div>
      )}
      {q.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Gauge} titulo="Aderência ao plano" valor={pct(r.aderencia)} cor={corMeta(r.aderencia, META_ADERENCIA)}
              detalhe={r.universo ? `${r.noPrazo} de ${r.universo} missões no prazo · meta ${pct(META_ADERENCIA, 0)}` : "Nenhuma missão vencida no mês"} />
            <Kpi icon={Target} titulo="Acuracidade de contagem" valor={pct(r.acuracidade)} cor={corMeta(r.acuracidade, META_ACURACIDADE)}
              detalhe={`${r.itensOk} itens OK · ${r.itensDiv} divergentes · meta ${pct(META_ACURACIDADE, 0)}`} />
            <Kpi icon={CalendarClock} titulo="Missões atrasadas em aberto" valor={String(r.atrasadasAbertas.length)} cor={r.atrasadasAbertas.length ? "text-red-600" : "text-emerald-600"}
              detalhe={`${r.comAtraso} concluídas com atraso no mês`} />
            <Kpi icon={ClipboardCheck} titulo="Ações abertas" valor={String(acoesAbertas.length)} cor={acoesVencidas.length ? "text-red-600" : ""}
              detalhe={acoesVencidas.length ? `${acoesVencidas.length} com prazo vencido` : "Nenhuma vencida"} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Aderência acumulada no mês</CardTitle><CardDescription>Missões programadas até cada dia, comparadas à meta.</CardDescription></CardHeader>
            <CardContent className="h-64">
              {r.serie.some((s) => s.acumulada !== null) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={r.serie.map((s) => ({ dia: s.data.slice(8), v: s.acumulada === null ? null : +(s.acumulada * 100).toFixed(1) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="dia" fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => [`${String(v).replace(".", ",")}%`, "Aderência"]} labelFormatter={(d) => `Dia ${d}`} />
                    <ReferenceLine y={META_ADERENCIA * 100} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "Meta", fontSize: 11, position: "insideTopRight" }} />
                    <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem missões vencidas neste mês.</div>}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-lg font-semibold">Etapas do processo</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {ETAPAS.map((e, idx) => {
                const abertas = acoesAbertas.filter((a) => a.etapa === e.id);
                const vencidas = abertas.filter((a) => acaoVencida(a, hoje)).length;
                const temAlerta = etapaMetricas[e.id].some((m) => m.alerta);
                return (
                  <Card key={e.id} className={temAlerta ? "border-amber-300" : ""}>
                    <CardHeader className="pb-2">
                      <div className="text-xs font-medium text-muted-foreground">Etapa {idx + 1}</div>
                      <CardTitle className="flex items-center gap-2 text-base">{e.nome}{temAlerta && <AlertTriangle className="size-4 text-amber-500" />}</CardTitle>
                      <CardDescription className="text-xs">{e.desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <dl className="space-y-1 text-sm">
                        {etapaMetricas[e.id].map((m) => (
                          <div key={m.label} className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{m.label}</dt>
                            <dd className={`font-semibold tabular-nums ${m.alerta ? "text-red-600" : ""}`}>{m.valor}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="flex items-center justify-between border-t pt-2">
                        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setFiltroEtapa(e.id); document.getElementById("acoes")?.scrollIntoView({ behavior: "smooth" }); }}>
                          {abertas.length} ações abertas{vencidas ? ` · ${vencidas} vencidas` : ""}
                        </button>
                        {gestor && <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setNovaAcao({ etapa: e.id })}><Plus className="size-3" />Ação</Button>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Pendências de execução</CardTitle><CardDescription>Missões vencidas não concluídas e concluídas com itens pendentes.</CardDescription></CardHeader>
              <CardContent>
                {pendencias.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhuma pendência de execução. 🎯</p>
                  : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Missão</TableHead><TableHead>Data</TableHead><TableHead>Pendência</TableHead><TableHead /></TableRow></TableHeader>
                      <TableBody>
                        {pendencias.map(({ m, motivo, etapa }) => (
                          <TableRow key={m.id + motivo}>
                            <TableCell className="max-w-[16rem] truncate text-xs"><Link to="/missoes/$id" params={{ id: m.id }} className="hover:underline">{m.titulo}</Link></TableCell>
                            <TableCell className="text-xs">{dataBr(m.data_execucao)}</TableCell>
                            <TableCell><Badge variant="destructive" className="text-[10px]">{motivo}</Badge></TableCell>
                            <TableCell>{gestor && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNovaAcao({ etapa, missao_id: m.id, titulo: `Tratar: ${m.titulo}` })}><Plus className="size-3" />Ação</Button>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Aderência por tipo e almoxarifado</CardTitle><CardDescription>Ordenado do pior para o melhor resultado.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {[{ t: "Tipo de missão", g: r.porTipo }, { t: "Almoxarifado", g: r.porOrigem }].map(({ t, g }) => (
                  <Table key={t}>
                    <TableHeader><TableRow><TableHead>{t}</TableHead><TableHead className="text-right">Programadas</TableHead><TableHead className="text-right">Falhas</TableHead><TableHead className="text-right">Aderência</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {g.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground">Sem dados.</TableCell></TableRow>}
                      {g.map((x) => (
                        <TableRow key={x.chave}>
                          <TableCell className="text-xs">{x.chave}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{x.programadas}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{x.falhas}</TableCell>
                          <TableCell className={`text-right text-xs font-semibold tabular-nums ${corMeta(x.aderencia, META_ADERENCIA)}`}>{pct(x.aderencia)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card id="acoes">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div><CardTitle className="text-base">Plano de ação por etapa</CardTitle><CardDescription>Ações para corrigir as pendências de cada etapa do processo.</CardDescription></div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filtroEtapa} onValueChange={(v) => setFiltroEtapa(v as EtapaId | "TODAS")}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="TODAS">Todas as etapas</SelectItem>{ETAPAS.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => setMostrarFechadas((v) => !v)}>{mostrarFechadas ? "Ocultar concluídas" : "Mostrar concluídas"}</Button>
                {gestor && <Button size="sm" className="gap-1" onClick={() => setNovaAcao({ etapa: filtroEtapa === "TODAS" ? "EXECUCAO" : filtroEtapa })}><Plus className="size-4" />Nova ação</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {listaAcoes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ação {mostrarFechadas ? "" : "aberta "}para este filtro.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Etapa</TableHead><TableHead>Ação</TableHead><TableHead>Responsável</TableHead><TableHead>Prazo</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {listaAcoes.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell><Badge variant="outline" className="text-[10px]">{nomeEtapa(a.etapa)}</Badge></TableCell>
                        <TableCell className="max-w-[22rem]">
                          <div className="text-sm font-medium">{a.titulo}</div>
                          {a.descricao && <div className="text-xs text-muted-foreground">{a.descricao}</div>}
                          {a.missao_id && <Link to="/missoes/$id" params={{ id: a.missao_id }} className="text-xs text-primary hover:underline">Ver missão</Link>}
                        </TableCell>
                        <TableCell className="text-xs">{a.responsavel_nome || "—"}</TableCell>
                        <TableCell className={`text-xs tabular-nums ${acaoVencida(a, hoje) ? "font-semibold text-red-600" : ""}`}>{dataBr(a.prazo)}</TableCell>
                        <TableCell>
                          {gestor ? (
                            <Select value={a.status} onValueChange={(v) => mudarStatus(a, v as Acao["status"])}>
                              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{Object.entries(STATUS_ACAO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <Badge variant="secondary">{STATUS_ACAO[a.status]}</Badge>}
                        </TableCell>
                        <TableCell>{gestor && <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => excluir(a)} aria-label="Excluir ação"><Trash2 className="size-4" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {novaAcao && (
        <NovaAcaoDialog inicial={novaAcao} origemPadrao={almox === TODOS ? null : almox} origens={origens} missoes={missoes}
          onClose={() => setNovaAcao(null)} onSalvo={() => { setNovaAcao(null); qc.invalidateQueries({ queryKey: ["indicador-inventario"] }); }} />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, titulo, valor, detalhe, cor }: { icon: typeof Gauge; titulo: string; valor: string; detalhe: string; cor?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1"><CardDescription>{titulo}</CardDescription><Icon className="size-4 text-muted-foreground" /></CardHeader>
      <CardContent><div className={`text-3xl font-bold tabular-nums ${cor ?? ""}`}>{valor}</div><p className="mt-1 text-xs text-muted-foreground">{detalhe}</p></CardContent>
    </Card>
  );
}

function NovaAcaoDialog({ inicial, origemPadrao, origens, missoes, onClose, onSalvo }: {
  inicial: { etapa: EtapaId; missao_id?: string; titulo?: string }; origemPadrao: string | null; origens: string[];
  missoes: MissaoLinha[]; onClose: () => void; onSalvo: () => void;
}) {
  const [f, setF] = useState({
    etapa: inicial.etapa, titulo: inicial.titulo ?? "", descricao: "", responsavel_nome: "", prazo: "",
    origem: origemPadrao ?? TODOS, missao_id: inicial.missao_id ?? "__nenhuma__",
  });
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!f.titulo.trim()) return toast.error("Informe o título da ação.");
    setSalvando(true);
    const { error } = await sb.from("processo_inventario_acoes").insert({
      etapa: f.etapa, titulo: f.titulo.trim(), descricao: f.descricao.trim() || null,
      responsavel_nome: f.responsavel_nome.trim() || null, prazo: f.prazo || null,
      origem: f.origem === TODOS ? null : f.origem, missao_id: f.missao_id === "__nenhuma__" ? null : f.missao_id,
    });
    setSalvando(false);
    if (error) return toast.error("Não consegui salvar: " + error.message);
    toast.success("Ação criada."); onSalvo();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova ação</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Etapa</Label>
              <Select value={f.etapa} onValueChange={(v) => setF({ ...f, etapa: v as EtapaId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ETAPAS.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Almoxarifado</Label>
              <Select value={f.origem} onValueChange={(v) => setF({ ...f, origem: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={TODOS}>Todos</SelectItem>{origens.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Ação</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="O que precisa ser feito" /></div>
          <div className="space-y-1"><Label>Detalhes</Label><Textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} rows={3} placeholder="Causa, contexto ou critério de conclusão" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Responsável</Label><Input value={f.responsavel_nome} onChange={(e) => setF({ ...f, responsavel_nome: e.target.value })} /></div>
            <div className="space-y-1"><Label>Prazo</Label><Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Missão relacionada (opcional)</Label>
            <Select value={f.missao_id} onValueChange={(v) => setF({ ...f, missao_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhuma__">Nenhuma</SelectItem>
                {missoes.map((m) => <SelectItem key={m.id} value={m.id}>{dataBr(m.data_execucao)} · {m.titulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1 size-4 animate-spin" />}Criar ação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
