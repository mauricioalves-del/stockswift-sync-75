import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Mágio Chocolates — Gestão de Estoque" },
    { name: "description", content: "Gestão de estoque, inventário e abastecimento da Mágio Chocolates." },
    { property: "og:title", content: "Mágio Chocolates — Gestão de Estoque" },
    { property: "og:description", content: "Portal de gestão de estoque, inventário e abastecimento da Mágio Chocolates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
