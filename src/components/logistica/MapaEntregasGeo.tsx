// Mapa de entregas (Leaflet): Brasil demarcado por estado (intensidade pelo volume) e, ao escolher São Paulo,
// as zonas da capital (Sul, Leste, Oeste, Norte, Centro) e a região metropolitana, com um ponto por entrega.
import { useEffect, useMemo, useRef, useState } from "react";
import { agruparPorUf, UF_CENTRO, ZONAS_SP, zonaSpDoEnvio, type PontoEntrega, type ZonaSP } from "@/lib/geo-entregas";
import ufsGeo from "@/lib/geo/br-ufs.json";
import zonasGeo from "@/lib/geo/sp-zonas.json";

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
let carregando: Promise<any> | null = null;
function carregarLeaflet(): Promise<any> {
  const w = window as any; if (w.L) return Promise.resolve(w.L); if (carregando) return carregando;
  carregando = new Promise((ok, erro) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `${LEAFLET}leaflet.min.css`; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = `${LEAFLET}leaflet.min.js`; s.onload = () => ok(w.L); s.onerror = erro; document.head.appendChild(s);
  });
  return carregando;
}
const brl = (v: number, d = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: d, minimumFractionDigits: d });
const COR_ZONA = Object.fromEntries(ZONAS_SP.map((z) => [z.id, z.cor])) as Record<ZonaSP, string>;
const POLIGONOS = (zonasGeo as any).features.map((f: any) => ({ zona: f.properties.zona, geometry: f.geometry }));
// escala de azul (volume por estado)
const escala = (t: number) => (t <= 0 ? "#eef2f7" : `hsl(222 ${35 + 40 * t}% ${88 - 52 * t}%)`);

