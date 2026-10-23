import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, Circle, Flag, Loader2, Lock, Pencil, Plus, Repeat, RotateCcw, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ACOES_MODELO, CHECKPOINTS, ETAPAS, FRENTES, INDICADORES_MODELO, PREMISSAS, RISCOS,
  atrasada, dataDoDia, diaDoCiclo, fmtData, isoDe, statusEtapa, type Indicador, type StatusEtapa,
} from "@/lib/integracao-modelo";

export const Route = createFileRoute("/_authenticated/gestao/plano-integracao")({
  component: PlanoIntegracaoPage,
  head: () => ({ meta: [{ title: "Plano de Integração" }] }),
});

type Plano = {
  id: string; titulo: string; pessoa_nome: string; pessoa_id: string | null; gestor_nome: string | null; padrinho_nome: string | null;
  data_inicio: string; etapa_atual: number; portoes: Record<string, { aprovado_em: string; aprovado_por: string; obs?: string }>;
  indicadores: Indicador[]; status: string; observacao: string | null;
};
type Acao = {
  id: string; plano_id: string; etapa: number; frente: string | null; acao: string; responsavel: string | null; entregavel: string | null;
  rota: string | null; prazo_dia: number; recorrente: boolean; ordem: number; concluida: boolean; concluida_em: string | null;
};

