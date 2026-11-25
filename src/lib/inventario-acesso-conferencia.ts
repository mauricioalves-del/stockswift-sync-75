export function acessoConferencia(isAdmin: boolean, participaDaFase: boolean) {
  return {
    visivel: isAdmin || participaDaFase,
    visaoAdministrativa: isAdmin && !participaDaFase,
    podeLancar: participaDaFase,
  };
}