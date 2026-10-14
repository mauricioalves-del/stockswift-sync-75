import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileSignature, Download, Loader2, Undo2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { CLASSES_PORTFOLIO, chaveSkuPortfolio, elegivelPortfolio, ultimasClassificacoes, type ClassificacaoPortfolio } from "@/lib/abastecimento-portfolio";
import { situacaoCompetencia, nomeMes, baixarDocumento, type Validacao } from "@/lib/abastecimento-validacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const sb = supabase as any;
const validacaoQuery = queryOptions({
  queryKey: ["abast-validacao"],
  queryFn: async () => {
    const [{ data: lojas }, grupos, produtos, classes, vals] = await Promise.all([
      sb.from("abast_lojas").select("codigo, nome").eq("ativo", true).order("ordem"),
      fetchAll<any>((f, t) => sb.from("grupo_produtos").select("codigo_produto, grupo").order("codigo_produto").range(f, t)),
      fetchAll<any>((f, t) => sb.from("abast_produto").select("id_produto, descricao").order("id_produto").range(f, t)),
      fetchAll<ClassificacaoPortfolio>((f, t) => sb.from("abast_classificacoes_portfolio").select("*").order("registrado_em", { ascending: false }).order("id").range(f, t)),
      fetchAll<Validacao>((f, t) => sb.from("abast_validacoes_portfolio").select("*").order("aprovado_em", { ascending: false }).range(f, t)),
    ]);
    return { lojas: (lojas ?? []) as { codigo: string; nome: string }[], grupos, produtos, classes, vals };
  },
});