const sb = supabase as any;
const ESTILO: Record<StatusEtapa, { rot: string; cls: string }> = {
  concluida: { rot: "Concluída", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  andamento: { rot: "Em andamento", cls: "bg-primary/10 text-primary" },
  bloqueada: { rot: "Bloqueada", cls: "bg-muted text-muted-foreground" },
};

function PlanoIntegracaoPage() {
  const qc = useQueryClient();
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const hoje = isoDe(new Date());
  const uidQ = useQuery({ queryKey: ["auth-uid"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null, staleTime: Infinity });

  const planosQ = useQuery({
    queryKey: ["integracao-planos"],
    queryFn: async () => {
      const { data, error } = await sb.from("integracao_planos").select("*").neq("status", "Cancelado").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plano[];
    },
  });
  const [planoId, setPlanoId] = useState<string | null>(null);
  const planos = planosQ.data ?? [];
  const plano = planos.find((p) => p.id === planoId) ?? planos.find((p) => p.status === "Ativo") ?? planos[0] ?? null;

  const acoesQ = useQuery({
    enabled: !!plano, queryKey: ["integracao-acoes", plano?.id],
    queryFn: async () => {
      const { data, error } = await sb.from("integracao_acoes").select("*").eq("plano_id", plano!.id).order("etapa").order("prazo_dia").order("ordem");
      if (error) throw error;
      return (data ?? []) as Acao[];
    },
  });
  const acoes = acoesQ.data ?? [];
  const [etapaSel, setEtapaSel] = useState<number | null>(null);
  useEffect(() => { setEtapaSel(null); }, [plano?.id]);
  const etapaVista = etapaSel ?? Math.min(plano?.etapa_atual ?? 0, ETAPAS.length - 1);

  const [novo, setNovo] = useState<"novo" | "editar" | null>(null);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["integracao-planos"] }); qc.invalidateQueries({ queryKey: ["integracao-acoes"] }); };

  const porEtapa = useMemo(() => ETAPAS.map((_, i) => acoes.filter((a) => a.etapa === i)), [acoes]);
  const podeMarcar = !!plano && (gestor || (!!uidQ.data && plano.pessoa_id === uidQ.data));

  if (planosQ.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando planos…</div>;
  if (planosQ.error) return <div className="p-6 text-sm text-destructive">Não consegui carregar os planos. Se a tela é nova, confirme que a migration do Plano de Integração foi aplicada no banco.</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="size-6" /> Plano de Integração</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Ciclo de 90 dias em etapas com portão: cada etapa só libera a próxima quando o gestor aprova o critério de avanço. Os prazos saem da data de início e cada ação aponta para a tela do sistema onde a rotina acontece.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {planos.length > 1 && (
            <Select value={plano?.id} onValueChange={setPlanoId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Escolha o plano" /></SelectTrigger>
              <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.titulo}{p.status === "Concluido" ? " (concluído)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {gestor && plano && <Button variant="outline" onClick={() => setNovo("editar")} className="gap-1"><Pencil className="size-4" /> Editar</Button>}
          {gestor && <Button onClick={() => setNovo("novo")} className="gap-1"><Plus className="size-4" /> Novo plano</Button>}
        </div>
      </div>

      {!plano ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {gestor ? "Crie o primeiro plano: ele já nasce com as 6 etapas, as ações, os indicadores e os rituais do modelo de integração." : "Você ainda não tem um plano de integração."}
        </CardContent></Card>
      ) : (
        <>
          <Resumo plano={plano} acoes={acoes} hoje={hoje} />
          <Ciclo plano={plano} porEtapa={porEtapa} etapaVista={etapaVista} onEscolher={setEtapaSel} />
          <DetalheEtapa key={`${plano.id}-${etapaVista}`} plano={plano} i={etapaVista} acoes={porEtapa[etapaVista] ?? []} hoje={hoje} gestor={gestor} podeMarcar={podeMarcar} onMudou={recarregar} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Indicadores key={plano.id} plano={plano} gestor={gestor} onMudou={recarregar} />
            <Rituais plano={plano} hoje={hoje} />
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="gap-1"><ChevronDown className="size-4" /> Premissas e riscos do plano</Button></CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-2 lg:grid-cols-2">
              <Card><CardHeader className="pb-2"><CardTitle className="text-base">Premissas</CardTitle></CardHeader>
                <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{PREMISSAS.map((p) => <li key={p}>{p}</li>)}</ul></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-base">Riscos e mitigações</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">{RISCOS.map(([r, m]) => <div key={r}><div className="font-medium">{r}</div><div className="text-muted-foreground">{m}</div></div>)}</CardContent></Card>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {novo && <PlanoDialog modo={novo} plano={novo === "editar" ? plano : null} onClose={() => setNovo(null)} onOk={(id) => { setNovo(null); if (id) setPlanoId(id); recarregar(); }} />}
    </div>
  );
}

function Metrica({ rot, valor, cls = "" }: { rot: string; valor: string; cls?: string }) {
  return <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">{rot}</div><div className={`text-xl font-semibold ${cls}`}>{valor}</div></div>;
}

function Resumo({ plano, acoes, hoje }: { plano: Plano; acoes: Acao[]; hoje: string }) {
  const dia = diaDoCiclo(plano.data_inicio, hoje);
  const feitas = acoes.filter((a) => a.concluida).length;
  const atras = acoes.filter((a) => a.etapa <= plano.etapa_atual && atrasada(a, plano.data_inicio, hoje)).length;
  const prox = CHECKPOINTS.find((c) => c.dia >= dia);
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{plano.pessoa_nome}</span> · início {fmtData(plano.data_inicio)}
        {plano.gestor_nome ? ` · gestor ${plano.gestor_nome}` : ""}{plano.padrinho_nome ? ` · padrinho ${plano.padrinho_nome}` : " · padrinho a definir"}
        {plano.status === "Concluido" && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">ciclo concluído</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metrica rot="Dia do ciclo" valor={dia < 0 ? `Começa em ${-dia} d` : `${Math.min(dia + 1, 90)} / 90`} />
        <Metrica rot="Ações concluídas" valor={`${feitas} / ${acoes.length}`} />
        <Metrica rot="Atrasadas (etapas liberadas)" valor={String(atras)} cls={atras ? "text-destructive" : ""} />
        <Metrica rot="Próximo checkpoint" valor={prox ? `${fmtData(dataDoDia(plano.data_inicio, prox.dia))}` : "—"} />
      </div>
    </div>
  );
}

function Ciclo({ plano, porEtapa, etapaVista, onEscolher }: { plano: Plano; porEtapa: Acao[][]; etapaVista: number; onEscolher: (i: number) => void }) {
  const total = porEtapa.flat().length || 1;
  const feitas = porEtapa.flat().filter((a) => a.concluida).length;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {ETAPAS.map((e, i) => {
          const st = statusEtapa(i, plano.etapa_atual); const its = porEtapa[i] ?? [];
          const ok = its.filter((a) => a.concluida).length; const pz = its.map((a) => a.prazo_dia);
          return (
            <button key={e.nome} type="button" onClick={() => onEscolher(i)}
              className={`rounded-lg border bg-card p-3 text-left transition hover:bg-muted/50 ${i === etapaVista ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{i + 1} · {e.periodo}</span>
                {st === "concluida" ? <CheckCircle2 className="size-4 text-emerald-600" /> : st === "bloqueada" ? <Lock className="size-3.5" /> : <Circle className="size-4 text-primary" />}
              </div>
              <div className="mt-1 text-sm font-semibold leading-tight">{e.nome}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{pz.length ? `${fmtData(dataDoDia(plano.data_inicio, Math.min(...pz)))} – ${fmtData(dataDoDia(plano.data_inicio, Math.max(...pz)))}` : "—"}</div>
              <div className="mt-2 h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${its.length ? (ok / its.length) * 100 : 0}%` }} /></div>
              <div className="mt-1 flex justify-between text-[11px]"><span className={`rounded px-1.5 ${ESTILO[st].cls}`}>{ESTILO[st].rot}</span><span className="text-muted-foreground">{ok}/{its.length}</span></div>
            </button>
          );
        })}
      </div>
      <div className="h-1 rounded bg-muted" title="Progresso do ciclo completo"><div className="h-1 rounded bg-primary/60" style={{ width: `${(feitas / total) * 100}%` }} /></div>
    </div>
  );
}

function DetalheEtapa({ plano, i, acoes, hoje, gestor, podeMarcar, onMudou }: { plano: Plano; i: number; acoes: Acao[]; hoje: string; gestor: boolean; podeMarcar: boolean; onMudou: () => void }) {
  const e = ETAPAS[i]; const st = statusEtapa(i, plano.etapa_atual);
  const portao = plano.portoes?.[String(i)];
  const [obs, setObs] = useState(""); const [salvando, setSalvando] = useState(false);
  const [nova, setNova] = useState({ acao: "", responsavel: "", prazo: dataDoDia(plano.data_inicio, Math.max(...acoes.map((a) => a.prazo_dia), 0)) });
  const pendentes = acoes.filter((a) => !a.concluida).length;
  const liberada = st !== "bloqueada";

  async function marcar(a: Acao, v: boolean) {
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await sb.from("integracao_acoes").update({ concluida: v, concluida_em: v ? new Date().toISOString() : null, concluida_por: v ? uid : null }).eq("id", a.id);
    if (error) toast.error("Não consegui atualizar: " + error.message); else onMudou();
  }
  async function excluir(a: Acao) {
    if (!confirm(`Excluir a ação "${a.acao}"?`)) return;
    const { error } = await sb.from("integracao_acoes").delete().eq("id", a.id);
    if (error) toast.error(error.message); else onMudou();
  }
  async function adicionar() {
    if (!nova.acao.trim() || !nova.prazo) { toast.error("Informe a ação e o prazo."); return; }
    const prazo_dia = diaDoCiclo(plano.data_inicio, nova.prazo);
    const { error } = await sb.from("integracao_acoes").insert({ plano_id: plano.id, etapa: i, acao: nova.acao.trim(), responsavel: nova.responsavel.trim() || null, prazo_dia, ordem: 999 });
    if (error) toast.error(error.message); else { setNova({ ...nova, acao: "" }); onMudou(); }
  }
  async function aprovar() {
    if (pendentes && !confirm(`Ainda há ${pendentes} ação(ões) pendente(s) nesta etapa. Aprovar o portão assim mesmo?`)) return;
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const proxima = i + 1;
      const portoes = { ...(plano.portoes ?? {}), [String(i)]: { aprovado_em: new Date().toISOString(), aprovado_por: u.user?.email ?? "", obs: obs.trim() || undefined } };
      const { error } = await sb.from("integracao_planos").update({ etapa_atual: proxima, portoes, status: proxima >= ETAPAS.length ? "Concluido" : "Ativo" }).eq("id", plano.id);
      if (error) throw error;
      toast.success(proxima >= ETAPAS.length ? "Ciclo concluído." : `Etapa liberada: ${ETAPAS[proxima].nome}.`); onMudou();
    } catch (err: any) { toast.error("Não consegui aprovar: " + (err?.message ?? err)); } finally { setSalvando(false); }
  }
  async function reabrir() {
    if (!confirm(`Reabrir a etapa "${e.nome}"? As etapas seguintes voltam a ficar bloqueadas.`)) return;
    const portoes = { ...(plano.portoes ?? {}) }; for (let k = i; k < ETAPAS.length; k++) delete portoes[String(k)];
    const { error } = await sb.from("integracao_planos").update({ etapa_atual: i, portoes, status: "Ativo" }).eq("id", plano.id);
    if (error) toast.error(error.message); else onMudou();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-lg">{i + 1}. {e.nome} <span className="text-sm font-normal text-muted-foreground">· {e.periodo}</span></CardTitle>
          <span className={`rounded px-2 py-0.5 text-xs ${ESTILO[st].cls}`}>{ESTILO[st].rot}</span>
        </div>
        <p className="text-sm text-muted-foreground">{e.meta}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!liberada && <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Etapa bloqueada: ela é liberada quando o gestor aprovar o portão da etapa anterior.</div>}
        <div className="divide-y rounded-md border">
          {acoes.map((a) => {
            const atr = liberada && atrasada(a, plano.data_inicio, hoje);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <input type="checkbox" className="size-4 accent-primary" checked={a.concluida} disabled={!podeMarcar || !liberada} onChange={(ev) => marcar(a, ev.target.checked)} aria-label={`Concluir: ${a.acao}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${a.concluida ? "text-muted-foreground line-through" : ""}`}>{a.acao}</div>
                  <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {a.frente && <span>{FRENTES[a.frente] ?? a.frente}</span>}
                    {a.entregavel && <span>Entregável: {a.entregavel}</span>}
                    {a.recorrente && <span className="inline-flex items-center gap-1"><Repeat className="size-3" /> rotina contínua a partir daqui</span>}
                  </div>
                </div>
                <span className="w-36 text-xs text-muted-foreground">{a.responsavel ?? "—"}</span>
                <span className={`w-20 text-xs ${atr ? "font-medium text-destructive" : "text-muted-foreground"}`}>{atr && <AlertTriangle className="mr-1 inline size-3" />}{fmtData(dataDoDia(plano.data_inicio, a.prazo_dia))}</span>
                <span className="w-16 text-xs">{a.rota ? <Link to={a.rota as any} className="inline-flex items-center gap-0.5 text-primary hover:underline">Abrir <ArrowUpRight className="size-3" /></Link> : null}</span>
                {gestor && <Button size="icon" variant="ghost" className="size-7" onClick={() => excluir(a)} aria-label="Excluir ação"><Trash2 className="size-3.5" /></Button>}
              </div>
            );
          })}
          {acoes.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma ação nesta etapa.</div>}
        </div>

        {gestor && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1"><Label className="text-xs">Nova ação nesta etapa</Label><Input value={nova.acao} onChange={(ev) => setNova({ ...nova, acao: ev.target.value })} placeholder="Revisar o checklist de FEFO com o padrinho" /></div>
            <div className="w-40"><Label className="text-xs">Responsável</Label><Input value={nova.responsavel} onChange={(ev) => setNova({ ...nova, responsavel: ev.target.value })} placeholder="Estagiária" /></div>
            <div className="w-40"><Label className="text-xs">Prazo</Label><Input type="date" value={nova.prazo} onChange={(ev) => setNova({ ...nova, prazo: ev.target.value })} /></div>
            <Button variant="outline" onClick={adicionar} className="gap-1"><Plus className="size-4" /> Adicionar</Button>
          </div>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-2"><Flag className="mt-0.5 size-4 shrink-0" /><div><span className="font-medium">Critério para avançar:</span> {e.criterio}</div></div>
          {portao && <div className="mt-1 pl-6 text-xs">Aprovado em {fmtData(portao.aprovado_em.slice(0, 10))}{portao.aprovado_por ? ` por ${portao.aprovado_por}` : ""}{portao.obs ? ` · ${portao.obs}` : ""}</div>}
          {gestor && st === "andamento" && plano.status !== "Concluido" && (
            <div className="mt-2 flex flex-wrap items-end gap-2 pl-6">
              <Textarea rows={1} value={obs} onChange={(ev) => setObs(ev.target.value)} placeholder="Observação do portão (opcional)" className="min-h-9 flex-1 bg-background" />
              <Button onClick={aprovar} disabled={salvando} className="gap-1">{salvando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{i === ETAPAS.length - 1 ? "Concluir ciclo" : "Aprovar e liberar próxima"}</Button>
            </div>
          )}
          {gestor && st === "concluida" && <div className="mt-2 pl-6"><Button size="sm" variant="ghost" onClick={reabrir} className="h-7 gap-1"><RotateCcw className="size-3.5" /> Reabrir etapa</Button></div>}
        </div>
      </CardContent>
    </Card>
  );
}

