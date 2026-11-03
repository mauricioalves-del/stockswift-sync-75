import { describe, expect, it } from "vitest";
import { destinoAcao } from "../src/lib/integracao-link";

describe("Destino das ações", () => {
  it("preserva tela, filtros e seção do link específico", () => {
    expect(destinoAcao("/estoque?sku=05304043#lotes")).toEqual({ externo: false, href: "/estoque?sku=05304043#lotes", pathname: "/estoque", search: { sku: "05304043" }, hash: "lotes" });
  });
  it("permite links externos http/https", () => {
    expect(destinoAcao("https://example.com/acao?id=10")?.href).toBe("https://example.com/acao?id=10");
  });
  it("não aceita execução de código como destino", () => {
    expect(() => destinoAcao("javascript:alert(1)")).toThrow();
    expect(() => destinoAcao("//example.com")).toThrow();
  });
  it("permite ação sem link", () => {
    expect(destinoAcao(" ")).toBeNull();
  });
});