// Detalhe de um fechamento de inventário (resumo, assinaturas, itens e administração).
// Usado no pop-up da lista de fechamentos e na tela própria de assinatura (link do alerta diário).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CheckCircle2, FileDown, Loader2, PenLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { lerTudo } from "@/lib/atlas-investigacao";
import { PAPEIS_ASSINATURA, assinarCiencia, corrigirAlmoxarifado, excluirFechamento, resumoFechamento, statusAssinatura, type ItemF } from "@/lib/atlas-fechamento";

export const sb = supabase as any;
export const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const un = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${un(n, 2)}%`);
export const dt = (s: string | null | undefined) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
export const dth = (s: string | null | undefined) => (s ? new Date(String(s).replace(" ", "T")).toLocaleString("pt-BR") : "—");

export async function quemSou() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = u.user ? await sb.from("profiles").select("nome, email").eq("id", u.user.id).maybeSingle() : { data: null };
  return { login: p?.email || u.user?.email || "", nome: p?.nome || p?.email || u.user?.email || "Stock Savvy" };
}

/** PDF da ciência (mesmo conteúdo do Atlas: fechamento, assinante, resumo de acurácia e itens divergentes no momento da assinatura). */
function pdfCiencia(c: any, f: any) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14); doc.text("Ciência de conciliação do fechamento de inventário", 14, 16);
  doc.setFontSize(10);
  const r = c.resumo_acuracia_snapshot ?? {};
  const linhas = [
    `Fechamento #${f.id} · ${f.almoxarifado} · ${dt(f.data_fechamento)} · arquivo ${f.arquivo_origem ?? "—"}`,
    `Assinado por ${c.gestor_nome ?? c.gestor_username} como ${PAPEIS_ASSINATURA[c.papel_assinatura] ?? c.papel_assinatura ?? "—"} em ${dth(c.data_assinatura)}`,
    `Itens divergentes: ${c.total_itens_divergentes} · valor total divergente: ${brl(c.valor_total_divergente)}`,
    `Acurácia item a item ${pct(r.item_a_item_pct)} · IAQ ${pct(r.iaq_pct)} · IAP ${pct(r.iap_pct)} · faltas ${brl(r.valor_falta)} · sobras ${brl(r.valor_sobra)} · resultado ${brl(r.resultado_liquido)}`,
  ];
  linhas.forEach((l, i) => doc.text(l, 14, 26 + i * 6));
  if (c.observacao) doc.text(`Observação: ${c.observacao}`, 14, 26 + linhas.length * 6, { maxWidth: 260 });
  autoTable(doc, {
    startY: 32 + linhas.length * 6 + (c.observacao ? 8 : 0), styles: { fontSize: 8 }, headStyles: { fillColor: [78, 127, 132] },
    head: [["SKU", "Descrição", "Almox.", "Sistema", "Contagem", "Divergência", "Valor (R$)"]],
    body: (c.itens_divergentes_snapshot ?? []).map((i: any) => [i.sku, i.descricao ?? "", i.almoxarifado, un(i.qtd_sistema, 3), un(i.qtd_contagem, 3), un(i.divergencia_qtd, 3), un(i.valor_estimado, 2)]),
  });
  doc.save(`ciencia_fechamento_${f.id}_${String(c.data_assinatura).slice(0, 10).replace(/-/g, "")}.pdf`);
}

type DetalheProps = { id: number; gestor: boolean; assina: boolean; almoxes: { codigo: string; nome_exibicao: string }[]; onClose: () => void; onMudou: () => void; papelInicial?: string };

/** Pop-up sobre a lista de fechamentos. */
export function FechamentoDetalheDialog(props: DetalheProps) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && props.onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <FechamentoDetalhe {...props} onOcupado={setOcupado} />
      </DialogContent>
    </Dialog>
  );
}

