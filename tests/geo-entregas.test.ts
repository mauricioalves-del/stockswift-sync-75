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

test("Zonas de São Paulo por CEP e por polígono", async () => {
  const { zonaSpPorCep, zonaSpDoEnvio, pontoNoPoligono } = await import("../src/lib/geo-entregas");
  expect(["01310-100", "02020-000", "03178-200", "08210-000", "04538-133", "05508-000", "09520-000", "13010-111", "20040-002"].map(zonaSpPorCep)).toEqual(["centro", "norte", "leste", "leste", "sul", "oeste", "metropolitana", "interior", null]);
  const quad = { type: "Polygon" as const, coordinates: [[[-46.7, -23.6], [-46.6, -23.6], [-46.6, -23.5], [-46.7, -23.5], [-46.7, -23.6]]] };
  expect(pontoNoPoligono(-46.65, -23.55, quad)).toBe(true);
  expect(zonaSpDoEnvio({ data: "", cliente: null, uf: "SP", lat: -23.55, lng: -46.65, custo: 0 }, [{ zona: "oeste", geometry: quad }])).toBe("oeste");
  expect(zonaSpDoEnvio({ data: "", cliente: null, uf: "SP", custo: 0 }, [])).toBe("sem_endereco");
  const z = (await import("../src/lib/geo/sp-zonas.json")).default as any;
  const sé = z.features.find((f: any) => pontoNoPoligono(-46.6340, -23.5503, f.geometry)); // Praça da Sé
  expect(sé?.properties.zona).toBe("centro");
  const pinheiros = z.features.find((f: any) => pontoNoPoligono(-46.6840, -23.5670, f.geometry));
  expect(pinheiros?.properties.zona).toBe("oeste");
  const guarulhos = z.features.find((f: any) => pontoNoPoligono(-46.5333, -23.4628, f.geometry));
  expect(guarulhos?.properties.zona).toBe("metropolitana");
});
