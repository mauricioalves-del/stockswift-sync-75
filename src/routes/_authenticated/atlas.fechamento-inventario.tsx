import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, CalendarCheck, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { abrirPlanilha, carregarContexto, type Planilha } from "@/lib/atlas-importar";
import { lerTudo } from "@/lib/atlas-investigacao";
import { ResponsaveisAssinatura } from "@/components/atlas/ResponsaveisAssinatura";
import { FechamentoDetalheDialog, brl, dt, quemSou, sb, un } from "@/components/atlas/FechamentoDetalhe";
import { ABA_FECHAMENTO, PAPEIS_ASSINATURA, importarFechamento, statusAssinatura } from "@/lib/atlas-fechamento";

export const Route = createFileRoute("/_authenticated/atlas/fechamento-inventario")({
  component: FechamentoInventario,
  // ?fechamento=<id> abre o fechamento direto (link do alerta diário de assinatura).
  validateSearch: (s: Record<string, unknown>): { fechamento?: number } => {
    const n = Number(s.fechamento);
    return Number.isInteger(n) && n > 0 ? { fechamento: n } : {};
  },
  head: () => ({ meta: [{ title: "Fechamento Inventário — Atlas" }] }),
});

function FechamentoInventario() {
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const assina = gestor || role === "DIRETOR_OPERACOES" || role === "COORDENADOR_FINANCEIRO";
  const qc = useQueryClient();
  const [almox, setAlmox] = useState("todos");
  const { fechamento: fechamentoUrl } = Route.useSearch();
  const [aberto, setAberto] = useState<number | null>(fechamentoUrl ?? null);
  const [responsaveis, setResponsaveis] = useState(false);
  const [importando, setImportando] = useState(false);
  const q = useQuery({
    queryKey: ["atlas-fechamentos"],
    queryFn: async () => {
      const [f, c, a] = await Promise.all([
        lerTudo<any>("atlas_fechamentos_inventario", "*"),
        lerTudo<any>("atlas_conciliacoes_ciencia", "fechamento_id, papel_assinatura"),
        sb.from("atlas_almoxarifados").select("codigo, nome_exibicao").order("codigo"),
      ]);
      const papeis = new Map<number, (string | null)[]>(); for (const x of c) (papeis.get(x.fechamento_id) ?? papeis.set(x.fechamento_id, []).get(x.fechamento_id)!).push(x.papel_assinatura);
      return { fechamentos: f.sort((x: any, y: any) => String(y.data_fechamento).localeCompare(String(x.data_fechamento))), papeis, almox: (a.data ?? []) as { codigo: string; nome_exibicao: string }[] };
    },
  });
  const lista = (q.data?.fechamentos ?? []).filter((f: any) => almox === "todos" || f.almoxarifado === almox);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["atlas-fechamentos"] }); qc.invalidateQueries({ queryKey: ["atlas-fechamento"] }); qc.invalidateQueries({ queryKey: ["atlas-inventario"] }); };

  async function aprovarLote() {
    const antes = prompt("Aprovar manualmente (como fechados) todos os fechamentos ANTERIORES a qual data? (AAAA-MM-DD)");
    if (!antes || !/^\d{4}-\d{2}-\d{2}$/.test(antes)) return;
    const eu = await quemSou();
    const alvo = (q.data?.fechamentos ?? []).filter((f: any) => String(f.data_fechamento) < antes && !f.aprovado_manual);
    for (const f of alvo) await sb.from("atlas_fechamentos_inventario").update({ aprovado_manual: true, aprovado_manual_por: eu.nome, aprovado_manual_em: new Date().toISOString() }).eq("id", f.id);
    await sb.from("atlas_log_auditoria").insert({ username: eu.nome, acao: "aprovar_manual_lote_fechamentos", detalhes: { antes_de: antes, quantidade: alvo.length }, criado_em: new Date().toISOString() });
    toast.success(`${alvo.length} fechamento(s) aprovados manualmente.`); recarregar();
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarCheck className="size-6" /> Fechamento Inventário</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">Cada fechamento importado gera os itens, as divergências (investigadas pelo motor do Atlas) e as ações de pós-inventário. O inventário só fica <strong>Fechado</strong> com as três ciências: {Object.values(PAPEIS_ASSINATURA).join(", ")}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={almox} onValueChange={setAlmox}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{(q.data?.almox ?? []).map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome_exibicao || a.codigo}</SelectItem>)}</SelectContent></Select>
          {gestor && <Button size="sm" variant="outline" className="gap-1" onClick={() => setResponsaveis(true)}><BellRing className="size-4" /> Responsáveis pelas assinaturas</Button>}
          {gestor && <Button size="sm" variant="outline" onClick={aprovarLote}>Aprovação manual em lote</Button>}
          {gestor && <Button size="sm" className="gap-1" onClick={() => setImportando(true)}><Upload className="size-4" /> Importar fechamento</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">#</th><th className="p-2">Data</th><th className="p-2">Almoxarifado</th><th className="p-2">Arquivo</th><th className="p-2 text-right">Itens</th><th className="p-2 text-right">Divergentes</th><th className="p-2 text-right">Valor divergente</th><th className="p-2">Situação</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={8} className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>}
            {lista.map((f: any) => {
              const st = statusAssinatura(q.data?.papeis.get(f.id) ?? []);
              return (
                <tr key={f.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setAberto(f.id)}>
                  <td className="p-2 text-xs">{f.id}</td><td className="p-2 text-xs">{dt(f.data_fechamento)}</td><td className="p-2 text-xs">{f.almoxarifado}</td>
                  <td className="max-w-[260px] truncate p-2 text-xs text-muted-foreground" title={f.arquivo_origem}>{f.arquivo_origem}</td>
                  <td className="p-2 text-right text-xs">{un(f.total_itens)}</td><td className="p-2 text-right text-xs">{un(f.total_divergentes)}</td><td className="p-2 text-right text-xs">{brl(f.valor_total_divergente)}</td>
                  <td className="p-2 text-xs">{st.fechado ? <span className="rounded bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Inventário fechado</span> : f.aprovado_manual ? <span className="rounded bg-sky-100 px-1.5 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">Aprovado manualmente</span> : <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Em aberto · {st.assinados.length}/3</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importando && <ImportarDialog onClose={() => setImportando(false)} onOk={(id) => { setImportando(false); recarregar(); setAberto(id); }} />}
      {aberto != null && <FechamentoDetalheDialog id={aberto} gestor={gestor} assina={assina} almoxes={q.data?.almox ?? []} onClose={() => setAberto(null)} onMudou={recarregar} />}
      {gestor && <ResponsaveisAssinatura open={responsaveis} onOpenChange={setResponsaveis} almoxarifados={[...new Set((q.data?.fechamentos ?? []).map((f: any) => f.almoxarifado).filter(Boolean) as string[])].sort()} />}
    </div>
  );
}

function ImportarDialog({ onClose, onOk }: { onClose: () => void; onOk: (id: number) => void }) {
  const [arq, setArq] = useState<{ nome: string; p: Planilha } | null>(null);
  const [aba, setAba] = useState(ABA_FECHAMENTO);
  const [prog, setProg] = useState(""); const [rodando, setRodando] = useState(false);
  async function escolher(f?: File) {
    if (!f) return;
    try { const p = abrirPlanilha(await f.arrayBuffer(), f.name); setArq({ nome: f.name, p }); setAba(p.abas.includes(ABA_FECHAMENTO) ? ABA_FECHAMENTO : p.abas[0]); }
    catch (e: any) { toast.error("Não consegui abrir: " + (e?.message ?? e)); }
  }
  async function importar() {
    if (!arq) return;
    setRodando(true);
    try {
      const ctx = await carregarContexto();
      const r = await importarFechamento(arq.p, arq.nome, aba, ctx, setProg);
      toast.success(`Fechamento #${r.fechamentoId} (${r.almoxarifado}, ${dt(r.data)}): ${r.total} itens, ${r.divergentes} divergentes (${brl(r.valor)}), ${r.acoesCriadas} ação(ões) criada(s), ${r.acoesFechadas} fechada(s).${r.erros.length ? ` ${r.erros.length} linha(s) com erro.` : ""}`);
      onOk(r.fechamentoId);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setRodando(false);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !rodando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar fechamento de inventário</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Planilha de conciliação (contábil × físico) com Grupo, Produto, Descrição, Almoxarifado, Qtd., Contagem 1, Status, Resumo, Vl, %, Obs, obs pós inv, Data. Item com Status começando por "Sem" é sem divergência.</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-muted"><FileSpreadsheet className="size-4" /> {arq?.nome || "Escolher arquivo .xlsx"}<input type="file" className="hidden" accept=".xlsx,.xlsm,.xls" onChange={(e) => escolher(e.target.files?.[0])} /></label>
          {arq && <div><Label className="text-xs">Aba</Label><Select value={aba} onValueChange={setAba}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{arq.p.abas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>}
          {rodando && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {prog || "importando…"}</div>}
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={rodando} onClick={onClose}>Cancelar</Button><Button disabled={!arq || rodando} onClick={importar} className="gap-1"><Upload className="size-4" /> Importar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

