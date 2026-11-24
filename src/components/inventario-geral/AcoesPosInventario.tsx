// Última etapa da Contagem de Inventário (só Administrador): selecionar itens — mesmo com saldo correto — e abrir
// ações de pós-inventário para erros de processo (sem nota fiscal, nota sem baixa etc.), acompanhadas no Atlas.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAll } from "@/lib/fetch-all";
import { num, sb } from "./comum";

export const MOTIVOS: Record<string, { rotulo: string; passos: string[] }> = {
  sem_nf: { rotulo: "Material recebido sem nota fiscal", passos: ["Solicitar a nota fiscal ao fornecedor/remetente", "Lançar a entrada fiscal no ERP", "Conferir o saldo do item após o lançamento"] },
  nf_sem_baixa: { rotulo: "Nota fiscal emitida sem baixa no estoque", passos: ["Localizar a nota emitida", "Efetuar a baixa/transferência correspondente", "Conferir o saldo após a baixa"] },
  transferencia: { rotulo: "Transferência entre almoxarifados não registrada", passos: ["Identificar origem, destino e quantidade", "Registrar a transferência no ERP", "Confirmar o recebimento no destino"] },
  apontamento: { rotulo: "Erro de apontamento de produção/consumo", passos: ["Revisar as OPs do período", "Corrigir o apontamento", "Validar o saldo com o PCP"] },
  lote: { rotulo: "Lote ou produto trocado", passos: ["Identificar o lote correto", "Corrigir o lote no sistema", "Reetiquetar o material se necessário"] },
  cadastro: { rotulo: "Erro de cadastro (unidade, conversão, ficha)", passos: ["Revisar o cadastro do produto", "Corrigir unidade/fator de conversão", "Reprocessar o saldo"] },
  avaria: { rotulo: "Avaria, perda ou vencimento sem baixa", passos: ["Registrar a baixa operacional", "Separar o material avariado", "Investigar a causa"] },
  outro: { rotulo: "Outro erro de processo", passos: [] },
};
type Item = { sku: string; desc: string; grupo: string | null; lotes: string[]; sis: number; c1: number | null; c2: number | null; final: number | null; ident: boolean | null; manual: boolean; obs: string };

