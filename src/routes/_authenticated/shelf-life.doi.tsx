import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Hourglass, Loader2, Pencil, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/shelf-life/doi")({
  component: CadastroDoiPage,
  head: () => ({
    meta: [
      { title: "Cadastro de DOI | Shelf Life" },
      { name: "description", content: "Cadastro do DOI (tempo de vida) dos SKUs premium usados no Farol Premium." },
    ],
  }),
});

type Faixa = "Follow-up" | "Atenção";
type Unidade = "meses" | "dias";
type Premium = { id_produto: string; descricao: string | null; faixa: Faixa; doi_dias: number; ativo: boolean };
type LoteEstoque = { id_produto: string; origem: string | null; lote: string | null; data_validade: string | null; quantidade: number };
type Form = { sku: string; descricao: string; faixa: Faixa; valor: string; unidade: Unidade; ativo: boolean };

const DIAS_POR_MES = 30; // mesma convenção da planilha de DOI (6 meses = 180 dias)
const MS_DIA = 86400000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// Mesmos limites padrão do Farol Premium (podem ser alterados no sistema sem mexer nesta tela).
const LIMITE_AMARELO = 0.5;
const LIMITE_VERMELHO = 0.75;

const FORM_VAZIO: Form = { sku: "", descricao: "", faixa: "Follow-up", valor: "", unidade: "meses", ativo: true };

