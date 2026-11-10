// Solicitação de materiais de uso e consumo da loja (material de apoio, cafeteria, sobremesa e gotas com saldo no CD).
// Sem caixaria: o gestor informa a quantidade de cada item. O pedido segue o fluxo normal (aguardando aprovação comercial).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PackageOpen, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const sb = supabase as any;
type ItemCatalogo = { id_produto: string; descricao: string; categoria: string; subcategoria: string; saldo: number; sem_cadastro: boolean; gota: boolean };
const un = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const ROTULO: Record<string, string> = { "MATERIAL DE CONSUMO": "Material de consumo", CAFETERIA: "Cafeteria", GOTAS: "Gotas (com saldo no CD)", BOLOS: "Sobremesa · Bolos" };

export function MateriaisConsumoDialog({ lojaInicial, onClose, onOk }: { lojaInicial?: string | null; onClose: () => void; onOk: () => void }) {
  const [loja, setLoja] = useState(lojaInicial ?? "");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const lojasQ = useQuery({ queryKey: ["abast-lojas-ativas"], queryFn: async () => { const { data, error } = await sb.from("abast_lojas").select("codigo, nome").eq("ativo", true).order("nome"); if (error) throw error; return (data ?? []) as { codigo: string; nome: string }[]; } });
  const catQ = useQuery({ queryKey: ["abast-catalogo-materiais"], queryFn: async () => { const { data, error } = await sb.rpc("abast_catalogo_materiais"); if (error) throw error; return (data ?? []) as ItemCatalogo[]; } });
  const num = (s: string | undefined) => { const n = Number(String(s ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; };
  const grupos = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const m = new Map<string, ItemCatalogo[]>();
    for (const i of catQ.data ?? []) {
      if (b && !`${i.id_produto} ${i.descricao}`.toLowerCase().includes(b)) continue;
      m.set(i.subcategoria, [...(m.get(i.subcategoria) ?? []), i]);
    }
    return [...m];
  }, [catQ.data, busca]);
  const escolhidos = (catQ.data ?? []).filter((i) => num(qtd[i.id_produto]) > 0);

  async function enviar() {
    if (!loja) { toast.error("Escolha a loja."); return; }
    if (!escolhidos.length) { toast.error("Informe a quantidade de ao menos um material."); return; }
    setSalvando(true);
    try {
      const { data, error } = await sb.rpc("abast_solicitar_materiais", { p_loja: loja, p_obs: obs.trim() || null, p_itens: escolhidos.map((i) => ({ id_produto: i.id_produto, qtd: num(qtd[i.id_produto]) })) });
      if (error) throw error;
      toast.success(`Pedido de materiais nº ${data?.numero} criado (${data?.itens} itens). Ele aparece em "Aguard. comercial" para aprovação.`);
      onOk();
    } catch (e: any) { toast.error("Não consegui criar a solicitação: " + (e?.message ?? e)); }
    finally { setSalvando(false); }
  }

  return <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
    <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
      <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
        <DialogTitle className="flex items-center gap-2 text-xl"><PackageOpen className="size-5" />Materiais de uso e consumo</DialogTitle>
        <DialogDescription>Material de apoio, cafeteria e sobremesa, mais todas as gotas com saldo no CD. Sem caixaria: informe a quantidade de cada item. O pedido vai para aprovação comercial como os demais.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[64vh] space-y-4 overflow-y-auto px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted-foreground">Loja
            <select value={loja} onChange={(e) => setLoja(e.target.value)} className="mt-1 block h-9 w-60 rounded-md border bg-background px-2 text-sm">
              <option value="">Escolha a loja</option>{(lojasQ.data ?? []).map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
            </select></label>
          <Input className="h-9 w-64" placeholder="Buscar material" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {catQ.isLoading ? <p className="text-sm text-muted-foreground">Carregando materiais…</p> : catQ.error ? <p className="text-sm text-destructive">Não foi possível carregar a lista de materiais.</p> :
          grupos.map(([sub, itens]) => <section key={sub} className="rounded-md border">
            <h3 className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">{ROTULO[sub] ?? sub}</h3>
            <table className="w-full text-sm"><tbody>{itens.map((i) => { const n = num(qtd[i.id_produto]); return (
              <tr key={i.id_produto} className={`border-t first:border-0 ${n > 0 ? "bg-primary/5" : ""}`}>
                <td className="w-32 px-3 py-1.5 font-mono text-xs">{i.sem_cadastro ? <span className="text-amber-700">sem cadastro</span> : i.id_produto}</td>
                <td className="px-2 py-1.5">{i.descricao}</td>
                <td className={`w-36 px-2 py-1.5 text-right text-xs ${i.sem_cadastro ? "text-muted-foreground" : i.saldo > 0 ? "text-emerald-700" : "text-red-600"}`}>{i.sem_cadastro ? "—" : `${un(i.saldo)} no CD`}</td>
                <td className="w-28 px-3 py-1.5"><Input inputMode="decimal" className="h-8 text-right" placeholder="0" value={qtd[i.id_produto] ?? ""} onChange={(e) => setQtd({ ...qtd, [i.id_produto]: e.target.value })} aria-label={`Quantidade de ${i.descricao}`} /></td>
              </tr>); })}</tbody></table>
          </section>)}
        <label className="block text-xs font-semibold text-muted-foreground">Observação (opcional)
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className="mt-1" placeholder="Ex.: reposição da semana, evento na loja…" /></label>
        <p className="text-[11px] text-muted-foreground">Itens sem cadastro no ACE4 entram no pedido e na requisição com código provisório (SEMCAD) e são separados manualmente.</p>
      </div>
      <DialogFooter className="items-center gap-2 border-t bg-muted/30 px-6 py-3 sm:justify-between">
        <span className="text-xs text-muted-foreground">{escolhidos.length ? `${escolhidos.length} material(is) · ${un(escolhidos.reduce((a, i) => a + num(qtd[i.id_produto]), 0))} un` : "Nenhum material escolhido"}</span>
        <div className="flex gap-2"><Button variant="ghost" disabled={salvando} onClick={onClose}>Voltar</Button>
          <Button disabled={salvando || !escolhidos.length || !loja} onClick={enviar} className="gap-2">{salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar solicitação</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
