import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { useShelfConfig } from "@/hooks/useFiltrosShelfLife";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

/** Origens ativas que o usuário pode enxergar. */
export function useOrigensDisponiveis() {
  const { almoxes } = useMeusAlmoxarifados();
  const q = useQuery({
    queryKey: ["origens-ativas"],
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("origens")
        .select("codigo_origem, ativo")
        .eq("ativo", true)
        .order("codigo_origem");
      if (error) throw error;
      return ((data ?? []) as any[]).map((o) => String(o.codigo_origem));
    },
  });
  return useMemo(() => {
    const todas = q.data ?? [];
    return almoxes ? todas.filter((o) => almoxes.includes(o)) : todas;
  }, [q.data, almoxes]);
}

/**
 * Parâmetro de configuração dos filtros do pilar Shelf Life.
 * A seleção é salva no navegador e compartilhada entre as telas do pilar.
 */
export function ConfigFiltrosCard({ mostrarSaldo = true }: { mostrarSaldo?: boolean }) {
  const origens = useOrigensDisponiveis();
  const { almoxAtivos, setAlmoxAtivos, somenteComSaldo, setSomenteComSaldo, resetConfig } = useShelfConfig();

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <SlidersHorizontal className="size-4" /> Configuração de Filtros
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={resetConfig}>
          <RotateCcw className="size-3.5 mr-1" /> Restaurar padrão
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
        <div className="lg:col-span-2">
          <Label className="text-xs">Almoxarifados ativos</Label>
          <MultiSelect
            options={origens.map((o) => ({ value: o, label: o }))}
            value={almoxAtivos}
            onChange={setAlmoxAtivos}
            allLabel="Todos os permitidos"
            placeholder="Buscar almoxarifado"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Define quais almoxarifados alimentam as telas de Shelf Life. A seleção fica salva neste navegador.
          </p>
        </div>
        {mostrarSaldo && (
          <div className="flex items-center gap-2 pb-1">
            <Switch id="somente-saldo" checked={somenteComSaldo} onCheckedChange={setSomenteComSaldo} />
            <Label htmlFor="somente-saldo" className="text-xs">Somente lotes com saldo (&gt; 0)</Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
