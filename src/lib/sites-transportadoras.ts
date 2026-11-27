// Site oficial de cotação de cada transportadora/plataforma. O cadastro do prestador (site_cotacao) tem prioridade;
// a lista abaixo cobre as principais do mercado, inclusive as sugeridas pela estimativa de mercado (IA).
const SITES: [RegExp, string][] = [
  [/melhor\s*envio/i, "https://melhorenvio.com.br/"],
  [/jamef/i, "https://www.jamef.com.br/"],
  [/braspress/i, "https://www.braspress.com/"],
  [/latam/i, "https://www.latamcargo.com/"],
  [/azul/i, "https://www.azulcargoexpress.com.br/"],
  [/gol\s*log|gollog|\bgol\b/i, "https://www.gollog.com.br/"],
  [/lalamove/i, "https://www.lalamove.com/pt-br/"],
  [/jadlog/i, "https://www.jadlog.com.br/"],
  [/correios|sedex/i, "https://www.correios.com.br/"],
  [/loggi/i, "https://www.loggi.com/"],
  [/total\s*express/i, "https://totalexpress.com.br/"],
  [/rodonaves/i, "https://www.rte.com.br/"],
  [/patrus/i, "https://www.patrus.com.br/"],
  [/tnt|fedex/i, "https://www.fedex.com/pt-br/"],
];

export function siteCotacao(nome: string | null | undefined, cadastrado?: string | null): string | null {
  const s = (cadastrado ?? "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!nome) return null;
  return SITES.find(([re]) => re.test(nome))?.[1] ?? null;
}
