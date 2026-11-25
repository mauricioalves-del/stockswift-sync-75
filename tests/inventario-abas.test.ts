import { test, expect } from "bun:test";
import { dividirInventarios, grupoInventario } from "../src/lib/inventario-status";

test("Inventários em estágio de contagem ficam na aba Em aberto", () => {
  for (const s of ["planejado", "lista_gerada", "em_contagem", "em_recontagem"]) expect(grupoInventario(s)).toBe("aberto");
});

test("Inventário finalizado ou cancelado sai da aba Em aberto", () => {
  expect(grupoInventario("finalizado")).toBe("finalizado");
  expect(grupoInventario("cancelado")).toBe("finalizado");
});

test("Divisão da lista mantém os dois grupos separados e completos", () => {
  const inv = [
    { numero: 8, status: "lista_gerada" },
    { numero: 7, status: "finalizado" },
    { numero: 5, status: "finalizado" },
    { numero: 6, status: "em_recontagem" },
    { numero: 4, status: "cancelado" },
  ];
  const { abertos, finalizados } = dividirInventarios(inv);
  expect(abertos.map((i) => i.numero)).toEqual([8, 6]);
  expect(finalizados.map((i) => i.numero)).toEqual([7, 5, 4]);
});
