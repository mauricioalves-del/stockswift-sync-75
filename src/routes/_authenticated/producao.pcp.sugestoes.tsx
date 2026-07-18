import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Rocket } from "lucide-react";
import { carregarBomCompleta, explodirBOM, gerarNumeroOP } from "@/lib/pcp-bom";

export const Route = createFileRoute("/_authenticated/producao/pcp/sugestoes")({
  component: SugestoesPage,
  head: () => ({ meta: [{ title: "Sugestões de OP — PCP" }] }),
});

type Sug = { id: string; id_produto: string; descricao: string | null; estoque_ideal: number | null; estoque_minimo: number | null };

function SugestoesPage() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const nav = useNavigate();

  // Cruza produtos_reposicao com produtos que existem como id_produto em ficha_tecnica_bom (fabricados)
  const q = useQuery({
    queryKey: ["pcp", "sugestoes"],
    queryFn: async (): Promise<(Sug & { sugestao: number })[]> => {
      const [{ data: rep }, { data: bom }, { data: est }] = await Promise.all([
        (supabase as any).from("produtos_reposicao").select("id,id_produto,descricao,estoque_ideal,estoque_minimo").eq("ativo", true),
        (supabase as any).from("ficha_tecnica_bom").select("id_produto").limit(10000),
        (supabase as any).from("estoque_sistemico").select("id_produto,quantidade"),
      ]);
      const fabricados = new Set<string>((bom ?? []).map((r: any) => r.id_produto));
      const saldos: Record<string, number> = {};
      for (const r of (est ?? []) as any[]) saldos[r.id_produto] = (saldos[r.id_produto] ?? 0) + Number(r.quantidade || 0);
      return ((rep ?? []) as Sug[])
        .filter((r) => fabricados.has(r.id_produto))
        .map((r) => {
          const saldo = saldos[r.id_produto] ?? 0;
          const ideal = Number(r.estoque_ideal ?? 0);
          const sugestao = Math.max(0, ideal - saldo);
          return { ...r, sugestao };
        })
        .filter((r) => r.sugestao > 0)
        .sort((a, b) => b.sugestao - a.sugestao);
    },
  });

  async function aceitar(s: Sug & { sugestao: number }) {
    try {
      const bom = await carregarBomCompleta();
      const nec = explodirBOM(s.id_produto, s.sugestao, bom);
      if (!nec.length) { toast.error("Produto sem BOM."); return; }
      const { data: user } = await supabase.auth.getUser();
      const { data: op, error } = await (supabase as any).from("ordens_producao").insert({
        numero_op: gerarNumeroOP(),
        produto: s.id_produto, desc_produto: s.descricao,
        quantidade_planejada: s.sugestao,
        origem_demanda: "SUGESTAO_ABASTECIMENTO",
        referencia_id: s.id, criado_por: user.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      await (supabase as any).from("necessidade_materiais_op").insert(nec.map((n) => ({
        op_id: op.id, id_item: n.id_item, item: n.item, um: n.um,
        qtd_necessaria: n.qtd_necessaria, eh_semiacabado: n.eh_semiacabado,
      })));
      toast.success("OP criada");
      qc.invalidateQueries({ queryKey: ["pcp"] });
      nav({ to: "/producao/pcp/$id", params: { id: op.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/producao/pcp" })}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
        <h1 className="text-2xl font-semibold">Sugestões de OP</h1>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Produtos fabricados com sugestão de abastecimento</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Sugestão</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell><div className="text-sm font-medium">{s.id_produto}</div><div className="text-xs text-muted-foreground">{s.descricao}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{s.sugestao.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && <Button size="sm" onClick={() => aceitar(s)}><Rocket className="h-4 w-4 mr-1" />Aceitar e Gerar OP</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!(q.data ?? []).length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">Sem sugestões no momento.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