export const Route = createFileRoute("/_authenticated/abastecimento/validacao")({
  loader: ({ context }) => context.queryClient.ensureQueryData(validacaoQuery),
  component: ValidacaoPage,
  head: () => ({ meta: [{ title: "Validação do Gestor — Abastecimento Mágio" }, { name: "description", content: "Validação mensal do portfólio por loja com assinatura, versão e documento de aprovação." }, { property: "og:title", content: "Validação do Gestor — Mágio" }, { property: "og:description", content: "Aprovação mensal auditável do portfólio de abastecimento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

function ValidacaoPage() {
  const { data } = useSuspenseQuery(validacaoQuery); const { isAdmin, role } = useRole(); const qc = useQueryClient();
  const gestor = isAdmin || role === "GERENTE";
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [competencia, setCompetencia] = useState(hoje.slice(0, 7));
  const [loja, setLoja] = useState(data.lojas[0]?.codigo ?? "");
  const [busca, setBusca] = useState(""); const [obs, setObs] = useState(""); const [salvando, setSalvando] = useState(false);
  const nomeLoja = (c: string) => data.lojas.find((l) => l.codigo === c)?.nome ?? c;
  const desc = useMemo(() => new Map(data.produtos.map((p: any) => [chaveSkuPortfolio(p.id_produto), p.descricao])), [data.produtos]);
  const grupoDe = useMemo(() => new Map(data.grupos.map((g: any) => [chaveSkuPortfolio(g.codigo_produto), g.grupo])), [data.grupos]);
  const ref = `${competencia}-01` > hoje ? `${competencia}-01` : hoje;
  const cls = useMemo(() => ultimasClassificacoes(data.classes.filter((c) => c.vigencia <= ref)), [data.classes, ref]);
  // Lista de trabalho = planilha importada em Parâmetros › Portfólio e Classificação (classificação vigente)
  const itens = useMemo(() => [...cls.values()].sort((a, b) => a.sku.localeCompare(b.sku)).map((c) => {
    const k = chaveSkuPortfolio(c.sku);
    return { sku: k, descricao: c.descricao || (desc.get(k) ?? "") as string, categoria: (grupoDe.get(k) ?? null) as string | null, ativoAtual: true, classe: c.classe, semClasse: false, elegivelClasse: elegivelPortfolio(c.classe, c.inicio_inovacao, ref) };
  }), [cls, desc, grupoDe, ref]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const sit0 = situacaoCompetencia(data.vals, loja, competencia);
  useEffect(() => { const v = sit0.validacao; setSel(new Set(v ? v.itens.filter((i) => i.ativo).map((i) => chaveSkuPortfolio(i.sku)).filter((k) => itens.some((x) => x.sku === k)) : itens.map((i) => i.sku))); }, [itens, sit0.validacao?.id]);
  const sit = situacaoCompetencia(data.vals, loja, competencia);
  const lista = itens.filter((i) => `${i.sku} ${i.descricao}`.toLowerCase().includes(busca.toLowerCase()));
  const ativos = itens.filter((i) => sel.has(i.sku));
  const cont = (k: string) => ativos.filter((i) => i.classe === k).length;
  const elegiveis = ativos.filter((i) => i.elegivelClasse).length;
  const historico = data.vals.filter((v) => v.loja === loja);
  const uploads = useMemo(() => { const m = new Map<string, ClassificacaoPortfolio & { n: number }>(); for (const c of data.classes) { const o = m.get((c as any).importacao_id); if (o) o.n++; else m.set((c as any).importacao_id, { ...c, n: 1 }); } return [...m.values()].slice(0, 3); }, [data.classes]);

  async function assinar() {
    if (!gestor || !loja) return; setSalvando(true);
    try {
      const { data: r, error } = await sb.rpc("abast_validar_portfolio", { p_competencia: competencia, p_loja: loja, p_skus: [...sel], p_observacao: obs });
      if (error) throw error;
      const { data: v, error: e2 } = await sb.from("abast_validacoes_portfolio").select("*").eq("id", r.id).single();
      if (e2) throw e2;
      baixarDocumento(v as Validacao, nomeLoja(loja));
      setObs(""); toast.success(`Portfólio de ${nomeMes(competencia)} validado (versão ${r.versao}). Lista de abastecimento atualizada.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["abast-validacao"] }), qc.invalidateQueries({ queryKey: ["abast-v2"] }), qc.invalidateQueries({ queryKey: ["abast-dash-hist"] })]);
    } catch (e: any) { toast.error(e?.message ?? "Validação não registrada"); } finally { setSalvando(false); }
  }
  async function desfazer(v: Validacao) {
    const motivo = window.prompt("Motivo para desfazer a validação (o registro é mantido no histórico):"); if (!motivo) return;
    const { error } = await sb.rpc("abast_desfazer_validacao", { p_id: v.id, p_motivo: motivo });
    if (error) return toast.error(error.message);
    toast.success("Validação desfeita — o registro continua no histórico"); qc.invalidateQueries({ queryKey: ["abast-validacao"] });
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><BadgeCheck className="size-6" />Validação do Gestor</h1>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-semibold text-muted-foreground">Competência<Input type="month" value={competencia} onChange={(e) => e.target.value && setCompetencia(e.target.value)} className="mt-1" /></label>
        <label className="text-xs font-semibold text-muted-foreground">Loja<select value={loja} onChange={(e) => setLoja(e.target.value)} className="mt-1 block h-9 min-w-48 rounded-md border bg-background px-2 text-sm">{data.lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}</select></label>
      </div>
    </header>

    <section className="rounded-lg border p-4 space-y-2">
      {sit.tipo === "VALIDADA" && <p><Badge className="mr-2">Validado</Badge><b>{nomeMes(competencia)}</b> validado em {new Date(sit.validacao.aprovado_em).toLocaleString("pt-BR")} por <b>{sit.validacao.aprovador_nome}</b> · versão {sit.validacao.versao} · {sit.validacao.totais.ativos} SKU(s) ativos.</p>}
      {sit.tipo === "HERDADA" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /><span><b>Pendente de validação — utilizando última versão aprovada</b>: {nomeMes(sit.validacao.competencia)} v{sit.validacao.versao}, aprovada por {sit.validacao.aprovador_nome}. A herança não é uma nova aprovação.</span></p>}
      {sit.tipo === "SEM" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /><b>Sem portfólio validado</b> para {nomeLoja(loja)}.</p>}
      <p className="text-xs text-muted-foreground">Delegação do portfólio (planilha de classificação): {uploads.length ? uploads.map((u) => `${u.arquivo || "Edição manual"} · ${new Date(u.registrado_em).toLocaleString("pt-BR")} · ${u.n} SKUs`).join(" | ") : "nenhum upload registrado"}</p>
    </section>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      {[["Total", itens.length], ["Ativos", ativos.length], ["Elegíveis OOS", elegiveis], ...Object.entries(CLASSES_PORTFOLIO).map(([k, n]) => [n, cont(k)])].map(([k, n]) => <div key={k as string} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="text-2xl font-bold">{n}</div></div>)}
    </div>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Lista do portfólio (planilha de Parâmetros) · {nomeLoja(loja)}</h2>
        <div className="flex gap-2"><Input placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />
          <Button variant="outline" size="sm" disabled={!gestor} onClick={() => setSel(new Set(itens.map((i) => i.sku)))}>Marcar todos</Button>
          <Button variant="outline" size="sm" disabled={!gestor} onClick={() => setSel(new Set())}>Desmarcar</Button></div>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead className="w-10">Ativo</TableHead><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Grupo</TableHead><TableHead>Classe</TableHead><TableHead>Meta OOS</TableHead></TableRow></TableHeader>
        <TableBody>{lista.map((i) => <TableRow key={i.sku}><TableCell><Checkbox aria-label={`Ativo ${i.sku}`} disabled={!gestor} checked={sel.has(i.sku)} onCheckedChange={(c) => setSel((s) => { const n = new Set(s); c ? n.add(i.sku) : n.delete(i.sku); return n; })} /></TableCell><TableCell>{i.sku}</TableCell><TableCell className="whitespace-normal text-xs">{i.descricao}</TableCell><TableCell className="text-xs">{i.categoria ?? "—"}</TableCell><TableCell>{CLASSES_PORTFOLIO[i.classe]}{i.semClasse && <span className="text-muted-foreground"> *</span>}</TableCell><TableCell className="text-xs">{!sel.has(i.sku) ? "Não ativo" : i.elegivelClasse ? "Elegível" : "Fora da meta"}</TableCell></TableRow>)}
          {!lista.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma classificação vigente — importe a lista em Parâmetros › Portfólio e Classificação</TableCell></TableRow>}</TableBody></Table></div>
      <p className="text-xs text-muted-foreground">* Sem classificação registrada: tratado como Linha.</p>
      {gestor ? <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <Textarea placeholder="Observação da aprovação (opcional)" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-10 max-w-xl" />
        <Button disabled={salvando || !itens.length} onClick={() => void assinar()}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}{sit.tipo === "VALIDADA" ? "Revalidar (nova versão)" : `Assinar e validar ${nomeMes(competencia)}`}</Button>
        <span className="text-xs text-muted-foreground">Ao assinar, somente os itens marcados passam a compor o planejamento de abastecimento e os indicadores desta loja, e o documento de aprovação é baixado.</span>
      </div> : <p className="text-sm text-muted-foreground">Somente gestores (Administrador ou Gerente) podem assinar a validação.</p>}
    </section>

    <section className="space-y-3"><h2 className="font-semibold">Histórico de validações · {nomeLoja(loja)}</h2>
      <div className="overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Versão</TableHead><TableHead>Status</TableHead><TableHead>Aprovado por</TableHead><TableHead>Data/hora</TableHead><TableHead>Ativos</TableHead><TableHead>Alterações</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{historico.map((v) => <TableRow key={v.id}><TableCell>{nomeMes(v.competencia)}</TableCell><TableCell>v{v.versao}</TableCell><TableCell><Badge variant={v.status === "VALIDADA" ? "secondary" : "outline"}>{v.status === "VALIDADA" ? "Validada" : "Desfeita"}</Badge></TableCell><TableCell>{v.aprovador_nome}</TableCell><TableCell className="text-xs">{new Date(v.aprovado_em).toLocaleString("pt-BR")}</TableCell><TableCell>{v.totais.ativos}</TableCell><TableCell className="text-xs">{v.diff.primeira_validacao ? "Primeira validação" : `+${v.diff.incluidos?.length ?? 0} / −${v.diff.retirados?.length ?? 0} / ${v.diff.reclassificados?.length ?? 0} reclass.`}</TableCell>
          <TableCell className="flex gap-1"><Button size="sm" variant="outline" onClick={() => baixarDocumento(v, nomeLoja(v.loja))}><Download className="size-4" />Documento</Button>{gestor && v.status === "VALIDADA" && <Button size="sm" variant="ghost" onClick={() => void desfazer(v)}><Undo2 className="size-4" />Desfazer</Button>}</TableCell></TableRow>)}
          {!historico.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma validação registrada</TableCell></TableRow>}</TableBody></Table></div>
    </section>
  </div>;
}
