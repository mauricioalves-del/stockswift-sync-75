// Follow-up das ordens de serviço: status, linha do tempo, comprovante de entrega e aprovação de custos do prestador.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Secao } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { abrirDoc, brl, CardKpi, dataBR, enviarDoc, Hero, nf, ROT, sb, Status } from "@/components/logistica/ui";
import { NovoLancamento, TIPOS_LANC } from "@/components/logistica/Lancamentos";
import { PROXIMOS, ZONA_ROTULO, type Zona } from "@/lib/tms";

export const Route = createFileRoute("/_authenticated/logistica/ordens")({ component: Ordens, head: () => ({ meta: [{ title: "Follow-up de entregas — Controle Logístico" }] }) });

function Ordens() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tms-ordens"], queryFn: async () => {
    const [o, s, p, e, l, cc] = await Promise.all([sb.from("log_ordens").select("*").order("numero", { ascending: false }).limit(500), sb.from("log_solicitacoes").select("*"), sb.from("log_prestadores").select("id, nome"), sb.from("log_eventos").select("*").order("created_at", { ascending: false }).limit(3000), sb.from("log_lancamentos").select("*").order("created_at", { ascending: false }).limit(2000), sb.from("log_centros_custo").select("centro_custo").order("centro_custo")]);
    for (const r of [o, s, p, e, l]) if (r.error) throw r.error;
    return { ord: o.data as any[], sol: new Map((s.data as any[]).map((x) => [x.id, x])), pres: new Map((p.data as any[]).map((x) => [x.id, x.nome])), ev: e.data as any[], lan: l.data as any[], cc: ((cc.data ?? []) as any[]).map((x) => x.centro_custo) };
  } });
  const [sel, setSel] = useState<string | null>(null); const [filtro, setFiltro] = useState("abertas");
  const r = () => qc.invalidateQueries({ queryKey: ["tms-ordens"] });
  const hoje = new Date().toISOString().slice(0, 10);
  const ords = (q.data?.ord ?? []).filter((o) => filtro === "todas" || (filtro === "abertas" ? !["entregue", "cancelada"].includes(o.status) : filtro === "atrasadas" ? !["entregue", "cancelada"].includes(o.status) && o.previsao && o.previsao < hoje : o.status === filtro));
  const k = useMemo(() => { const o = q.data?.ord ?? []; const ab = o.filter((x) => !["entregue", "cancelada"].includes(x.status)); const ent = o.filter((x) => x.status === "entregue");
    const noPrazo = ent.filter((x) => x.entregue_em && x.previsao && x.entregue_em.slice(0, 10) <= x.previsao).length;
    return { abertas: ab.length, atrasadas: ab.filter((x) => x.previsao && x.previsao < hoje).length, ocorr: o.filter((x) => x.status === "ocorrencia").length, otif: ent.length ? noPrazo / ent.length : null, pend: (q.data?.lan ?? []).filter((x) => x.status === "pendente").length, semComprov: ent.filter((x) => !x.comprovante_path).length }; }, [q.data, hoje]);
  const atual = q.data?.ord.find((o) => o.id === sel); const sol = atual ? q.data!.sol.get(atual.solicitacao_id) : null;
  const lanc = (q.data?.lan ?? []).filter((l) => (atual ? l.ordem_id === atual.id : true));

  async function mudar(status: string) {
    if (!atual) return; const extra: any = { status };
    if (status === "coletada") extra.coletado_em = new Date().toISOString();
    if (status === "entregue") { const rec = prompt("Recebido por (nome):"); if (!rec) return; extra.entregue_em = new Date().toISOString(); extra.recebedor = rec; }
    if (status === "ocorrencia" || status === "cancelada") { const m = prompt("Descreva a ocorrência / motivo:"); if (!m) return; await sb.from("log_eventos").insert({ ordem_id: atual.id, status, descricao: m }); }
    const res = await sb.from("log_ordens").update(extra).eq("id", atual.id); if (res.error) return toast.error(res.error.message); r();
  }
  async function comprovante(f: File) { if (!atual) return; try { const path = await enviarDoc(`ordens/${atual.numero}`, f); await sb.from("log_ordens").update({ comprovante_path: path }).eq("id", atual.id); await sb.from("log_eventos").insert({ ordem_id: atual.id, status: atual.status, descricao: "Comprovante anexado", anexo_path: path }); r(); } catch (e: any) { toast.error(e?.message); } }
  async function decidir(id: string, status: "aprovado" | "rejeitado") {
    const motivo = status === "rejeitado" ? prompt("Motivo da rejeição:") : null; if (status === "rejeitado" && !motivo) return;
    const { data: u } = await sb.auth.getUser(); const res = await sb.from("log_lancamentos").update({ status, motivo, aprovado_por: u.user?.id, aprovado_em: new Date().toISOString() }).eq("id", id);
    if (res.error) return toast.error(res.error.message); r();
  }

  return (
    <div className="w-full space-y-4">
      <Hero titulo="Follow-up de entregas" sub="Ordens de serviço criadas pela cotação aprovada · status, comprovantes, notas do prestador e aprovação de custos. Entregue + custo aprovado alimenta o Painel Logístico." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <CardKpi t="Ordens abertas" v={nf(k.abertas)} borda="border-l-sky-500" />
        <CardKpi t="Atrasadas" v={nf(k.atrasadas)} borda={k.atrasadas ? "border-l-red-500" : "border-l-emerald-500"} tom={k.atrasadas ? "text-red-600" : ""} />
        <CardKpi t="Ocorrências" v={nf(k.ocorr)} borda={k.ocorr ? "border-l-red-500" : "border-l-emerald-500"} />
        <CardKpi t="Entregas no prazo" v={k.otif == null ? "—" : `${nf(k.otif * 100)}%`} sub="meta 95%" borda={(k.otif ?? 1) >= 0.95 ? "border-l-emerald-500" : "border-l-amber-500"} />
        <CardKpi t="Custos a aprovar" v={nf(k.pend)} borda={k.pend ? "border-l-amber-500" : "border-l-emerald-500"} />
        <CardKpi t="Entregues sem comprovante" v={nf(k.semComprov)} borda={k.semComprov ? "border-l-amber-500" : "border-l-emerald-500"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Secao letra="A" titulo="Ordens de serviço">
          <div className="mb-2 flex flex-wrap gap-1">{[["abertas", "Abertas"], ["atrasadas", "Atrasadas"], ["ocorrencia", "Ocorrências"], ["entregue", "Entregues"], ["todas", "Todas"]].map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} className={`h-7 rounded-md border px-2 text-xs font-semibold ${filtro === v ? "bg-slate-900 text-white" : "bg-background"}`}>{l}</button>)}</div>
          <div className="max-h-[600px] space-y-1.5 overflow-auto">{ords.map((o) => { const s = q.data!.sol.get(o.solicitacao_id); const atr = !["entregue", "cancelada"].includes(o.status) && o.previsao && o.previsao < hoje; return (
            <button key={o.id} onClick={() => setSel(o.id)} className={`w-full rounded-lg border p-2 text-left text-sm hover:bg-muted ${sel === o.id ? "border-slate-900 ring-1 ring-slate-900" : ""}`}>
              <div className="flex items-center justify-between gap-2"><b>OS {o.numero} · {q.data!.pres.get(o.prestador_id)}</b><Status s={o.status} /></div>
              <div className="text-xs text-muted-foreground">{s?.cliente || s?.destino_cidade || "—"} · {ZONA_ROTULO[s?.zona as Zona] ?? ""} · {brl(o.valor_aprovado)}</div>
              <div className={`text-xs ${atr ? "font-semibold text-red-600" : "text-muted-foreground"}`}>previsão {dataBR(o.previsao)}{atr ? " · atrasada" : ""}</div></button>); })}
            {!ords.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma ordem neste filtro.</p>}</div>
        </Secao>
        <Secao letra="B" titulo={atual ? `OS ${atual.numero}` : "Detalhe"}>
          {!atual ? <p className="py-10 text-center text-sm text-muted-foreground">Escolha uma ordem.</p> : <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-2 text-xs">{sol?.origem} → {[sol?.destino_endereco, sol?.destino_cidade, sol?.destino_uf].filter(Boolean).join(" · ")}<br />Pedido {sol?.pedido || "—"} · {nf(sol?.peso_kg, 1)} kg · CC {sol?.centro_custo} · valor aprovado <b>{brl(atual.valor_aprovado)}</b>{atual.justificativa_excecao && <> · exceção: {atual.justificativa_excecao}</>}</div>
            <div className="flex flex-wrap items-center gap-2">{(PROXIMOS[atual.status] ?? []).map((s) => <Button key={s} size="sm" variant={s === "cancelada" || s === "ocorrencia" ? "outline" : "default"} onClick={() => mudar(s)}>{ROT[s]}</Button>)}
              <label className="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Anexar comprovante<input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && comprovante(e.target.files[0])} /></label>
              {atual.comprovante_path && <button className="flex items-center gap-1 text-xs underline" onClick={() => abrirDoc(atual.comprovante_path)}><FileText className="size-3.5" />Ver comprovante{atual.recebedor ? ` (recebido por ${atual.recebedor})` : ""}</button>}</div>
            <div><b className="text-xs">Linha do tempo</b><ul className="mt-1 space-y-1 border-l pl-3 text-xs">{q.data!.ev.filter((e) => e.ordem_id === atual.id).map((e) => <li key={e.id}><Status s={e.status} /> <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span> {e.descricao}{e.anexo_path && <button className="ml-1 underline" onClick={() => abrirDoc(e.anexo_path)}>anexo</button>}</li>)}</ul></div>
          </div>}
        </Secao>
      </div>
      <Secao letra="C" titulo={atual ? `Custos e cobranças da OS ${atual.numero}` : "Custos e cobranças lançados pelos prestadores"}>
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Data", "OS", "Prestador", "Tipo", "Descrição", "CC", "Nota", "Valor", "Status", ""].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{lanc.slice(0, 200).map((l) => <tr key={l.id} className="border-t">
            <td className="px-2 py-1">{dataBR(l.data)}</td><td className="px-2 py-1">{q.data!.ord.find((o) => o.id === l.ordem_id)?.numero ?? "avulso"}</td><td className="px-2 py-1">{q.data!.pres.get(l.prestador_id)}</td><td className="px-2 py-1 text-xs">{TIPOS_LANC[l.tipo]}</td>
            <td className="px-2 py-1 text-xs">{l.descricao}{l.quantidade ? ` · ${nf(l.quantidade, 1)}` : ""}</td><td className="px-2 py-1 text-xs">{l.centro_custo ?? "—"}</td>
            <td className="px-2 py-1 text-xs">{l.nota_path ? <button className="underline" onClick={() => abrirDoc(l.nota_path)}>{l.nota_numero || "abrir"}</button> : l.nota_numero ?? <span className="text-red-600">sem nota</span>}</td>
            <td className="px-2 py-1 text-right font-semibold tabular-nums">{brl(l.valor)}</td><td className="px-2 py-1"><Status s={l.status} />{l.motivo && <div className="text-[10px] text-muted-foreground">{l.motivo}</div>}</td>
            <td className="px-2 py-1">{l.status === "pendente" && <div className="flex gap-1"><Button size="sm" onClick={() => decidir(l.id, "aprovado")}>Aprovar</Button><Button size="sm" variant="outline" onClick={() => decidir(l.id, "rejeitado")}>Rejeitar</Button></div>}</td></tr>)}</tbody></table>
        {!lanc.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum lançamento.</p>}
        {atual && <details className="mt-3 rounded-lg border p-2"><summary className="cursor-pointer text-xs font-semibold">Lançar custo em nome do prestador</summary><div className="mt-2"><NovoLancamento prestadorId={atual.prestador_id} ordens={[{ id: atual.id, numero: atual.numero, rotulo: sol?.cliente ?? "" }]} ccs={q.data!.cc} onFim={r} /></div></details>}
      </Secao>
    </div>
  );
}
