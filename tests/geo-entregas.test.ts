import { expect, test } from "bun:test";
import { agruparPorUf, agruparPorZona, distanciaKm, zonaDoEnvio } from "../src/lib/geo-entregas";
const o: [number, number] = [-23.5505, -46.6333];
test("Zonas por coordenada, km e região", () => {
  expect(Math.round(distanciaKm(o, [-22.9056, -47.0608]))).toBe(84); // Campinas
  expect(zonaDoEnvio({ data: "", cliente: null, uf: "SP", lat: -23.59, lng: -46.68, custo: 0 }, o).id).toBe("z1");
  expect(zonaDoEnvio({ data: "", cliente: null, uf: "SP", km: 32, custo: 0 }, o)).toMatchObject({ id: "z3", aproximada: true });
  expect(zonaDoEnvio({ data: "", cliente: null, uf: "SP", fora_sp: true, custo: 0 }, o).id).toBe("z4");
  expect(zonaDoEnvio({ data: "", cliente: null, uf: "RJ", custo: 0 }, o).id).toBe("z5");
  const pts = [{ data: "", cliente: null, uf: "SP", custo: 10 }, { data: "", cliente: null, uf: "sp", custo: 5 }, { data: "", cliente: null, uf: "RJ", custo: 50 }];
  expect(agruparPorUf(pts)[0]).toEqual({ uf: "SP", n: 2, custo: 15 });
  expect(agruparPorZona(pts, o).find((z) => z.id === "z3")).toMatchObject({ n: 2, custo: 15, aprox: 2 });
});
