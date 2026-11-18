// Mapa de entregas: centroides das UFs, zonas de entrega em anéis a partir da origem e agregações.
export const UF_CENTRO: Record<string, [number, number, string]> = {
  AC: [-9.97, -67.81, "Acre"], AL: [-9.65, -35.73, "Alagoas"], AP: [0.03, -51.07, "Amapá"], AM: [-3.12, -60.02, "Amazonas"], BA: [-12.97, -38.5, "Bahia"],
  CE: [-3.73, -38.52, "Ceará"], DF: [-15.79, -47.88, "Distrito Federal"], ES: [-20.32, -40.34, "Espírito Santo"], GO: [-16.68, -49.25, "Goiás"], MA: [-2.53, -44.3, "Maranhão"],
  MT: [-15.6, -56.1, "Mato Grosso"], MS: [-20.45, -54.62, "Mato Grosso do Sul"], MG: [-19.92, -43.94, "Minas Gerais"], PA: [-1.46, -48.49, "Pará"], PB: [-7.12, -34.86, "Paraíba"],
  PR: [-25.43, -49.27, "Paraná"], PE: [-8.05, -34.88, "Pernambuco"], PI: [-5.09, -42.8, "Piauí"], RJ: [-22.91, -43.17, "Rio de Janeiro"], RN: [-5.79, -35.21, "Rio Grande do Norte"],
  RS: [-30.03, -51.23, "Rio Grande do Sul"], RO: [-8.76, -63.9, "Rondônia"], RR: [2.82, -60.67, "Roraima"], SC: [-27.6, -48.55, "Santa Catarina"], SP: [-23.55, -46.63, "São Paulo"],
  SE: [-10.91, -37.07, "Sergipe"], TO: [-10.18, -48.33, "Tocantins"],
};
/** Zonas de entrega em anéis (km a partir da origem). */
export const ZONAS_ANEL = [
  { id: "z1", nome: "Zona 1 · até 10 km", ate: 10, cor: "#1d4ed8" },
  { id: "z2", nome: "Zona 2 · 10 a 25 km", ate: 25, cor: "#0891b2" },
  { id: "z3", nome: "Zona 3 · 25 a 50 km (Grande SP)", ate: 50, cor: "#16a34a" },
  { id: "z4", nome: "Zona 4 · 50 a 150 km", ate: 150, cor: "#d97706" },
  { id: "z5", nome: "Zona 5 · acima de 150 km", ate: Infinity, cor: "#dc2626" },
] as const;
export type PontoEntrega = { data: string; cliente: string | null; uf: string | null; cidade?: string | null; lat?: number | null; lng?: number | null; km?: number | null; zona?: string | null; fora_sp?: boolean | null; custo: number };

export function distanciaKm(a: [number, number], b: [number, number]) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Zona do envio: pela coordenada; sem ela, pelo km registrado; sem km, pela região (Grande SP → zona 3, interior → zona 4, demais → zona 5). */
export function zonaDoEnvio(p: PontoEntrega, origem: [number, number]): { id: string; aproximada: boolean; dist: number | null } {
  let d: number | null = null, aprox = false;
  if (p.lat != null && p.lng != null) d = distanciaKm(origem, [p.lat, p.lng]);
  else if (p.km != null && p.km > 0) { d = p.km; aprox = true; }
  if (d != null) return { id: ZONAS_ANEL.find((z) => d! <= z.ate)!.id, aproximada: aprox, dist: d };
  const uf = (p.uf ?? "SP").toUpperCase();
  if (uf !== "SP") return { id: "z5", aproximada: true, dist: null };
  return { id: p.fora_sp || p.zona === "interior_sp" ? "z4" : "z3", aproximada: true, dist: null };
}
export function agruparPorUf(pontos: PontoEntrega[]) {
  const m = new Map<string, { uf: string; n: number; custo: number }>();
  for (const p of pontos) { const uf = (p.uf ?? "SP").toUpperCase(); if (!UF_CENTRO[uf]) continue; const a = m.get(uf) ?? { uf, n: 0, custo: 0 }; a.n++; a.custo += p.custo; m.set(uf, a); }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
export function agruparPorZona(pontos: PontoEntrega[], origem: [number, number]) {
  const m = new Map<string, { n: number; custo: number; aprox: number }>(ZONAS_ANEL.map((z) => [z.id, { n: 0, custo: 0, aprox: 0 }]));
  for (const p of pontos) { const z = zonaDoEnvio(p, origem); const a = m.get(z.id)!; a.n++; a.custo += p.custo; if (z.aproximada) a.aprox++; }
  return ZONAS_ANEL.map((z) => ({ ...z, ...m.get(z.id)! }));
}
