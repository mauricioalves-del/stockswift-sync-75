// Diagnóstico por linha (duplo clique) do Detalhe por SKU e do Farol de ruptura futura:
// conta a história do item (situação, histórico de ruptura da foto diária, reposição) e sugere um plano de ação.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConsultaEstoqueSku } from "@/components/abast-dash/ConsultaEstoqueSku";
import type { Bruto } from "@/lib/abastecimento-dados";
import type { DashLinha } from "@/lib/abastecimento-dash";
import type { HistLinha } from "@/lib/abastecimento-dash-hist";
import { CLUSTER_PILL, CLUSTER_ROTULO, NOME, Pill, STATUS_PILL, brl, dm, n0, n1 } from "@/components/abast-dash/comum";

const semZero = (s: string) => String(s).replace(/^0+/, "");
const STATUS_TXT: Record<string, string> = { ruptura: "Ruptura", stockout: "Stockout", ok: "OK", stockover: "Stock Over" };

type Acao = { prioridade: "Alta" | "Média" | "Baixa"; acao: string; motivo: string };

function historia(l: DashLinha, hist: HistLinha[], saldoCd: number | null) {
  const rs = hist.filter((h) => h.loja === l.local && semZero(h.id_produto) === semZero(l.sku)).sort((a, b) => a.data.localeCompare(b.data));
  const diasRup = rs.filter((h) => h.em_ruptura).length;
  const periodos: { ini: string; fim: string; dias: number }[] = []; let cur: { ini: string; fim: string; dias: number } | null = null;
  for (const h of rs) { if (h.em_ruptura) { if (cur) { cur.fim = h.data; cur.dias++; } else cur = { ini: h.data, fim: h.data, dias: 1 }; } else if (cur) { periodos.push(cur); cur = null; } }
  if (cur) periodos.push(cur);

  const fatos: string[] = [];
  const loc = NOME[l.local] ?? l.local;
  if (l.status === "ruptura") fatos.push(`O item está zerado em ${loc}${l.diasSemEstoque > 0 ? ` há ${l.diasSemEstoque} dia(s)` : ""}, com venda média de ${n1(l.vbm)} un/dia — cada dia sem estoque é venda perdida.`);
  else if (l.status === "stockout") fatos.push(`Tem ${n0(l.estoque)} un em ${loc}, abaixo do mínimo de ${n0(l.minimo ?? 0)} un. Vende ${n1(l.vbm)} un/dia, o que dá ${l.cobertura === null ? "—" : `${n1(l.cobertura)} dia(s)`} de cobertura líquida.`);
  else if (l.status === "stockover") fatos.push(`Tem ${n0(l.estoque)} un em ${loc}, acima do máximo de ${n0(l.maximo ?? 0)} un: ${n0(l.excessoUn)} un em excesso (${brl(l.excessoRs)} parados).`);
  else fatos.push(`Estoque de ${n0(l.estoque)} un em ${loc}, dentro da faixa (mín ${n0(l.minimo ?? 0)} · máx ${n0(l.maximo ?? 0)}).`);
  if (l.zeraEm && l.status !== "ruptura") fatos.push(`No ritmo atual, zera em ${dm(l.zeraEm)} (${l.diasAteZerar} dia(s)).`);
  if (l.emTransito > 0) fatos.push(`Há ${n0(l.emTransito)} un a caminho${l.chegaEm ? `, com chegada prevista em ${dm(l.chegaEm)}` : ""}.`);
  else if (l.status !== "stockover" && l.status !== "ok") fatos.push("Não há reposição a caminho.");
  if (l.alerta) fatos.push("Alerta: zera em até 5 dias sem reposição suficiente ou a reposição chega depois de zerar.");
  if (l.local !== "CD" && saldoCd !== null) fatos.push(saldoCd > 0 ? `O CD tem ${n0(saldoCd)} un disponíveis deste produto.` : "O CD também está sem saldo deste produto.");
  fatos.push(diasRup > 0 ? `No período filtrado, ficou ${diasRup} dia(s) em ruptura pela foto diária, em ${periodos.length} ocorrência(s).` : "No período filtrado não teve ruptura registrada na foto diária.");

  const plano: Acao[] = [];
  const temSugestao = l.sugestao > 0;
  if (l.status === "ruptura" || l.status === "stockout" || (l.diasAteZerar ?? 99) <= 7) {
    if (l.emTransito <= 0 && temSugestao) {
      if (l.local === "CD") plano.push({ prioridade: "Alta", acao: `Programar produção/compra de ${n0(l.sugestao)} un para o CD`, motivo: "CD sem cobertura e sem entrada prevista." });
      else if (saldoCd !== null && saldoCd > 0) plano.push({ prioridade: "Alta", acao: `Gerar pedido de ${n0(Math.min(l.sugestao, saldoCd))} un do CD na Reposição de Lojas`, motivo: "O CD tem saldo para cobrir a loja." });
      else plano.push({ prioridade: "Alta", acao: `Avaliar transferência de outra loja ou almoxarifado (${n0(l.sugestao)} un)`, motivo: "CD sem saldo: use a Origem na Reposição de Lojas e o botão Ver estoque do item." });
    }
    if (l.emTransito > 0 && l.alerta) plano.push({ prioridade: "Alta", acao: "Antecipar a entrega ou complementar com transferência", motivo: `A reposição a caminho chega${l.chegaEm ? ` em ${dm(l.chegaEm)}` : ""} depois do estoque zerar.` });
    if (l.emTransito > 0 && !l.alerta) plano.push({ prioridade: "Média", acao: "Acompanhar o recebimento da reposição a caminho", motivo: "Risco já endereçado; confirmar entrada no Farol de Recebimento." });
    if (l.local === "CD" && l.emTransito <= 0 && !temSugestao) plano.push({ prioridade: "Média", acao: "Revisar parâmetros de cobertura do item", motivo: "Está em risco mas o sistema não sugere reposição." });
  }
  if (l.status === "stockover") {
    plano.push({ prioridade: "Média", acao: "Suspender novos pedidos até normalizar", motivo: `${n0(l.excessoUn)} un acima do máximo.` });
    plano.push({ prioridade: "Baixa", acao: "Remanejar o excesso para lojas com falta ou ativar ação comercial", motivo: `Libera ${brl(l.excessoRs)} de capital parado.` });
  }
  if (diasRup >= 3) plano.push({ prioridade: "Média", acao: "Revisar mínimo, máximo e dias de cobertura do item", motivo: `Ruptura recorrente (${diasRup} dias no período).` });
  if (plano.length === 0) plano.push({ prioridade: "Baixa", acao: "Manter monitoramento", motivo: "Item dentro da faixa, sem risco nos próximos dias." });
  return { fatos, plano, periodos, diasRup };
}

