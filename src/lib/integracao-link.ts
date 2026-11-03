export function destinoAcao(valor: string) {
  const link = valor.trim();
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) {
    const url = new URL(link, "https://local.invalid");
    return { externo: false, href: link, pathname: url.pathname, search: Object.fromEntries(url.searchParams), hash: url.hash.slice(1) };
  }
  const url = new URL(link);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Informe um caminho do sistema ou um link http/https válido.");
  return { externo: true, href: url.href, pathname: url.pathname, search: Object.fromEntries(url.searchParams), hash: url.hash.slice(1) };
}