import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Save, X, ScanLine, Eye, EyeOff, Loader2 } from "lucide-react";
import { sounds } from "@/lib/audio";
import { calcAcuracidade, acuracidadeColor, formatNum } from "@/lib/inventory";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { addPendingCount } from "@/lib/idb";
import { syncPendingCounts } from "@/lib/sync";

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

const TODOS = "__TODOS__";

function ContarPage() {
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [grupo, setGrupo] = useState<string>(TODOS);
  const [sku, setSku] = useState<string>("");

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

  // Lista de grupos distintos
  const { data: grupos } = useQuery({
    queryKey: ["grupos-distintos"],
    queryFn: async () => {
      const { data } = await supabase.from("grupo_produtos").select("grupo");
      const set = new Set<string>((data ?? []).map((r: { grupo: string }) => r.grupo));
      return Array.from(set).sort();
    },
  });

  // SKUs do grupo selecionado
  const { data: skus } = useQuery({
    queryKey: ["skus-do-grupo", grupo],
    enabled: grupo !== "",
    queryFn: async () => {
      if (grupo === TODOS) {
        const { data } = await supabase.from("estoque_sistemico").select("id_produto, descricao").limit(2000);
        const map = new Map<string, string>();
        (data ?? []).forEach((r: { id_produto: string; descricao: string }) => map.set(r.id_produto, r.descricao));
        return Array.from(map.entries()).map(([id_produto, descricao]) => ({ id_produto, descricao })).sort((a, b) => a.id_produto.localeCompare(b.id_produto));
      }
      const { data: gp } = await supabase.from("grupo_produtos").select("codigo_produto").eq("grupo", grupo);
      const codes = (gp ?? []).map((r: { codigo_produto: string }) => r.codigo_produto);
      if (codes.length === 0) return [];
      const { data: est } = await supabase.from("estoque_sistemico").select("id_produto, descricao").in("id_produto", codes);
      const map = new Map<string, string>();
      (est ?? []).forEach((r: { id_produto: string; descricao: string }) => map.set(r.id_produto, r.descricao));
      return Array.from(map.entries()).map(([id_produto, descricao]) => ({ id_produto, descricao })).sort((a, b) => a.id_produto.localeCompare(b.id_produto));
    },
  });

  // Lotes do SKU
  const { data: lotes } = useQuery({
    queryKey: ["lotes-do-sku", sku],
    enabled: !!sku,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_sistemico")
        .select("*")
        .eq("id_produto", sku)
        .order("lote");
      if (error) throw error;
      return (data ?? []) as EstoqueItem[];
    },
  });

  // Inventario existente
  const { data: contagens } = useQuery({
    queryKey: ["contagens-sku", sku],
    enabled: !!sku,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventario")
        .select("id_produto, lote, quantidade_contada, status, acuracidade")
        .eq("id_produto", sku);
      const map: Record<string, { qtd: number; status: string; ac: number | null }> = {};
      (data ?? []).forEach((r) => { map[r.lote ?? ""] = { qtd: Number(r.quantidade_contada), status: r.status, ac: r.acuracidade != null ? Number(r.acuracidade) : null }; });
      return map;
    },
  });

  // Reset SKU quando grupo muda
  useEffect(() => { setSku(""); }, [grupo]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contagem Operacional</h1>
          <p className="text-sm text-muted-foreground">Selecione Grupo → SKU para listar os lotes disponíveis</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/scanner"><ScanLine className="size-4 mr-1.5" /> Scanner</Link></Button>
          <div className="flex items-center gap-2 text-xs">
            <Switch checked={showSistemico} onCheckedChange={setShowSistemico} id="cego" />
            <Label htmlFor="cego" className="cursor-pointer flex items-center gap-1">
              {showSistemico ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Exibir saldo
            </Label>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Filtro Grupo</Label>
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(grupos ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Filtro SKU</Label>
            <Select value={sku} onValueChange={setSku} disabled={!grupo}>
              <SelectTrigger><SelectValue placeholder={grupo ? "Selecione um SKU" : "Selecione o grupo primeiro"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(skus ?? []).map((s) => (
                  <SelectItem key={s.id_produto} value={s.id_produto}>
                    {s.id_produto} — {s.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {sku && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Lote</TableHead>
                  {showSistemico && <TableHead className="text-right">Saldo Sistema</TableHead>}
                  <TableHead>Local</TableHead>
                  <TableHead className="w-40">Contagem</TableHead>
                  <TableHead className="w-28 text-right">Acuracidade</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-44 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lotes ?? []).map((l) => (
                  <LinhaContagem
                    key={l.id}
                    item={l}
                    showSistemico={showSistemico}
                    existente={contagens?.[l.lote ?? ""]}
                    online={online}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["contagens-sku", sku] });
                      qc.invalidateQueries({ queryKey: ["inventario"] });
                      qc.invalidateQueries({ queryKey: ["recontagem"] });
                      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                    }}
                  />
                ))}
                {(lotes ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum lote encontrado</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LinhaContagem({
  item, showSistemico, existente, online, onSaved,
}: {
  item: EstoqueItem;
  showSistemico: boolean;
  existente?: { qtd: number; status: string; ac: number | null };
  online: boolean;
  onSaved: () => void;
}) {
  const [contado, setContado] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const ac = useMemo(() => {
    const v = Number((contado || "0").replace(",", "."));
    if (contado === "" || Number.isNaN(v)) return null;
    return calcAcuracidade(v, Number(item.quantidade));
  }, [contado, item.quantidade]);

  const cor = acuracidadeColor(ac);
  const bloqueado = existente && existente.status !== "RECONTAGEM_OBRIGATORIA" && existente.status !== "RECONTAGEM_NECESSARIA";

  async function salvar() {
    const q = Number(contado.replace(",", "."));
    if (contado === "" || Number.isNaN(q) || q < 0) { toast.error("Quantidade inválida"); sounds.error(); return; }

    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";

    // Verificar duplicidade
    const { data: existing } = await supabase
      .from("inventario")
      .select("id, status")
      .eq("id_produto", item.id_produto)
      .eq("lote", item.lote ?? "")
      .maybeSingle();

    if (existing && existing.status !== "RECONTAGEM_OBRIGATORIA" && existing.status !== "RECONTAGEM_NECESSARIA") {
      toast.error("Este lote já foi inventariado.");
      sounds.error();
      setSaving(false);
      return;
    }

    const payload = {
      id_produto: item.id_produto,
      lote: item.lote ?? "",
      descricao: item.descricao ?? "",
      unidade: item.unidade ?? "UN",
      id_local: item.id_local ?? "",
      custo_unitario: Number(item.custo_unitario),
      saldo_sistemico: Number(item.quantidade),
      quantidade_contada: q,
      data_validade: item.data_validade,
      contagem_numero: existing ? 2 : 1,
      usuario: userId,
      data_contagem: new Date().toISOString(),
    };

    if (!online) {
      await addPendingCount({ ...payload, localId: crypto.randomUUID(), createdAt: Date.now() });
      toast.success("Contagem salva offline");
      sounds.success();
      setSaving(false);
      setContado("");
      onSaved();
      return;
    }

    let error;
    if (existing) {
      ({ error } = await supabase.from("inventario").update({
        ...payload,
        status: "PENDENTE",
      }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("inventario").insert(payload));
    }

    if (error) {
      toast.error(error.message);
      sounds.error();
    } else {
      toast.success("Contagem salva");
      sounds.success();
      setContado("");
      await supabase.from("audit_logs").insert({
        usuario: userId, acao: "SALVAR_CONTAGEM", entidade: "inventario",
        payload: { id_produto: item.id_produto, lote: item.lote, quantidade_contada: q, acuracidade: ac },
      });
      onSaved();
      if (online) syncPendingCounts();
    }
    setSaving(false);
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.id_produto}</TableCell>
      <TableCell className="max-w-xs truncate">{item.descricao}</TableCell>
      <TableCell className="font-mono text-xs">{item.lote || "—"}</TableCell>
      {showSistemico && <TableCell className="text-right tabular-nums">{formatNum(Number(item.quantidade))} {item.unidade}</TableCell>}
      <TableCell className="text-xs">{item.id_local || "—"}</TableCell>
      <TableCell>
        <Input
          type="number" inputMode="decimal" step="0.001" min="0"
          value={contado}
          disabled={bloqueado}
          onChange={(e) => setContado(e.target.value)}
          placeholder={existente ? `Atual: ${formatNum(existente.qtd)}` : "0"}
          className="h-9 tabular-nums"
        />
      </TableCell>
      <TableCell className="text-right">
        {ac != null ? (
          <span className={`inline-flex px-2 py-0.5 rounded font-semibold text-xs ${cor.bg} ${cor.text}`}>{cor.label}</span>
        ) : existente?.ac != null ? (
          <span className="text-xs text-muted-foreground tabular-nums">{Number(existente.ac).toFixed(2)}%</span>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {existente && <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground">{existente.status}</span>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setContado("")} disabled={!contado || saving}>
            <X className="size-3.5" />
          </Button>
          <Button size="sm" onClick={salvar} disabled={saving || !contado || !!bloqueado}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <><Save className="size-3.5 mr-1" /> Salvar</>}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
