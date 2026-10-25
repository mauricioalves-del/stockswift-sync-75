import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2, DatabaseBackup, Loader2, Mic, MicOff, Orbit, Pencil, Plus, Send, Sparkles, Trash2, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { contarTabelasAtlas } from "@/lib/atlas-backup";
import { ATLAS_TABELAS } from "@/lib/atlas-tabelas";
import { ATLAS_MODULOS, ATLAS_RENDER_URL, faseEmAndamento } from "@/lib/atlas-modulos";
import { GATILHOS_ASSISTENTE, MODULOS_VOZ, carregarPerguntas, chaveDe, ehComandoDeNavegacao, falar, moduloPorVoz, normalizar, perguntarAtlas, semAtivacao, type PerguntaPadrao } from "@/lib/atlas-assistente";

export const Route = createFileRoute("/_authenticated/atlas/inicio")({
  component: AtlasInicio,
  head: () => ({ meta: [{ title: "Atlas — Início" }] }),
});

const sb = supabase as any;
const un = (n: number) => n.toLocaleString("pt-BR");
const TABELAS = Object.keys(ATLAS_TABELAS);

function AtlasInicio() {
  const { role } = useRole();
  const gestor = role === "ADMINISTRADOR" || role === "GERENTE";
  const navegar = useNavigate();
  const qc = useQueryClient();
  const perguntasQ = useQuery({ queryKey: ["atlas-perguntas-padrao"], queryFn: carregarPerguntas });
  const perguntas = perguntasQ.data ?? [];
  const resumoQ = useQuery({
    queryKey: ["atlas-inicio-resumo"],
    queryFn: async () => {
      const h = new Date().toISOString().slice(0, 10);
      const [ab, inv, acoes, fech, cien] = await Promise.all([
        sb.from("atlas_divergencias").select("id", { count: "exact", head: true }).eq("status", "Aberta").or("origem.is.null,origem.neq.fechamento_inventario"),
        sb.from("atlas_divergencias").select("id", { count: "exact", head: true }).eq("status", "Em_Investigacao"),
        sb.from("atlas_acoes_pos_inventario").select("prazo, status").in("status", ["Pendente", "Em_Andamento"]),
        sb.from("atlas_fechamentos_inventario").select("id, aprovado_manual"),
        sb.from("atlas_conciliacoes_ciencia").select("fechamento_id, papel_assinatura"),
      ]);
      const pap = new Map<number, Set<string>>(); for (const c of cien.data ?? []) if (c.papel_assinatura) (pap.get(c.fechamento_id) ?? pap.set(c.fechamento_id, new Set()).get(c.fechamento_id)!).add(c.papel_assinatura);
      return { abertas: ab.count ?? 0, emInvestigacao: inv.count ?? 0, atrasadas: (acoes.data ?? []).filter((a: any) => a.prazo && a.prazo < h).length, fechAbertos: (fech.data ?? []).filter((f: any) => !f.aprovado_manual && (pap.get(f.id)?.size ?? 0) < 3).length };
    },
  });
  const contQ = useQuery({ queryKey: ["atlas-contagens"], queryFn: () => contarTabelasAtlas(TABELAS), enabled: gestor });
  const historicoOk = contQ.isSuccess && TABELAS.every((t) => (contQ.data?.[t] ?? -1) >= ATLAS_TABELAS[t].linhas);
  const migracaoConcluida = faseEmAndamento(true) > 5;

  // ---------- assistente ----------
  const [texto, setTexto] = useState("");
  const [conversa, setConversa] = useState<{ pergunta: string; resposta?: string; erro?: string; rotulo?: string | null }[]>([]);
  const [pensando, setPensando] = useState(false);
  const [vozLigada, setVozLigada] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function perguntar(p: string) {
    const q = p.trim(); if (!q || pensando) return;
    setPensando(true); setTexto("");
    setConversa((c) => [{ pergunta: q }, ...c].slice(0, 10));
    try {
      const r = await perguntarAtlas(q, perguntas);
      setConversa((c) => [{ pergunta: q, resposta: r.resposta, rotulo: r.padrao?.rotulo }, ...c.slice(1)]);
      if (vozLigada) { pausarEscuta(); falar(r.resposta, retomarEscuta); }
    } catch (e: any) {
      setConversa((c) => [{ pergunta: q, erro: e?.message ?? String(e) }, ...c.slice(1)]);
    }
    setPensando(false);
  }

  // ---------- voz ----------
  const Reconhecimento: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const recRef = useRef<any>(null);
  const [escutaContinua, setEscutaContinua] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [status, setStatus] = useState("");
  const continuaRef = useRef(false); const pausadoRef = useRef(false);

  function tratarFrase(frase: string, exigeAtivacao: boolean) {
    const n = normalizar(frase);
    if (exigeAtivacao && !/^(e[ai]?\s+)?atlas\b/.test(n)) return;
    const resto = semAtivacao(frase);
    setStatus(`"${frase}"`);
    if (!resto) { setStatus("Diga um módulo ou faça uma pergunta."); return; }
    if (GATILHOS_ASSISTENTE.includes(normalizar(resto))) { inputRef.current?.focus(); setStatus("Assistente pronto — faça sua pergunta."); return; }
    const m = moduloPorVoz(frase);
    if (m && ehComandoDeNavegacao(frase, m)) { setStatus(`Abrindo ${m.nome}…`); registrarComando(frase, m.rota); navegar({ to: m.rota as any }); return; }
    registrarComando(frase, null);
    perguntar(resto);
  }
  async function registrarComando(frase: string, destino: string | null) {
    const { data: u } = await supabase.auth.getUser();
    await sb.from("atlas_log_auditoria").insert({ username: u.user?.email ?? "Stock Savvy", acao: "comando_de_voz", detalhes: { transcricao: frase, destino }, criado_em: new Date().toISOString() });
  }
  function criar(continuo: boolean) {
    const r = new Reconhecimento(); r.lang = "pt-BR"; r.continuous = continuo; r.interimResults = false;
    r.onresult = (ev: any) => { const res = ev.results[ev.results.length - 1]; if (res.isFinal) tratarFrase(res[0].transcript, continuo); };
    r.onstart = () => setOuvindo(true);
    r.onend = () => { setOuvindo(false); if (continuaRef.current && !pausadoRef.current) { try { r.start(); } catch { /* já reiniciando */ } } };
    r.onerror = (e: any) => { if (e.error === "not-allowed") { setStatus("Sem permissão para usar o microfone."); continuaRef.current = false; setEscutaContinua(false); } };
    return r;
  }
  // enquanto a resposta é lida em voz alta, o microfone para (evita o Atlas ouvir a própria voz)
  function pausarEscuta() { pausadoRef.current = true; try { recRef.current?.stop(); } catch { /* parado */ } }
  function retomarEscuta() { pausadoRef.current = false; if (continuaRef.current) { try { recRef.current?.start(); } catch { /* já ativo */ } } }
  function falarUmaVez() {
    if (!Reconhecimento) return;
    try { recRef.current?.abort(); } catch { /* nada */ }
    continuaRef.current = false; setEscutaContinua(false);
    recRef.current = criar(false); setStatus("Ouvindo…"); recRef.current.start();
  }
  function alternarContinua() {
    if (!Reconhecimento) return;
    if (escutaContinua) { continuaRef.current = false; setEscutaContinua(false); try { recRef.current?.stop(); } catch { /* parado */ } setStatus(""); return; }
    try { recRef.current?.abort(); } catch { /* nada */ }
    continuaRef.current = true; setEscutaContinua(true); recRef.current = criar(true); recRef.current.start(); setStatus('Escutando — comece com "Atlas, …"');
  }
  useEffect(() => () => { continuaRef.current = false; try { recRef.current?.abort(); } catch { /* nada */ } window.speechSynthesis?.cancel(); }, []);

  const [editando, setEditando] = useState<PerguntaPadrao | "nova" | null>(null);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Orbit className="size-6" /> Atlas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Inteligência de estoque da Mágio. Pergunte ao assistente, diga <strong>"Atlas, divergências"</strong> para abrir um módulo, ou <strong>"Atlas, resumo do dia"</strong>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Reconhecimento ? (
            <>
              <Button size="sm" variant="outline" className="gap-1" onClick={falarUmaVez} disabled={ouvindo && !escutaContinua}>{ouvindo && !escutaContinua ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />} Falar</Button>
              <Button size="sm" variant={escutaContinua ? "default" : "outline"} className="gap-1" onClick={alternarContinua}>{escutaContinua ? <Mic className="size-4" /> : <MicOff className="size-4" />} {escutaContinua ? 'Escutando "Atlas…"' : "Escuta contínua"}</Button>
            </>
          ) : <span className="text-xs text-muted-foreground">Comandos de voz exigem Chrome ou Edge.</span>}
          <Button size="icon" variant="ghost" title={vozLigada ? "Respostas em voz alta: ligadas" : "Respostas em voz alta: desligadas"} onClick={() => { setVozLigada(!vozLigada); window.speechSynthesis?.cancel(); }}>{vozLigada ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button>
        </div>
      </div>
      {status && <div className="text-xs text-muted-foreground">{status}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["Divergências abertas", resumoQ.data?.abertas, "/atlas/divergencias"], ["Em investigação", resumoQ.data?.emInvestigacao, "/atlas/divergencias"], ["Ações pós-inventário atrasadas", resumoQ.data?.atrasadas, "/atlas/pos-inventario"], ["Fechamentos sem as 3 ciências", resumoQ.data?.fechAbertos, "/atlas/fechamento-inventario"]] as const).map(([rot, v, rota]) => (
          <Link key={rot} to={rota as any}><Card className="transition hover:bg-muted/40"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{rot}</div><div className="mt-1 text-xl font-semibold">{v == null ? "…" : un(v)}</div></CardContent></Card></Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4" /> Assistente Atlas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {perguntas.map((p) => (
              <span key={p.chave} className="inline-flex items-center gap-0.5">
                <button type="button" disabled={pensando} onClick={() => perguntar(p.pergunta)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">{p.rotulo}</button>
                {gestor && p.personalizada && <button type="button" className="text-muted-foreground hover:text-foreground" title="Editar" onClick={() => setEditando(p)}><Pencil className="size-3" /></button>}
              </span>
            ))}
            {gestor && <button type="button" onClick={() => setEditando("nova")} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"><Plus className="size-3" /> Pergunta padrão</button>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); perguntar(texto); }}>
            <Input ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte algo — ex.: quais almoxarifados têm mais divergências abertas?" />
            <Button type="submit" disabled={!texto.trim() || pensando} className="gap-1">{pensando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Perguntar</Button>
          </form>
          <div className="space-y-2">
            {conversa.map((c, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground">{c.pergunta}{c.rotulo ? ` · pergunta padrão: ${c.rotulo}` : ""}</div>
                {c.resposta ? <div className="mt-1 flex items-start gap-2"><p className="flex-1">{c.resposta}</p><button type="button" className="text-muted-foreground hover:text-foreground" title="Ouvir" onClick={() => falar(c.resposta!)}><Volume2 className="size-4" /></button></div>
                  : c.erro ? <div className="mt-1 text-destructive">{c.erro}</div> : <div className="mt-1 flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> pensando…</div>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">O assistente responde só com os números do retrato atual (divergências, baixas, fechamentos e ações de pós-inventário). Para algo fora disso, ele indica o módulo certo.</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODULOS_VOZ.filter((m) => m.rota !== "/atlas/inicio").map((m) => (
          <Link key={m.rota} to={m.rota as any} className="rounded-lg border bg-card p-3 transition hover:bg-muted/50">
            <div className="flex items-start justify-between gap-2"><span className="font-medium">{m.nome}</span><ArrowUpRight className="size-3.5 text-muted-foreground" /></div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.conteudo}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">voz: "Atlas, {m.palavras[0]}"</p>
          </Link>
        ))}
      </div>

      {gestor && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
            <div className="flex items-center gap-2">{migracaoConcluida && historicoOk ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Loader2 className="size-4 text-muted-foreground" />}
              <span>Migração do Atlas: {migracaoConcluida ? "as 5 fases estão no Stock Savvy" : "em andamento"} · histórico {contQ.isLoading ? "…" : historicoOk ? "importado e conferido" : "incompleto"} ({ATLAS_MODULOS.filter((m) => m.rota).length}/{ATLAS_MODULOS.length} módulos). <a href={ATLAS_RENDER_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">Atlas original</a></span></div>
            <Link to="/atlas/importar-backup" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><DatabaseBackup className="size-4" /> Backup do Atlas</Link>
          </CardContent>
        </Card>
      )}

      {editando && <EditarPergunta pergunta={editando === "nova" ? null : editando} onClose={() => setEditando(null)} onOk={() => { setEditando(null); qc.invalidateQueries({ queryKey: ["atlas-perguntas-padrao"] }); }} />}
    </div>
  );
}

function EditarPergunta({ pergunta, onClose, onOk }: { pergunta: PerguntaPadrao | null; onClose: () => void; onOk: () => void }) {
  const [v, setV] = useState({ rotulo: pergunta?.rotulo ?? "", pergunta: pergunta?.pergunta ?? "", gatilhos: (pergunta?.gatilhos ?? []).join(", "), instrucao: pergunta?.instrucao ?? "" });
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    const gatilhos = v.gatilhos.split(",").map((g) => g.trim()).filter(Boolean);
    if (!v.rotulo.trim() || !v.pergunta.trim() || !gatilhos.length) { toast.error("Preencha rótulo, pergunta e ao menos um gatilho."); return; }
    setOcupado(true);
    const { data: u } = await supabase.auth.getUser();
    const dados = { rotulo: v.rotulo.trim(), pergunta: v.pergunta.trim(), gatilhos, instrucao_extra: v.instrucao.trim() || null, ativo: true };
    const r = pergunta ? await sb.from("atlas_perguntas_padrao_personalizadas").update(dados).eq("chave", pergunta.chave) : await sb.from("atlas_perguntas_padrao_personalizadas").insert({ ...dados, chave: `${chaveDe(v.rotulo)}_${Date.now().toString(36)}`, criado_por: u.user?.email ?? null, criado_em: new Date().toISOString() });
    setOcupado(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Pergunta padrão salva."); onOk();
  }
  async function excluir() {
    if (!pergunta || !confirm(`Excluir a pergunta "${pergunta.rotulo}"?`)) return;
    const { error } = await sb.from("atlas_perguntas_padrao_personalizadas").delete().eq("chave", pergunta.chave);
    if (error) { toast.error(error.message); return; }
    toast.success("Pergunta excluída."); onOk();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{pergunta ? "Editar pergunta padrão" : "Nova pergunta padrão"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label className="text-xs">Rótulo do botão</Label><Input value={v.rotulo} onChange={(e) => setV({ ...v, rotulo: e.target.value })} /></div>
          <div><Label className="text-xs">Pergunta enviada ao assistente</Label><Input value={v.pergunta} onChange={(e) => setV({ ...v, pergunta: e.target.value })} /></div>
          <div><Label className="text-xs">Gatilhos (separados por vírgula) — se a frase falada contiver um deles, a pergunta é reconhecida</Label><Input value={v.gatilhos} onChange={(e) => setV({ ...v, gatilhos: e.target.value })} /></div>
          <div><Label className="text-xs">Orientação para o assistente (opcional)</Label><Textarea rows={3} value={v.instrucao} onChange={(e) => setV({ ...v, instrucao: e.target.value })} /></div>
        </div>
        <DialogFooter className="gap-2">{pergunta && <Button variant="ghost" className="mr-auto gap-1 text-destructive" disabled={ocupado} onClick={excluir}><Trash2 className="size-4" /> Excluir</Button>}<Button variant="ghost" disabled={ocupado} onClick={onClose}>Cancelar</Button><Button disabled={ocupado} onClick={salvar}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
