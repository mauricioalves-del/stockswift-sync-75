import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/pedidos")({
  component: PedidosPage,
  head: () => ({ meta: [{ title: "Pedidos de Abastecimento" }] }),
});

type Item = { id: string; id_produto: string; descricao: string | null; qtd_sugerida: number | null; qtd_pedida: number; qtd_separada: number | null; caixa: number | null; origem: string };
type Pedido = { id: string; numero: number; loja: string; status: string; base_demanda: string | null; tipo?: string | null; loja_origem?: string | null; criado_em: string; atualizado_em: string; requisicao_id: string | null; requisicao_numero: string | null; itens: Item[] };

// Etapas do acompanhamento. "Em separação" e "Separado" mudam sozinhas conforme a requisição na tela Requisições.
const ETAPAS = [{ k: "ABERTO", r: "Aberto" }, { k: "EM_SEPARACAO", r: "Em separação" }, { k: "SEPARADO", r: "Separado" }, { k: "ENVIADO", r: "Enviado" }, { k: "RECEBIDO", r: "Recebido" }];
const ROTULO: Record<string, string> = { ABERTO: "Aberto", EM_SEPARACAO: "Em separação", SEPARADO: "Separado", ENVIADO: "Enviado", RECEBIDO: "Recebido", CANCELADO: "Cancelado" };
const COR: Record<string, string> = { ABERTO: "bg-amber-100 text-amber-800", EM_SEPARACAO: "bg-orange-100 text-orange-700", SEPARADO: "bg-teal-100 text-teal-700", ENVIADO: "bg-indigo-100 text-indigo-700", RECEBIDO: "bg-emerald-100 text-emerald-700", CANCELADO: "bg-slate-100 text-slate-500" };
const ATIVOS = ["ABERTO", "EM_SEPARACAO", "SEPARADO", "ENVIADO"];
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");

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
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const gestor = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const [status, setStatus] = useState("ATIVOS");
  const [aberto, setAberto] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);

  const q = useQuery({
    enabled: pode, queryKey: ["abast-pedidos"], refetchInterval: 15000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: ps, error } = await sb.from("abast_pedidos").select("id, numero, loja, status, base_demanda, criado_em, atualizado_em, requisicao_id, requisicao_numero, tipo, loja_origem").order("numero", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = (ps ?? []).map((p: any) => p.id);
      const { data: its } = ids.length ? await sb.from("abast_pedido_itens").select("id, pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, qtd_separada, caixa, origem").in("pedido_id", ids) : { data: [] };
      return (ps ?? []).map((p: any) => ({ ...p, itens: (its ?? []).filter((i: any) => i.pedido_id === p.id) })) as Pedido[];
    },
  });

  async function mudar(p: Pedido, novo: string) {
    setAgindo(p.id);
    try {
      const { error } = await (supabase as any).rpc("abast_atualizar_pedido", { p_id: p.id, p_status: novo });
      if (error) throw error;
      toast.success(`Pedido ${p.numero}: ${(ROTULO[novo] ?? novo).toLowerCase()}.`);
      qc.invalidateQueries({ queryKey: ["abast-pedidos"] }); qc.invalidateQueries({ queryKey: ["abast-v2"] });
    } catch (err: any) { toast.error("Não consegui atualizar: " + (err?.message ?? err)); }
    finally { setAgindo(null); }
  }
  function exportar(p: Pedido) {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const linhas = [["Pedido", "Loja", "Requisição", "SKU", "Produto", "Qtd pedida", "Qtd separada", "Sugerida", "Caixa", "Origem"], ...p.itens.map((i) => [p.numero, p.loja, p.requisicao_numero, i.id_produto, i.descricao, i.qtd_pedida, i.qtd_separada, i.qtd_sugerida, i.caixa, i.origem])];
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
          Ao gerar o pedido, o sistema cria a <strong>requisição de separação</strong> em Suprimentos → Requisições. O acompanhamento segue: <strong>Aberto</strong> → <strong>Em separação</strong> → <strong>Separado</strong> → <strong>Enviado</strong> → <strong>Recebido</strong>. As etapas <strong>Em separação</strong> e <strong>Separado</strong> mudam sozinhas conforme a separação feita na tela de Requisições (a tela se atualiza a cada 15 s). Pedidos em andamento contam como "a caminho" na Reposição e abatem a sugestão. Marque como <strong>enviado</strong> quando o CD expedir e como <strong>recebido</strong> quando a loja receber. Para o Itaim, que não tem nota de transferência, este controle é o trânsito.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{["ATIVOS", "ABERTO", "EM_SEPARACAO", "SEPARADO", "ENVIADO", "RECEBIDO", "CANCELADO", "TODOS"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>{s === "ATIVOS" ? "Em andamento" : ROTULO[s] ?? "Todos"}{s !== "TODOS" ? ` (${contagem(s)})` : ""}</button>)}</div>
      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Loja</TableHead><TableHead>Status</TableHead><TableHead>Etapas</TableHead><TableHead>Requisição</TableHead><TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Separado</TableHead><TableHead>Criado</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {lista.length === 0 && <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">{q.isLoading ? "Carregando..." : q.error ? "Não consegui ler os pedidos (as tabelas já foram criadas no banco?)." : "Nenhum pedido neste filtro."}</TableCell></TableRow>}
          {lista.map((p) => {
            const total = p.itens.reduce((a, b) => a + Number(b.qtd_pedida), 0), sep = p.itens.reduce((a, b) => a + Number(b.qtd_separada ?? 0), 0);
            const separando = p.status === "EM_SEPARACAO" || p.status === "SEPARADO";
            return (<Fragment key={p.id}>
              <TableRow className="cursor-pointer" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <TableCell className="font-semibold">{p.numero}</TableCell><TableCell>{p.loja}{p.tipo === "TRANSFERENCIA" && <div className="text-[10px] text-primary">Transferência de {p.loja_origem}</div>}</TableCell>
                <TableCell><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR[p.status] ?? ""}`}>{(ROTULO[p.status] ?? p.status).toUpperCase()}</span></TableCell>
                <TableCell><Etapas status={p.status} /></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>{p.requisicao_id ? <Link to="/suprimentos/requisicoes/$id" params={{ id: p.requisicao_id }} className="text-xs font-mono text-primary hover:underline">{p.requisicao_numero}</Link> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">{p.itens.length}</TableCell><TableCell className="text-right">{un(total)}</TableCell>
                <TableCell className="text-right text-xs">{p.requisicao_id ? `${un(sep)} / ${un(total)}` : "—"}</TableCell>
                <TableCell className="text-xs">{new Date(p.criado_em).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => exportar(p)} aria-label="CSV"><Download className="size-4" /></Button>
                  {gestor && (p.status === "ABERTO" || p.status === "EM_SEPARACAO") && p.requisicao_id && <Link to="/suprimentos/requisicoes" title={`Separar na tela Requisições (${p.requisicao_numero})`} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"><PackageCheck className="size-3.5" /> Separar</Link>}
                  {gestor && (p.status === "SEPARADO" || p.status === "EM_SEPARACAO" || (p.status === "ABERTO" && !p.requisicao_id)) && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "ENVIADO")}>Marcar enviado</Button>}
                  {gestor && p.status === "ENVIADO" && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "RECEBIDO")}>Marcar recebido</Button>}
                  {gestor && (p.status === "ABERTO" || p.status === "ENVIADO") && <Button size="sm" variant="ghost" disabled={agindo === p.id} onClick={() => mudar(p, "CANCELADO")}>Cancelar</Button>}
                  {gestor && separando && <span className="ml-2 text-[10px] text-muted-foreground" title="Há separação registrada: cancele ou estorne pela requisição">cancelar pela requisição</span>}
                </TableCell></TableRow>
              {aberto === p.id && <TableRow><TableCell colSpan={10} className="bg-muted/30"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Pedido</TableHead><TableHead className="text-right">Separado</TableHead><TableHead className="text-right">Sugerido</TableHead><TableHead className="text-right">Caixa</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
                <TableBody>{p.itens.map((i) => <TableRow key={i.id ?? i.id_produto}><TableCell className="font-mono text-xs">{i.id_produto}</TableCell><TableCell>{i.descricao}</TableCell><TableCell className="text-right font-semibold">{un(Number(i.qtd_pedida))}</TableCell><TableCell className="text-right">{i.qtd_separada == null ? "—" : un(Number(i.qtd_separada))}</TableCell><TableCell className="text-right">{i.qtd_sugerida == null ? "—" : un(Number(i.qtd_sugerida))}</TableCell><TableCell className="text-right">{i.caixa ?? "—"}</TableCell><TableCell className="text-xs">{i.origem === "MANUAL" ? "Manual" : "Sugestão"}</TableCell></TableRow>)}</TableBody></Table></TableCell></TableRow>}
            </Fragment>);
          })}
        </TableBody></Table></CardContent></Card>
    </div>
  );
}
