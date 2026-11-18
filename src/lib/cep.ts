// Consulta de CEP para preencher endereço: ViaCEP e, se falhar, BrasilAPI. Serviços públicos, sem chave.
export type EnderecoCep = { cep: string; endereco: string; bairro: string; cidade: string; uf: string };

export const soDigitosCep = (v: string) => String(v ?? "").replace(/\D/g, "").slice(0, 8);
export const formatarCep = (v: string) => { const d = soDigitosCep(v); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

/** Normaliza as respostas dos dois serviços; null quando o CEP não existe. */
export function lerRespostaCep(j: any): EnderecoCep | null {
  if (!j || j.erro === true || j.erro === "true") return null;
  const cidade = j.localidade ?? j.city, uf = j.uf ?? j.state;
  if (!cidade || !uf) return null;
  return { cep: soDigitosCep(j.cep ?? ""), endereco: j.logradouro ?? j.street ?? "", bairro: j.bairro ?? j.neighborhood ?? "", cidade, uf: String(uf).toUpperCase() };
}

export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = soDigitosCep(cep); if (d.length !== 8) return null;
  for (const url of [`https://viacep.com.br/ws/${d}/json/`, `https://brasilapi.com.br/api/cep/v2/${d}`]) {
    try {
      const r = await fetch(url);
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const e = lerRespostaCep(await r.json()); if (e) return { ...e, cep: d };
    } catch { /* tenta o próximo serviço */ }
  }
  return null;
}
