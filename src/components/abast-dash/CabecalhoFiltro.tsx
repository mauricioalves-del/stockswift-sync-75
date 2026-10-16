import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filtroAtivo, type ColDef, type Filtro, type Ordem } from "@/lib/tabela-filtro";

/** Cabeçalho de coluna no padrão da Reposição: clique no título para ordenar, funil para filtrar (texto, lista de valores ou faixa numérica). */
export function CabCol<T>({ col, ordem, onOrdem, filtro, onFiltro, opcoes, dicaOrdem }: { col: ColDef<T>; ordem: Ordem; onOrdem: () => void; filtro: Filtro | undefined; onFiltro: (f: Filtro) => void; opcoes: { valor: string; n: number }[]; dicaOrdem?: string }) {
  const [aberto, setAberto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ativo = filtroAtivo(filtro);
  const emOrdem = ordem?.k === col.k;
  const Seta = !emOrdem ? ArrowUpDown : ordem?.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th title={col.dica ?? col.r} className={`sticky top-0 z-20 h-11 whitespace-nowrap bg-muted px-2 align-middle font-medium ${col.al === "right" ? "text-right" : "text-left"} ${emOrdem ? "text-foreground" : "text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={onOrdem} title={dicaOrdem ?? "Ordenar (1º clique: menor → maior)"} className="inline-flex items-center gap-1 hover:text-foreground">
          <span>{col.r}</span><Seta className={`size-3.5 ${emOrdem ? "text-primary" : "opacity-40"}`} />
        </button>
        <button type="button" ref={btn} onClick={() => setAberto(!aberto)} title="Filtrar esta coluna" aria-label={`Filtrar ${col.r}`} className={`rounded p-0.5 hover:bg-muted ${ativo ? "text-primary" : "opacity-40 hover:opacity-100"}`}>
          <Filter className="size-3.5" fill={ativo ? "currentColor" : "none"} />
        </button>
      </span>
      {aberto && <PainelFiltro col={col} ancora={btn.current} filtro={filtro} opcoes={opcoes} onChange={onFiltro} onFechar={() => setAberto(false)} />}
    </th>
  );
}

function PainelFiltro<T>({ col, ancora, filtro, opcoes, onChange, onFechar }: { col: ColDef<T>; ancora: HTMLButtonElement | null; filtro: Filtro | undefined; opcoes: { valor: string; n: number }[]; onChange: (f: Filtro) => void; onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = ancora?.getBoundingClientRect();
  const esq = Math.max(8, Math.min((r?.left ?? 0) - 8, window.innerWidth - 268));
  const topo = (r?.bottom ?? 0) + 6;
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !ancora?.contains(e.target as Node)) onFechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [ancora, onFechar]);
  const f = filtro ?? {};
  const marcados = f.vals ?? opcoes.map((o) => o.valor);
  const alternar = (v: string) => { const s = new Set(marcados); if (s.has(v)) s.delete(v); else s.add(v); onChange({ ...f, vals: s.size === opcoes.length ? undefined : [...s] }); };
  return createPortal(
    <div ref={ref} style={{ position: "fixed", left: esq, top: topo, width: 260 }} className="z-[100] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <div className="mb-2 flex items-center justify-between"><strong>{col.r}</strong><button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({})}>Limpar</button></div>
      {col.t === "txt" && <Input autoFocus className="h-8" placeholder="contém…" value={f.txt ?? ""} onChange={(e) => onChange({ ...f, txt: e.target.value })} />}
      {col.t === "num" && <div className="flex items-center gap-2"><Input autoFocus className="h-8" inputMode="decimal" placeholder="de (≥)" value={f.min ?? ""} onChange={(e) => onChange({ ...f, min: e.target.value })} /><Input className="h-8" inputMode="decimal" placeholder="até (≤)" value={f.max ?? ""} onChange={(e) => onChange({ ...f, max: e.target.value })} /></div>}
      {col.t === "cat" && (<>
        <div className="mb-1 flex gap-3 text-xs"><button className="text-primary hover:underline" onClick={() => onChange({ ...f, vals: undefined })}>Marcar todos</button><button className="text-primary hover:underline" onClick={() => onChange({ ...f, vals: [] })}>Desmarcar todos</button></div>
        <div className="max-h-56 space-y-1 overflow-auto">{opcoes.map((o) => <label key={o.valor} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={marcados.includes(o.valor)} onChange={() => alternar(o.valor)} /><span className="flex-1 truncate">{o.valor || "(vazio)"}</span><span className="text-muted-foreground">{o.n}</span></label>)}</div>
      </>)}
    </div>, document.body);
}
