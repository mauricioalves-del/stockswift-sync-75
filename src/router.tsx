import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./lib/auth-rapido";

export const getRouter = () => {
  // Cache: dados ficam "frescos" por 1 min (sem refazer a consulta a cada troca de tela ou foco da janela)
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 1 } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // carrega o código da tela ao passar o mouse/tocar no menu
    defaultPreloadStaleTime: 0,
  });

  return router;
};
