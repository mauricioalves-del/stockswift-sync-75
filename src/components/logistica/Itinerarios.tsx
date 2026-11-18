// Itinerários do prestador: cadastro dos destinos, rota mais curta saindo da fábrica e km apurado no fim da corrida.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Navigation, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Campo, dataBR, inputCls, nf, sb } from "@/components/logistica/ui";
import { calcularRota } from "@/lib/roteirizacao.functions";
import { STATUS_ITIN, type Parada } from "@/lib/roteirizacao";
import { buscarCep, formatarCep, soDigitosCep } from "@/lib/cep";

const paradaVazia: Parada = { cliente: "", endereco: "", numero: "", cidade: "São Paulo", uf: "SP", cep: "" };
const COR: Record<string, string> = { planejado: "bg-info/15 text-info", em_rota: "bg-warning/25 text-foreground", finalizado: "bg-success/15 text-success", cancelado: "bg-muted text-muted-foreground" };

function linkMaps(it: any) {
  const o = it.origem; const ps = (it.paradas as Parada[]).filter((p) => p.lat != null);
  if (!o?.lat || !ps.length) return null;
  const fim = it.retorno_origem ? `${o.lat},${o.lng}` : `${ps[ps.length - 1].lat},${ps[ps.length - 1].lng}`;
  const meio = (it.retorno_origem ? ps : ps.slice(0, -1)).map((p) => `${p.lat},${p.lng}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${o.lat},${o.lng}&destination=${fim}${meio ? `&waypoints=${encodeURIComponent(meio)}` : ""}`;
}

export function Itinerarios({ prestadorId, ordens }: { prestadorId: string; ordens: { id: string; numero: number }[] }) {
  const qc = useQueryClient();
  const rota = useServerFn(calcularRota);
  const q = useQuery({ queryKey: ["tms-itinerarios", prestadorId], queryFn: async () => {
    const r = await sb.from("log_itinerarios").select("*").eq("prestador_id", prestadorId).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    if (r.error) throw r.error; return r.data as any[];
  } });
  const origemQ = useQuery({ queryKey: ["log-origem-fabrica"], queryFn: async () => ((await sb.rpc("log_origem_fabrica")).data ?? null) });
  const [f, setF] = useState({ descricao: "", data: new Date().toISOString().slice(0, 10), ordem_id: "", retorno_origem: false, paradas: [{ ...paradaVazia }] as Parada[] });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const r = () => qc.invalidateQueries({ queryKey: ["tms-itinerarios", prestadorId] });
  const setP = (i: number, k: keyof Parada, v: string) => setF((f) => ({ ...f, paradas: f.paradas.map((p, j) => (j === i ? { ...p, [k]: v, ...(k === "cep" ? {} : { lat: null, lng: null }) } : p)) }));
  const [buscandoCep, setBuscandoCep] = useState<number | null>(null);
  async function mudarCep(i: number, v: string) {
    const fmt = formatarCep(v); setP(i, "cep", fmt);
    if (soDigitosCep(fmt).length !== 8) return;
    setBuscandoCep(i);
    const e = await buscarCep(fmt);
    setBuscandoCep(null);
    if (!e) return toast.error("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
    setF((f) => ({ ...f, paradas: f.paradas.map((p, j) => (j === i && soDigitosCep(p.cep ?? "") === e.cep ? { ...p, endereco: e.endereco || p.endereco, bairro: e.bairro || null, cidade: e.cidade, uf: e.uf, lat: null, lng: null } : p)) }));
    if (!e.endereco) toast.message("CEP geral da cidade: informe a rua manualmente.");
  }

  async function executar(id: string, finalizar = false) {
    setOcupado(id);
    try { const res = await rota({ data: { id, finalizar } }); toast.success(`${finalizar ? "Corrida finalizada" : "Rota calculada"}: ${nf(res.km, 1)} km · ${res.duracao_min} min · ${res.paradas} destino(s)`); r(); }
    catch (e: any) { toast.error(e?.message ?? "Falha ao calcular a rota"); } finally { setOcupado(null); }
  }
  async function salvar() {
    const paradas = f.paradas.filter((p) => p.endereco.trim());
    if (!paradas.length) return toast.error("Informe ao menos um destino com endereço.");
    const o = origemQ.data as any; if (!o?.lat) return toast.error("Origem da fábrica não cadastrada. Avise o gestor de logística.");
    const { data, error } = await sb.from("log_itinerarios").insert({ prestador_id: prestadorId, descricao: f.descricao || null, data: f.data, ordem_id: f.ordem_id || null, retorno_origem: f.retorno_origem, paradas, origem: { nome: o.nome, lat: o.lat, lng: o.lng } }).select("id").single();
    if (error) return toast.error(error.message);
    setF({ ...f, descricao: "", ordem_id: "", paradas: [{ ...paradaVazia }] }); await executar(data.id);
  }
  async function status(it: any, s: string) {
    const extra: any = { status: s }; if (s === "em_rota") extra.iniciado_em = new Date().toISOString();
    const res = await sb.from("log_itinerarios").update(extra).eq("id", it.id); if (res.error) return toast.error(res.error.message); r();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" />Saída: <b className="text-foreground">{(origemQ.data as any)?.nome ?? "fábrica não cadastrada"}</b> — o sistema escolhe a ordem de entrega mais curta e conta os km.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Campo l="Descrição" className="col-span-2"><input className={inputCls} value={f.descricao} placeholder="Ex.: Entregas zona sul" onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
          <Campo l="Data"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
          <Campo l="Ordem de serviço"><select className={inputCls} value={f.ordem_id} onChange={(e) => setF({ ...f, ordem_id: e.target.value })}><option value="">Sem OS</option>{ordens.map((o) => <option key={o.id} value={o.id}>OS {o.numero}</option>)}</select></Campo>
          <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={f.retorno_origem} onChange={(e) => setF({ ...f, retorno_origem: e.target.checked })} />Volta para a fábrica</label>
        </div>
        <div className="mt-3 space-y-2">
          {f.paradas.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border bg-card p-2 md:grid-cols-12">
              <Campo l={`Destino ${i + 1} · CEP`} className="md:col-span-2"><div className="relative"><input className={inputCls} inputMode="numeric" placeholder="00000-000" value={p.cep ?? ""} onChange={(e) => mudarCep(i, e.target.value)} />{buscandoCep === i && <Loader2 aria-label="Buscando CEP" className="absolute right-2 top-1/2 mt-0.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div></Campo>
              <Campo l="Cliente" className="md:col-span-2"><input className={inputCls} value={p.cliente ?? ""} onChange={(e) => setP(i, "cliente", e.target.value)} /></Campo>
              <Campo l={p.bairro ? `Endereço (rua) · ${p.bairro}` : "Endereço (rua)"} className="col-span-2 md:col-span-3"><input className={inputCls} value={p.endereco} onChange={(e) => setP(i, "endereco", e.target.value)} /></Campo>
              <Campo l="Nº" className="md:col-span-1"><input className={inputCls} value={p.numero ?? ""} onChange={(e) => setP(i, "numero", e.target.value)} /></Campo>
              <Campo l="Cidade" className="md:col-span-2"><input className={inputCls} value={p.cidade ?? ""} onChange={(e) => setP(i, "cidade", e.target.value)} /></Campo>
              <Campo l="UF" className="md:col-span-1"><input className={inputCls} maxLength={2} value={p.uf ?? ""} onChange={(e) => setP(i, "uf", e.target.value.toUpperCase())} /></Campo>
              <div className="flex items-end md:col-span-1"><Button variant="ghost" size="icon" aria-label="Remover destino" disabled={f.paradas.length === 1} onClick={() => setF({ ...f, paradas: f.paradas.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setF({ ...f, paradas: [...f.paradas, { ...paradaVazia, cidade: f.paradas.at(-1)?.cidade, uf: f.paradas.at(-1)?.uf }] })}><Plus className="size-4" />Adicionar destino</Button>
          <Button size="sm" disabled={!!ocupado} onClick={salvar}><RouteIcon className="size-4" />Salvar e roteirizar</Button>
        </div>
      </div>

      {(q.data ?? []).length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum itinerário cadastrado.</p> : (
        <div className="space-y-2">{(q.data ?? []).map((it) => {
          const url = linkMaps(it);
          return (
            <div key={it.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm"><b>{dataBR(it.data)}</b>{it.descricao && <span>{it.descricao}</span>}<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR[it.status]}`}>{STATUS_ITIN[it.status]}</span>
                  {it.km_total != null && <span className="font-semibold tabular-nums">{nf(it.km_total, 1)} km{it.duracao_min != null && <span className="font-normal text-muted-foreground"> · {it.duracao_min} min</span>}</span>}</div>
                <div className="flex flex-wrap gap-1">
                  {url && <Button asChild size="sm" variant="outline"><a href={url} target="_blank" rel="noopener noreferrer"><Navigation className="size-4" />Abrir rota</a></Button>}
                  {it.status !== "finalizado" && it.status !== "cancelado" && <>
                    <Button size="sm" variant="outline" disabled={ocupado === it.id} onClick={() => executar(it.id)}>Recalcular</Button>
                    {it.status === "planejado" && <Button size="sm" variant="outline" onClick={() => status(it, "em_rota")}>Iniciar corrida</Button>}
                    <Button size="sm" disabled={ocupado === it.id} onClick={() => executar(it.id, true)}>Finalizar corrida</Button>
                  </>}
                </div>
              </div>
              <ol className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <li>Saída · {it.origem?.nome}</li>
                {(it.paradas as Parada[]).map((p, i) => <li key={i}><b className="text-foreground">{p.sequencia ?? i + 1}.</b> {p.cliente ? `${p.cliente} — ` : ""}{[p.endereco, p.numero, p.bairro, p.cidade, p.uf].filter(Boolean).join(", ")}{p.km_trecho != null && <span className="tabular-nums"> · {nf(p.km_trecho, 1)} km</span>}</li>)}
                {it.retorno_origem && <li>Retorno · {it.origem?.nome}</li>}
              </ol>
            </div>
          );
        })}</div>
      )}
    </div>
  );
}
