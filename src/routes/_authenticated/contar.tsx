import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Save, ScanLine, Eye, EyeOff, Loader2 } from "lucide-react";
import { sounds } from "@/lib/audio";
import { addPendingCount } from "@/lib/idb";
import { syncPendingCounts } from "@/lib/sync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export const Route = createFileRoute("/_authenticated/contar")({
  component: ContarPage,
  head: () => ({ meta: [{ title: "Contagem" }] }),
});

interface EstoqueItem {
  id: string;
  id_produto: string;
  lote: string;
  descricao: string;
  unidade: string;
  id_local: string;
  quantidade: number;
  custo_unitario: number;
  data_validade: string | null;
}

function ContarPage() {
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EstoqueItem | null>(null);
  const [contado, setContado] = useState<string>("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inventário cego
  const { data: cego } = useQuery({
    queryKey: ["config-cego"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("valor").eq("chave", "inventario_cego").maybeSingle();
      return data?.valor === true || data?.valor === "true";
    },
  });

  const [showSistemico, setShowSistemico] = useState<boolean>(true);
  useEffect(() => { if (cego !== undefined) setShowSistemico(!cego); }, [cego]);

  const { data: results } = useQuery({
    queryKey: ["estoque-search", search],
    enabled: search.trim().length >= 2,
    queryFn: async (): Promise<EstoqueItem[]> => {
      const term = search.trim();
      const { data, error } = await supabase
        .from("estoque_sistemico")
        .select("*")
        .or(`id_produto.ilike.%${term}%,lote.ilike.%${term}%,descricao.ilike.%${term}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EstoqueItem[];
    },
  });

  // Verificar quantas contagens existem para sugerir número da contagem
  const { data: contagensExistentes } = useQuery({
    queryKey: ["contagens", selected?.id_produto, selected?.lote],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventario")
        .select("contagem_numero")
        .eq("id_produto", selected!.id_produto)
        .eq("lote", selected!.lote)
        .order("contagem_numero", { ascending: false })
        .limit(1);
      return data?.[0]?.contagem_numero ?? 0;
    },
  });

  const proximaContagem = useMemo(() => (contagensExistentes ?? 0) + 1, [contagensExistentes]);

  async function handleSave() {
    if (!selected) return;
    const q = Number(contado.replace(",", "."));
    if (Number.isNaN(q) || q < 0) { toast.error("Quantidade inválida"); sounds.error(); return; }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";
    const payload = {
      id_produto: selected.id_produto,
      lote: selected.lote,
      descricao: selected.descricao,
      unidade: selected.unidade,
      id_local: selected.id_local,
      custo_unitario: Number(selected.custo_unitario),
      saldo_sistemico: Number(selected.quantidade),
      quantidade_contada: q,
      data_validade: selected.data_validade,
      contagem_numero: proximaContagem,
      usuario: userId,
      observacao: obs || null,
      data_contagem: new Date().toISOString(),
    };

    if (online) {
      const { error } = await supabase.from("inventario").insert(payload);
      if (error) {
        toast.error("Falha ao salvar online — salvando offline");
        await addPendingCount({ ...payload, localId: crypto.randomUUID(), createdAt: Date.now() });
      } else {
        toast.success("Contagem salva");
        sounds.success();
      }
    } else {
      await addPendingCount({ ...payload, localId: crypto.randomUUID(), createdAt: Date.now() });
      toast.success("Contagem salva offline");
      sounds.success();
    }

    qc.invalidateQueries({ queryKey: ["inventario"] });
    qc.invalidateQueries({ queryKey: ["pending-counts"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });

    setContado("");
    setObs("");
    setSelected(null);
    setSearch("");
    setSaving(false);
    setTimeout(() => inputRef.current?.focus(), 50);
    if (online) syncPendingCounts();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contagem Operacional</h1>
          <p className="text-sm text-muted-foreground">Busque o produto e registre a quantidade contada</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/scanner"><ScanLine className="size-4 mr-1.5" /> Scanner</Link></Button>
          <div className="flex items-center gap-2 text-xs">
            <Switch checked={showSistemico} onCheckedChange={setShowSistemico} id="cego" />
            <Label htmlFor="cego" className="cursor-pointer flex items-center gap-1">
              {showSistemico ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              Exibir saldo
            </Label>
          </div>
        </div>
      </div>

      {!selected && (
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                autoFocus
                placeholder="Buscar por código, lote ou descrição..."
                className="pl-9 h-12 text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {results && results.length > 0 && (
              <div className="mt-3 divide-y border rounded-lg overflow-hidden">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setSearch(""); }}
                    className="w-full text-left p-3 hover:bg-accent transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.descricao || r.id_produto}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.id_produto} · Lote {r.lote || "—"} · {r.id_local || "—"}</div>
                    </div>
                    {showSistemico && <Badge variant="secondary" className="tabular-nums">{r.quantidade} {r.unidade}</Badge>}
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && results?.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhum produto encontrado</div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg truncate">{selected.descricao || selected.id_produto}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  Cód: {selected.id_produto} · Lote: {selected.lote || "—"} · Local: {selected.id_local || "—"} · Un: {selected.unidade}
                </div>
                {selected.data_validade && <div className="text-xs text-muted-foreground">Validade: {selected.data_validade}</div>}
              </div>
              <Badge variant="outline">Contagem #{proximaContagem}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSistemico && (
              <div className="bg-muted rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Saldo sistêmico</span>
                <span className="text-xl font-bold tabular-nums">{Number(selected.quantidade).toLocaleString("pt-BR")} {selected.unidade}</span>
              </div>
            )}
            <div>
              <Label htmlFor="qtd" className="text-base">Quantidade contada</Label>
              <Input
                id="qtd"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                autoFocus
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="h-14 text-2xl text-center tabular-nums font-bold"
              />
            </div>
            <div>
              <Label htmlFor="obs">Observação (opcional)</Label>
              <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setSelected(null); setContado(""); setObs(""); }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !contado}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <><Save className="size-4 mr-1.5" /> Salvar</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
