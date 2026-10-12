import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Gauge, Download } from "lucide-react";
import { formatBRL } from "@/lib/inventory";
import { useRole } from "@/hooks/useRole";
import { useAbastBruto } from "@/lib/abastecimento-hook";
import { montarItens, type ItemRep } from "@/lib/abastecimento-dados";
import { resumirLoja2 } from "@/lib/abastecimento-motor2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/abastecimento/indicadores")({
  component: IndicadoresPage,
  head: () => ({ meta: [{ title: "Indicadores de Abastecimento" }] }),
});

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
const un = (v: number) => Math.round(v).toLocaleString("pt-BR");
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const SIT: Record<string, { r: string; c: string }> = { adiantado: { r: "Adiantado", c: "text-emerald-600" }, no_ritmo: { r: "No ritmo", c: "text-sky-600" }, atrasado: { r: "Atrasado", c: "text-amber-600" }, critico: { r: "Crítico", c: "text-red-600" }, sem_meta: { r: "Sem meta", c: "text-muted-foreground" } };

function IndicadoresPage() {
  const { isAdmin, role } = useRole();
  const pode = isAdmin || role === "GERENTE" || role === "COORDENADOR_CONTROLE";
  const bruto = useAbastBruto(pode);
  const [sit, setSit] = useState<"critico" | "atrasado" | "TODOS">("critico");
  const hojeIso = new Date().toLocaleDateString("en-CA");
  const mont = useMemo(() => (bruto.data ? montarItens(bruto.data, { base: "real", denominador: "calendario", hojeIso }) : null), [bruto.data, hojeIso]);
  const lojas = bruto.data?.lojas ?? [];

  const porLoja = useMemo(() => lojas.map((l) => {
    const it: ItemRep[] = mont?.itens[l.codigo] ?? [];
    const r = resumirLoja2(it);
    const comMeta = it.filter((i) => i.metaMes > 0);
    const meta = comMeta.reduce((a, b) => a + b.metaMes, 0), real = comMeta.reduce((a, b) => a + b.realizadoMes, 0), esp = comMeta.reduce((a, b) => a + b.acomp.esperadoAteHoje, 0);
    const ref = mont?.refPorLoja[l.codigo] ?? null; const diaRef = ref ? +ref.slice(8, 10) : 0; const diasMes = comMeta[0]?.acomp.diasMes ?? 30;
    const proj = diaRef > 0 ? (real / diaRef) * diasMes : 0;
    const cobs = it.filter((i) => i.coberturaFisica != null && (i.demandaDia ?? 0) > 0).map((i) => i.coberturaFisica as number);
    const sits = { critico: 0, atrasado: 0, no_ritmo: 0, adiantado: 0, sem_meta: 0 } as Record<string, number>; for (const i of it) sits[i.acomp.situacao]++;
    return { l, it, r, meta, real, esp, proj, ref, parcial: esp > 0 ? real / esp : null, cobMedia: cobs.length ? cobs.reduce((a, b) => a + b, 0) / cobs.length : null, sits, semExpo: it.filter((i) => i.semExposicao).length, ritmo: meta > 0 && diasMes > diaRef ? Math.max(0, meta - real) / (diasMes - diaRef) : null };
  }), [lojas, mont]);

  const piores = useMemo(() => {
    const todos = (mont ? Object.values(mont.itens).flat() : []).filter((i) => i.metaMes > 0 && (sit === "TODOS" ? true : sit === "critico" ? i.acomp.situacao === "critico" : i.acomp.situacao === "critico" || i.acomp.situacao === "atrasado"));
    return todos.sort((a, b) => (a.acomp.atingimentoParcial ?? 9) - (b.acomp.atingimentoParcial ?? 9) || b.metaMes - a.metaMes).slice(0, 25);
  }, [mont, sit]);

  const porFamilia = useMemo(() => {
    const m = new Map<string, { meta: number; real: number; esp: number; n: number }>();
    for (const i of mont ? Object.values(mont.itens).flat() : []) { if (i.metaMes <= 0) continue; const f = i.familia || "(sem família)"; const o = m.get(f) ?? { meta: 0, real: 0, esp: 0, n: 0 }; o.meta += i.metaMes; o.real += i.realizadoMes; o.esp += i.acomp.esperadoAteHoje; o.n++; m.set(f, o); }
    return [...m.entries()].map(([f, o]) => ({ f, ...o, parcial: o.esp > 0 ? o.real / o.esp : null })).sort((a, b) => (a.parcial ?? 9) - (b.parcial ?? 9));
  }, [mont]);

  function exportar() {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`; const f = (n: number | null) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
    const cab = ["Loja", "SKU", "Produto", "Família", "Meta do mês", "Realizado", "Esperado até a data", "Atingimento parcial", "Projeção do mês", "Ritmo necessário/dia", "Situação"];
    const corpo = (mont ? Object.values(mont.itens).flat() : []).filter((i) => i.metaMes > 0).map((i) => [i.loja, i.sku, i.descricao, i.familia, f(i.metaMes), f(i.realizadoMes), f(i.acomp.esperadoAteHoje), f(i.acomp.atingimentoParcial), f(i.acomp.projecaoMes), f(i.acomp.ritmoNecessario), SIT[i.acomp.situacao].r].map(esc).join(";"));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Meta_x_Realizado_${hojeIso}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a gestores.</div>;
  const alertas: string[] = [];
  for (const p of porLoja) {
    if (!p.ref) alertas.push(`${p.l.nome}: sem faturamento carregado: a demanda real é zero.`);
    else { const d = Math.round((Date.now() - new Date(p.ref + "T12:00:00").getTime()) / 86400000); if (d > 3) alertas.push(`${p.l.nome}: faturamento defasado há ${d} dias (última venda ${dataBr(p.ref)}).`); }
    if (p.semExpo > 0) alertas.push(`${p.l.nome}: ${p.semExpo} SKU(s) sem exposição cadastrada (assumida como zero).`);
    if (p.r.faltaCD > 0) alertas.push(`${p.l.nome}: o CD não cobre ${un(p.r.faltaCD)} un do que a loja precisa.`);
  }
  if ((mont?.semFamilia.length ?? 0) > 0) alertas.push(`${new Set(mont!.semFamilia.map((s) => s.sku)).size} SKU(s) sem família: cadastre por linha na Reposição.`);
  if ((mont?.excluidos.semGrupo ?? 0) > 0) alertas.push(`${mont!.excluidos.semGrupo} combinação(ões) de loja e SKU do consenso sem cadastro de grupo (fora do universo).`);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Gauge className="size-6" /> Indicadores de Abastecimento</h1>
        <p className="text-sm text-muted-foreground">Saúde do estoque por loja e <strong>meta mensal × realizado, dia a dia</strong>, só para produto acabado com meta no consenso. Os dados são os de hoje: o histórico diário dos indicadores passa a ser guardado em uma próxima etapa.</p>
      </div>

      {alertas.length > 0 && <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-4 text-sm text-amber-900"><strong>Atenção</strong><ul className="list-disc pl-5">{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></CardContent></Card>}

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Saúde do estoque</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Disponibilidade</TableHead><TableHead className="text-right">Ruptura</TableHead><TableHead className="text-right">Abaixo do mín.</TableHead><TableHead className="text-right">A caminho</TableHead><TableHead className="text-right">Excesso</TableHead><TableHead className="text-right">Cobertura média</TableHead><TableHead className="text-right">Capital parado</TableHead><TableHead className="text-right">A pedir</TableHead><TableHead className="text-right">Falta no CD</TableHead></TableRow></TableHeader>
        <TableBody>{porLoja.map((p) => (
          <TableRow key={p.l.codigo}><TableCell className="font-medium">{p.l.nome}</TableCell><TableCell className="text-right">{p.r.ativos}</TableCell>
            <TableCell className="text-right font-semibold">{p.r.disponibilidade == null ? "—" : `${(p.r.disponibilidade * 100).toFixed(1)}%`}</TableCell>
            <TableCell className="text-right text-red-600">{p.r.contagem.ruptura}</TableCell><TableCell className="text-right text-amber-600">{p.r.contagem.abaixo}</TableCell><TableCell className="text-right text-indigo-600">{p.r.contagem.em_transito}</TableCell><TableCell className="text-right text-sky-600">{p.r.contagem.excesso}</TableCell>
            <TableCell className="text-right">{p.cobMedia == null ? "—" : `${p.cobMedia.toFixed(1)} dias`}</TableCell><TableCell className="text-right">{formatBRL(p.r.capitalParado)}</TableCell>
            <TableCell className="text-right">{p.r.itensPedido} · {un(p.r.unidadesPedido)} un</TableCell><TableCell className="text-right">{p.r.faltaCD > 0 ? un(p.r.faltaCD) : "—"}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Meta do mês × realizado</CardTitle><CardDescription>Meta do consenso para o mês atual contra o faturado até a última venda carregada de cada loja.</CardDescription></CardHeader><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">Última venda</TableHead><TableHead className="text-right">Meta do mês</TableHead><TableHead className="text-right">Realizado</TableHead><TableHead className="text-right">Esperado até a data</TableHead><TableHead className="text-right">Atingimento parcial</TableHead><TableHead className="text-right">Projeção do mês</TableHead><TableHead className="text-right">Ritmo necessário</TableHead><TableHead>SKUs por situação</TableHead></TableRow></TableHeader>
        <TableBody>{porLoja.map((p) => (
          <TableRow key={p.l.codigo}><TableCell className="font-medium">{p.l.nome}</TableCell><TableCell className="text-right">{dataBr(p.ref)}</TableCell><TableCell className="text-right">{un(p.meta)}</TableCell><TableCell className="text-right">{un(p.real)}</TableCell><TableCell className="text-right">{un(p.esp)}</TableCell>
            <TableCell className={`text-right font-semibold ${p.parcial == null ? "" : p.parcial >= 0.9 ? "text-emerald-600" : p.parcial >= 0.7 ? "text-amber-600" : "text-red-600"}`}>{pct(p.parcial)}</TableCell>
            <TableCell className="text-right">{un(p.proj)} ({pct(p.meta > 0 ? p.proj / p.meta : null)})</TableCell><TableCell className="text-right">{p.ritmo == null ? "—" : `${p.ritmo.toFixed(1)}/dia`}</TableCell>
            <TableCell className="text-xs">{(["critico", "atrasado", "no_ritmo", "adiantado"] as const).map((s) => <span key={s} className={`mr-2 ${SIT[s].c}`}>{SIT[s].r} {p.sits[s]}</span>)}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por família</CardTitle><CardDescription>Do pior para o melhor atingimento parcial.</CardDescription></CardHeader><CardContent className="p-0 max-h-96 overflow-auto"><Table>
          <TableHeader><TableRow><TableHead>Família</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Realizado</TableHead><TableHead className="text-right">Parcial</TableHead></TableRow></TableHeader>
          <TableBody>{porFamilia.map((f) => <TableRow key={f.f}><TableCell>{f.f}</TableCell><TableCell className="text-right">{f.n}</TableCell><TableCell className="text-right">{un(f.meta)}</TableCell><TableCell className="text-right">{un(f.real)}</TableCell><TableCell className={`text-right font-semibold ${f.parcial == null ? "" : f.parcial >= 0.9 ? "text-emerald-600" : f.parcial >= 0.7 ? "text-amber-600" : "text-red-600"}`}>{pct(f.parcial)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

        <Card><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">SKUs mais distantes da meta</CardTitle>
          <div className="flex gap-1">{(["critico", "atrasado", "TODOS"] as const).map((s) => <Button key={s} size="sm" variant={sit === s ? "default" : "outline"} onClick={() => setSit(s)}>{s === "critico" ? "Crítico" : s === "atrasado" ? "Atrasado+" : "Todos"}</Button>)}</div></div></CardHeader>
          <CardContent className="p-0 max-h-96 overflow-auto"><Table>
            <TableHeader><TableRow><TableHead>Loja</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Real</TableHead><TableHead className="text-right">Parcial</TableHead></TableRow></TableHeader>
            <TableBody>{piores.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum SKU nesta situação.</TableCell></TableRow>}
              {piores.map((i) => <TableRow key={`${i.loja}|${i.sku}`}><TableCell className="text-xs">{i.loja}</TableCell><TableCell className="max-w-[200px] truncate">{i.descricao}</TableCell><TableCell className="text-right">{un(i.metaMes)}</TableCell><TableCell className="text-right">{un(i.realizadoMes)}</TableCell><TableCell className={`text-right font-semibold ${SIT[i.acomp.situacao].c}`}>{pct(i.acomp.atingimentoParcial)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </div>

      <div className="flex gap-2"><Button variant="outline" size="sm" className="gap-1" onClick={exportar}><Download className="size-4" /> CSV meta × realizado</Button>
        <Link to="/abastecimento/projecao-cd" className="inline-flex items-center rounded-md border px-3 text-sm hover:bg-muted">Projeção do CD e Plano de Produção →</Link></div>
    </div>
  );
}
