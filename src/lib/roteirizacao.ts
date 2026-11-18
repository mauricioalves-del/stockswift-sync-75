// Roteirização do portal do prestador: tipos e regras puras (sem rede), compartilhadas entre tela e servidor.
export type Ponto = { nome: string; lat: number; lng: number };
export type Parada = { endereco: string; bairro?: string | null; numero?: string | null; cep?: string | null; cidade?: string | null; uf?: string | null; cliente?: string | null; lat?: number | null; lng?: number | null; sequencia?: number | null; km_trecho?: number | null };

/** Waypoints do OSRM /trip trazem, na ordem de entrada, a posição de cada ponto na viagem otimizada. Índice 0 é a origem. */
export function ordenarPelaViagem<T>(paradas: T[], waypoints: { waypoint_index: number }[]): T[] {
  if (waypoints.length !== paradas.length + 1) throw new Error("Resposta do roteirizador incompleta.");
  return paradas.map((p, i) => ({ p, pos: waypoints[i + 1].waypoint_index })).sort((a, b) => a.pos - b.pos).map((x) => x.p);
}
/** Km com 1 casa a partir de metros. */
export const metrosParaKm = (m: number) => Math.round(m / 100) / 10;

/** Monta a URL do OSRM: origem fixa como primeiro ponto; com retorno, fecha o ciclo na fábrica. */
export function urlViagem(base: string, origem: Ponto, pontos: { lat: number; lng: number }[], retorno: boolean) {
  const coords = [origem, ...pontos].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  return `${base}/trip/v1/driving/${coords}?source=first&roundtrip=${retorno}${retorno ? "" : "&destination=any"}&overview=simplified&geometries=geojson&steps=false`;
}
export const STATUS_ITIN: Record<string, string> = { planejado: "Planejado", em_rota: "Em rota", finalizado: "Finalizado", cancelado: "Cancelado" };