/** Conteúdo do fechamento; em tela própria (comoPagina) o título vira cabeçalho da página. */
export function FechamentoDetalhe({ id, gestor, assina, almoxes, onClose, onMudou, papelInicial, comoPagina, onOcupado }: DetalheProps & { comoPagina?: boolean; onOcupado?: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ["atlas-fechamento", id],
    queryFn: async () => {
      const [f, itens, ciencias] = await Promise.all([
        sb.from("atlas_fechamentos_inventario").select("*").eq("id", id).single(),
        lerTudo<ItemF>("atlas_itens_fechamento", "*", (x) => x.eq("fechamento_id", id)),
        sb.from("atlas_conciliacoes_ciencia").select("*").eq("fechamento_id", id).order("data_assinatura", { ascending: false }),
      ]);
      const skus = [...new Set(itens.map((i) => i.sku))];
      const custos = new Map<string, number>();
      for (let i = 0; i < skus.length; i += 300) { const { data } = await sb.from("atlas_produtos").select("sku, custo_unitario").in("sku", skus.slice(i, i + 300)).not("custo_unitario", "is", null); for (const p of data ?? []) custos.set(p.sku, Number(p.custo_unitario)); }
      return { f: f.data, itens, ciencias: (ciencias.data ?? []) as any[], custos };
    },
  });
  const [soDiv, setSoDiv] = useState(true);
  const [ass, setAss] = useState({ papel: papelInicial && PAPEIS_ASSINATURA[papelInicial] ? papelInicial : "", obs: "" });
  const [novoAlmox, setNovoAlmox] = useState("");
  const [ocupado, setOcupadoLocal] = useState(false);
  const setOcupado = (v: boolean) => { setOcupadoLocal(v); onOcupado?.(v); };
  const d = q.data;
  const resumo = useMemo(() => (d ? resumoFechamento(d.itens, d.custos) : null), [d]);
  const st = d ? statusAssinatura(d.ciencias.map((c) => c.papel_assinatura)) : null;
  const itens = (d?.itens ?? []).filter((i) => !soDiv || i.divergente).sort((a, b) => Number(b.destaque_recorrente) - Number(a.destaque_recorrente) || Math.abs(Number(b.valor_estimado)) - Math.abs(Number(a.valor_estimado)));

  async function acao(fn: () => Promise<unknown>, ok: string, fechar = false) {
    setOcupado(true);
    try { await fn(); toast.success(ok); onMudou(); if (fechar) onClose(); } catch (e: any) { toast.error(e?.message ?? String(e)); }
    setOcupado(false);
  }

  return (
    <>
        {comoPagina
          ? <h2 className="text-lg font-semibold">Fechamento #{id}{d?.f ? ` · ${d.f.almoxarifado} · ${dt(d.f.data_fechamento)}` : ""}</h2>
          : <DialogHeader><DialogTitle>Fechamento #{id}{d?.f ? ` · ${d.f.almoxarifado} · ${dt(d.f.data_fechamento)}` : ""}</DialogTitle></DialogHeader>}
        {!d || !resumo || !st ? <Loader2 className="mx-auto size-5 animate-spin" /> : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {[["Itens", un(resumo.total_itens)], ["Divergentes", un(resumo.total_divergentes)], ["Item a item", pct(resumo.item_a_item_pct)], ["IAQ", pct(resumo.iaq_pct)], ["IAP", pct(resumo.iap_pct)], ["Resultado", brl(resumo.resultado_liquido)]].map(([r, v]) => <div key={r} className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{r}</div><div className="font-semibold">{v}</div></div>)}
            </div>
            <div className="text-xs text-muted-foreground">Faltas {brl(resumo.valor_falta)} em {resumo.itens_com_falta} itens · sobras {brl(resumo.valor_sobra)} em {resumo.itens_com_sobra} itens · arquivo {d.f.arquivo_origem} · importado por {d.f.criado_por} em {dth(d.f.criado_em)}</div>
            <Tabs defaultValue="assinaturas">
              <TabsList><TabsTrigger value="assinaturas">Assinaturas ({st.assinados.length}/3)</TabsTrigger><TabsTrigger value="itens">Itens</TabsTrigger>{gestor && <TabsTrigger value="admin">Administração</TabsTrigger>}</TabsList>
              <TabsContent value="assinaturas" className="space-y-3">
                <div className={`rounded-md px-3 py-2 text-sm ${st.fechado ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}>
                  {st.fechado ? <><CheckCircle2 className="mr-1 inline size-4" /> Inventário fechado — as três ciências foram registradas.</> : <>Inventário em aberto. Falta: {st.faltantes.join(", ")}.{d.f.aprovado_manual ? ` (Aprovado manualmente por ${d.f.aprovado_manual_por} em ${dt(d.f.aprovado_manual_em)}.)` : ""}</>}
                </div>
                {assina && (
                  <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                    <div className="w-60"><Label className="text-xs">Assinar como</Label><Select value={ass.papel} onValueChange={(v) => setAss({ ...ass, papel: v })}><SelectTrigger className="h-8"><SelectValue placeholder="Papel" /></SelectTrigger><SelectContent>{Object.entries(PAPEIS_ASSINATURA).map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent></Select></div>
                    <div className="min-w-[240px] flex-1"><Label className="text-xs">Observação (opcional)</Label><Textarea rows={1} className="min-h-8" value={ass.obs} onChange={(e) => setAss({ ...ass, obs: e.target.value })} /></div>
                    <Button size="sm" className="gap-1" disabled={!ass.papel || ocupado} onClick={() => { if (!confirm(`Registrar sua ciência como ${PAPEIS_ASSINATURA[ass.papel]} para ${resumo.total_divergentes} itens divergentes (${brl(resumo.valor_falta + resumo.valor_sobra)})?`)) return; acao(async () => { await assinarCiencia(id, ass.papel, ass.obs.trim() || null, d.itens, d.custos, await quemSou()); setAss({ papel: "", obs: "" }); }, "Ciência registrada."); }}><PenLine className="size-4" /> Assinar ciência</Button>
                  </div>
                )}
                <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">Quando</th><th className="p-1">Quem</th><th className="p-1">Papel</th><th className="p-1 text-right">Itens</th><th className="p-1 text-right">Valor</th><th className="p-1">Observação</th><th className="p-1" /></tr></thead>
                  <tbody>{d.ciencias.map((c) => <tr key={c.id} className="border-t"><td className="p-1">{dth(c.data_assinatura)}</td><td className="p-1">{c.gestor_nome || c.gestor_username}</td><td className="p-1">{PAPEIS_ASSINATURA[c.papel_assinatura] ?? c.papel_assinatura ?? "—"}</td><td className="p-1 text-right">{c.total_itens_divergentes}</td><td className="p-1 text-right">{brl(c.valor_total_divergente)}</td><td className="max-w-[220px] truncate p-1">{c.observacao ?? ""}</td><td className="p-1"><button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => pdfCiencia(c, d.f)}><FileDown className="size-3.5" /> PDF</button></td></tr>)}
                    {!d.ciencias.length && <tr><td colSpan={7} className="p-2 text-center text-muted-foreground">Nenhuma assinatura ainda.</td></tr>}</tbody></table>
              </TabsContent>
              <TabsContent value="itens">
                <label className="mb-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soDiv} onChange={(e) => setSoDiv(e.target.checked)} /> Só divergentes</label>
                <div className="max-h-[50vh] overflow-auto rounded-md border"><table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card"><tr className="text-left text-muted-foreground"><th className="p-1">SKU</th><th className="p-1">Descrição</th><th className="p-1 text-right">Sistema</th><th className="p-1 text-right">Contagem</th><th className="p-1 text-right">Diverg.</th><th className="p-1 text-right">Valor</th><th className="p-1">Resumo / obs. pós-inventário</th></tr></thead>
                  <tbody>{itens.map((i) => <tr key={i.id} className="border-t"><td className="p-1 font-mono">{i.sku}{i.destaque_recorrente && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title={`Divergiu em ${i.recorrencias_anteriores} fechamento(s) anterior(es)`}>recorrente {i.recorrencias_anteriores}×</span>}</td><td className="max-w-[220px] truncate p-1">{i.descricao_produto}</td><td className="p-1 text-right">{un(i.qtd_sistema, 3)}</td><td className="p-1 text-right">{un(i.qtd_contagem, 3)}</td><td className={`p-1 text-right ${Number(i.divergencia_qtd) < 0 ? "text-destructive" : Number(i.divergencia_qtd) > 0 ? "text-emerald-700" : ""}`}>{un(i.divergencia_qtd, 3)}</td><td className="p-1 text-right">{brl(i.valor_estimado)}</td><td className="max-w-[260px] truncate p-1 text-muted-foreground" title={[i.resumo_planilha, i.observacao_pos_inventario].filter(Boolean).join(" · ")}>{[i.resumo_planilha, i.observacao_pos_inventario].filter(Boolean).join(" · ")}</td></tr>)}</tbody>
                </table></div>
              </TabsContent>
              {gestor && (
                <TabsContent value="admin" className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                    <div className="w-60"><Label className="text-xs">Corrigir almoxarifado (fechamento, itens, divergências e histórico)</Label><Select value={novoAlmox} onValueChange={setNovoAlmox}><SelectTrigger className="h-8"><SelectValue placeholder={d.f.almoxarifado} /></SelectTrigger><SelectContent>{almoxes.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome_exibicao || a.codigo}</SelectItem>)}</SelectContent></Select></div>
                    <Button size="sm" variant="outline" disabled={!novoAlmox || novoAlmox === d.f.almoxarifado || ocupado} onClick={() => acao(async () => corrigirAlmoxarifado(id, novoAlmox, (await quemSou()).nome), "Almoxarifado corrigido.")}>Corrigir</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <span className="text-xs">Aprovação manual (fechamentos antigos, de antes das três assinaturas): <strong>{d.f.aprovado_manual ? `sim, por ${d.f.aprovado_manual_por}` : "não"}</strong></span>
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => acao(async () => { const eu = await quemSou(); await sb.from("atlas_fechamentos_inventario").update(d.f.aprovado_manual ? { aprovado_manual: false, aprovado_manual_por: null, aprovado_manual_em: null } : { aprovado_manual: true, aprovado_manual_por: eu.nome, aprovado_manual_em: new Date().toISOString() }).eq("id", id); }, "Aprovação manual atualizada.")}>{d.f.aprovado_manual ? "Desfazer aprovação manual" : "Aprovar manualmente"}</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3">
                    <span className="text-xs">Excluir o fechamento remove os itens, as divergências, o histórico, as ações e as ciências gerados por ele.</span>
                    <Button size="sm" variant="destructive" className="gap-1" disabled={ocupado} onClick={() => { if (!confirm(`Excluir o fechamento #${id} e tudo que ele gerou? Não dá para desfazer.`)) return; acao(async () => excluirFechamento(id, (await quemSou()).nome), "Fechamento excluído.", true); }}><Trash2 className="size-4" /> Excluir fechamento</Button>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
    </>
  );
}
