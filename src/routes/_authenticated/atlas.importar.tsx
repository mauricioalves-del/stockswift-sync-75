import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FONTES_CONTEXTO, abrirPlanilha, carregarContexto, excluirLote, importarContexto, importarCustosPlanilhaPreco, importarCustosSimples,
  importarLivroCaixa, importarMovimentacao, type FonteContexto, type Planilha,
} from "@/lib/atlas-importar";
import { investigarLote } from "@/lib/atlas-investigacao";

export const Route = createFileRoute("/_authenticated/atlas/importar")({
  component: AtlasImportar,
  head: () => ({ meta: [{ title: "Importar — Atlas" }] }),
});

const sb = supabase as any;
const un = (n: number) => n.toLocaleString("pt-BR");
type Arq = { nome: string; planilha: Planilha } | null;

/** Escolha de arquivo (.xlsx/.xlsm/.csv) + aba. */
function Arquivo({ arq, setArq, aba, setAba, abaPadrao, csv = true }: { arq: Arq; setArq: (a: Arq) => void; aba: string; setAba: (s: string) => void; abaPadrao?: string; csv?: boolean }) {
  const [lendo, setLendo] = useState(false);
  async function escolher(f?: File) {
    if (!f) return;
    setLendo(true);
    try {
      const planilha = abrirPlanilha(await f.arrayBuffer(), f.name);
      setArq({ nome: f.name, planilha });
      setAba(planilha.abas[0] === "CSV" ? "" : abaPadrao && planilha.abas.includes(abaPadrao) ? abaPadrao : planilha.abas[0]);
    } catch (e: any) { toast.error("Não consegui abrir o arquivo: " + (e?.message ?? e)); setArq(null); }
    finally { setLendo(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        {lendo ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
        <span className="max-w-[260px] truncate">{arq?.nome || "Escolher arquivo"}</span>
        <input type="file" className="hidden" accept={csv ? ".xlsx,.xlsm,.xls,.csv" : ".xlsx,.xlsm,.xls"} onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {arq && arq.planilha.abas[0] !== "CSV" && (
        <Select value={aba} onValueChange={setAba}>
          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Aba" /></SelectTrigger>
          <SelectContent>{arq.planilha.abas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

function Resultado({ texto, erro }: { texto?: string | null; erro?: string | null }) {
  if (erro) return <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{erro}</div>;
  if (texto) return <div className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 whitespace-pre-line">{texto}</div>;
  return null;
}

function AtlasImportar() {
  const { role } = useRole();
  const pode = role === "ADMINISTRADOR" || role === "GERENTE";
  const qc = useQueryClient();
  const almoxQ = useQuery({ queryKey: ["atlas-almox-ativos"], queryFn: async () => ((await sb.from("atlas_almoxarifados").select("codigo, nome_exibicao, ativo").order("codigo")).data ?? []).filter((a: any) => a.ativo !== false) as { codigo: string; nome_exibicao: string | null }[] });
  const lotesQ = useQuery({ queryKey: ["atlas-lotes"], queryFn: async () => ((await sb.from("atlas_lotes_importacao").select("*").order("criado_em", { ascending: false }).limit(50)).data ?? []) as any[] });
  const almox = almoxQ.data ?? [];
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [prog, setProg] = useState("");

  async function rodar(chave: string, fn: (ctx: Awaited<ReturnType<typeof carregarContexto>>) => Promise<string>, setRes: (r: { texto?: string; erro?: string }) => void) {
    setOcupado(chave); setProg(""); setRes({});
    try { const ctx = await carregarContexto(); const texto = await fn(ctx); setRes({ texto }); toast.success("Importação concluída."); }
    catch (e: any) { setRes({ erro: e?.message ?? String(e) }); }
    finally { setOcupado(null); setProg(""); qc.invalidateQueries({ queryKey: ["atlas-lotes"] }); qc.invalidateQueries({ queryKey: ["atlas-contagens"] }); }
  }

  // movimentação
  const [movArq, setMovArq] = useState<Arq>(null); const [movAba, setMovAba] = useState(""); const [movAlmox, setMovAlmox] = useState(""); const [movRes, setMovRes] = useState<{ texto?: string; erro?: string }>({});
  // custos
  const [cArq, setCArq] = useState<Arq>(null); const [cAba, setCAba] = useState(""); const [cRes, setCRes] = useState<{ texto?: string; erro?: string }>({});
  const [ppArq, setPpArq] = useState<Arq>(null); const [ppAba, setPpAba] = useState("tabela de preço"); const [ppRes, setPpRes] = useState<{ texto?: string; erro?: string }>({});
  // livro-caixa
  const [lcArq, setLcArq] = useState<Arq>(null); const [lcAba, setLcAba] = useState(""); const [lcAlmox, setLcAlmox] = useState(""); const [lcRes, setLcRes] = useState<{ texto?: string; erro?: string }>({});
  // contexto
  const [ctxArq, setCtxArq] = useState<Record<string, Arq>>({}); const [ctxAba, setCtxAba] = useState<Record<string, string>>({}); const [ctxRes, setCtxRes] = useState<Record<string, { texto?: string; erro?: string }>>({});

  const listaAlmox = (v: string, set: (s: string) => void) => (
    <Select value={v} onValueChange={set}>
      <SelectTrigger className="h-8 w-60"><SelectValue placeholder="Almoxarifado do arquivo" /></SelectTrigger>
      <SelectContent>{almox.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome_exibicao || a.codigo} <span className="text-muted-foreground">({a.codigo})</span></SelectItem>)}</SelectContent>
    </Select>
  );
  const Botao = ({ chave, ok, onClick }: { chave: string; ok: boolean; onClick: () => void }) => (
    <Button size="sm" className="gap-1" disabled={!ok || !!ocupado} onClick={onClick}>{ocupado === chave ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{ocupado === chave ? "Importando…" : "Importar"}</Button>
  );

  async function desfazer(l: any) {
    if (!confirm(`Desfazer a importação #${l.id} (${l.arquivo_origem})?\n\nRemove as ${l.divergencias_criadas ?? 0} divergências e os ${l.historico_criado ?? 0} registros de histórico criados por ela.`)) return;
    try { const ctx = await carregarContexto(); const r = await excluirLote(l.id, ctx); toast.success(`Importação desfeita: ${r.divergencias} divergências e ${r.historico} registros de histórico removidos.`); }
    catch (e: any) { toast.error(e?.message ?? String(e)); }
    qc.invalidateQueries({ queryKey: ["atlas-lotes"] });
  }

  if (!pode) return <div className="p-8 text-center text-muted-foreground">A importação do Atlas é feita por gestores (Administrador ou Gerente).</div>;
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Upload className="size-6" /> Importar</h1>
        <p className="text-sm text-muted-foreground">Mesmas importações do Atlas, gravando direto no histórico do Atlas dentro do Stock Savvy. Cada divergência criada pela movimentação já passa pelo motor de investigação do Atlas (hipótese, evidências e casos similares); baixa aprovada compatível resolve a divergência automaticamente. {ocupado && prog ? <span className="font-medium text-foreground"> {prog}</span> : null}</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Movimentação (sistema × contagem)</CardTitle>
          <CardDescription><strong>Excel (.xlsx/.xlsm)</strong>: aba "Movimentação" com Grupo, Data, Id_Produto, Unid., Sistema, Entrada, Saídas, Contagem, Obs, Prejuízo — o arquivo do dia a dia, um almoxarifado por arquivo. <strong>CSV</strong>: colunas sku, almoxarifado, data_movimento, entrada, saida, saldo_sistema, saldo_fisico, unidade. Saldo igual vai para o histórico; diferente vira divergência.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Arquivo arq={movArq} setArq={setMovArq} aba={movAba} setAba={setMovAba} abaPadrao="Movimentação" />
            {movArq && movArq.planilha.abas[0] !== "CSV" && listaAlmox(movAlmox, setMovAlmox)}
            <Botao chave="mov" ok={!!movArq && (movArq.planilha.abas[0] === "CSV" || !!movAlmox)} onClick={() => rodar("mov", async (ctx) => {
              const r = await importarMovimentacao(movArq!.planilha, movArq!.nome, movArq!.planilha.abas[0] === "CSV" ? null : movAlmox, movAba || null, ctx);
              // mesma sequência do Atlas: cada divergência nova já passa pelo motor de investigação
              const inv = r.divergencias ? await investigarLote((q) => q.eq("lote_importacao_id", r.loteId), ctx.usuario, (a, t) => setProg(`investigando ${a}/${t}…`)) : null;
              return `Importação #${r.loteId}: ${un(r.linhas)} linhas · ${un(r.historico)} no histórico · ${un(r.divergencias)} divergências${inv ? ` (investigadas: ${inv.ok}${inv.porBaixa ? `, ${inv.porBaixa} resolvida(s) por baixa aprovada` : ""}${inv.erros.length ? `, ${inv.erros.length} com erro — use Investigar pendentes` : ""})` : ""}.${r.erros.length ? `\n${r.erros.length} linha(s) com erro: ${r.erros.slice(0, 8).join(" | ")}${r.erros.length > 8 ? " …" : ""}` : ""}`;
            }, setMovRes)} />
          </div>
          <Resultado texto={movRes.texto} erro={movRes.erro} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Livro-caixa bruto do sistema</CardTitle>
          <CardDescription>Exportação direta do sistema (Id_Produto, Data, Operacao, Id_Doc, Doc, Qtd_Sai, Qtd_Ent…), um arquivo por almoxarifado. Substitui o livro-caixa anterior desse almoxarifado, casa as transferências internas (documento INT) entre origem e destino, registra as conferências ("Inventário (+)/(-)") e os dias com movimento — a base da Cobertura de Conferência.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Arquivo arq={lcArq} setArq={setLcArq} aba={lcAba} setAba={setLcAba} csv={false} />
            {listaAlmox(lcAlmox, setLcAlmox)}
            <Botao chave="lc" ok={!!lcArq && !!lcAlmox} onClick={() => rodar("lc", async (ctx) => {
              const r = await importarLivroCaixa(lcArq!.planilha, lcArq!.nome, lcAlmox, lcAba || null, ctx, setProg);
              return `${lcAlmox}: ${un(r.linhas)} linhas do livro-caixa · ${un(r.dias)} dia(s) com movimento novos · ${un(r.conferencias)} conferências · transferências: ${un(r.transfCriadas)} novas, ${un(r.transfAtualizadas)} atualizadas.${r.naoMapeados.length ? `\nAlmoxarifados sem de-para (revise): ${r.naoMapeados.join(", ")}` : ""}`;
            }, setLcRes)} />
          </div>
          <Resultado texto={lcRes.texto} erro={lcRes.erro} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Custos por SKU</CardTitle>
            <CardDescription>Duas colunas: sku, custo_unitario (CSV ou Excel). Alimenta o valor estimado (R$) das divergências. SKU fora do cadastro é ignorado e listado.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Arquivo arq={cArq} setArq={setCArq} aba={cAba} setAba={setCAba} />
              <Botao chave="c" ok={!!cArq} onClick={() => rodar("c", async (ctx) => {
                const r = await importarCustosSimples(cArq!.planilha, cArq!.nome, cAba || null, ctx);
                return `${un(r.atualizados)} produtos atualizados.${r.naoEncontrados.length ? `\nFora do cadastro (${r.naoEncontrados.length}): ${r.naoEncontrados.slice(0, 20).join(", ")}${r.naoEncontrados.length > 20 ? " …" : ""}` : ""}${r.erros.length ? `\nErros: ${r.erros.slice(0, 5).join(" | ")}` : ""}`;
              }, setCRes)} />
            </div>
            <Resultado texto={cRes.texto} erro={cRes.erro} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Custos via planilha de preço</CardTitle>
            <CardDescription>Explosão de ficha técnica com custo (ex.: aba "tabela de preço"). Só grava o SKU cujo custo é igual em todas as ocorrências.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Arquivo arq={ppArq} setArq={setPpArq} aba={ppAba} setAba={setPpAba} abaPadrao="tabela de preço" csv={false} />
              <Botao chave="pp" ok={!!ppArq && !!ppAba} onClick={() => rodar("pp", async (ctx) => {
                const r = await importarCustosPlanilhaPreco(ppArq!.planilha, ppArq!.nome, ppAba, ctx);
                return `${un(r.atualizados)} produtos atualizados · ${r.ambiguos.length} SKU(s) com custo ambíguo ignorados · ${r.naoEncontrados.length} fora do cadastro.${r.ambiguos.length ? `\nAmbíguos: ${r.ambiguos.slice(0, 15).join(", ")}${r.ambiguos.length > 15 ? " …" : ""}` : ""}`;
              }, setPpRes)} />
            </div>
            <Resultado texto={ppRes.texto} erro={ppRes.erro} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dados de contexto (planilhas do banco SQL da empresa)</CardTitle>
          <CardDescription>Usados na investigação das divergências. Cada envio <strong>substitui</strong> os dados anteriores por completo (são espelhos do sistema da empresa) — reenviar a versão mais atual é seguro, não duplica.</CardDescription></CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {(Object.keys(FONTES_CONTEXTO) as FonteContexto[]).map((f) => {
              const cfg = FONTES_CONTEXTO[f]; const chave = "ctx_" + f;
              return (
                <div key={f} className="space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-44 text-sm font-medium">{cfg.nome}</span>
                    <Arquivo arq={ctxArq[f] ?? null} setArq={(a) => setCtxArq({ ...ctxArq, [f]: a })} aba={ctxAba[f] ?? cfg.abaPadrao} setAba={(s) => setCtxAba({ ...ctxAba, [f]: s })} abaPadrao={cfg.abaPadrao} csv={false} />
                    <Botao chave={chave} ok={!!ctxArq[f]} onClick={() => rodar(chave, async (ctx) => {
                      const r = await importarContexto(f, ctxArq[f]!.planilha, ctxArq[f]!.nome, ctxAba[f] || null, ctx, setProg);
                      return `${cfg.nome}: ${un(r.linhas)} linhas importadas (substituição completa)${r.ignorados ? ` · ${un(r.ignorados)} ignoradas` : ""}.`;
                    }, (r) => setCtxRes((s) => ({ ...s, [f]: r })))} />
                    <span className="text-[11px] text-muted-foreground">aba padrão: {cfg.abaPadrao}</span>
                  </div>
                  <Resultado texto={ctxRes[f]?.texto} erro={ctxRes[f]?.erro} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Últimas importações de movimentação</CardTitle>
          <CardDescription>Inclui as importações feitas no Atlas antes da migração. Desfazer remove as divergências e o histórico criados por aquela importação.</CardDescription></CardHeader>
        <CardContent>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">#</th><th className="p-2">Quando</th><th className="p-2">Arquivo</th><th className="p-2">Almox.</th><th className="p-2">Por</th><th className="p-2 text-right">Linhas</th><th className="p-2 text-right">Diverg.</th><th className="p-2 text-right">Histórico</th><th className="p-2" /></tr></thead>
              <tbody>
                {(lotesQ.data ?? []).map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="p-2 text-xs">{l.id}</td>
                    <td className="p-2 whitespace-nowrap text-xs">{l.criado_em ? new Date(String(l.criado_em).replace(" ", "T")).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-2 max-w-[260px] truncate text-xs" title={l.arquivo_origem}>{l.arquivo_origem}</td>
                    <td className="p-2 text-xs">{l.almoxarifado || "—"}</td>
                    <td className="p-2 text-xs">{l.usuario || "—"}</td>
                    <td className="p-2 text-right text-xs">{un(l.linhas_processadas ?? 0)}</td>
                    <td className="p-2 text-right text-xs">{un(l.divergencias_criadas ?? 0)}</td>
                    <td className="p-2 text-right text-xs">{un(l.historico_criado ?? 0)}</td>
                    <td className="p-2 text-right"><Button size="icon" variant="ghost" className="size-7" disabled={!!ocupado} onClick={() => desfazer(l)} title="Desfazer esta importação"><Trash2 className="size-3.5" /></Button></td>
                  </tr>
                ))}
                {!lotesQ.isLoading && !(lotesQ.data ?? []).length && <tr><td colSpan={9} className="p-4 text-center text-xs text-muted-foreground">Nenhuma importação.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {ocupado && <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-lg"><Loader2 className="size-4 animate-spin" /> Importando… {prog}</div>}
    </div>
  );
}