function msDe(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
function dataBR(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
function mesAno(ms: number): string {
  const d = new Date(ms);
  return `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}
function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
/** Fabricação estimada = validade − DOI (em dias). */
function fabricacaoEstimada(validadeISO: string, doiDias: number) {
  const ms = msDe(validadeISO.slice(0, 10)) - doiDias * MS_DIA;
  return { data: dataBR(ms), mes: mesAno(ms) };
}
function doiEmDias(valor: string, unidade: Unidade): number {
  const n = Number(String(valor).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(unidade === "meses" ? n * DIAS_POR_MES : n);
}
function doiRotulo(dias: number): string {
  if (dias % DIAS_POR_MES === 0) {
    const m = dias / DIAS_POR_MES;
    return `${m} ${m === 1 ? "mês" : "meses"} (${dias} dias)`;
  }
  return `${dias} dias`;
}
function semaforo(dias: number, doi: number): { cor: string; bola: string; shelf: number } {
  const shelf = 1 - dias / doi;
  if (dias < 0 || shelf > LIMITE_VERMELHO) return { cor: "text-red-600", bola: "🔴", shelf };
  if (shelf >= LIMITE_AMARELO) return { cor: "text-amber-600", bola: "🟡", shelf };
  return { cor: "text-green-600", bola: "🟢", shelf };
}

function CadastroDoiPage() {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aExcluir, setAExcluir] = useState<Premium | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [validadeSim, setValidadeSim] = useState("");

  const listaQ = useQuery({
    queryKey: ["premium-prioridades"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("premium_prioridades").select("id_produto, descricao, faixa, doi_dias, ativo").order("faixa").order("id_produto");
      if (error) throw error;
      return (data ?? []) as Premium[];
    },
  });
  const lista = listaQ.data ?? [];
  const skus = useMemo(() => lista.map((p) => p.id_produto), [lista]);

  const lotesQ = useQuery({
    queryKey: ["premium-lotes", skus.join(",")],
    enabled: skus.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_sistemico").select("id_produto, origem, lote, data_validade, quantidade")
        .in("id_produto", skus).gt("quantidade", 0).order("data_validade").limit(5000);
      if (error) throw error;
      return (data ?? []) as LoteEstoque[];
    },
  });
  const lotesPorSku = useMemo(() => {
    const m = new Map<string, LoteEstoque[]>();
    for (const l of lotesQ.data ?? []) m.set(l.id_produto, [...(m.get(l.id_produto) ?? []), l]);
    return m;
  }, [lotesQ.data]);

  const doiDias = doiEmDias(form.valor, form.unidade);
  const hoje = hojeISO();

  async function buscarDescricao() {
    const sku = form.sku.trim();
    if (!sku || form.descricao.trim() || editando) return;
    const { data } = await (supabase as any)
      .from("estoque_sistemico").select("descricao").eq("id_produto", sku).limit(1);
    const d = data?.[0]?.descricao;
    if (d) setForm((f) => ({ ...f, descricao: d }));
  }

  function editar(p: Premium) {
    const meses = p.doi_dias % DIAS_POR_MES === 0;
    setForm({
      sku: p.id_produto, descricao: p.descricao ?? "", faixa: p.faixa,
      valor: String(meses ? p.doi_dias / DIAS_POR_MES : p.doi_dias), unidade: meses ? "meses" : "dias", ativo: p.ativo,
    });
    setEditando(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function limpar() {
    setForm(FORM_VAZIO);
    setEditando(false);
    setValidadeSim("");
  }

  async function salvar() {
    const sku = form.sku.trim();
    if (!sku) return toast.error("Informe o SKU");
    if (doiDias <= 0) return toast.error("Informe o DOI (tempo de vida) maior que zero");
    if (!editando && lista.some((p) => p.id_produto === sku)) {
      return toast.error("Este SKU já está cadastrado. Use Editar na lista.");
    }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).from("premium_prioridades").upsert({
        id_produto: sku, descricao: form.descricao.trim() || null, faixa: form.faixa,
        doi_dias: doiDias, ativo: form.ativo, updated_at: new Date().toISOString(),
      }, { onConflict: "id_produto" });
      if (error) throw error;
      toast.success(editando ? "DOI atualizado" : "SKU cadastrado");
      limpar();
      qc.invalidateQueries({ queryKey: ["premium-prioridades"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p: Premium, ativo: boolean) {
    const { error } = await (supabase as any).from("premium_prioridades")
      .update({ ativo, updated_at: new Date().toISOString() }).eq("id_produto", p.id_produto);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["premium-prioridades"] });
  }

  async function excluir() {
    if (!aExcluir) return;
    setExcluindo(true);
    try {
      const { error } = await (supabase as any).from("premium_prioridades").delete().eq("id_produto", aExcluir.id_produto);
      if (error) throw error;
      toast.success("SKU removido do Farol Premium");
      setAExcluir(null);
      qc.invalidateQueries({ queryKey: ["premium-prioridades"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    } finally {
      setExcluindo(false);
    }
  }

  function alternarAberto(sku: string) {
    setAbertos((s) => { const n = new Set(s); if (n.has(sku)) n.delete(sku); else n.add(sku); return n; });
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Hourglass className="size-6" /> Cadastro de DOI</h1>
        <p className="text-sm text-muted-foreground">
          DOI é o tempo de vida do produto, da fabricação ao vencimento. Os SKUs cadastrados aqui formam o Farol Premium.
          Como o DOI é fixo, a data de fabricação do lote é estimada por <strong>validade − DOI</strong>: um lote que vence em
          janeiro e tem DOI de 5 meses foi fabricado por volta de agosto.
        </p>
      </div>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editando ? `Editando ${form.sku}` : "Novo SKU premium"}</CardTitle>
            <CardDescription>1 mês = {DIAS_POR_MES} dias, como na planilha de DOI (6 meses = 180 dias).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>SKU *</Label>
              <Input value={form.sku} disabled={editando} placeholder="Ex: 05004160"
                onChange={(e) => setForm({ ...form, sku: e.target.value })} onBlur={buscarDescricao} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} placeholder="Preenchida automaticamente se o SKU tiver estoque"
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Faixa</Label>
              <Select value={form.faixa} onValueChange={(v) => setForm({ ...form, faixa: v as Faixa })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                  <SelectItem value="Atenção">Atenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>DOI (tempo de vida) *</Label>
                <Input inputMode="decimal" value={form.valor} placeholder="Ex: 5"
                  onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={form.unidade} onValueChange={(v) => setForm({ ...form, unidade: v as Unidade })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">Meses</SelectItem>
                    <SelectItem value="dias">Dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="md:col-span-2 rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <div>
                {doiDias > 0
                  ? <>Será gravado como <strong>{doiRotulo(doiDias)}</strong>.</>
                  : <span className="text-muted-foreground">Informe o DOI para ver a conversão.</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="!mt-0">Simulador: validade do lote</Label>
                <Input type="date" className="w-44" value={validadeSim} onChange={(e) => setValidadeSim(e.target.value)} />
                {doiDias > 0 && validadeSim && (
                  <span>
                    → fabricado por volta de <strong>{fabricacaoEstimada(validadeSim, doiDias).data}</strong>{" "}
                    ({fabricacaoEstimada(validadeSim, doiDias).mes})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label className="!mt-0">Ativo no Farol Premium</Label>
            </div>
            <div className="flex justify-end gap-2">
              {editando && <Button variant="outline" onClick={limpar}>Cancelar edição</Button>}
              <Button onClick={salvar} disabled={salvando} className="gap-2">
                {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {editando ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">SKUs cadastrados ({lista.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>SKU</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Faixa</TableHead>
                <TableHead>DOI</TableHead>
                <TableHead className="text-right">Lotes em estoque</TableHead>
                <TableHead>Ativo</TableHead>
                {canWrite && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {listaQ.isLoading ? "Carregando..." : "Nenhum SKU cadastrado"}
                </TableCell></TableRow>
              )}
              {lista.map((p) => {
                const lotes = lotesPorSku.get(p.id_produto) ?? [];
                const aberto = abertos.has(p.id_produto);
                return (
                  <Fragment key={p.id_produto}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => alternarAberto(p.id_produto)} aria-label="Ver lotes">
                          {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.id_produto}</TableCell>
                      <TableCell>{p.descricao ?? "—"}</TableCell>
                      <TableCell><Badge variant={p.faixa === "Atenção" ? "default" : "outline"}>{p.faixa}</Badge></TableCell>
                      <TableCell>{doiRotulo(p.doi_dias)}</TableCell>
                      <TableCell className="text-right">{lotes.length}</TableCell>
                      <TableCell>
                        <Switch checked={p.ativo} disabled={!canWrite} onCheckedChange={(v) => alternarAtivo(p, v)} />
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => editar(p)}><Pencil className="size-3.5" /> Editar</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAExcluir(p)} aria-label="Excluir SKU">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {aberto && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={canWrite ? 7 : 6} className="bg-muted/30">
                          {lotes.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Sem estoque deste SKU em nenhum almoxarifado.</span>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Almoxarifado</TableHead>
                                  <TableHead>Lote</TableHead>
                                  <TableHead>Validade</TableHead>
                                  <TableHead>Fabricação estimada</TableHead>
                                  <TableHead className="text-right">Dias p/ vencer</TableHead>
                                  <TableHead className="text-right">Shelf</TableHead>
                                  <TableHead className="text-right">Qtd</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lotes.map((l, i) => {
                                  const val = (l.data_validade ?? "").slice(0, 10);
                                  const dias = val ? Math.round((msDe(val) - msDe(hoje)) / MS_DIA) : null;
                                  const fab = val ? fabricacaoEstimada(val, p.doi_dias) : null;
                                  const sem = dias != null ? semaforo(dias, p.doi_dias) : null;
                                  return (
                                    <TableRow key={`${l.origem}-${l.lote}-${i}`}>
                                      <TableCell>{l.origem ?? "—"}</TableCell>
                                      <TableCell className="font-mono text-xs">{l.lote ?? "—"}</TableCell>
                                      <TableCell>{val ? dataBR(msDe(val)) : "—"}</TableCell>
                                      <TableCell>{fab ? `${fab.data} (${fab.mes})` : "—"}</TableCell>
                                      <TableCell className={`text-right font-semibold ${sem?.cor ?? ""}`}>{dias == null ? "—" : dias < 0 ? "vencido" : dias}</TableCell>
                                      <TableCell className={`text-right font-semibold ${sem?.cor ?? ""}`}>
                                        {sem ? `${sem.bola} ${Math.max(Math.round(sem.shelf * 100), 0)}%` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right">{Number(l.quantidade).toLocaleString("pt-BR")}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover SKU do Farol Premium?</AlertDialogTitle>
            <AlertDialogDescription>
              «{aExcluir?.descricao ?? aExcluir?.id_produto}» deixa de aparecer no Farol Premium. O estoque não é afetado.
              Para só pausar, desligue o botão "Ativo".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }} disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {excluindo ? <Loader2 className="size-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
