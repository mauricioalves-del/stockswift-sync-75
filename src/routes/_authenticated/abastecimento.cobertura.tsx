import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Save, RotateCcw, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { formatBRL } from "@/lib/inventory";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarItens, type Bruto } from "@/lib/abastecimento-dados";
import { resumirLoja2 } from "@/lib/abastecimento-motor2";
import { PARAM_SISTEMA, resolverParam, validarCampos, type CoberturaRegra } from "@/lib/abastecimento-cobertura";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/cobertura")({
  component: CoberturaPage,
  head: () => ({ meta: [{ title: "Cobertura e parâmetros — Abastecimento" }] }),
});

type Campos = { min: string; ideal: string; max: string; seg: string };
const VAZIO: Campos = { min: "", ideal: "", max: "", seg: "" };
const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const lerNum = (s: string): number | null | "ruim" => { const t = s.trim().replace(",", "."); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : "ruim"; };
const vazio = (c: Campos) => !c.min.trim() && !c.ideal.trim() && !c.max.trim() && !c.seg.trim();
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");

function CoberturaPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const qc = useQueryClient();
  const bruto = useAbastBruto(pode);
  const dados = bruto.data;
  // Almox SP (CD): regra própria de cobertura, usada no Dashboard de Disponibilidade (mínimo/máximo do CD sobre a venda das lojas)
  const lojasCfg = [...(dados?.lojas ?? []), { codigo: "CD", nome: "Almox SP (CD)", almoxarifado: "Alm_SP_Fabrica" }];
  const [padrao, setPadrao] = useState<Campos>(VAZIO);
  const [lojasEd, setLojasEd] = useState<Record<string, Campos>>({});
  const [famEd, setFamEd] = useState<Record<string, Campos>>({});
  const [novaFam, setNovaFam] = useState("");
  const [iniciado, setIniciado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const hojeIso = new Date().toLocaleDateString("en-CA");

  const antigoQ = useQuery({
    enabled: pode, queryKey: ["abast-param-antigo"],
    queryFn: async () => { const { data } = await (supabase as any).from("parametros_abastecimento").select("origem, cobertura_dias, dias_seguranca, ativo"); return (data ?? []) as { origem: string; cobertura_dias: number; dias_seguranca: number; ativo: boolean }[]; },
  });

  const doBanco = useMemo(() => {
    if (!dados) return null;
    const lj: Record<string, Campos> = {}, fm: Record<string, Campos> = {};
    for (const r of dados.coberturas ?? []) { const c = { min: txt(r.dias_min), ideal: txt(r.dias_ideal), max: txt(r.dias_max), seg: txt(r.dias_seguranca) }; if (r.escopo === "LOJA") lj[r.valor] = c; else fm[r.valor] = c; }
    return { padrao: { min: txt(dados.params.diasMin), ideal: txt(dados.params.diasIdeal), max: txt(dados.params.diasMax), seg: txt(dados.params.diasSeguranca) }, lj, fm };
  }, [dados]);
  useEffect(() => { if (doBanco && !iniciado) { setPadrao(doBanco.padrao); setLojasEd(doBanco.lj); setFamEd(doBanco.fm); setIniciado(true); } }, [doBanco, iniciado]);

  // Valida e monta o que está na tela
  const { erros, params, regras } = useMemo(() => {
    const erros: string[] = [];
    const campo = (rot: string, c: Campos, obrig: boolean) => {
      const v = { min: lerNum(c.min), ideal: lerNum(c.ideal), max: lerNum(c.max), seg: lerNum(c.seg) };
      if (Object.values(v).some((x) => x === "ruim")) { erros.push(`${rot}: use só números.`); return null; }
      const n = v as { min: number | null; ideal: number | null; max: number | null; seg: number | null };
      erros.push(...validarCampos(rot, n, obrig)); return n;
    };
    const p = campo("Padrão", padrao, true);
    const regras: CoberturaRegra[] = [];
    for (const l of lojasCfg) { const c = lojasEd[l.codigo]; if (!c || vazio(c)) continue; const n = campo(`Loja ${l.nome}`, c, false); if (n) regras.push({ escopo: "LOJA", valor: l.codigo, dias_min: n.min, dias_ideal: n.ideal, dias_max: n.max, dias_seguranca: n.seg }); }
    for (const [f, c] of Object.entries(famEd)) { if (vazio(c)) continue; const n = campo(`Família ${f}`, c, false); if (n) regras.push({ escopo: "FAMILIA", valor: f, dias_min: n.min, dias_ideal: n.ideal, dias_max: n.max, dias_seguranca: n.seg }); }
    const params = p && p.min !== null && p.ideal !== null && p.max !== null && p.seg !== null ? { diasMin: p.min, diasIdeal: p.ideal, diasMax: p.max, diasSeguranca: p.seg } : null;
    return { erros, params, regras };
  }, [padrao, lojasEd, famEd, dados]);

  const sujo = useMemo(() => {
    if (!doBanco) return false;
    return JSON.stringify([padrao, Object.fromEntries(Object.entries(lojasEd).filter(([, c]) => !vazio(c))), Object.fromEntries(Object.entries(famEd).filter(([, c]) => !vazio(c)))]) !== JSON.stringify([doBanco.padrao, doBanco.lj, doBanco.fm]);
  }, [padrao, lojasEd, famEd, doBanco]);

  // Prévia do impacto: mesmo cálculo da Reposição (base venda real), com os valores da tela
  const previa = useMemo(() => {
    if (!dados || !params || erros.length) return null;
    const propor: Bruto = { ...dados, params, coberturas: regras };
    const o = { base: "real" as const, denominador: "calendario" as const, hojeIso };
    const a = montarItens(dados, o), n = montarItens(propor, o);
    return dados.lojas.map((l) => ({ l, a: resumirLoja2(a.itens[l.codigo] ?? []), n: resumirLoja2(n.itens[l.codigo] ?? []) }));
  }, [dados, params, regras, erros, hojeIso]);

  const familiasDisponiveis = useMemo(() => [...new Set((dados?.familias ?? []).map((f) => f.familia).filter(Boolean))].filter((f) => !(f in famEd)).sort((a, b) => a.localeCompare(b, "pt-BR")), [dados, famEd]);
  const efetivoLoja = (cod: string) => { const p = params ?? PARAM_SISTEMA; return resolverParam(p, regras.filter((r) => r.escopo === "LOJA"), cod, "").p; };

  async function salvar() {
    if (!isAdmin || !dados || !params || erros.length) return;
    setSalvando(true);
    try {
      const sb = supabase as any; const agora = new Date().toISOString();
      const cfg = [["dias_min", params.diasMin], ["dias_ideal", params.diasIdeal], ["dias_max", params.diasMax], ["dias_seguranca", params.diasSeguranca]].map(([chave, v]) => ({ chave, valor: String(v), atualizado_em: agora }));
      let r = await sb.from("abast_config").upsert(cfg, { onConflict: "chave" }); if (r.error) throw r.error;
      const manter = new Set(regras.map((x) => `${x.escopo}|${x.valor}`));
      for (const e of dados.coberturas ?? []) if (!manter.has(`${e.escopo}|${e.valor}`)) { r = await sb.from("abast_param_cobertura").delete().eq("escopo", e.escopo).eq("valor", e.valor); if (r.error) throw r.error; }
      if (regras.length) { r = await sb.from("abast_param_cobertura").upsert(regras.map((x) => ({ ...x, atualizado_em: agora })), { onConflict: "escopo,valor" }); if (r.error) throw r.error; }
      toast.success("Cobertura salva. A Reposição e os Indicadores já usam os novos valores.");
      await qc.invalidateQueries({ queryKey: ["abast-v2"] }); setIniciado(false);   // espera a recarga terminar para a tela mostrar o que ficou salvo
    } catch (err: any) { toast.error("Não consegui salvar: " + (err?.message ?? err)); }
    finally { setSalvando(false); }
  }
  function doModeloAntigo() {
    const novo = { ...lojasEd }; let n = 0;
    for (const l of lojasCfg) { const o = (antigoQ.data ?? []).find((x) => x.origem === l.almoxarifado); if (o) { novo[l.codigo] = { min: "", ideal: String(o.cobertura_dias), max: "", seg: String(o.dias_seguranca) }; n++; } }
    setLojasEd(novo); toast.info(n ? `Preenchi ${n} loja(s) com a cobertura do modelo antigo. Confira a prévia e salve.` : "Não achei parâmetros do modelo antigo para as lojas.");
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const ro = !isAdmin;
  const entrada = (v: string, on: (s: string) => void, ph: string) => <Input className="h-8 w-20 text-right ml-auto" inputMode="decimal" disabled={ro} placeholder={ph} value={v} onChange={(e) => on(e.target.value)} />;
  const linhaCampos = (c: Campos, on: (c: Campos) => void, ph: { min: string; ideal: string; max: string; seg: string }) => (<>
    <td className="p-2 text-right">{entrada(c.min, (s) => on({ ...c, min: s }), ph.min)}</td><td className="p-2 text-right">{entrada(c.ideal, (s) => on({ ...c, ideal: s }), ph.ideal)}</td>
    <td className="p-2 text-right">{entrada(c.max, (s) => on({ ...c, max: s }), ph.max)}</td><td className="p-2 text-right">{entrada(c.seg, (s) => on({ ...c, seg: s }), ph.seg)}</td></>);
  const pPad = params ?? PARAM_SISTEMA;
  const phPadrao = { min: String(pPad.diasMin), ideal: String(pPad.diasIdeal), max: String(pPad.diasMax), seg: String(pPad.diasSeguranca) };
  const delta = (a: number, n: number, bomSeMenor = true) => a === n ? <span className="text-muted-foreground">{un(a)}</span> : <span>{un(a)} → <strong className={(n < a) === bomSeMenor ? "text-emerald-600" : "text-amber-600"}>{un(n)}</strong></span>;

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><SlidersHorizontal className="size-6" /> Cobertura e parâmetros</h1>
        <p className="text-sm text-muted-foreground">
          A <strong>cobertura</strong> é quantos dias de venda o estoque deve cobrir. <strong>Mínimo</strong>: abaixo disso o item entra em "Abaixo do mínimo" e gera sugestão (ponto de pedido). <strong>Ideal</strong>: a reposição leva o estoque até cobrir esses dias. <strong>Máximo</strong>: acima disso o item é "Excesso". <strong>Segurança</strong>: dias extras somados ao ideal e ao máximo (×1,5 nas classes A e B). A exposição não conta como vendável. Regra por <strong>família</strong> vence a da <strong>loja</strong>, que vence o <strong>padrão</strong>, campo a campo (campo vazio herda do nível acima). {isAdmin ? "" : "Somente o administrador altera; você pode consultar."}
        </p>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Padrão (todas as lojas)</CardTitle><CardDescription>Valor de partida do sistema: mínimo {PARAM_SISTEMA.diasMin}, ideal {PARAM_SISTEMA.diasIdeal}, máximo {PARAM_SISTEMA.diasMax}, segurança {PARAM_SISTEMA.diasSeguranca} dias.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {([["Mínimo (dias)", "min"], ["Ideal (dias)", "ideal"], ["Máximo (dias)", "max"], ["Segurança (dias)", "seg"]] as const).map(([r, k]) => <div key={k}><div className="text-xs text-muted-foreground mb-1">{r}</div>{entrada(padrao[k], (s) => setPadrao({ ...padrao, [k]: s }), "")}</div>)}
          {isAdmin && <Button variant="outline" size="sm" className="gap-1" onClick={() => setPadrao({ min: String(PARAM_SISTEMA.diasMin), ideal: String(PARAM_SISTEMA.diasIdeal), max: String(PARAM_SISTEMA.diasMax), seg: String(PARAM_SISTEMA.diasSeguranca) })}><RotateCcw className="size-4" /> Valores de partida</Button>}
        </CardContent></Card>

      <Card><CardHeader className="pb-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">Por loja</CardTitle><CardDescription>Deixe vazio para usar o padrão. A coluna "Em uso" mostra mínimo / ideal / máximo / segurança que a loja usa (antes das regras de família). A linha do Almox SP (CD) vale só para o Dashboard de Disponibilidade (mínimo/máximo do CD sobre a venda das lojas); não altera a Reposição.</CardDescription></div>
        {isAdmin && <Button variant="outline" size="sm" className="gap-1" onClick={doModeloAntigo} disabled={antigoQ.isLoading}><History className="size-4" /> Preencher com o modelo antigo</Button>}</div></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-left font-medium">Loja</th><th className="p-2 text-right font-medium">Mínimo</th><th className="p-2 text-right font-medium">Ideal</th><th className="p-2 text-right font-medium">Máximo</th><th className="p-2 text-right font-medium">Segurança</th><th className="p-2 text-right font-medium">Em uso</th></tr></thead>
          <tbody>{(lojasCfg).map((l) => { const e = efetivoLoja(l.codigo); return (<tr key={l.codigo} className="border-b"><td className="p-2">{l.nome}<div className="text-[10px] text-muted-foreground">{l.almoxarifado}</div></td>{linhaCampos(lojasEd[l.codigo] ?? VAZIO, (c) => setLojasEd({ ...lojasEd, [l.codigo]: c }), phPadrao)}<td className="p-2 text-right text-xs font-semibold">{e.diasMin} / {e.diasIdeal} / {e.diasMax} / {e.diasSeguranca}</td></tr>); })}</tbody></table></CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por família</CardTitle><CardDescription>Útil quando um tipo de produto gira diferente (ex.: granéis com cobertura menor, presentes com cobertura maior).</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-left font-medium">Família</th><th className="p-2 text-right font-medium">Mínimo</th><th className="p-2 text-right font-medium">Ideal</th><th className="p-2 text-right font-medium">Máximo</th><th className="p-2 text-right font-medium">Segurança</th><th className="w-10" /></tr></thead>
          <tbody>{Object.keys(famEd).sort((a, b) => a.localeCompare(b, "pt-BR")).map((f) => (<tr key={f} className="border-b"><td className="p-2">{f}</td>{linhaCampos(famEd[f], (c) => setFamEd({ ...famEd, [f]: c }), phPadrao)}<td className="p-2 text-right">{isAdmin && <button type="button" aria-label={`Remover regra de ${f}`} title="Remover a regra desta família" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600" onClick={() => { const n = { ...famEd }; delete n[f]; setFamEd(n); }}><Trash2 className="size-4" /></button>}</td></tr>))}
            {Object.keys(famEd).length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhuma regra por família.</td></tr>}</tbody></table>
          {isAdmin && <div className="flex items-center gap-2 p-3"><select className="h-8 rounded-md border bg-background px-2 text-xs" value={novaFam} onChange={(e) => setNovaFam(e.target.value)}><option value="">Adicionar regra para a família…</option>{familiasDisponiveis.map((f) => <option key={f} value={f}>{f}</option>)}</select><Button size="sm" variant="outline" disabled={!novaFam} onClick={() => { setFamEd({ ...famEd, [novaFam]: { ...VAZIO } }); setNovaFam(""); }}>Adicionar</Button></div>}</CardContent></Card>

      {erros.length > 0 && <Card className="border-red-300 bg-red-50"><CardContent className="pt-4 text-sm text-red-800"><strong>Corrija antes de salvar</strong><ul className="list-disc pl-5">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul></CardContent></Card>}

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Impacto na Reposição (base: venda real)</CardTitle><CardDescription>{sujo ? "Comparação do que está salvo (esquerda) com o que está na tela (direita), com os mesmos dados de hoje." : "Sem alterações pendentes: a prévia aparece quando você mudar algum valor."}</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-left font-medium">Loja</th><th className="p-2 text-right font-medium">Itens a pedir</th><th className="p-2 text-right font-medium">Unidades a pedir</th><th className="p-2 text-right font-medium">Valor a pedir</th><th className="p-2 text-right font-medium">Ruptura</th><th className="p-2 text-right font-medium">Abaixo do mín.</th><th className="p-2 text-right font-medium">Excesso</th><th className="p-2 text-right font-medium">Falta no CD</th></tr></thead>
          <tbody>{(sujo && previa ? previa : []).map(({ l, a, n }) => (<tr key={l.codigo} className="border-b"><td className="p-2 font-medium">{l.nome}</td><td className="p-2 text-right">{delta(a.itensPedido, n.itensPedido)}</td><td className="p-2 text-right">{delta(a.unidadesPedido, n.unidadesPedido)}</td><td className="p-2 text-right text-xs">{formatBRL(a.valorPedido)} → <strong>{formatBRL(n.valorPedido)}</strong></td><td className="p-2 text-right">{delta(a.contagem.ruptura, n.contagem.ruptura)}</td><td className="p-2 text-right">{delta(a.contagem.abaixo, n.contagem.abaixo)}</td><td className="p-2 text-right">{delta(a.contagem.excesso, n.contagem.excesso, false)}</td><td className="p-2 text-right">{delta(a.faltaCD, n.faltaCD)}</td></tr>))}
            {!(sujo && previa) && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">{sujo ? "Corrija os erros acima para ver a prévia." : "—"}</td></tr>}</tbody></table></CardContent></Card>

      {isAdmin && <div className="flex gap-2"><Button className="gap-1" disabled={!sujo || erros.length > 0 || salvando} onClick={salvar}><Save className="size-4" /> {salvando ? "Salvando..." : "Salvar cobertura"}</Button><Button variant="outline" disabled={!sujo || salvando} onClick={() => setIniciado(false)}>Descartar alterações</Button></div>}
      <p className="text-xs text-muted-foreground">Estes parâmetros valem para a Reposição de Lojas e os Indicadores. O módulo "Parâmetros Abastecimento" (Suprimentos) é o modelo anterior e não alimenta a Reposição.</p>
    </div>
  );
}
