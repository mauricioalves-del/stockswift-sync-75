// Mapa de entregas (Leaflet + OpenStreetMap): Brasil com bolhas por estado; ao escolher um estado, o mapa aproxima
// e mostra as zonas de entrega em anéis a partir da origem, com os pontos de entrega geolocalizados.
import { useEffect, useMemo, useRef, useState } from "react";
import { agruparPorUf, agruparPorZona, UF_CENTRO, ZONAS_ANEL, zonaDoEnvio, type PontoEntrega } from "@/lib/geo-entregas";

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
let carregando: Promise<any> | null = null;
function carregarLeaflet(): Promise<any> {
  const w = window as any; if (w.L) return Promise.resolve(w.L);
  if (carregando) return carregando;
  carregando = new Promise((ok, erro) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `${LEAFLET}leaflet.min.css`; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = `${LEAFLET}leaflet.min.js`; s.onload = () => ok(w.L); s.onerror = erro; document.head.appendChild(s);
  });
  return carregando;
}
const brl = (v: number, d = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d, minimumFractionDigits: d });

export function MapaEntregasGeo({ pontos, origem, origemNome }: { pontos: PontoEntrega[]; origem: [number, number]; origemNome: string }) {
  const div = useRef<HTMLDivElement>(null); const mapa = useRef<any>(null); const camada = useRef<any>(null);
  const [uf, setUf] = useState<string>("BR"); const [metrica, setMetrica] = useState<"n" | "custo">("n"); const [erro, setErro] = useState(false);
  const porUf = useMemo(() => agruparPorUf(pontos), [pontos]);
  const doEstado = useMemo(() => (uf === "BR" ? pontos : pontos.filter((p) => (p.uf ?? "SP").toUpperCase() === uf)), [pontos, uf]);
  const zonas = useMemo(() => agruparPorZona(doEstado, origem), [doEstado, origem]);
  const geo = doEstado.filter((p) => p.lat != null && p.lng != null);
  const total = doEstado.length || 1, custoTot = doEstado.reduce((s, p) => s + p.custo, 0);
  const cidades = useMemo(() => { const m = new Map<string, { n: number; custo: number }>(); for (const p of doEstado) { if (!p.cidade) continue; const a = m.get(p.cidade) ?? { n: 0, custo: 0 }; a.n++; a.custo += p.custo; m.set(p.cidade, a); } return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6); }, [doEstado]);

  useEffect(() => {
    let vivo = true;
    carregarLeaflet().then((L) => {
      if (!vivo || !div.current || mapa.current) return;
      mapa.current = L.map(div.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([-14.5, -52], 4);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap", maxZoom: 16 }).addTo(mapa.current);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "overlayPane" }).addTo(mapa.current);
      camada.current = L.layerGroup().addTo(mapa.current); desenhar();
    }).catch(() => setErro(true));
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { desenhar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uf, metrica, pontos, origem]);

  function desenhar() {
    const L = (window as any).L; const m = mapa.current; if (!L || !m || !camada.current) return;
    camada.current.clearLayers();
    if (uf === "BR") {
      const max = Math.max(1, ...porUf.map((x) => (metrica === "n" ? x.n : x.custo)));
      for (const x of porUf) {
        const [lat, lng, nome] = UF_CENTRO[x.uf]; const v = metrica === "n" ? x.n : x.custo;
        const r = 7 + 32 * Math.sqrt(v / max);
        const cor = x.uf === "SP" ? "#34436C" : x.uf === "PA" ? "#2E7D6B" : "#D98E04";
        L.circleMarker([lat, lng], { radius: r, color: "#fff", weight: 1.5, fillColor: cor, fillOpacity: 0.75 })
          .bindTooltip(`<b>${nome}</b><br>${x.n} envio(s) · ${brl(x.custo)}<br>médio ${brl(x.custo / x.n, 2)}<br><i>clique para ver as zonas</i>`, { direction: "top" })
          .on("click", () => setUf(x.uf)).addTo(camada.current);
        L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<div style="font:700 10px sans-serif;color:#fff;text-align:center;line-height:${2 * r}px;width:${2 * r}px;margin:-${r}px 0 0 -${r}px">${x.uf}</div>` }), interactive: false }).addTo(camada.current);
      }
      m.flyTo([-14.5, -52], 4, { duration: 0.6 });
      return;
    }
    // Estado: anéis das zonas a partir da origem + pontos de entrega
    for (const z of [...ZONAS_ANEL].reverse()) { if (!isFinite(z.ate)) continue; L.circle(origem, { radius: z.ate * 1000, color: z.cor, weight: 1, fillColor: z.cor, fillOpacity: 0.07, dashArray: "4 4" }).bindTooltip(z.nome, { sticky: true }).addTo(camada.current); }
    L.circleMarker(origem, { radius: 7, color: "#111", weight: 2, fillColor: "#facc15", fillOpacity: 1 }).bindTooltip(`<b>${origemNome}</b> · origem`, { permanent: false }).addTo(camada.current);
    for (const p of geo) { const z = zonaDoEnvio(p, origem); const cor = ZONAS_ANEL.find((x) => x.id === z.id)!.cor;
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1, fillColor: cor, fillOpacity: 0.9 }).bindPopup(`<b>${p.cliente ?? "—"}</b><br>${p.cidade ?? ""} ${p.uf ?? ""}<br>${p.data.split("-").reverse().join("/")} · ${brl(p.custo, 2)}${z.dist != null ? `<br>${Math.round(z.dist)} km da origem` : ""}`).addTo(camada.current); }
    const pts: [number, number][] = geo.map((p) => [p.lat!, p.lng!]);
    const centro = UF_CENTRO[uf]; const temOrigem = uf === "SP";
    if (pts.length) m.flyToBounds(L.latLngBounds([...pts, ...(temOrigem ? [origem] : [])]).pad(0.25), { duration: 0.6, maxZoom: 11 });
    else if (temOrigem) m.flyTo(origem, 9, { duration: 0.6 });
    else if (centro) m.flyTo([centro[0], centro[1]], 6, { duration: 0.6 });
  }

  const estados = porUf.map((x) => x.uf);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <div className="relative overflow-hidden rounded-xl border">
        <div className="absolute left-3 top-3 z-[500] flex flex-wrap gap-1 rounded-lg bg-white/95 p-1 text-xs shadow dark:bg-slate-900/95">
          <button onClick={() => setUf("BR")} className={`rounded-md px-2 py-1 font-semibold ${uf === "BR" ? "bg-slate-900 text-white" : ""}`}>Brasil</button>
          <select value={uf === "BR" ? "" : uf} onChange={(e) => e.target.value && setUf(e.target.value)} className="rounded-md border bg-transparent px-1 py-1 font-semibold"><option value="">Estado…</option>{Object.keys(UF_CENTRO).sort().map((u) => <option key={u} value={u}>{u}{estados.includes(u) ? " ●" : ""}</option>)}</select>
          {uf === "BR" && <><button onClick={() => setMetrica("n")} className={`rounded-md px-2 py-1 ${metrica === "n" ? "bg-slate-200 font-semibold dark:bg-slate-700" : ""}`}>Envios</button><button onClick={() => setMetrica("custo")} className={`rounded-md px-2 py-1 ${metrica === "custo" ? "bg-slate-200 font-semibold dark:bg-slate-700" : ""}`}>Custo</button></>}
        </div>
        <div ref={div} className="h-[460px] w-full bg-muted" />
        {erro && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Não foi possível carregar o mapa (sem acesso aos mapas na rede).</p>}
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">{uf === "BR" ? "Brasil" : UF_CENTRO[uf]?.[2]} · {doEstado.length} envio(s)</div>
          <div className="text-2xl font-bold tabular-nums">{brl(custoTot)}</div>
          <div className="text-xs text-muted-foreground">custo médio {brl(custoTot / total, 2)} · {geo.length} com coordenada no mapa</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="mb-2 text-xs font-bold">Zonas de entrega (a partir de {origemNome})</div>
          {zonas.map((z) => <div key={z.id} className="mb-1.5 text-xs"><div className="flex justify-between gap-2"><span><span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: z.cor }} />{z.nome}</span><span className="tabular-nums font-semibold">{z.n} · {Math.round((z.n / total) * 100)}%</span></div>
            <div className="mt-0.5 h-1.5 rounded bg-muted"><div className="h-1.5 rounded" style={{ width: `${(z.n / total) * 100}%`, background: z.cor }} /></div>
            <div className="text-[10px] text-muted-foreground">{brl(z.custo)}{z.n ? ` · médio ${brl(z.custo / z.n, 2)}` : ""}{z.aprox ? ` · ${z.aprox} por região/km (sem coordenada)` : ""}</div></div>)}
        </div>
        {uf === "BR" ? <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="mb-2 text-xs font-bold">Envios por estado</div>
          {porUf.slice(0, 8).map((x) => <button key={x.uf} onClick={() => setUf(x.uf)} className="flex w-full justify-between rounded px-1 py-0.5 text-xs hover:bg-muted"><span>{UF_CENTRO[x.uf][2]}</span><span className="tabular-nums">{x.n} · {brl(x.custo)}</span></button>)}</div>
          : cidades.length > 0 && <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="mb-2 text-xs font-bold">Principais cidades</div>{cidades.map(([c, a]) => <div key={c} className="flex justify-between text-xs"><span>{c}</span><span className="tabular-nums">{a.n} · {brl(a.custo)}</span></div>)}</div>}
        <p className="text-[11px] text-muted-foreground">As novas solicitações gravam a coordenada pelo CEP e aparecem como pontos. O histórico importado não tem endereço: entra nas zonas pela região (Grande SP = zona 3, interior = zona 4, outros estados = zona 5) ou pelo km registrado.</p>
      </div>
    </div>
  );
}
