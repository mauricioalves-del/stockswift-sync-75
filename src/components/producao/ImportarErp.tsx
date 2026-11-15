// Janela de importação das bases do ERP (planilha GrPCP_Conexoes_ERP.xlsx, depois de "Atualizar tudo" no Excel).
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BASES_ERP, gravarBaseErp, lerPlanilhaErp, type BaseErp, type LeituraBase } from "@/lib/erp-importador";

const sb = supabase as any;
const nf = (v: number) => v.toLocaleString("pt-BR");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ImportarErp() {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<string>("");
  const [lidas, setLidas] = useState<LeituraBase[]>([]);
  const [faltando, setFaltando] = useState<BaseErp[]>([]);
  const [sel, setSel] = useState<Set<BaseErp>>(new Set());
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);
  const [prog, setProg] = useState<Record<string, number>>({});
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const ultimas = useQuery({
    enabled: aberto, queryKey: ["erp-importacoes"],
    queryFn: async () => { const { data, error } = await sb.from("erp_importacoes").select("base, linhas, arquivo, importado_por, importado_em").order("importado_em", { ascending: false }).limit(60); if (error) throw error; const m = new Map<string, any>(); for (const r of data ?? []) if (!m.has(r.base)) m.set(r.base, r); return m; },
  });

  async function ler(f: File) {
    setLendo(true); setLidas([]); setFaltando([]); setArquivo(f.name);
    try { const r = lerPlanilhaErp(await f.arrayBuffer()); setLidas(r.lidas); setFaltando(r.faltando); setSel(new Set(r.lidas.filter((l) => l.linhas.length).map((l) => l.base))); }
    catch (e: any) { toast.error("Não consegui ler a planilha: " + (e?.message ?? e)); }
    finally { setLendo(false); if (input.current) input.current.value = ""; }
  }
  async function gravar() {
    const { data: u } = await supabase.auth.getUser();
    try {
      for (const l of lidas.filter((x) => sel.has(x.base))) { setGravando(l.titulo); await gravarBaseErp(sb, l, arquivo, u.user?.email ?? null, (f, t) => setProg((p) => ({ ...p, [l.base]: f / t }))); }
      toast.success("Bases do ERP importadas."); qc.invalidateQueries({ queryKey: ["indicador-producao"] }); qc.invalidateQueries({ queryKey: ["erp-importacoes"] });
    } catch (e: any) { toast.error("Falha na importação: " + (e?.message ?? e)); }
    finally { setGravando(null); }
  }

  return <>
    <Button variant="outline" onClick={() => setAberto(true)}><Database className="mr-2 size-4" />Bases do ERP</Button>
    <Dialog open={aberto} onOpenChange={(v) => !gravando && setAberto(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Importar bases do ERP</DialogTitle>
          <DialogDescription>Abra a planilha <b>GrPCP_Conexoes_ERP.xlsx</b> no Excel, clique em <b>Dados › Atualizar tudo</b>, salve e envie aqui. Cada base é reconhecida pelo cabeçalho e substitui a carga anterior.</DialogDescription></DialogHeader>
        <input ref={input} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        <Button onClick={() => input.current?.click()} disabled={lendo || !!gravando}><Upload className="mr-2 size-4" />{lendo ? "Lendo a planilha…" : "Escolher planilha"}</Button>
        <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr><th className="px-2 py-1"></th><th className="px-2 py-1 text-left">Base</th><th className="px-2 py-1 text-left">Aba encontrada</th><th className="px-2 py-1 text-right">Linhas</th><th className="px-2 py-1 text-left">Última carga</th></tr></thead>
          <tbody>{(Object.keys(BASES_ERP) as BaseErp[]).map((b) => { const l = lidas.find((x) => x.base === b), u = ultimas.data?.get(b), p = prog[b];
            return <tr key={b} className="border-t"><td className="px-2 py-1 text-center"><input type="checkbox" disabled={!l || !!gravando} checked={sel.has(b)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(b) : n.delete(b); return n; })} /></td>
              <td className="px-2 py-1">{BASES_ERP[b].titulo}</td>
              <td className="px-2 py-1 text-xs">{l ? l.aba : arquivo ? <span className="text-amber-700">não encontrada</span> : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums">{l ? <>{nf(l.linhas.length)}{p != null && p < 1 ? <span className="ml-1 text-xs text-muted-foreground">({Math.round(p * 100)}%)</span> : p === 1 ? <span className="ml-1 text-xs text-emerald-700">✓</span> : null}</> : "—"}</td>
              <td className="px-2 py-1 text-xs text-muted-foreground">{u ? `${quando(u.importado_em)} · ${nf(u.linhas)} linhas` : "nunca"}</td></tr>; })}</tbody></table></div>
        {faltando.length > 0 && arquivo && <p className="text-xs text-amber-700">Não encontradas na planilha: {faltando.map((b) => BASES_ERP[b].titulo).join(", ")}.</p>}
        <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{gravando ? `Gravando: ${gravando}…` : "A importação apaga e regrava cada base marcada. Razão social e CPF/CNPJ de clientes não são gravados."}</p>
          <Button onClick={gravar} disabled={!sel.size || !!gravando || lendo}>{gravando ? "Importando…" : `Importar ${sel.size} base(s)`}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