export type PontoMapa = PontoEntrega & { cep?: string | null };
export function MapaEntregasGeo({ pontos }: { pontos: PontoMapa[] }) {
  const div = useRef<HTMLDivElement>(null); const mapa = useRef<any>(null); const camada = useRef<any>(null);
  const [uf, setUf] = useState("BR"); const [metrica, setMetrica] = useState<"n" | "custo">("n"); const [erro, setErro] = useState(false);
  const porUf = useMemo(() => agruparPorUf(pontos), [pontos]);
  const doEstado = useMemo(() => (uf === "BR" ? pontos : pontos.filter((p) => (p.uf ?? "SP").toUpperCase() === uf)), [pontos, uf]);
  const zonas = useMemo(() => { if (uf !== "SP") return [];
    const m = new Map<ZonaSP, { n: number; custo: number }>(); for (const p of doEstado) { const z = zonaSpDoEnvio(p, POLIGONOS); const a = m.get(z) ?? { n: 0, custo: 0 }; a.n++; a.custo += p.custo; m.set(z, a); }
    return ZONAS_SP.map((z) => ({ ...z, ...(m.get(z.id) ?? { n: 0, custo: 0 }) })); }, [doEstado, uf]);
  const geo = doEstado.filter((p) => p.lat != null && p.lng != null);
  const total = doEstado.length || 1, custoTot = doEstado.reduce((s, p) => s + p.custo, 0);
  const cidades = useMemo(() => { const m = new Map<string, { n: number; custo: number }>(); for (const p of doEstado) { if (!p.cidade) continue; const a = m.get(p.cidade) ?? { n: 0, custo: 0 }; a.n++; a.custo += p.custo; m.set(p.cidade, a); } return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6); }, [doEstado]);

  useEffect(() => {
    let vivo = true;
    carregarLeaflet().then((L) => {
      if (!vivo || !div.current || mapa.current) return;
      mapa.current = L.map(div.current, { scrollWheelZoom: false, zoomSnap: 0.25 }).setView([-15, -53], 4);
      // Mar em azul: basemap oceânico da Esri (fundo) + camada de rótulos e fronteiras por cima.
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Fontes: GEBCO, NOAA, National Geographic e outros órgãos de geociências", maxZoom: 16 }).addTo(mapa.current);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(mapa.current);
      camada.current = L.layerGroup().addTo(mapa.current); desenhar();
    }).catch(() => setErro(true));
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { desenhar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uf, metrica, pontos]);

  function pontosNoMapa(L: any, lista: PontoMapa[]) {
    for (const p of lista) {
      const z = (p.uf ?? "").toUpperCase() === "SP" ? zonaSpDoEnvio(p, POLIGONOS) : null; const cor = z ? COR_ZONA[z] : "#111827";
      L.circleMarker([p.lat, p.lng], { radius: 6, color: "#ffffff", weight: 2, fillColor: cor, fillOpacity: 1 })
        .bindPopup(`<b>${p.cliente ?? "—"}</b><br>${p.cidade ?? ""} ${p.uf ?? ""}${z ? ` · ${ZONAS_SP.find((x) => x.id === z)!.nome}` : ""}<br>${p.data.split("-").reverse().join("/")} · ${brl(p.custo, 2)}`).addTo(camada.current);
    }
  }
  function desenhar() {
    const L = (window as any).L; const m = mapa.current; if (!L || !m || !camada.current) return;
    camada.current.clearLayers();
    if (uf === "BR") {
      const val = new Map(porUf.map((x) => [x.uf, metrica === "n" ? x.n : x.custo])); const max = Math.max(1, ...val.values());
      L.geoJSON(ufsGeo as any, {
        style: (f: any) => ({ color: "#ffffff", weight: 1.2, fillColor: escala(Math.sqrt((val.get(f.properties.uf) ?? 0) / max)), fillOpacity: 0.85 }),
        onEachFeature: (f: any, layer: any) => { const s = f.properties.uf, x = porUf.find((y) => y.uf === s);
          layer.bindTooltip(`<b>${UF_CENTRO[s]?.[2] ?? s}</b><br>${x ? `${x.n} envio(s) · ${brl(x.custo)}<br>médio ${brl(x.custo / x.n, 2)}` : "sem envios"}`, { sticky: true });
          layer.on({ click: () => setUf(s), mouseover: () => layer.setStyle({ weight: 2.5, color: "#111827" }), mouseout: () => layer.setStyle({ weight: 1.2, color: "#ffffff" }) }); },
      }).addTo(camada.current);
      for (const x of porUf) { const c = UF_CENTRO[x.uf]; if (!c) continue;
        L.marker([c[0], c[1]], { interactive: false, icon: L.divIcon({ className: "", html: `<div style="transform:translate(-50%,-50%);font:700 10px system-ui;color:#0f172a;background:#fff;border-radius:9px;padding:1px 6px;box-shadow:0 1px 2px #0003;white-space:nowrap">${x.uf} · ${metrica === "n" ? x.n : brl(x.custo)}</div>` }) }).addTo(camada.current); }
      pontosNoMapa(L, geo);
      m.flyTo([-15, -53], 4, { duration: 0.6 });
      return;
    }
    const contorno = (ufsGeo as any).features.find((f: any) => f.properties.uf === uf);
    if (uf === "SP") {
      L.geoJSON(zonasGeo as any, { style: (f: any) => ({ color: COR_ZONA[f.properties.zona as ZonaSP], weight: 1.5, fillColor: COR_ZONA[f.properties.zona as ZonaSP], fillOpacity: 0.28 }),
        onEachFeature: (f: any, layer: any) => { const z = zonas.find((x) => x.id === f.properties.zona); layer.bindTooltip(`<b>${z?.nome}</b><br>${z?.n ?? 0} envio(s) · ${brl(z?.custo ?? 0)}`, { sticky: true }); } }).addTo(camada.current);
      pontosNoMapa(L, geo);
      const b = L.geoJSON(zonasGeo as any).getBounds(); geo.forEach((p) => b.extend([p.lat, p.lng]));
      m.flyToBounds(geo.some((p) => (p.lat! < -24.2 || p.lat! > -23 || p.lng! < -47.3 || p.lng! > -45.6)) ? b.pad(0.05) : L.geoJSON(zonasGeo as any).getBounds().pad(0.02), { duration: 0.6 });
      return;
    }
    if (contorno) { const g = L.geoJSON(contorno, { style: { color: "#34436C", weight: 2, fillColor: "#34436C", fillOpacity: 0.08 } }).addTo(camada.current); pontosNoMapa(L, geo); m.flyToBounds(g.getBounds().pad(0.05), { duration: 0.6 }); }
  }

  const estados = porUf.map((x) => x.uf);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <div className="relative overflow-hidden rounded-xl border">
        <div className="absolute left-12 top-3 z-[500] flex flex-wrap gap-1 rounded-lg bg-white/95 p-1 text-xs shadow">
          <button onClick={() => setUf("BR")} className={`rounded-md px-2 py-1 font-semibold ${uf === "BR" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Brasil</button>
          <button onClick={() => setUf("SP")} className={`rounded-md px-2 py-1 font-semibold ${uf === "SP" ? "bg-slate-900 text-white" : "text-slate-700"}`}>São Paulo (zonas)</button>
          <select value={uf === "BR" || uf === "SP" ? "" : uf} onChange={(e) => e.target.value && setUf(e.target.value)} className="rounded-md border bg-white px-1 py-1 font-semibold text-slate-700"><option value="">Outro estado…</option>{Object.keys(UF_CENTRO).filter((u) => u !== "SP").sort().map((u) => <option key={u} value={u}>{UF_CENTRO[u][2]}{estados.includes(u) ? " ●" : ""}</option>)}</select>
          {uf === "BR" && <><button onClick={() => setMetrica("n")} className={`rounded-md px-2 py-1 ${metrica === "n" ? "bg-slate-200 font-semibold" : "text-slate-700"}`}>Envios</button><button onClick={() => setMetrica("custo")} className={`rounded-md px-2 py-1 ${metrica === "custo" ? "bg-slate-200 font-semibold" : "text-slate-700"}`}>Custo</button></>}
        </div>
        <div ref={div} className="h-[520px] w-full bg-mar" />
        {uf === "SP" && <div className="absolute bottom-6 left-3 z-[500] rounded-lg bg-white/95 p-2 text-[11px] text-slate-700 shadow">{ZONAS_SP.slice(0, 6).map((z) => <div key={z.id} className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: z.cor }} />{z.nome}</div>)}<div className="mt-1 flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-white bg-slate-700 shadow" />entrega</div></div>}
        {erro && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Não foi possível carregar o mapa.</p>}
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">{uf === "BR" ? "Brasil" : UF_CENTRO[uf]?.[2]} · {doEstado.length} envio(s)</div>
          <div className="text-2xl font-bold tabular-nums">{brl(custoTot)}</div>
          <div className="text-xs text-muted-foreground">custo médio {brl(custoTot / total, 2)} · {geo.length} entrega(s) com endereço no mapa</div>
        </div>
        {uf === "SP" ? <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="mb-2 text-xs font-bold">Envios por zona</div>
          {zonas.filter((z) => z.n || z.id !== "sem_endereco").map((z) => <div key={z.id} className="mb-1.5 text-xs"><div className="flex justify-between gap-2"><span><span className="mr-1.5 inline-block size-2.5 rounded-sm" style={{ background: z.cor }} />{z.nome}</span><span className="font-semibold tabular-nums">{z.n} · {Math.round((z.n / total) * 100)}%</span></div>
            <div className="mt-0.5 h-1.5 rounded bg-muted"><div className="h-1.5 rounded" style={{ width: `${(z.n / total) * 100}%`, background: z.cor }} /></div>
            <div className="text-[10px] text-muted-foreground">{brl(z.custo)}{z.n ? ` · médio ${brl(z.custo / z.n, 2)}` : ""}</div></div>)}
        </div> : uf === "BR" ? <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="mb-2 text-xs font-bold">Envios por estado</div>
          {porUf.slice(0, 10).map((x) => <button key={x.uf} onClick={() => setUf(x.uf)} className="flex w-full justify-between rounded px-1 py-0.5 text-xs hover:bg-muted"><span>{UF_CENTRO[x.uf][2]}</span><span className="tabular-nums">{x.n} · {brl(x.custo)}</span></button>)}</div>
          : <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="mb-2 text-xs font-bold">Principais cidades</div>{cidades.length ? cidades.map(([c, a]) => <div key={c} className="flex justify-between text-xs"><span>{c}</span><span className="tabular-nums">{a.n} · {brl(a.custo)}</span></div>) : <p className="text-xs text-muted-foreground">Sem cidade registrada (histórico importado).</p>}</div>}
        <p className="text-[11px] text-muted-foreground">Cada entrega com endereço aparece como um ponto (as novas solicitações gravam a coordenada pelo CEP). Na capital, a zona vem do ponto no mapa ou da faixa do CEP; o histórico importado não tem endereço e aparece como “Grande SP sem endereço”.</p>
      </div>
    </div>
  );
}
