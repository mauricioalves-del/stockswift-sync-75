import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download, PackageCheck, Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { statusAnterior, statusPedido } from "@/lib/abastecimento-pedido-status";
import { anexarSaldos, itemValido, mostrarSaldo, saldoFinal, validarEdicaoLocal, type Saldo } from "@/lib/abastecimento-pedidos-saldo";
import { RessalvaDialog } from "@/components/abast-dash/RessalvaDialog";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarItens, nk, type ItemRep } from "@/lib/abastecimento-dados";
import type { Base2 } from "@/lib/abastecimento-motor2";

export const Route = createFileRoute("/_authenticated/abastecimento/pedidos")({
  component: PedidosPage,
  head: () => ({ meta: [{ title: "Pedidos de Abastecimento — Mágio" }, { name: "description", content: "Aprovação e acompanhamento dos pedidos de abastecimento das lojas." }, { property: "og:title", content: "Pedidos de Abastecimento — Mágio" }, { property: "og:description", content: "Aprovação e acompanhamento dos pedidos de abastecimento das lojas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

type Item = { id: string; id_produto: string; descricao: string | null; qtd_sugerida: number | null; qtd_pedida: number; qtd_separada: number | null; caixa: number | null; origem: string; aceito: boolean | null; saldo?: Saldo | null };
type Edicao = { em: string; nome: string | null; acao: "EDITAR" | "EXCLUIR"; id_produto: string; descricao: string | null; qtd_antes: number; qtd_depois: number; motivo: string | null };
type Pedido = {
  historico_status?: string[];
  id: string; numero: number; loja: string; status: string; base_demanda: string | null; tipo?: string | null; loja_origem?: string | null; observacao?: string | null;
  criado_em: string; atualizado_em: string; requisicao_id: string | null; requisicao_numero: string | null; itens: Item[];
  aprov_comercial_nome?: string | null; aprov_comercial_em?: string | null; aprov_comercial_obs?: string | null; aprov_comercial_resultado?: string | null;
  aprov_diretor_nome?: string | null; aprov_diretor_em?: string | null; aprov_diretor_obs?: string | null; aprov_diretor_decisao?: string | null;
  edicoes?: Edicao[] | null; almox_origem?: string | null;
};

const ETAPAS = [{ k: "AGUARD_COMERCIAL", r: "Comercial" }, { k: "ABERTO", r: "Aberto" }, { k: "EM_SEPARACAO", r: "Em separação" }, { k: "SEPARADO", r: "Separado" }, { k: "ENVIADO", r: "Enviado" }, { k: "RECEBIDO", r: "Recebido" }];
const ROTULO: Record<string, string> = { AGUARD_COMERCIAL: "Aguard. comercial", AGUARD_DIRETOR: "Aguard. comercial", ABERTO: "Aberto", EM_SEPARACAO: "Em separação", SEPARADO: "Separado", ENVIADO: "Enviado", RECEBIDO: "Recebido", CANCELADO: "Cancelado" };
const COR: Record<string, string> = { AGUARD_COMERCIAL: "bg-warning/15 text-warning", AGUARD_DIRETOR: "bg-destructive/10 text-destructive", ABERTO: "bg-amber-100 text-amber-800", EM_SEPARACAO: "bg-orange-100 text-orange-700", SEPARADO: "bg-teal-100 text-teal-700", ENVIADO: "bg-indigo-100 text-indigo-700", RECEBIDO: "bg-emerald-100 text-emerald-700", CANCELADO: "bg-slate-100 text-slate-500" };
const ATIVOS = ["AGUARD_COMERCIAL", "AGUARD_DIRETOR", "ABERTO", "EM_SEPARACAO", "SEPARADO", "ENVIADO"];
const DECISAO: Record<string, string> = { COM_SUGESTOES: "Atender com as sugestões", SEM_SUGESTOES: "Atender sem as sugestões", CANCELAR: "Cancelado pelo diretor" };
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");
const un1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BASES: Base2[] = ["ajustada", "real", "consenso", "maior"];
const BASE_ROTULO: Record<string, string> = { ajustada: "ajustada", real: "real", consenso: "consenso", maior: "maior entre real e consenso" };
const baseDo = (p: { base_demanda: string | null }): Base2 => (BASES.includes(p.base_demanda as Base2) ? (p.base_demanda as Base2) : "ajustada");
/** Status a partir dos quais a coluna "Separado" faz sentido. */
const COM_SEPARACAO = ["SEPARADO", "ENVIADO", "RECEBIDO"];
/** Contexto da loja de destino (valores atuais do motor de abastecimento, na base de demanda do pedido). */
type LojaCtx = (p: Pedido, i: Item) => ItemRep | undefined;
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "");

function Etapas({ status }: { status: string }) {
  if (status === "CANCELADO") return <span className="text-xs text-muted-foreground">—</span>;
  const atual = ETAPAS.findIndex((e) => e.k === status);
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {ETAPAS.map((e, i) => (
        <Fragment key={e.k}>
          {i > 0 && <span className={`h-px w-2.5 ${i <= atual ? "bg-primary" : "bg-border"}`} />}
          <span title={e.r} className={`flex items-center gap-1 text-[10px] ${i < atual ? "text-emerald-600" : i === atual ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            <span className={`size-2 rounded-full ${i < atual ? "bg-emerald-500" : i === atual ? "bg-primary" : "bg-muted-foreground/30"}`} />{e.r}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function PedidosPage() {
  const { isAdmin, role } = useRole();
  const sb = supabase as any;
  const papeisQ = useQuery({ queryKey: ["abast-papeis-validacao"], queryFn: async () => { const { data: r } = await sb.rpc("abast_papeis_validacao"); return { gc: !!r?.gerente_comercial, dir: !!r?.diretor_operacional, admin: !!r?.admin }; } });
  const comercial = isAdmin || !!papeisQ.data?.gc;
  const diretor = isAdmin || role === "DIRETOR_OPERACOES" || !!papeisQ.data?.dir;
  const gestor = isAdmin || role === "GERENTE";
  const pode = gestor || role === "COORDENADOR_CONTROLE" || comercial || diretor;
  const qc = useQueryClient();
  const [status, setStatus] = useState("ATIVOS");
  const [aberto, setAberto] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [ressalva, setRessalva] = useState<Pedido | null>(null);
  const [retorno, setRetorno] = useState<Pedido | null>(null);
  const [editando, setEditando] = useState<{ p: Pedido; i: Item } | null>(null);
  const [excluindo, setExcluindo] = useState<{ p: Pedido; i: Item } | null>(null);
  // editar/excluir item: só enquanto o pedido aguarda aprovação (antes de existir requisição de separação)
  const podeEditar = (p: Pedido) => (p.status === "AGUARD_COMERCIAL" && (comercial || gestor)) || (p.status === "AGUARD_DIRETOR" && (comercial || gestor));

  async function retornar(p: Pedido) {
    if (!isAdmin) return;
    setAgindo(p.id);
    try {
      const { data, error } = await sb.rpc("abast_retornar_status", { p_id: p.id, p_status_atual: p.status });
      if (error) throw error;
      toast.success(`Pedido ${p.numero} retornou para ${ROTULO[data.para] ?? data.para}.`);
      setRetorno(null);
      recarregar();
      qc.invalidateQueries({ queryKey: ["requisicoes"] });
    } catch (err: any) { toast.error("Não consegui retornar: " + (err?.message ?? err)); }
    finally { setAgindo(null); }
  }

  const q = useQuery({
    enabled: pode, queryKey: ["abast-pedidos"], refetchInterval: 15000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: ps, error } = await sb.from("abast_pedidos").select("*").order("numero", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = (ps ?? []).map((p: any) => p.id);
      const { data: its } = ids.length ? await sb.from("abast_pedido_itens").select("id, pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, qtd_separada, caixa, origem, aceito").in("pedido_id", ids) : { data: [] };
      const { data: sal } = ids.length ? await sb.rpc("abast_pedido_saldos", { p_ids: ids }) : { data: [] };   // se falhar, a tela segue sem as colunas de saldo
      return (anexarSaldos(ps ?? [], its ?? [], sal) as unknown as Pedido[]).map((p) => ({ ...p, status: statusPedido(p.status) }));
    },
  });

  // Estoque da loja, CMD, exposição e mín/ideal: mesmo cálculo da Reposição, na base de demanda escolhida no pedido.
  const bruto = useAbastBruto(pode);
  const hojeIso = new Date().toLocaleDateString("en-CA");
  const lojaCtx = useMemo<LojaCtx | null>(() => {
    if (!bruto.data || !q.data?.length) return null;
    const porBase = new Map<Base2, Map<string, ItemRep>>();
    for (const b of new Set(q.data.map(baseDo))) {
      const m = new Map<string, ItemRep>();
      try {
        const mont = montarItens(bruto.data, { base: b, denominador: "calendario", hojeIso });
        for (const [loja, its] of Object.entries(mont.itens)) for (const it of its) m.set(`${loja}|${nk(it.sku)}`, it);
      } catch { /* sem contexto da loja: colunas ficam com "—" */ }
      porBase.set(b, m);
    }
    return (p, i) => porBase.get(baseDo(p))?.get(`${p.loja}|${nk(i.id_produto)}`);
  }, [bruto.data, q.data, hojeIso]);

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["abast-pedidos"] }); qc.invalidateQueries({ queryKey: ["abast-v2"] }); };

  async function mudar(p: Pedido, novo: string) {
    setAgindo(p.id);
    try {
      const { error } = await sb.rpc("abast_atualizar_pedido", { p_id: p.id, p_status: novo });
      if (error) throw error;
      toast.success(`Pedido ${p.numero}: ${(ROTULO[novo] ?? novo).toLowerCase()}.`);
      recarregar();
    } catch (err: any) { toast.error("Não consegui atualizar: " + (err?.message ?? err)); }
    finally { setAgindo(null); }
  }
  async function aprovar(p: Pedido) {
    setAgindo(p.id);
    try {
      const { error } = await sb.rpc("abast_aprovar_comercial", { p_id: p.id, p_aprovado: true, p_obs: null, p_itens_sugeridos: [] });
      if (error) throw error;
      toast.success(`Pedido ${p.numero} aprovado. A requisição de separação foi criada.`);
      recarregar();
    } catch (err: any) { toast.error("Não consegui aprovar: " + (err?.message ?? err)); }
    finally { setAgindo(null); }
  }
  function exportar(p: Pedido) {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const linhas = [["Pedido", "Loja", "Requisição", "SKU", "Produto", "Estoque loja", "CMD", "Exposição", "Mínimo", "Ideal", "Qtd pedida", "Qtd separada", "Sugerida", "Caixa", "Origem do item", "Almox origem", "Saldo inicial", "Saldo final"], ...p.itens.map((i) => [p.numero, p.loja, p.requisicao_numero, i.id_produto, i.descricao, ...((c) => [c?.estoque ?? "", c?.demandaDia == null ? "" : un1(c.demandaDia), c?.exposicao ?? "", c?.minQ ?? "", c?.idealQ ?? ""])(lojaCtx?.(p, i)), i.qtd_pedida, i.qtd_separada, i.qtd_sugerida, i.caixa, i.origem, p.almox_origem, mostrarSaldo(p, i) ? i.saldo?.saldo_inicial : "", mostrarSaldo(p, i) ? saldoFinal(i) : ""])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas.map((l) => l.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Pedido_${p.numero}_${p.loja}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const lista = (q.data ?? []).filter((p) => status === "TODOS" ? true : status === "ATIVOS" ? ATIVOS.includes(p.status) : p.status === status);
  const contagem = (s: string) => (q.data ?? []).filter((p) => (s === "ATIVOS" ? ATIVOS.includes(p.status) : p.status === s)).length;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="size-6" /> Pedidos de Abastecimento</h1>
        <p className="text-sm text-muted-foreground">
          Aprovação comercial · Separação · Envio · Recebimento
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{["ATIVOS", "AGUARD_COMERCIAL", "ABERTO", "EM_SEPARACAO", "SEPARADO", "ENVIADO", "RECEBIDO", "CANCELADO", "TODOS"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>{s === "ATIVOS" ? "Em andamento" : ROTULO[s] ?? "Todos"}{s !== "TODOS" ? ` (${contagem(s)})` : ""}</button>)}</div>
      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Loja</TableHead><TableHead>Almox origem</TableHead><TableHead>Status</TableHead><TableHead>Etapas</TableHead><TableHead>Requisição</TableHead><TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Separado</TableHead><TableHead>Criado</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {lista.length === 0 && <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">{q.isLoading ? "Carregando..." : q.error ? "Não consegui ler os pedidos." : "Nenhum pedido neste filtro."}</TableCell></TableRow>}
          {lista.map((p) => {
            const validos = p.itens.filter((i) => i.aceito !== false && !(i.origem === "SUGESTAO_COMERCIAL" && i.aceito == null));
            const total = validos.reduce((a, b) => a + Number(b.qtd_pedida), 0), sep = validos.reduce((a, b) => a + Number(b.qtd_separada ?? 0), 0);
            const separando = p.status === "EM_SEPARACAO" || p.status === "SEPARADO";
            const aguardando = p.status === "AGUARD_COMERCIAL" || p.status === "AGUARD_DIRETOR";
            return (<Fragment key={p.id}>
              <TableRow className="cursor-pointer" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <TableCell className="font-semibold">{p.numero}</TableCell><TableCell>{p.loja}{p.tipo === "TRANSFERENCIA" && <div className="text-[10px] text-primary">Transferência de {p.loja_origem}</div>}</TableCell><TableCell className="text-xs">{p.almox_origem ? <><span className="font-mono">{p.almox_origem}</span><div className="text-[10px] text-muted-foreground">{p.tipo === "TRANSFERENCIA" ? "transferência entre lojas" : "CD"}</div></> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR[p.status] ?? ""}`}>{(ROTULO[p.status] ?? p.status).toUpperCase()}</span></TableCell>
                <TableCell><Etapas status={p.status} /></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>{p.requisicao_id ? <Link to="/suprimentos/requisicoes/$id" params={{ id: p.requisicao_id }} className="text-xs font-mono text-primary hover:underline">{p.requisicao_numero}</Link> : <span className="text-xs text-muted-foreground">{aguardando ? "após aprovação" : "—"}</span>}</TableCell>
                <TableCell className="text-right">{validos.length}</TableCell><TableCell className="text-right">{un(total)}</TableCell>
                <TableCell className="text-right text-xs">{p.requisicao_id ? `${un(sep)} / ${un(total)}` : "—"}</TableCell>
                <TableCell className="text-xs">{dt(p.criado_em)}</TableCell>
                <TableCell className="text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => exportar(p)} aria-label="CSV"><Download className="size-4" /></Button>
                  {isAdmin && statusAnterior(p) && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => setRetorno(p)} title={`Retornar para ${ROTULO[statusAnterior(p) ?? ""] ?? "status anterior"}`} aria-label={`Retornar status do pedido ${p.numero}`}><Undo2 className="size-4" /> Retornar</Button>}
                  {comercial && p.status === "AGUARD_COMERCIAL" && <>
                    <Button size="sm" disabled={agindo === p.id} onClick={() => aprovar(p)}>Aprovar</Button>
                    <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => setRessalva(p)}>Adicionar Produto</Button>
                  </>}
                  {gestor && (p.status === "ABERTO" || p.status === "EM_SEPARACAO") && p.requisicao_id && <Link to="/suprimentos/requisicoes" title={`Separar na tela Requisições (${p.requisicao_numero})`} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"><PackageCheck className="size-3.5" /> Separar</Link>}
                  {gestor && (p.status === "ABERTO" || p.status === "EM_SEPARACAO") && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "SEPARADO")} title="Marcar como separado sem gerar a ficha de separação">Separado</Button>}
                  {gestor && (p.status === "SEPARADO" || p.status === "EM_SEPARACAO" || (p.status === "ABERTO" && !p.requisicao_id)) && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "ENVIADO")}>Marcar enviado</Button>}
                  {gestor && p.status === "ENVIADO" && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "RECEBIDO")}>Marcar recebido</Button>}
                  {gestor && (p.status === "ABERTO" || p.status === "ENVIADO" || aguardando) && <Button size="sm" variant="ghost" disabled={agindo === p.id} onClick={() => mudar(p, "CANCELADO")}>Cancelar</Button>}
                  {gestor && separando && <span className="ml-2 text-[10px] text-muted-foreground" title="Há separação registrada: cancele ou estorne pela requisição">cancelar pela requisição</span>}
                </TableCell></TableRow>
              {aberto === p.id && <TableRow><TableCell colSpan={11} className="bg-muted/30 space-y-3">
                <Historico p={p} />
                <ItensTabela p={p} lojaCtx={lojaCtx} podeEditar={podeEditar(p)} onEditar={(i) => setEditando({ p, i })} onExcluir={(i) => setExcluindo({ p, i })} />
              </TableCell></TableRow>}
            </Fragment>);
          })}
        </TableBody></Table></CardContent></Card>
      {ressalva && <RessalvaDialog p={ressalva} onClose={() => setRessalva(null)} onOk={() => { setRessalva(null); recarregar(); }} />}
      {editando && <EditarItemDialog p={editando.p} i={editando.i} onClose={() => setEditando(null)} onOk={() => { setEditando(null); recarregar(); }} />}
      {excluindo && <ExcluirItemDialog p={excluindo.p} i={excluindo.i} onClose={() => setExcluindo(null)} onOk={() => { setExcluindo(null); recarregar(); }} />}
      {isAdmin && retorno && <Dialog open onOpenChange={(o) => !o && agindo !== retorno.id && setRetorno(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retornar status · Pedido {retorno.numero}</DialogTitle><DialogDescription>De {ROTULO[retorno.status]} para {ROTULO[statusAnterior(retorno) ?? ""]}. O retorno ficará registrado no histórico de auditoria.</DialogDescription></DialogHeader>
          {statusAnterior(retorno)?.startsWith("AGUARD_") && <p className="text-sm text-muted-foreground">A aprovação será refeita. Se houver requisição sem separação, ela será cancelada; uma nova será criada após a aprovação.</p>}
          <DialogFooter><Button variant="ghost" disabled={agindo === retorno.id} onClick={() => setRetorno(null)}>Voltar</Button><Button disabled={agindo === retorno.id} onClick={() => retornar(retorno)}>Confirmar retorno</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}

function Historico({ p }: { p: Pedido }) {
  return <div className="space-y-2"><HistoricoAprovacoes p={p} /><Edicoes lista={p.edicoes ?? []} /></div>;
}

function Edicoes({ lista }: { lista: Edicao[] }) {
  if (!lista.length) return null;
  return (
    <div className="rounded-md border bg-card p-2 text-xs">
      <div className="font-semibold">Edições feitas nesta tela ({lista.length})</div>
      <ul className="mt-1 space-y-0.5">{lista.map((e, k) => <li key={k} className="text-muted-foreground"><span className="font-medium text-foreground">{e.nome ?? "—"}</span> · {dt(e.em)} · {e.acao === "EXCLUIR" ? "excluiu" : "alterou"} <span className="font-mono">{e.id_produto}</span> {e.descricao}: {un(Number(e.qtd_antes))} → {e.acao === "EXCLUIR" ? "removido" : un(Number(e.qtd_depois))}{e.motivo ? ` · ${e.motivo}` : ""}</li>)}</ul>
    </div>
  );
}

function HistoricoAprovacoes({ p }: { p: Pedido }) {
  if (!p.aprov_comercial_em && !p.aprov_diretor_em) return <p className="text-xs text-muted-foreground">{p.status === "AGUARD_COMERCIAL" ? "Aguardando aprovação do gerente comercial." : "Sem registro de aprovação (pedido anterior ao fluxo de aprovação)."}</p>;
  return (
    <div className="grid gap-2 text-xs md:grid-cols-2">
      {p.aprov_comercial_em && <div className="rounded-md border bg-card p-2">
        <div className="font-semibold">Gerente comercial · {p.aprov_comercial_resultado === "APROVADO" ? "Aprovado" : "Com ressalvas"}</div>
        <div className="text-muted-foreground">{p.aprov_comercial_nome} · {dt(p.aprov_comercial_em)}</div>
        {p.aprov_comercial_obs && <div className="mt-1 whitespace-pre-wrap">{p.aprov_comercial_obs}</div>}
      </div>}
      {p.aprov_diretor_em && <div className="rounded-md border bg-card p-2">
        <div className="font-semibold">Diretor de Operações · {DECISAO[p.aprov_diretor_decisao ?? ""] ?? p.aprov_diretor_decisao}</div>
        <div className="text-muted-foreground">{p.aprov_diretor_nome} · {dt(p.aprov_diretor_em)}</div>
        {p.aprov_diretor_obs && <div className="mt-1 whitespace-pre-wrap">{p.aprov_diretor_obs}</div>}
      </div>}
    </div>
  );
}

function ItensTabela({ p, podeEditar, onEditar, onExcluir, compacto, lojaCtx }: { p: Pedido; lojaCtx?: LojaCtx | null; podeEditar: boolean; onEditar: (i: Item) => void; onExcluir: (i: Item) => void; compacto?: boolean }) {
  const itens = p.itens;
  const orig = (i: Item) => i.origem === "SUGESTAO_COMERCIAL_ANTERIOR" ? "Sugestão comercial · aprovação anterior" : i.origem === "SUGESTAO_COMERCIAL" ? `Sugestão comercial${i.aceito === true ? " · aceita" : i.aceito === false ? " · recusada" : " · pendente"}` : i.origem === "MANUAL" ? "Manual" : i.origem === "TRANSFERENCIA" ? "Transferência" : "Sugestão";
  const algumSaldo = itens.some((i) => mostrarSaldo(p, i));
  const verSep = COM_SEPARACAO.includes(p.status) || (p.status === "CANCELADO" && itens.some((i) => i.qtd_separada != null));
  const verLoja = !compacto && !!lojaCtx;
  const base = BASE_ROTULO[baseDo(p)];
  const nota = algumSaldo
    ? "Saldo inicial = estoque do almox de origem − unidades de outros pedidos em andamento (aguardando aprovação, abertos, em separação ou separados). Saldo final = saldo inicial − este pedido."
    : p.status === "ENVIADO" || p.status === "RECEBIDO" || p.status === "CANCELADO" ? "Saldos não se aplicam a este pedido: o estoque do ERP já reflete a saída (ou o pedido foi cancelado)." : "Saldo do origem indisponível no momento.";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span><span className="text-muted-foreground">Almox de origem:</span> <strong className="font-mono">{p.almox_origem ?? "—"}</strong>{p.almox_origem && <span className="text-muted-foreground"> ({p.tipo === "TRANSFERENCIA" ? `transferência de ${p.loja_origem}` : "CD"})</span>}</span>
        {podeEditar && <span className="text-primary">Você pode editar a quantidade e excluir itens enquanto o pedido aguarda aprovação; o limite é o saldo do origem, em múltiplos da caixa.</span>}
      </div>
      {!compacto && <p className="text-[11px] text-muted-foreground">{nota}</p>}
      <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead>{verLoja && <><TableHead className="text-right" title={`Estoque atual de ${p.loja}`}>Estoque loja</TableHead><TableHead className="text-right" title={`Consumo médio diário na base de demanda usada no abastecimento: ${base}`}>CMD</TableHead><TableHead className="text-right">Exposição</TableHead><TableHead className="text-right" title="Estoque mínimo / ideal da loja (exposição + CMD × dias de cobertura)">Mín / Ideal</TableHead></>}<TableHead className="text-right">Pedido</TableHead>{verSep && <TableHead className="text-right">Separado</TableHead>}<TableHead className="text-right">Sugerido</TableHead><TableHead className="text-right">Caixa</TableHead>{!compacto && <><TableHead className="text-right">Estoque origem</TableHead><TableHead className="text-right">Em outros pedidos</TableHead><TableHead className="text-right">Saldo inicial</TableHead><TableHead className="text-right">Saldo final</TableHead></>}<TableHead>Origem do item</TableHead>{podeEditar && <TableHead />}</TableRow></TableHeader>
        <TableBody>{itens.map((i) => {
          const c = verLoja ? lojaCtx?.(p, i) : undefined;
          const ver = mostrarSaldo(p, i), fin = ver ? saldoFinal(i) : null, falta = fin !== null && fin < 0;
          return (<TableRow key={i.id} className={i.aceito === false ? "opacity-50 line-through" : ""}>
            <TableCell className="font-mono text-xs">{i.id_produto}</TableCell><TableCell>{i.descricao}</TableCell>
            {verLoja && <>
              <TableCell className="text-right">{c?.estoque == null ? "—" : un(c.estoque)}</TableCell>
              <TableCell className="text-right" title={c?.demandaDia != null ? `Base ${base}` : undefined}>{c?.demandaDia == null ? "—" : un1(c.demandaDia)}</TableCell>
              <TableCell className="text-right">{c?.exposicao == null ? "—" : un(c.exposicao)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{c?.minQ == null ? "—" : `${un(c.minQ)} / ${c.idealQ == null ? "—" : un(c.idealQ)}`}</TableCell>
            </>}
            <TableCell className="text-right font-semibold">{un(Number(i.qtd_pedida))}</TableCell>
            {verSep && <TableCell className="text-right">{i.qtd_separada == null ? "—" : un(Number(i.qtd_separada))}</TableCell>}
            <TableCell className="text-right">{i.qtd_sugerida == null ? "—" : un(Number(i.qtd_sugerida))}</TableCell>
            <TableCell className="text-right">{i.caixa ?? "—"}</TableCell>
            {!compacto && <>
              <TableCell className="text-right">{ver && i.saldo ? un(i.saldo.estoque) : "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">{ver && i.saldo ? un(i.saldo.reservado_outros) : "—"}</TableCell>
              <TableCell className="text-right">{ver && i.saldo ? un(i.saldo.saldo_inicial) : "—"}</TableCell>
              <TableCell className={`text-right font-semibold ${falta ? "text-destructive" : ""}`} title={falta ? "O pedido passa do saldo do origem" : undefined}>{fin === null ? "—" : un(fin)}</TableCell>
            </>}
            <TableCell className={`text-xs ${i.origem === "SUGESTAO_COMERCIAL" ? "text-primary font-medium" : ""}`}>{orig(i)}</TableCell>
            {podeEditar && <TableCell className="whitespace-nowrap text-right">{itemValido(i) && <>
              <Button size="sm" variant="ghost" onClick={() => onEditar(i)} title="Editar quantidade" aria-label={`Editar ${i.id_produto}`}><Pencil className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onExcluir(i)} title="Excluir item" aria-label={`Excluir ${i.id_produto}`}><Trash2 className="size-4" /></Button>
            </>}</TableCell>}
          </TableRow>);
        })}</TableBody></Table>
    </div>
  );
}

function EditarItemDialog({ p, i, onClose, onOk }: { p: Pedido; i: Item; onClose: () => void; onOk: () => void }) {
  const sb = supabase as any;
  const atual = Number(i.qtd_pedida), cx = Number(i.caixa ?? 0), s = i.saldo ?? null;
  const [qtd, setQtd] = useState(String(atual));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const n = Number(qtd.replace(",", "."));
  const erro = validarEdicaoLocal(i, n);
  const final = s && Number.isFinite(n) ? s.saldo_inicial - n : null;
  const passo = (d: number) => setQtd(String(Math.max(cx > 0 ? cx : 1, (Number.isFinite(n) ? n : atual) + d * (cx > 0 ? cx : 1))));
  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await sb.rpc("abast_editar_item_pedido", { p_item: i.id, p_qtd: n, p_motivo: motivo.trim() || null });
      if (error) throw error;
      toast.success(`Pedido ${p.numero}: ${i.id_produto} alterado de ${un(atual)} para ${un(n)}.`);
      onOk();
    } catch (err: any) { toast.error("Não consegui editar: " + (err?.message ?? err)); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar item · Pedido {p.numero}</DialogTitle><DialogDescription><span className="font-mono">{i.id_produto}</span> {i.descricao}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Almox de origem</span><span className="text-right font-mono">{p.almox_origem ?? "—"}</span>
          <span className="text-muted-foreground">Estoque no origem</span><span className="text-right">{s ? un(s.estoque) : "—"}</span>
          <span className="text-muted-foreground">Em outros pedidos</span><span className="text-right">{s ? un(s.reservado_outros) : "—"}</span>
          <span className="text-muted-foreground">Saldo inicial (disponível)</span><span className="text-right font-semibold">{s ? un(s.saldo_inicial) : "—"}</span>
          <span className="text-muted-foreground">Caixa</span><span className="text-right">{cx > 0 ? `${cx} un` : "—"}</span>
          <span className="text-muted-foreground">Quantidade atual / sugerida</span><span className="text-right">{un(atual)} / {i.qtd_sugerida == null ? "—" : un(Number(i.qtd_sugerida))}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => passo(-1)} disabled={salvando}>− {cx > 0 ? "caixa" : "1"}</Button>
          <Input autoFocus className="w-28 text-right" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Nova quantidade" />
          <Button type="button" variant="outline" size="sm" onClick={() => passo(1)} disabled={salvando}>+ {cx > 0 ? "caixa" : "1"}</Button>
          <span className="text-xs text-muted-foreground">Saldo final: <strong className={final !== null && final < 0 ? "text-destructive" : ""}>{final === null ? "—" : un(final)}</strong></span>
        </div>
        <Input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button variant="ghost" disabled={salvando} onClick={onClose}>Cancelar</Button><Button disabled={salvando || !!erro || n === atual} onClick={salvar}>{salvando ? "Salvando..." : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirItemDialog({ p, i, onClose, onOk }: { p: Pedido; i: Item; onClose: () => void; onOk: () => void }) {
  const sb = supabase as any;
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function excluir() {
    setSalvando(true);
    try {
      const { error } = await sb.rpc("abast_excluir_item_pedido", { p_item: i.id, p_motivo: motivo.trim() || null });
      if (error) throw error;
      toast.success(`Pedido ${p.numero}: item ${i.id_produto} excluído.`);
      onOk();
    } catch (err: any) { toast.error("Não consegui excluir: " + (err?.message ?? err)); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir item · Pedido {p.numero}</DialogTitle><DialogDescription>Retirar <span className="font-mono">{i.id_produto}</span> {i.descricao} ({un(Number(i.qtd_pedida))} un) do pedido. A exclusão fica registrada no histórico do pedido.</DialogDescription></DialogHeader>
        <Input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter><Button variant="ghost" disabled={salvando} onClick={onClose}>Voltar</Button><Button variant="destructive" disabled={salvando} onClick={excluir}>{salvando ? "Excluindo..." : "Excluir item"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