const numOuNull = (s: string) => { const n = Number(String(s).replace(",", ".")); return s.trim() === "" || !Number.isFinite(n) ? null : n; };

function Indicadores({ plano, gestor, onMudou }: { plano: Plano; gestor: boolean; onMudou: () => void }) {
  const base = plano.indicadores?.length ? plano.indicadores : INDICADORES_MODELO;
  const [linhas, setLinhas] = useState(base.map((x) => ({ ...x, b: x.base?.toString() ?? "", m: x.meta?.toString() ?? "", a: x.atual?.toString() ?? "" })));
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const indicadores = linhas.map(({ b, m, a, ...x }) => ({ ...x, base: numOuNull(b), meta: numOuNull(m), atual: numOuNull(a) }));
    const { error } = await sb.from("integracao_planos").update({ indicadores }).eq("id", plano.id);
    setSalvando(false);
    if (error) toast.error(error.message); else { toast.success("Indicadores salvos."); onMudou(); }
  }
  const set = (k: number, campo: "b" | "m" | "a", v: string) => setLinhas(linhas.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Indicadores · linha de base × dia 90</CardTitle>
        <p className="text-xs text-muted-foreground">Meça a linha de base antes da chegada; no fechamento, preencha o valor atual para comparar.</p></CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] gap-2 text-[11px] text-muted-foreground"><span>Indicador</span><span className="text-right">Base</span><span className="text-right">Meta</span><span className="text-right">Dia 90</span></div>
        {linhas.map((x, k) => (
          <div key={x.nome} className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] items-center gap-2">
            <div className="text-sm leading-tight">{x.nome} <span className="text-[11px] text-muted-foreground">({x.unidade})</span></div>
            {(["b", "m", "a"] as const).map((c) => gestor
              ? <Input key={c} className="h-8 text-right" inputMode="decimal" value={x[c]} onChange={(ev) => set(k, c, ev.target.value)} placeholder="—" />
              : <span key={c} className="text-right text-sm">{x[c] || "—"}</span>)}
          </div>
        ))}
        {gestor && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar indicadores"}</Button></div>}
      </CardContent>
    </Card>
  );
}

