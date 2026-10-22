import { createFileRoute } from "@tanstack/react-router";
import { ConsumoPage } from "@/components/abast-dash/ImportarConsumo";

export const Route = createFileRoute("/_authenticated/abastecimento/consumo")({
  component: ConsumoPage,
  head: () => ({ meta: [{ title: "Importar Consumo" }] }),
});
