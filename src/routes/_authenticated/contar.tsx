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
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import { LimparContagemDialog } from "@/components/inventario/LimparContagemDialog";
import { useAlmoxAtivo } from "@/lib/almox-inventario";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { Warehouse, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  origem: string;
  quantidade: number;
  custo_unitario: number;
  data_validade: string | null;
}

const TODOS = "__TODOS__";
const SEM_FAMILIA = "__SEM_FAMILIA__";
const GRUPOS_COM_FAMILIA = new Set(["Produto Acabado", "Mercadoria para Revenda"]);

function ContarPage() {
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const { isAdmin } = useRole();
  const [origem, setOrigem] = useState<string>(TODOS);
  const [grupo, setGrupo] = useState<string>(TODOS);
  const [familia, setFamilia] = useState<string>(TODOS);
  const [sku, setSku] = useState<string>("");
  const { data: almoxInfo } = useAlmoxAtivo();

  // Aplica almoxarifado ativo (missão ou padrão do usuário) como default do filtro
  useEffect(() => {
    if (almoxInfo?.almox && origem === TODOS) setOrigem(almoxInfo.almox);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almoxInfo?.almox]);

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

  // Origens ativas
  const { data: origens } = useQuery({
    queryKey: ["origens-ativas"],
    queryFn: async () => {
      const { data } = await supabase.from("origens").select("codigo_origem, descricao").eq("ativo", true).order("codigo_origem");
      return data ?? [];
    },
  });

  // Locais (combobox)
  const { data: locais } = useQuery({
    queryKey: ["locais-ativos"],
    queryFn: async () => {
      const { data } = await supabase.from("locais").select("nome").eq("ativo", true).order("nome");
      return (data ?? []).map((r) => r.nome);
    },
  });

  // Grupos de produto (Produto Acabado, Matéria Prima, ...)
  const { data: grupos } = useQuery({
    queryKey: ["grupos-distintos"],
    queryFn: async () => {
      const { data } = await supabase.from("grupo_produtos").select("grupo");
      return Array.from(new Set((data ?? []).map((r) => r.grupo))).sort();
    },
  });

  // Mostrar filtro Família?
  const usaFamilia = grupo !== TODOS && GRUPOS_COM_FAMILIA.has(grupo);

  // Códigos do grupo selecionado
  const { data: codigosDoGrupo } = useQuery({
    queryKey: ["codigos-do-grupo", grupo],
    enabled: grupo !== TODOS,
    queryFn: async () => {
      const { data } = await supabase.from("grupo_produtos").select("codigo_produto").eq("grupo", grupo);
      return (data ?? []).map((r) => r.codigo_produto);
    },
  });

  // Famílias do grupo (com percentual de conclusão)
  const { data: familias } = useQuery({
    queryKey: ["familias-do-grupo", grupo, codigosDoGrupo],
    enabled: usaFamilia && !!codigosDoGrupo,
    queryFn: async () => {
      const codes = codigosDoGrupo ?? [];
      if (codes.length === 0) return [] as { familia: string; total: number; feitos: number; pct: number }[];
      const { data: fam } = await supabase.from("familias").select("codigo_produto, familia").in("codigo_produto", codes);
      const byFam: Record<string, Set<string>> = {};
      (fam ?? []).forEach((f) => {
        byFam[f.familia] = byFam[f.familia] || new Set();
        byFam[f.familia].add(f.codigo_produto);
      });
      // SKUs já inventariados (distintos)
      const { data: inv } = await supabase.from("inventario").select("id_produto").in("id_produto", codes);
      const inventariados = new Set((inv ?? []).map((i) => i.id_produto));
      return Object.entries(byFam)
        .map(([familia, set]) => {
          const total = set.size;
          const feitos = Array.from(set).filter((c) => inventariados.has(c)).length;
          return { familia, total, feitos, pct: total > 0 ? Math.round((feitos / total) * 100) : 0 };
        })
        .sort((a, b) => a.familia.localeCompare(b.familia));
    },
  });

  // SKUs filtrados por origem + grupo + família opcional
  const { data: skus } = useQuery({
    queryKey: ["skus-filtrados", origem, grupo, familia, codigosDoGrupo],
    enabled: grupo !== "" && (grupo === TODOS || !!codigosDoGrupo),
    queryFn: async () => {
      let codes: string[] | null = null;
      if (grupo !== TODOS) codes = codigosDoGrupo ?? [];
      if (usaFamilia && familia !== TODOS && codes) {
        const { data: fam } = await supabase.from("familias").select("codigo_produto").eq("familia", familia).in("codigo_produto", codes);
        codes = (fam ?? []).map((f) => f.codigo_produto);
      }
      let q = supabase.from("estoque_sistemico").select("id_produto, descricao").limit(2000);
      if (codes !== null) {
        if (codes.length === 0) return [];
        q = supabase.from("estoque_sistemico").select("id_produto, descricao").in("id_produto", codes);
      }
      if (origem !== TODOS) q = q.eq("origem", origem);
      const { data } = await q;
      const map = new Map<string, string>();
      (data ?? []).forEach((r) => map.set(r.id_produto, r.descricao));
      return Array.from(map.entries()).map(([id_produto, descricao]) => ({ id_produto, descricao }))
        .sort((a, b) => a.id_produto.localeCompare(b.id_produto));
    },
  });

  // Lotes do SKU (filtrados por origem)
  const { data: lotes } = useQuery({
    queryKey: ["lotes-do-sku", sku, origem],
    enabled: !!sku,
    queryFn: async () => {
      let q = supabase.from("estoque_sistemico").select("*").eq("id_produto", sku);
      if (origem !== TODOS) q = q.eq("origem", origem);
      const { data, error } = await q.order("lote");
      if (error) throw error;
      return (data ?? []) as EstoqueItem[];
    },
  });

  // Contagens existentes
  const { data: contagens } = useQuery({
    queryKey: ["contagens-sku", sku],
    enabled: !!sku,
    queryFn: async () => {
      const { data } = await supabase.from("inventario")
        .select("id_produto, lote, quantidade_contada, status, acuracidade, id_local")
        .eq("id_produto", sku);
      const map: Record<string, { qtd: number; status: string; ac: number | null; local: string | null }> = {};
      (data ?? []).forEach((r) => { map[r.lote ?? ""] = { qtd: Number(r.quantidade_contada), status: r.status, ac: r.acuracidade != null ? Number(r.acuracidade) : null, local: r.id_local }; });
      return map;
    },
  });

  // Reset cascata
  useEffect(() => { setGrupo(TODOS); setFamilia(TODOS); setSku(""); }, [origem]);
  useEffect(() => { setFamilia(TODOS); setSku(""); }, [grupo]);
  useEffect(() => { setSku(""); }, [familia]);

  const familiaCorPct = (p: number) => p === 100 ? "text-success" : p >= 80 ? "text-warning-foreground" : "text-destructive";

  const cols = usaFamilia ? "md:grid-cols-4" : "md:grid-cols-3";

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contagem Operacional</h1>
          <p className="text-sm text-muted-foreground">Hierarquia: Almox → Grupo → {usaFamilia ? "Família → " : ""}SKU → Lote</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/scanner"><ScanLine className="size-4 mr-1.5" /> Scanner</Link></Button>
          {isAdmin && <LimparContagemDialog />}
          <div className="flex items-center gap-2 text-xs">
            <Switch checked={showSistemico} onCheckedChange={setShowSistemico} id="cego" />
            <Label htmlFor="cego" className="cursor-pointer flex items-center gap-1">
              {showSistemico ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Exibir saldo
            </Label>
          </div>
        </div>
      </div>

      {almoxInfo?.almox ? (
        <div className="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm">
          <Warehouse className="size-4 text-primary" />
          <span>Contagem restrita ao almoxarifado <strong>{almoxInfo.almox}</strong></span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {almoxInfo.source === "Missao" ? `Missão: ${almoxInfo.missaoTitulo ?? ""}` : "Padrão do usuário"}
          </Badge>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning-foreground" />
          <span className="text-warning-foreground">Almoxarifado não configurado — mostrando todos.</span>
        </div>
      )}



      <Card>
        <CardContent className={cn("p-4 grid grid-cols-1 gap-4", cols)}>
          <div>
            <Label className="text-xs">Almox</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>

              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {(origens ?? []).map((o) => (
                  <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.descricao || o.codigo_origem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Grupo de Produto</Label>
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(grupos ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {usaFamilia && (
            <div>
              <Label className="text-xs">Família</Label>
              <Select value={familia} onValueChange={setFamilia}>
                <SelectTrigger><SelectValue placeholder="Selecione a família" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {(familias ?? []).map((f) => (
                    <SelectItem key={f.familia} value={f.familia}>
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span>{f.familia}</span>
                        <span className={cn("text-[10px] font-semibold tabular-nums", familiaCorPct(f.pct))}>
                          {f.feitos}/{f.total} · {f.pct}%
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  {familias && familias.length === 0 && <SelectItem disabled value={SEM_FAMILIA}>Nenhuma família mapeada</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">SKU</Label>
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

      {/* Resumo família ativa */}
      {usaFamilia && familia !== TODOS && familias && (
        <FamiliaProgresso familia={familias.find((f) => f.familia === familia)} />
      )}

      {sku && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Lote</TableHead>
                  {showSistemico && <TableHead className="text-right">Sistema</TableHead>}
                  <TableHead className="w-48">Local *</TableHead>
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
                    locais={locais ?? []}
                    showSistemico={showSistemico}
                    existente={contagens?.[l.lote ?? ""]}
                    online={online}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["contagens-sku", sku] });
                      qc.invalidateQueries({ queryKey: ["inventario"] });
                      qc.invalidateQueries({ queryKey: ["recontagem"] });
                      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                      qc.invalidateQueries({ queryKey: ["familias-do-grupo"] });
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

function FamiliaProgresso({ familia }: { familia?: { familia: string; total: number; feitos: number; pct: number } }) {
  if (!familia) return null;
  const cor = familia.pct === 100 ? "bg-success" : familia.pct >= 80 ? "bg-warning" : "bg-destructive";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">{familia.familia}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{familia.feitos} de {familia.total} SKUs · <span className="font-semibold">{familia.pct}%</span></div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full transition-all", cor)} style={{ width: `${familia.pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaContagem({
  item, locais, showSistemico, existente, online, onSaved,
}: {
  item: EstoqueItem;
  locais: string[];
  showSistemico: boolean;
  existente?: { qtd: number; status: string; ac: number | null; local: string | null };
  online: boolean;
  onSaved: () => void;
}) {
  const [contado, setContado] = useState<string>("");
  const [local, setLocal] = useState<string>(existente?.local || item.id_local || "");
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
    if (!local) { toast.error("Selecione o Local"); sounds.error(); return; }

    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";

    const { data: existing } = await supabase
      .from("inventario").select("id, status")
      .eq("id_produto", item.id_produto).eq("lote", item.lote ?? "").maybeSingle();

    if (existing && existing.status !== "RECONTAGEM_OBRIGATORIA" && existing.status !== "RECONTAGEM_NECESSARIA") {
      toast.error("Este lote já foi inventariado."); sounds.error(); setSaving(false); return;
    }

    const payload = {
      id_produto: item.id_produto,
      lote: item.lote ?? "",
      descricao: item.descricao ?? "",
      unidade: item.unidade ?? "UN",
      id_local: local,
      origem: item.origem ?? "",
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
      toast.success("Contagem salva offline"); sounds.success();
      setSaving(false); setContado(""); onSaved(); return;
    }

    let error;
    if (existing) ({ error } = await supabase.from("inventario").update({ ...payload, status: "PENDENTE" }).eq("id", existing.id));
    else ({ error } = await supabase.from("inventario").insert(payload));

    if (error) { toast.error(error.message); sounds.error(); }
    else {
      toast.success("Contagem salva"); sounds.success();
      setContado("");
      await supabase.from("audit_logs").insert({
        usuario: userId, acao: "SALVAR_CONTAGEM", entidade: "inventario",
        payload: { id_produto: item.id_produto, lote: item.lote, local, quantidade_sistema: Number(item.quantidade), quantidade_contada: q, acuracidade: ac },
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
      <TableCell>
        <Select value={local} onValueChange={setLocal} disabled={!!bloqueado}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {locais.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            {item.id_local && !locais.includes(item.id_local) && <SelectItem value={item.id_local}>{item.id_local}</SelectItem>}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input type="number" inputMode="decimal" step="0.001" min="0"
          value={contado} disabled={!!bloqueado}
          onChange={(e) => setContado(e.target.value)}
          placeholder={existente ? `Atual: ${formatNum(existente.qtd)}` : "0"}
          className="h-9 tabular-nums" />
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
          <Button size="sm" onClick={salvar} disabled={saving || !contado || !local || !!bloqueado}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <><Save className="size-3.5 mr-1" /> Salvar</>}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
