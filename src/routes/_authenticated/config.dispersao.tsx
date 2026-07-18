import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FAIXAS_DEFAULT } from "@/lib/dispersao";

export const Route = createFileRoute("/_authenticated/config/dispersao")({
  component: ConfigDispersao,
  head: () => ({ meta: [{ title: "Faixas de Alerta — Dispersão" }] }),
});

function ConfigDispersao() {
  const qc = useQueryClient();
  const { isAdmin } = useRole();
  const q = useQuery({
    queryKey: ["dispersao", "faixas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("parametros_dispersao").select("*").maybeSingle();
      return data ?? { limite_atencao_pct: FAIXAS_DEFAULT.atencao, limite_critico_pct: FAIXAS_DEFAULT.critico };
    },
  });
  const [atencao, setAtencao] = useState<string>("");
  const [critico, setCritico] = useState<string>("");
  useEffect(() => {
    if (q.data) { setAtencao(String(q.data.limite_atencao_pct)); setCritico(String(q.data.limite_critico_pct)); }
  }, [q.data]);

  async function salvar() {
    const a = Number(atencao), c = Number(critico);
    if (!(a > 0) || !(c > 0) || a >= c) { toast.error("Atenção precisa ser < Crítico e ambos > 0."); return; }
    const { error } = await (supabase as any).from("parametros_dispersao")
      .update({ limite_atencao_pct: a, limite_critico_pct: c, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Faixas atualizadas");
    qc.invalidateQueries({ queryKey: ["dispersao", "faixas"] });
  }

  if (!isAdmin) return <div className="p-6 text-sm">Somente Administrador pode editar as faixas.</div>;

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Faixas de Alerta — Dispersão</h1>
        <p className="text-sm text-muted-foreground">Limites em % (valor absoluto) para classificar linhas de dispersão.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Limites</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Atenção (|%| até…)</Label>
            <Input type="number" step="0.1" value={atencao} onChange={(e) => setAtencao(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Até esse valor a linha é considerada Normal. Default: 5%</p>
          </div>
          <div>
            <Label>Crítico (|%| acima de…)</Label>
            <Input type="number" step="0.1" value={critico} onChange={(e) => setCritico(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Entre Atenção e Crítico → Atenção. Acima → Crítico. Default: 15%</p>
          </div>
          <Button onClick={salvar}>Salvar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
