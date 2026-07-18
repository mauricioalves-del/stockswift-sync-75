import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { carregarBomCompleta, explodirBOM, gerarNumeroOP } from "@/lib/pcp-bom";

export const Route = createFileRoute("/_authenticated/producao/pcp")({
  component: PcpPage,
  head: () => ({ meta: [
    { title: "PCP — Planejamento e Controle de Produção" },
    { name: "description", content: "Ordens de produção, explosão de BOM e disponibilidade de materiais." },
  ]}),
});

type OP = {
  id: string; numero_op: string; produto: string; desc_produto: string | null;
  quantidade_planejada: number; quantidade_produzida_real: number | null;
  data_planejada: string | null; almoxarifado_producao: string | null;
  status: string; origem_demanda: string; op_pai_id: string | null; created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  PLANEJADA: "Planejada", LIBERADA: "Liberada", EM_PRODUCAO: "Em Produção",
  CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};
const STATUS_COR: Record<string, string> = {
  PLANEJADA: "bg-muted text-foreground border-border",
  LIBERADA: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  EM_PRODUCAO: "bg-warning/15 text-warning border-warning/30",
  CONCLUIDA: "bg-success/15 text-success border-success/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
};

function PcpPage() {
  const { canWrite } = useRole();
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  const opsQ = useQuery({
    queryKey: ["pcp", "ops"],
    queryFn: async (): Promise<OP[]> => {
      const { data, error } = await (supabase as any)
        .from("ordens_producao")
        .select("id,numero_op,produto,desc_produto,quantidade_planejada,quantidade_produzida_real,data_planejada,almoxarifado_producao,status,origem_demanda,op_pai_id,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as OP[]) ?? [];
    },
  });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (opsQ.data ?? []).filter((o) => {
      if (filtroStatus !== "todos" && o.status !== filtroStatus) return false;
      if (q && !`${o.numero_op} ${o.produto} ${o.desc_produto ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [opsQ.data, filtroStatus, busca]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">PCP — Ordens de Produção</h1>
          <p className="text-sm text-muted-foreground">Planejamento e controle de produção com explosão de BOM.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/producao/pcp/sugestoes"><Sparkles className="h-4 w-4 mr-1" /> Sugestões</Link>
          </Button>
          {canWrite && <NovaOPDialog />}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar OP / produto…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">{lista.length} OPs</div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OP</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd Planejada</TableHead>
                <TableHead className="text-right">Qtd Real</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((o) => (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link to="/producao/pcp/$id" params={{ id: o.id }} className="text-primary hover:underline">
                      {o.numero_op}
                    </Link>
                    {o.op_pai_id && <Badge variant="outline" className="ml-2 text-[10px]">filha</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{o.produto}</div>
                    {o.desc_produto && <div className="text-xs text-muted-foreground">{o.desc_produto}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(o.quantidade_planejada).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.quantidade_produzida_real != null ? Number(o.quantidade_produzida_real).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-xs">{o.almoxarifado_producao ?? "—"}</TableCell>
                  <TableCell className="text-xs">{o.origem_demanda === "MANUAL" ? "Manual" : "Abastec."}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_COR[o.status]}>{STATUS_LABEL[o.status]}</Badge></TableCell>
                </TableRow>
              ))}
              {!lista.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">Nenhuma OP.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NovaOPDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [produto, setProduto] = useState("");
  const [qtd, setQtd] = useState("");
  const [data, setData] = useState("");
  const [almox, setAlmox] = useState("");
  const [saving, setSaving] = useState(false);

  const almoxQ = useQuery({
    queryKey: ["origens", "ativas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("origens").select("codigo_origem,descricao").eq("ativo", true).order("codigo_origem");
      return (data as { codigo_origem: string; descricao: string | null }[]) ?? [];
    },
  });

  const produtosQ = useQuery({
    queryKey: ["pcp", "produtos-bom"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("ficha_tecnica_bom").select("id_produto,produto").limit(5000);
      const uniq = new Map<string, string>();
      for (const r of (data ?? []) as { id_produto: string; produto: string | null }[]) {
        if (!uniq.has(r.id_produto)) uniq.set(r.id_produto, r.produto ?? r.id_produto);
      }
      return Array.from(uniq.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: open,
  });

  async function criar() {
    if (!produto || !qtd || Number(qtd) <= 0) { toast.error("Preencha produto e quantidade."); return; }
    setSaving(true);
    try {
      const bom = await carregarBomCompleta();
      const nec = explodirBOM(produto, Number(qtd), bom);
      if (!nec.length) { toast.error("Produto sem BOM cadastrada."); setSaving(false); return; }
      const nomeProd = produtosQ.data?.find((p) => p.id === produto)?.nome ?? produto;
      const { data: user } = await supabase.auth.getUser();
      const { data: opCriada, error } = await (supabase as any)
        .from("ordens_producao")
        .insert({
          numero_op: gerarNumeroOP(),
          produto, desc_produto: nomeProd,
          quantidade_planejada: Number(qtd),
          data_planejada: data || null,
          almoxarifado_producao: almox || null,
          origem_demanda: "MANUAL",
          criado_por: user.user?.id ?? null,
        })
        .select("id").single();
      if (error) throw error;

      const rows = nec.map((n) => ({
        op_id: opCriada.id, id_item: n.id_item, item: n.item, um: n.um,
        qtd_necessaria: n.qtd_necessaria, eh_semiacabado: n.eh_semiacabado,
      }));
      const { error: e2 } = await (supabase as any).from("necessidade_materiais_op").insert(rows);
      if (e2) throw e2;

      toast.success("OP criada");
      qc.invalidateQueries({ queryKey: ["pcp"] });
      setOpen(false); setProduto(""); setQtd(""); setData(""); setAlmox("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar OP");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova OP</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Ordem de Produção</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={produto} onValueChange={setProduto}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto…" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(produtosQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.id} — {p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Quantidade</Label><Input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label>Data planejada</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div>
            <Label>Almoxarifado de produção</Label>
            <Select value={almox} onValueChange={setAlmox}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {(almoxQ.data ?? []).map((o) => <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.codigo_origem} — {o.descricao ?? ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={saving}>{saving ? "Criando…" : "Criar OP"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