function Rituais({ plano, hoje }: { plano: Plano; hoje: string }) {
  const dia = diaDoCiclo(plano.data_inicio, hoje);
  // 1:1 no fim de cada semana do ciclo (dias 4, 11, 18…)
  const prox11 = Math.min(88, 4 + 7 * Math.max(0, Math.ceil((Math.max(dia, 0) - 4) / 7)));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Rituais e checkpoints</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" /> 1:1 semanal de 30 min (o que fez, onde travou, próximos passos) · próximo {fmtData(dataDoDia(plano.data_inicio, prox11))}</div>
        {CHECKPOINTS.map((c) => {
          const data = dataDoDia(plano.data_inicio, c.dia); const passou = data < hoje;
          return (
            <div key={c.nome} className="flex items-start gap-2">
              {passou ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
              <div><span className="font-medium">{c.nome}</span> · {fmtData(data)}<div className="text-xs text-muted-foreground">{c.pergunta} Feedback nos dois sentidos.</div></div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PlanoDialog({ modo, plano, onClose, onOk }: { modo: "novo" | "editar"; plano: Plano | null; onClose: () => void; onOk: (id?: string) => void }) {
  const usuariosQ = useQuery({ queryKey: ["profiles-lista"], queryFn: async () => ((await sb.from("profiles").select("id, nome, email").order("nome")).data ?? []) as { id: string; nome: string; email: string }[] });
  const [f, setF] = useState({
    titulo: plano?.titulo ?? "Integração · estagiária de operações", pessoa_nome: plano?.pessoa_nome ?? "", pessoa_id: plano?.pessoa_id ?? "",
    gestor_nome: plano?.gestor_nome ?? "", padrinho_nome: plano?.padrinho_nome ?? "", data_inicio: plano?.data_inicio ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!f.titulo.trim() || !f.pessoa_nome.trim() || !f.data_inicio) { toast.error("Informe título, pessoa e data de início."); return; }
    setSalvando(true);
    try {
      const dados = { titulo: f.titulo.trim(), pessoa_nome: f.pessoa_nome.trim(), pessoa_id: f.pessoa_id || null, gestor_nome: f.gestor_nome.trim() || null, padrinho_nome: f.padrinho_nome.trim() || null, data_inicio: f.data_inicio };
      if (modo === "editar" && plano) {
        const { error } = await sb.from("integracao_planos").update(dados).eq("id", plano.id); if (error) throw error;
        toast.success("Plano atualizado."); onOk(plano.id); return;
      }
      const { data, error } = await sb.from("integracao_planos").insert({ ...dados, indicadores: INDICADORES_MODELO }).select("id").single();
      if (error) throw error;
      const linhas = ACOES_MODELO.map((a, k) => ({ plano_id: data.id, etapa: a.etapa, frente: a.frente ?? null, acao: a.acao, responsavel: a.responsavel, entregavel: a.entregavel ?? null, rota: a.rota ?? null, prazo_dia: a.prazo_dia, recorrente: !!a.recorrente, ordem: k }));
      const { error: e2 } = await sb.from("integracao_acoes").insert(linhas);
      if (e2) { await sb.from("integracao_planos").delete().eq("id", data.id); throw e2; }
      toast.success(`Plano criado com ${linhas.length} ações em ${ETAPAS.length} etapas.`); onOk(data.id);
    } catch (err: any) { toast.error("Não consegui salvar: " + (err?.message ?? err)); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{modo === "novo" ? "Novo plano de integração" : "Editar plano"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Título</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Pessoa integrada</Label><Input value={f.pessoa_nome} onChange={(e) => setF({ ...f, pessoa_nome: e.target.value })} placeholder="Nome" /></div>
            <div><Label>Data de início</Label><Input type="date" value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} /></div>
          </div>
          <div><Label>Usuário no sistema (opcional)</Label>
            <Select value={f.pessoa_id || "nenhum"} onValueChange={(v) => setF({ ...f, pessoa_id: v === "nenhum" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="nenhum">Ainda sem usuário</SelectItem>{(usuariosQ.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">Com o usuário vinculado, ela vê o próprio plano e marca as ações concluídas.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gestor</Label><Input value={f.gestor_nome} onChange={(e) => setF({ ...f, gestor_nome: e.target.value })} /></div>
            <div><Label>Padrinho</Label><Input value={f.padrinho_nome} onChange={(e) => setF({ ...f, padrinho_nome: e.target.value })} placeholder="A definir" /></div>
          </div>
          {modo === "novo" && <p className="text-xs text-muted-foreground">O plano nasce com as {ETAPAS.length} etapas e {ACOES_MODELO.length} ações do modelo; os prazos são calculados a partir da data de início e podem ser ajustados depois.</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : modo === "novo" ? "Criar plano" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
