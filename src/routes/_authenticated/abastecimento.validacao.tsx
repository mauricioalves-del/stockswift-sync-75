import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileSignature, Download, Loader2, Undo2, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { CLASSES_PORTFOLIO, chaveSkuPortfolio, elegivelPortfolio, ultimasClassificacoes, type ClassificacaoPortfolio } from "@/lib/abastecimento-portfolio";
import { situacaoCompetencia, nomeMes, baixarDocumento, uniaoCD, situacaoCD, LOJA_CD, NOME_CD, type PapeisValidacao, type Validacao } from "@/lib/abastecimento-validacao";
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
  const { data } = useSuspenseQuery(validacaoQuery); const qc = useQueryClient();
  // Quem pode assinar vem do banco: Gerente Comercial (lojas) e Diretor Operacional (ciência do Almox SP) são signatários designados pelo administrador
  const papeisQ = useQuery({ queryKey: ["abast-papeis-validacao"], queryFn: async (): Promise<PapeisValidacao> => { const { data: r } = await sb.rpc("abast_papeis_validacao"); return { gerente_comercial: !!r?.gerente_comercial, diretor_operacional: !!r?.diretor_operacional, admin: !!r?.admin }; } });
  const papeis: PapeisValidacao = papeisQ.data ?? { gerente_comercial: false, diretor_operacional: false, admin: false };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [competencia, setCompetencia] = useState(hoje.slice(0, 7));
  const [loja, setLoja] = useState(data.lojas[0]?.codigo ?? "");
  const [busca, setBusca] = useState(""); const [obs, setObs] = useState(""); const [salvando, setSalvando] = useState(false);
  const [filtroCard, setFiltroCard] = useState<string | null>(null);
  const [filtroCardCD, setFiltroCardCD] = useState<string | null>(null);
  const ehCD = loja === LOJA_CD;
  const gestor = ehCD ? papeis.diretor_operacional : papeis.gerente_comercial;   // quem assina nesta tela
  const nomeLoja = (c: string) => (c === LOJA_CD ? NOME_CD : data.lojas.find((l) => l.codigo === c)?.nome ?? c);
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
  const lista = itens.filter((i) => `${i.sku} ${i.descricao}`.toLowerCase().includes(busca.toLowerCase())).filter((i) => {
    if (!filtroCard || filtroCard === "Total") return true;
    if (filtroCard === "Ativos") return sel.has(i.sku);
    if (filtroCard === "Elegíveis OOS") return sel.has(i.sku) && i.elegivelClasse;
    return i.classe === filtroCard;
  });
  const ativos = itens.filter((i) => sel.has(i.sku));
  const cont = (k: string) => ativos.filter((i) => i.classe === k).length;
  const elegiveis = ativos.filter((i) => i.elegivelClasse).length;
  const historico = data.vals.filter((v) => v.loja === loja);
  const codigosLojas = useMemo(() => data.lojas.map((l) => l.codigo), [data.lojas]);
  const itensCD = useMemo(() => uniaoCD(data.vals, codigosLojas), [data.vals, codigosLojas]);
  const sitCD = situacaoCD(data.vals, codigosLojas, competencia);
  const listaCD = itensCD.filter((i) => `${i.sku} ${i.descricao}`.toLowerCase().includes(busca.toLowerCase())).filter((i) => !filtroCardCD || i.classe === filtroCardCD);
  const contCD = (k: string) => itensCD.filter((i) => i.classe === k).length;
  const uploads = useMemo(() => { const m = new Map<string, ClassificacaoPortfolio & { n: number }>(); for (const c of data.classes) { const o = m.get((c as any).importacao_id); if (o) o.n++; else m.set((c as any).importacao_id, { ...c, n: 1 }); } return [...m.values()].slice(0, 3); }, [data.classes]);

  async function assinar() {
    if (!gestor || !loja) return; setSalvando(true);
    try {
      if (ehCD) {
        const { data: r, error } = await sb.rpc("abast_validar_cd", { p_competencia: competencia, p_observacao: obs });
        if (error) throw error;
        const { data: v, error: e2 } = await sb.from("abast_validacoes_portfolio").select("*").eq("id", r.id).single();
        if (e2) throw e2;
        baixarDocumento(v as Validacao, NOME_CD, nomeLoja);
        setObs(""); toast.success(`Ciência do Almox SP registrada (versão ${r.versao}) — ${r.itens} itens a manter em estoque.`);
        await qc.invalidateQueries({ queryKey: ["abast-validacao"] }); return;
      }
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
        <label className="text-xs font-semibold text-muted-foreground">Loja<select value={loja} onChange={(e) => { setLoja(e.target.value); setFiltroCard(null); setFiltroCardCD(null); }} className="mt-1 block h-9 min-w-48 rounded-md border bg-background px-2 text-sm">{data.lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}<option value={LOJA_CD}>{NOME_CD}</option></select></label>
      </div>
    </header>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {[...data.lojas.map((l) => ({ codigo: l.codigo, nome: l.nome })), { codigo: LOJA_CD, nome: NOME_CD }].map((l) => {
        const cd = l.codigo === LOJA_CD; const s = situacaoCompetencia(data.vals, l.codigo, competencia); const c = situacaoCD(data.vals, codigosLojas, competencia);
        const tipo = cd ? c.tipo : s.tipo; const v = cd ? c.validacao : s.validacao;
        const cor = tipo === "VALIDADA" && !(cd && c.desatualizada) ? "border-l-emerald-500" : tipo === "SEM" ? "border-l-red-500" : "border-l-amber-500";
        return <button key={l.codigo} type="button" onClick={() => setLoja(l.codigo)} className={`rounded-lg border border-l-4 p-3 text-left transition hover:shadow ${cor} ${loja === l.codigo ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center justify-between"><span className="font-semibold">{l.nome}</span><span className="text-[11px] text-muted-foreground">{cd ? "ciência do Diretor Operacional" : "validação do Gerente Comercial"}</span></div>
          <div className="mt-1 text-xs">{tipo === "SEM" ? <span className="font-semibold text-red-600">{cd ? "Sem ciência registrada" : "Sem portfólio validado"}</span> : <span><b className={tipo === "VALIDADA" ? "text-emerald-700" : "text-amber-700"}>{tipo === "VALIDADA" ? (cd ? "Ciência dada" : "Validado") : "Pendente (usa a última versão)"}</b> · v{v!.versao} · {v!.aprovador_nome} · {v!.totais.ativos} SKUs</span>}</div>
          {cd && c.desatualizada && <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700"><AlertTriangle className="size-3" />Lojas mudaram depois da ciência (+{c.incluidos.length} / −{c.retirados.length}): nova ciência necessária</div>}
        </button>;
      })}
    </section>

    <section className="rounded-lg border p-4 space-y-2">
      {!ehCD && sit.tipo === "VALIDADA" && <p><Badge className="mr-2">Validado</Badge><b>{nomeMes(competencia)}</b> validado em {new Date(sit.validacao.aprovado_em).toLocaleString("pt-BR")} por <b>{sit.validacao.aprovador_nome}</b> · versão {sit.validacao.versao} · {sit.validacao.totais.ativos} SKU(s) ativos.</p>}
      {!ehCD && sit.tipo === "HERDADA" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /><span><b>Pendente de validação — utilizando última versão aprovada</b>: {nomeMes(sit.validacao.competencia)} v{sit.validacao.versao}, aprovada por {sit.validacao.aprovador_nome}. A herança não é uma nova aprovação.</span></p>}
      {!ehCD && sit.tipo === "SEM" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /><b>Sem portfólio validado</b> para {nomeLoja(loja)}.</p>}
      {ehCD && sitCD.tipo === "VALIDADA" && <p><Badge className="mr-2">Ciência dada</Badge><b>{nomeMes(competencia)}</b> · ciência do Diretor Operacional em {new Date(sitCD.validacao!.aprovado_em).toLocaleString("pt-BR")} por <b>{sitCD.validacao!.aprovador_nome}</b> · versão {sitCD.validacao!.versao} · {sitCD.validacao!.totais.ativos} itens a manter em estoque.</p>}
      {ehCD && sitCD.tipo === "HERDADA" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /><span><b>Pendente de nova ciência — vale a última</b>: {nomeMes(sitCD.validacao!.competencia)} v{sitCD.validacao!.versao}, por {sitCD.validacao!.aprovador_nome}.</span></p>}
      {ehCD && sitCD.tipo === "SEM" && <p className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /><b>Sem ciência registrada</b> para o {NOME_CD}.</p>}
      {ehCD && sitCD.desatualizada && <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><b>Ciência desatualizada:</b> o Gerente Comercial alterou o portfólio das lojas depois dela. {sitCD.incluidos.length ? <>Incluídos: <b>{sitCD.incluidos.join(", ")}</b>. </> : null}{sitCD.retirados.length ? <>Retirados: <b>{sitCD.retirados.join(", ")}</b>. </> : null}O Diretor Operacional precisa dar nova ciência.</span></p>}
      {!ehCD && <p className="text-xs text-muted-foreground">Delegação do portfólio (planilha de classificação): {uploads.length ? uploads.map((u) => `${u.arquivo || "Edição manual"} · ${new Date(u.registrado_em).toLocaleString("pt-BR")} · ${u.n} SKUs`).join(" | ") : "nenhum upload registrado"}</p>}
    </section>

    {!ehCD ? <>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      {[{ id: "Total", rotulo: "Total", n: itens.length }, { id: "Ativos", rotulo: "Ativos", n: ativos.length }, { id: "Elegíveis OOS", rotulo: "Elegíveis OOS", n: elegiveis }, ...Object.entries(CLASSES_PORTFOLIO).map(([k, rotulo]) => ({ id: k, rotulo: String(rotulo), n: cont(k) }))].map((c) => (
        <CardFiltro key={c.id} rotulo={c.rotulo} valor={c.n} ativo={filtroCard === c.id} onClick={() => setFiltroCard((f) => (f === c.id ? null : c.id))} />
      ))}
    </div>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Lista do portfólio (planilha de Parâmetros) · {nomeLoja(loja)}{filtroCard && filtroCard !== "Total" && <span className="ml-2 text-xs font-normal text-muted-foreground">filtro: {rotuloFiltro(filtroCard)} <button type="button" className="underline" onClick={() => setFiltroCard(null)}>limpar</button></span>}</h2>
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
      </div> : <p className="text-sm text-muted-foreground">Somente o Gerente Comercial (signatário designado pelo administrador) pode assinar a validação das lojas.</p>}
    </section>
    </> : <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[{ id: "TOTAL", rotulo: "Itens a manter em estoque", n: itensCD.length }, ...Object.entries(CLASSES_PORTFOLIO).map(([k, rotulo]) => ({ id: k, rotulo: String(rotulo), n: contCD(k) })), { id: "LOJAS", rotulo: "Lojas com portfólio validado", n: new Set(data.vals.filter((v) => v.status === "VALIDADA" && codigosLojas.includes(v.loja)).map((v) => v.loja)).size + " de " + codigosLojas.length }].map((c) => (
          <CardFiltro key={c.id} rotulo={c.rotulo} valor={c.n} ativo={filtroCardCD === c.id} onClick={() => setFiltroCardCD((f) => (f === c.id || c.id === "TOTAL" || c.id === "LOJAS" ? null : c.id))} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Itens aprovados pelo Gerente Comercial · o {NOME_CD} deve manter estoque{filtroCardCD && <span className="ml-2 text-xs font-normal text-muted-foreground">filtro: {(CLASSES_PORTFOLIO as Record<string, string>)[filtroCardCD] ?? filtroCardCD} <button type="button" className="underline" onClick={() => setFiltroCardCD(null)}>limpar</button></span>}</h2>
        <Input placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Grupo</TableHead><TableHead>Classe</TableHead><TableHead>Meta OOS</TableHead><TableHead>Aprovado nas lojas</TableHead></TableRow></TableHeader>
        <TableBody>{listaCD.map((i) => <TableRow key={i.sku}><TableCell>{i.sku}</TableCell><TableCell className="whitespace-normal text-xs">{i.descricao}</TableCell><TableCell className="text-xs">{i.categoria ?? "—"}</TableCell><TableCell>{CLASSES_PORTFOLIO[i.classe]}</TableCell><TableCell className="text-xs">{i.elegivel ? "Elegível" : "Fora da meta"}</TableCell><TableCell className="text-xs">{(i.lojas ?? []).map(nomeLoja).join(", ")}{(i.lojas ?? []).length < codigosLojas.length && <span className="ml-1 text-amber-700">(não é de todas as lojas)</span>}</TableCell></TableRow>)}
          {!listaCD.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma loja tem portfólio validado pelo Gerente Comercial ainda — a lista do {NOME_CD} é montada a partir das validações das lojas.</TableCell></TableRow>}</TableBody></Table></div>
      {gestor ? <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <Textarea placeholder="Observação da ciência (opcional)" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} className="min-h-10 max-w-xl" />
        <Button disabled={salvando || !itensCD.length} onClick={() => void assinar()}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}{sitCD.tipo === "VALIDADA" ? "Dar nova ciência (nova versão)" : `Dar ciência de ${nomeMes(competencia)}`}</Button>
        <span className="text-xs text-muted-foreground">Ao dar ciência, o Diretor Operacional declara que o {NOME_CD} deve manter estoque dos itens acima, aprovados pelo Gerente Comercial. Se as lojas mudarem depois, a ciência fica desatualizada e é preciso dá-la de novo. O termo de ciência é baixado.</span>
      </div> : <p className="text-sm text-muted-foreground">Somente o Diretor Operacional (signatário designado pelo administrador) pode dar ciência do {NOME_CD}.</p>}
    </section>}

    <section className="space-y-3"><h2 className="font-semibold">Histórico de validações · {nomeLoja(loja)}</h2>
      <div className="overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Versão</TableHead><TableHead>Status</TableHead><TableHead>Aprovado por</TableHead><TableHead>Data/hora</TableHead><TableHead>Ativos</TableHead><TableHead>Alterações</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{historico.map((v) => <TableRow key={v.id}><TableCell>{nomeMes(v.competencia)}</TableCell><TableCell>v{v.versao}</TableCell><TableCell><Badge variant={v.status === "VALIDADA" ? "secondary" : "outline"}>{v.status === "VALIDADA" ? "Validada" : "Desfeita"}</Badge></TableCell><TableCell>{v.aprovador_nome}</TableCell><TableCell className="text-xs">{new Date(v.aprovado_em).toLocaleString("pt-BR")}</TableCell><TableCell>{v.totais.ativos}</TableCell><TableCell className="text-xs">{v.diff.primeira_validacao ? "Primeira validação" : `+${v.diff.incluidos?.length ?? 0} / −${v.diff.retirados?.length ?? 0} / ${v.diff.reclassificados?.length ?? 0} reclass.`}</TableCell>
          <TableCell className="flex gap-1"><Button size="sm" variant="outline" onClick={() => baixarDocumento(v, nomeLoja(v.loja), nomeLoja)}><Download className="size-4" />Documento</Button>{gestor && v.status === "VALIDADA" && <Button size="sm" variant="ghost" onClick={() => void desfazer(v)}><Undo2 className="size-4" />Desfazer</Button>}</TableCell></TableRow>)}
          {!historico.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma validação registrada</TableCell></TableRow>}</TableBody></Table></div>
    </section>
    {papeis.admin && <Signatarios />}
  </div>;
}

const FUNCOES = [{ k: "GERENTE_COMERCIAL", n: "Gerente Comercial", d: "valida o portfólio de cada loja" }, { k: "DIRETOR_OPERACIONAL", n: "Diretor Operacional", d: "dá ciência do Almox SP (CD)" }] as const;
type Signatario = { user_id: string; funcao: string; nome: string | null; ativo: boolean; designado_em: string };
function Signatarios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["abast-signatarios"], queryFn: async () => {
    const [{ data: sig }, { data: usu }] = await Promise.all([sb.from("abast_signatarios").select("user_id, funcao, nome, ativo, designado_em").order("funcao").order("nome"), sb.from("profiles").select("id, nome, email").order("nome").limit(500)]);
    return { sig: (sig ?? []) as Signatario[], usuarios: (usu ?? []) as { id: string; nome: string | null; email: string | null }[] };
  } });
  const [usuario, setUsuario] = useState(""); const [funcao, setFuncao] = useState<string>(FUNCOES[0].k); const [salvando, setSalvando] = useState(false);
  async function definir(user_id: string, f: string, ativo: boolean) {
    setSalvando(true);
    try { const { error } = await sb.rpc("abast_designar_signatario", { p_user_id: user_id, p_funcao: f, p_ativo: ativo }); if (error) throw error; toast.success(ativo ? "Signatário designado" : "Signatário removido"); await qc.invalidateQueries({ queryKey: ["abast-signatarios"] }); await qc.invalidateQueries({ queryKey: ["abast-papeis-validacao"] }); setUsuario(""); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível alterar o signatário"); } finally { setSalvando(false); }
  }
  const sig = q.data?.sig ?? []; const usuarios = q.data?.usuarios ?? [];
  return <section className="space-y-3 rounded-lg border p-4">
    <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4" />Signatários da validação (administrador)</h2>
    <p className="text-xs text-muted-foreground">Quem assina é designado aqui. O administrador designa, mas não assina. Cada função pode ter mais de uma pessoa; o termo registra quem assinou.</p>
    <div className="grid gap-3 md:grid-cols-2">{FUNCOES.map((f) => <div key={f.k} className="rounded-md border p-3"><div className="font-semibold">{f.n}</div><div className="mb-2 text-xs text-muted-foreground">{f.d}</div>
      {sig.filter((s) => s.funcao === f.k && s.ativo).map((s) => <div key={s.user_id} className="flex items-center justify-between border-t py-1 text-sm"><span>{s.nome}<span className="ml-2 text-[11px] text-muted-foreground">desde {new Date(s.designado_em).toLocaleDateString("pt-BR")}</span></span><Button size="sm" variant="ghost" disabled={salvando} onClick={() => void definir(s.user_id, f.k, false)}>Remover</Button></div>)}
      {!sig.some((s) => s.funcao === f.k && s.ativo) && <p className="border-t pt-2 text-sm font-semibold text-red-600">Ninguém designado — ninguém consegue assinar.</p>}</div>)}</div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-muted-foreground">Usuário<select value={usuario} onChange={(e) => setUsuario(e.target.value)} className="mt-1 block h-9 min-w-64 rounded-md border bg-background px-2 text-sm"><option value="">Selecione…</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}{u.nome && u.email ? ` (${u.email})` : ""}</option>)}</select></label>
      <label className="text-xs font-semibold text-muted-foreground">Função<select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="mt-1 block h-9 min-w-48 rounded-md border bg-background px-2 text-sm">{FUNCOES.map((f) => <option key={f.k} value={f.k}>{f.n}</option>)}</select></label>
      <Button disabled={!usuario || salvando} onClick={() => void definir(usuario, funcao, true)}>Designar</Button>
    </div>
  </section>;
}

function rotuloFiltro(id: string) {
  if (id === "Ativos" || id === "Elegíveis OOS") return id;
  return String((CLASSES_PORTFOLIO as Record<string, string>)[id] ?? id);
}

function CardFiltro({ rotulo, valor, ativo, onClick }: { rotulo: string; valor: string | number; ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={ativo ? "Clique para limpar o filtro" : "Clique para filtrar a lista"}
      className={`rounded-lg border p-3 text-left transition hover:border-primary/60 ${ativo ? "border-primary bg-primary/10 ring-1 ring-primary" : ""}`}>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-2xl font-bold">{valor}</div>
    </button>
  );
}