const PRI: Record<Acao["prioridade"], string> = { Alta: "bg-destructive/10 text-destructive", Média: "bg-warning/15 text-warning", Baixa: "bg-muted text-muted-foreground" };

export function DiagnosticoSku({ linha, onFechar, hist, bruto, todas }: { linha: DashLinha | null; onFechar: () => void; hist: HistLinha[]; bruto?: Bruto; todas?: DashLinha[] }) {
  const [estq, setEstq] = useState(false);
  const l = linha;
  const saldoCd = l && todas ? todas.find((x) => x.local === "CD" && semZero(x.sku) === semZero(l.sku))?.estoque ?? null : null;
  const h = l ? historia(l, hist, saldoCd) : null;
  return (<>
    <Dialog open={!!l && !estq} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {l && h && (<>
          <DialogHeader><DialogTitle>Diagnóstico · {l.sku}</DialogTitle><DialogDescription>{l.produto} · {NOME[l.local] ?? l.local}</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-2"><Pill cls={STATUS_PILL[l.status]}>{STATUS_TXT[l.status]}</Pill><Pill cls={CLUSTER_PILL[l.cluster]}>{CLUSTER_ROTULO[l.cluster]}</Pill>{l.alerta && <Pill cls="bg-destructive text-destructive-foreground">ALERTA</Pill>}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Estoque", `${n0(l.estoque)} un`], ["Mín · Máx", `${n0(l.minimo ?? 0)} · ${n0(l.maximo ?? 0)}`], ["Venda/dia", n1(l.vbm)], ["Cobertura", l.cobertura === null ? "—" : `${n1(l.cobertura)} d`], ["Em trânsito", n0(l.emTransito)], ["Chega em", l.chegaEm ? dm(l.chegaEm) : "—"], ["Zera em", l.zeraEm ? `${dm(l.zeraEm)} · ${l.diasAteZerar} d` : "—"], ["Sugestão", `${n0(l.sugestao)} un`]].map(([t, v]) => <div key={t} className="rounded-lg border bg-card p-2"><div className="text-[10px] font-semibold uppercase text-muted-foreground">{t}</div><div className="text-sm font-bold tabular-nums">{v}</div></div>)}
          </div>
          <section><h3 className="mb-1 text-sm font-bold">A história do item</h3><ul className="list-disc space-y-1 pl-5 text-sm">{h.fatos.map((f, i) => <li key={i}>{f}</li>)}</ul></section>
          {h.periodos.length > 0 && <section><h3 className="mb-1 text-sm font-bold">Rupturas no período (foto diária)</h3>
            <table className="w-full text-sm"><thead><tr className="border-b bg-muted text-[11px] uppercase"><th className="px-2 py-1.5 text-left">Entrou</th><th className="px-2 py-1.5 text-left">Até</th><th className="px-2 py-1.5 text-right">Dias</th></tr></thead>
              <tbody>{h.periodos.map((p) => <tr key={p.ini} className="border-b last:border-0"><td className="px-2 py-1">{dm(p.ini)}</td><td className="px-2 py-1">{dm(p.fim)}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{p.dias}</td></tr>)}</tbody></table></section>}
          <section><h3 className="mb-1 text-sm font-bold">Plano de ação</h3>
            <table className="w-full text-sm"><thead><tr className="border-b bg-muted text-[11px] uppercase"><th className="px-2 py-1.5 text-left">Prioridade</th><th className="px-2 py-1.5 text-left">Ação</th><th className="px-2 py-1.5 text-left">Por quê</th></tr></thead>
              <tbody>{h.plano.map((a, i) => <tr key={i} className="border-b last:border-0"><td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRI[a.prioridade]}`}>{a.prioridade}</span></td><td className="px-2 py-1.5 font-medium">{a.acao}</td><td className="px-2 py-1.5 text-muted-foreground">{a.motivo}</td></tr>)}</tbody></table></section>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setEstq(true)}>Ver estoque do item</Button></div>
        </>)}
      </DialogContent>
    </Dialog>
    <ConsultaEstoqueSku aberto={!!l && estq} onFechar={() => setEstq(false)} bruto={bruto} sku={l?.sku ?? ""} descricao={l?.produto ?? ""} lojaDestino="" cdNaoAtende={false} />
  </>);
}
