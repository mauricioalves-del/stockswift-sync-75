import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download } from "lucide-react";
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

type Pedido = { id: string; numero: number; loja: string; status: string; base_demanda: string | null; criado_em: string; atualizado_em: string; itens: { id_produto: string; descricao: string | null; qtd_sugerida: number | null; qtd_pedida: number; caixa: number | null; origem: string }[] };
const COR: Record<string, string> = { ABERTO: "bg-amber-100 text-amber-800", ENVIADO: "bg-indigo-100 text-indigo-700", RECEBIDO: "bg-emerald-100 text-emerald-700", CANCELADO: "bg-slate-100 text-slate-500" };
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");

function PedidosPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const gestor = isAdmin || role === "GERENTE";
  const qc = useQueryClient();
  const [status, setStatus] = useState("ATIVOS");
  const [aberto, setAberto] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);

  const q = useQuery({
    enabled: pode, queryKey: ["abast-pedidos"],
    queryFn: async () => {
      const sb = supabase as any;
      const { data: ps, error } = await sb.from("abast_pedidos").select("id, numero, loja, status, base_demanda, criado_em, atualizado_em").order("numero", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = (ps ?? []).map((p: any) => p.id);
      const { data: its } = ids.length ? await sb.from("abast_pedido_itens").select("pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem").in("pedido_id", ids) : { data: [] };
      return (ps ?? []).map((p: any) => ({ ...p, itens: (its ?? []).filter((i: any) => i.pedido_id === p.id) })) as Pedido[];
    },
  });

  async function mudar(p: Pedido, novo: string) {
    setAgindo(p.id);
    try {
      const { error } = await (supabase as any).rpc("abast_atualizar_pedido", { p_id: p.id, p_status: novo });
      if (error) throw error;
      toast.success(`Pedido ${p.numero}: ${novo.toLowerCase()}.`);
      qc.invalidateQueries({ queryKey: ["abast-pedidos"] }); qc.invalidateQueries({ queryKey: ["abast-v2"] });
    } catch (err: any) { toast.error("Não consegui atualizar: " + (err?.message ?? err)); }
    finally { setAgindo(null); }
  }
  function exportar(p: Pedido) {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const linhas = [["Pedido", "Loja", "SKU", "Produto", "Qtd pedida", "Sugerida", "Caixa", "Origem"], ...p.itens.map((i) => [p.numero, p.loja, i.id_produto, i.descricao, i.qtd_pedida, i.qtd_sugerida, i.caixa, i.origem])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas.map((l) => l.map(esc).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Pedido_${p.numero}_${p.loja}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const lista = (q.data ?? []).filter((p) => status === "TODOS" ? true : status === "ATIVOS" ? p.status === "ABERTO" || p.status === "ENVIADO" : p.status === status);
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="size-6" /> Pedidos de Abastecimento</h1>
        <p className="text-sm text-muted-foreground">Pedidos <strong>abertos</strong> e <strong>enviados</strong> contam como "a caminho" na Reposição: abatem a sugestão e evitam pedido duplicado. Marque como <strong>enviado</strong> quando o CD expedir e como <strong>recebido</strong> quando a loja receber (aí o estoque já reflete a entrada). Para o Itaim, que não tem nota de transferência, é este controle que mostra o trânsito.</p>
      </div>
      <div className="flex flex-wrap gap-2">{["ATIVOS", "ABERTO", "ENVIADO", "RECEBIDO", "CANCELADO", "TODOS"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted"}`}>{s === "ATIVOS" ? "Em andamento" : s.charAt(0) + s.slice(1).toLowerCase()}</button>)}</div>
      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Loja</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Criado</TableHead><TableHead>Base</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {lista.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{q.isLoading ? "Carregando..." : q.error ? "Não consegui ler os pedidos (as tabelas já foram criadas no banco?)." : "Nenhum pedido neste filtro."}</TableCell></TableRow>}
          {lista.map((p) => (<Fragment key={p.id}>
            <TableRow className="cursor-pointer" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
              <TableCell className="font-semibold">{p.numero}</TableCell><TableCell>{p.loja}</TableCell>
              <TableCell><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR[p.status]}`}>{p.status}</span></TableCell>
              <TableCell className="text-right">{p.itens.length}</TableCell><TableCell className="text-right">{un(p.itens.reduce((a, b) => a + Number(b.qtd_pedida), 0))}</TableCell>
              <TableCell className="text-xs">{new Date(p.criado_em).toLocaleString("pt-BR")}</TableCell><TableCell className="text-xs">{p.base_demanda}</TableCell>
              <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => exportar(p)} aria-label="CSV"><Download className="size-4" /></Button>
                {gestor && p.status === "ABERTO" && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "ENVIADO")}>Marcar enviado</Button>}
                {gestor && p.status === "ENVIADO" && <Button size="sm" variant="outline" disabled={agindo === p.id} onClick={() => mudar(p, "RECEBIDO")}>Marcar recebido</Button>}
                {gestor && (p.status === "ABERTO" || p.status === "ENVIADO") && <Button size="sm" variant="ghost" disabled={agindo === p.id} onClick={() => mudar(p, "CANCELADO")}>Cancelar</Button>}
              </TableCell></TableRow>
            {aberto === p.id && <TableRow><TableCell colSpan={8} className="bg-muted/30"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Pedido</TableHead><TableHead className="text-right">Sugerido</TableHead><TableHead className="text-right">Caixa</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
              <TableBody>{p.itens.map((i) => <TableRow key={i.id_produto}><TableCell className="font-mono text-xs">{i.id_produto}</TableCell><TableCell>{i.descricao}</TableCell><TableCell className="text-right font-semibold">{un(Number(i.qtd_pedida))}</TableCell><TableCell className="text-right">{i.qtd_sugerida == null ? "—" : un(Number(i.qtd_sugerida))}</TableCell><TableCell className="text-right">{i.caixa ?? "—"}</TableCell><TableCell className="text-xs">{i.origem === "MANUAL" ? "Manual" : "Sugestão"}</TableCell></TableRow>)}</TableBody></Table></TableCell></TableRow>}
          </Fragment>))}
        </TableBody></Table></CardContent></Card>
    </div>
  );
}
