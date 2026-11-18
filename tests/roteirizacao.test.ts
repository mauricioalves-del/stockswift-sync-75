import { describe, expect, test } from "bun:test";
import { metrosParaKm, ordenarPelaViagem, urlViagem } from "../src/lib/roteirizacao";

describe("roteirização", () => {
  test("reordena as paradas pela sequência otimizada, origem fixa", () => {
    const r = ordenarPelaViagem(["A", "B", "C"], [{ waypoint_index: 0 }, { waypoint_index: 3 }, { waypoint_index: 1 }, { waypoint_index: 2 }]);
    expect(r).toEqual(["B", "C", "A"]);
  });
  test("rejeita resposta com número de pontos diferente", () => {
    expect(() => ordenarPelaViagem(["A"], [{ waypoint_index: 0 }])).toThrow();
  });
  test("km com uma casa decimal", () => { expect(metrosParaKm(12345)).toBe(12.3); });
  test("sai sempre da fábrica e só fecha o ciclo com retorno", () => {
    const o = { nome: "Fábrica", lat: -23.5, lng: -46.6 };
    const ida = urlViagem("https://x", o, [{ lat: -23.6, lng: -46.7 }], false);
    expect(ida).toContain("/-46.600000,-23.500000;-46.700000,-23.600000?");
    expect(ida).toContain("source=first&roundtrip=false&destination=any");
    expect(urlViagem("https://x", o, [{ lat: -23.6, lng: -46.7 }], true)).toContain("roundtrip=true&overview");
  });
});
