// Roteirizador do portal do prestador: geocodifica as paradas, pede ao OSRM a viagem mais curta saindo da fábrica
// e grava a sequência e a quilometragem. Só o servidor grava km (o banco ignora km vindo do parceiro).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metrosParaKm, ordenarPelaViagem, urlViagem, type Parada, type Ponto } from "./roteirizacao";

const OSRM = "https://router.project-osrm.org";
const UA = { "User-Agent": "Magio-Logistica/1.0 (roteirizacao)" };

async function geocodificar(p: Parada): Promise<{ lat: number; lng: number } | null> {
  const cep = String(p.cep ?? "").replace(/\D/g, "");
  const consultas = [[p.endereco, p.numero, p.cidade, p.uf].filter(Boolean).join(", "), [p.endereco, p.cidade, p.uf].filter(Boolean).join(", ")];
  for (const q of consultas) {
    if (!q.trim()) continue;
    try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: UA }); if (r.ok) { const j: any = await r.json(); if (j?.[0]) return { lat: +j[0].lat, lng: +j[0].lon }; } } catch { /* segue */ }
  }
  if (cep.length === 8) {
    try { const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`); if (r.ok) { const j: any = await r.json(); const c = j?.location?.coordinates; if (c?.latitude && c?.longitude) return { lat: +c.latitude, lng: +c.longitude }; } } catch { /* segue */ }
  }
  return null;
}

export const calcularRota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; finalizar?: boolean }) => {
    if (!d || typeof d.id !== "string" || !/^[0-9a-f-]{36}$/i.test(d.id)) throw new Error("Itinerário inválido.");
    return { id: d.id, finalizar: !!d.finalizar };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: it, error } = await sb.from("log_itinerarios").select("*").eq("id", data.id).maybeSingle();
    if (error || !it) throw new Error("Itinerário não encontrado.");
    const [{ data: meu }, { data: gestor }] = await Promise.all([sb.rpc("log_meu_prestador"), sb.rpc("is_gestor", { _user_id: context.userId })]);
    if (meu !== it.prestador_id && !gestor) throw new Error("Sem permissão para este itinerário.");
    if (it.status === "finalizado") throw new Error("Corrida já finalizada.");
    const paradas: Parada[] = Array.isArray(it.paradas) ? it.paradas : [];
    if (!paradas.length) throw new Error("Cadastre ao menos um destino de entrega.");
    if (paradas.length > 24) throw new Error("Máximo de 24 destinos por itinerário.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = (await supabaseAdmin.from("app_config").select("valor").eq("chave", "log_origem").maybeSingle()).data?.valor as any;
    if (!cfg?.lat || !cfg?.lng) throw new Error("Origem da fábrica não cadastrada (Cadastros de transporte › Origem).");
    const origem: Ponto = { nome: cfg.nome ?? "Fábrica", lat: +cfg.lat, lng: +cfg.lng };

    const faltando: string[] = [];
    for (const p of paradas) {
      if (p.lat != null && p.lng != null) continue;
      const g = await geocodificar(p); if (g) { p.lat = g.lat; p.lng = g.lng; } else faltando.push(p.endereco);
    }
    if (faltando.length) throw new Error(`Endereço não localizado: ${faltando.join("; ")}. Revise rua, número, cidade e CEP.`);

    const r = await fetch(urlViagem(OSRM, origem, paradas as { lat: number; lng: number }[], it.retorno_origem), { headers: UA });
    if (!r.ok) throw new Error(`Roteirizador indisponível [${r.status}]. Tente novamente em instantes.`);
    const j: any = await r.json();
    if (j.code !== "Ok" || !j.trips?.[0]) throw new Error(`Não foi possível traçar a rota (${j.code ?? "erro"}).`);
    const trip = j.trips[0];
    const ordenadas = ordenarPelaViagem(paradas, j.waypoints).map((p, i) => ({ ...p, sequencia: i + 1, km_trecho: trip.legs?.[i] ? metrosParaKm(trip.legs[i].distance) : null }));
    const km = metrosParaKm(trip.distance), min = Math.round(trip.duration / 60);
    const upd: any = { paradas: ordenadas, km_total: km, duracao_min: min, geometria: trip.geometry, origem };
    if (data.finalizar) { upd.status = "finalizado"; upd.finalizado_em = new Date().toISOString(); }
    const u = await supabaseAdmin.from("log_itinerarios").update(upd).eq("id", it.id);
    if (u.error) throw new Error(u.error.message);
    return { km, duracao_min: min, paradas: ordenadas.length, retorno_km: it.retorno_origem && trip.legs?.length ? metrosParaKm(trip.legs[trip.legs.length - 1].distance) : null };
  });