export function AcoesPosInventario({ inv }: { inv: any }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inv-acoes", inv.id, inv.fechamento_id], queryFn: async () => {
    const [it, us, ac, itf] = await Promise.all([
      fetchAll<any>((f, t) => sb.from("inv_itens").select("codigo_produto, descricao, grupo, lote, qtd_sistema, qtd_contagem, qtd_recontagem, qtd_final, identificado_recontagem, origem_item, observacao").eq("inventario_id", inv.id).order("codigo_produto").range(f, t)),
      sb.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome"),
      inv.fechamento_id ? sb.from("atlas_acoes_pos_inventario").select("id, sku, descricao_produto, acao_descricao, responsavel, prazo, status").eq("fechamento_id", inv.fechamento_id).order("id", { ascending: false }) : Promise.resolve({ data: [] }),
      inv.fechamento_id ? sb.from("atlas_itens_fechamento").select("id, sku").eq("fechamento_id", inv.fechamento_id) : Promise.resolve({ data: [] }),
    ]);
    const m = new Map<string, Item>();
    for (const i of it) { const a: Item = m.get(i.codigo_produto) ?? { sku: i.codigo_produto, desc: i.descricao, grupo: i.grupo, lotes: [], sis: 0, c1: null, c2: null, final: null, ident: null, manual: false, obs: "" };
      (a.lotes as string[]).push(i.lote || "sem lote"); a.sis += Number(i.qtd_sistema || 0);
      if (i.qtd_contagem != null) a.c1 = (a.c1 ?? 0) + Number(i.qtd_contagem); if (i.qtd_recontagem != null) a.c2 = (a.c2 ?? 0) + Number(i.qtd_recontagem);
      a.final = (a.final ?? 0) + Number(i.qtd_final ?? i.qtd_contagem ?? 0); if (i.identificado_recontagem != null) a.ident = a.ident === true || i.identificado_recontagem;
      if (i.origem_item === "manual") a.manual = true; if (i.observacao && !a.obs.includes(i.observacao)) a.obs = [a.obs, i.observacao].filter(Boolean).join(" | "); m.set(i.codigo_produto, a); }
    return { itens: [...m.values()], usuarios: (us.data ?? []) as any[], acoes: (ac.data ?? []) as any[], itemFech: new Map(((itf.data ?? []) as any[]).map((x) => [x.sku, x.id])) };
  } });
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busca, setBusca] = useState(""); const [filtro, setFiltro] = useState("todos");
  const [f, setF] = useState({ motivo: "sem_nf", descricao: "", responsavel: "", prazo: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) });
  const [salvando, setSalvando] = useState(false);
  const comAcao = useMemo(() => new Set((q.data?.acoes ?? []).map((a) => a.sku)), [q.data]);
  if (!q.data) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  const dif = (i: Item) => (i.final ?? 0) - i.sis;
  const lista = q.data.itens.filter((i) => (!busca || `${i.sku} ${i.desc}`.toLowerCase().includes(busca.toLowerCase())) && (filtro === "todos" || (filtro === "divergentes" ? Math.abs(dif(i)) > 0.0001 : filtro === "corretos" ? Math.abs(dif(i)) <= 0.0001 : filtro === "recontados" ? i.c2 != null : i.manual)));
  const alternar = (sku: string) => setSel((s) => { const n = new Set(s); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });

  async function criar() {
    if (!inv.fechamento_id) return toast.error("Gere o fechamento oficial antes de abrir as ações.");
    if (!sel.size) return toast.error("Selecione ao menos um item.");
    if (f.motivo === "outro" && !f.descricao.trim()) return toast.error("Descreva o erro de processo.");
    setSalvando(true);
    try {
      const { data: u } = await sb.auth.getUser(); const { data: p } = await sb.from("profiles").select("nome, email").eq("id", u.user?.id).maybeSingle();
      const resp = q.data!.usuarios.find((x) => x.id === f.responsavel); const mot = MOTIVOS[f.motivo];
      const linhas = q.data!.itens.filter((i) => sel.has(i.sku)).map((i) => ({
        item_fechamento_id: q.data!.itemFech.get(i.sku) ?? null, fechamento_id: inv.fechamento_id, sku: i.sku, descricao_produto: i.desc, almoxarifado: inv.almoxarifado,
        acao_descricao: `${mot.rotulo}${f.descricao.trim() ? ` — ${f.descricao.trim()}` : ""}. Inventário #${inv.numero}: sistema ${num(i.sis)}, 1ª contagem ${num(i.c1)}${i.c2 != null ? `, recontagem ${num(i.c2)} (identificado: ${i.ident ? "Sim" : "Não"})` : ""}, final ${num(i.final)}; lotes ${i.lotes.join(", ")}${i.obs ? `; obs.: ${i.obs}` : ""}.`,
        responsavel: resp ? resp.nome || resp.email : null, prazo: f.prazo || null, status: "Pendente", origem_automatica: false, criado_por: p?.nome || p?.email || "Administrador", criado_em: new Date().toISOString(),
        checklist: mot.passos.map((d) => ({ descricao: d, concluido: false })),
      }));
      const r = await sb.from("atlas_acoes_pos_inventario").insert(linhas); if (r.error) throw r.error;
      toast.success(`${linhas.length} ação(ões) de pós-inventário aberta(s). Acompanhamento no Atlas › Pós-inventário.`); setSel(new Set()); setF({ ...f, descricao: "" });
      qc.invalidateQueries({ queryKey: ["inv-acoes", inv.id] });
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setSalvando(false); }
  }
  const sc = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-3">
      {!inv.fechamento_id && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">As ações ficam disponíveis depois que o inventário é finalizado e o fechamento oficial é gerado.</p>}
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2"><ClipboardList className="size-4" /><b>Decisão pós-inventário</b><span className="text-xs text-muted-foreground">Selecione os itens — inclusive com saldo correto — que precisam de acompanhamento por erro de processo.</span></div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_2fr_1.2fr_auto_auto]">
          <select className={sc} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}>{Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
          <Input placeholder="Descrição da ação / o que aconteceu (ex.: NF 1234 do fornecedor X)" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          <select className={sc} value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}><option value="">Responsável…</option>{q.data.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select>
          <Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
          <Button onClick={criar} disabled={salvando || !sel.size || !inv.fechamento_id}>{salvando ? "Abrindo…" : `Abrir ação (${sel.size})`}</Button>
        </div>
        {MOTIVOS[f.motivo].passos.length > 0 && <p className="text-[11px] text-muted-foreground">Checklist da ação: {MOTIVOS[f.motivo].passos.join(" → ")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          {[["todos", "Todos"], ["divergentes", "Com diferença"], ["corretos", "Saldo correto"], ["recontados", "Recontados"], ["manuais", "Incluídos manualmente"]].map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} className={`h-8 rounded-full border px-3 text-xs font-semibold ${filtro === v ? "bg-slate-900 text-white" : "bg-muted"}`}>{l}</button>)}
          <Button size="sm" variant="outline" onClick={() => setSel(new Set(lista.map((i) => i.sku)))}>Selecionar filtrados</Button>{sel.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar</Button>}
        </div>
        <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[900px] text-xs"><thead className="sticky top-0 bg-muted"><tr>{["", "SKU", "Produto", "Lotes", "Sistema", "1ª", "2ª", "Ident.", "Final", "Dif.", "Observação", "Ação"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{lista.map((i) => { const d = dif(i); return (
            <tr key={i.sku} className={`border-t ${sel.has(i.sku) ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}>
              <td className="px-2 py-1"><input type="checkbox" checked={sel.has(i.sku)} onChange={() => alternar(i.sku)} /></td>
              <td className="px-2 py-1 font-mono">{i.sku}</td><td className="px-2 py-1">{i.desc}{i.manual && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">manual</span>}</td><td className="px-2 py-1">{i.lotes.length}</td>
              <td className="px-2 py-1 tabular-nums">{num(i.sis)}</td><td className="px-2 py-1 tabular-nums">{num(i.c1)}</td><td className="px-2 py-1 tabular-nums">{num(i.c2)}</td><td className="px-2 py-1">{i.ident == null ? "" : i.ident ? "Sim" : "Não"}</td>
              <td className="px-2 py-1 font-semibold tabular-nums">{num(i.final)}</td><td className={`px-2 py-1 tabular-nums ${d < 0 ? "text-red-600" : d > 0 ? "text-sky-700" : ""}`}>{Math.abs(d) < 0.0001 ? "—" : `${d > 0 ? "+" : ""}${num(d)}`}</td>
              <td className="max-w-[220px] truncate px-2 py-1" title={i.obs}>{i.obs}</td><td className="px-2 py-1">{comAcao.has(i.sku) && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">aberta</span>}</td></tr>); })}</tbody></table></div>
      </CardContent></Card>
      {q.data.acoes.length > 0 && <Card><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><b className="text-sm">Ações abertas neste inventário ({q.data.acoes.length})</b><Link to="/atlas/pos-inventario" className="text-xs underline">Acompanhar no Atlas › Pós-inventário</Link></div>
        <table className="w-full text-xs"><thead className="bg-muted"><tr>{["SKU", "Produto", "Ação", "Responsável", "Prazo", "Status"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{q.data.acoes.map((a) => <tr key={a.id} className="border-t"><td className="px-2 py-1 font-mono">{a.sku}</td><td className="px-2 py-1">{a.descricao_produto}</td><td className="max-w-[420px] truncate px-2 py-1" title={a.acao_descricao}>{a.acao_descricao}</td><td className="px-2 py-1">{a.responsavel ?? "—"}</td><td className="px-2 py-1">{a.prazo ? new Date(a.prazo + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td><td className="px-2 py-1">{a.status}</td></tr>)}</tbody></table></CardContent></Card>}
    </div>
  );
}
