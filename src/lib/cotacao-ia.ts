// Estimativa de mercado por IA para solicitações de transporte: monta o pedido para a IA e normaliza a resposta
// em 3 opções de plataformas/transportadoras diferentes. São referências de preço, não cotações contratadas.
import { ZONA_ROTULO, type Zona } from "./tms";

export const MODAIS_IA = ["aplicativo", "veiculo_proprio", "correios", "rodoviario", "aereo"] as const;
export type ModalIA = (typeof MODAIS_IA)[number];

export type OpcaoIA = { plataforma: string; modal: ModalIA; valor_min: number; valor_max: number; valor_estimado: number; prazo_dias: number | null; observacao: string };
export type PremissasIA = { km: number | null; km_fonte: "informado" | "rota" | "sem_km"; peso_kg: number; volumes: number | null; zona: string | null; termico: boolean; termica_custo: number; termica_itens: string[]; dias_ate_limite: number | null };

export type SolicitacaoIA = { tipo: string; origem: string; destino_endereco?: string | null; destino_cidade?: string | null; destino_uf?: string | null; destino_cep?: string | null; observacao?: string | null; valor_pedido?: number | null };

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Esquema estrito da resposta (raiz objeto, tudo obrigatório, sem limites numéricos). */
export const ESQUEMA_IA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "opcoes"],
  properties: {
    resumo: { type: "string" },
    opcoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["plataforma", "modal", "valor_min", "valor_max", "valor_estimado", "prazo_dias", "observacao"],
        properties: {
          plataforma: { type: "string" },
          modal: { type: "string", enum: [...MODAIS_IA] },
          valor_min: { type: "number" },
          valor_max: { type: "number" },
          valor_estimado: { type: "number" },
          prazo_dias: { type: ["number", "null"] },
          observacao: { type: "string" },
        },
      },
    },
  },
} as const;

export const INSTRUCOES_IA = `Você é especialista em fretes e entregas no Brasil. A empresa é uma fábrica de chocolates em São Paulo (produto sensível ao calor).
Com base nos dados da solicitação, estime o preço de mercado do FRETE em 3 opções de plataformas ou transportadoras EXTERNAS e DIFERENTES entre si, adequadas ao perfil (distância, peso, volumes, prazo e necessidade de proteção térmica).
Referências de mercado: entregas urbanas na Grande SP — Lalamove, Uber Flash, 99Entrega, Loggi, Borzo; interior/litoral e outros estados — Correios (SEDEX/PAC), Loggi, Jadlog, Total Express, Braspress e transportadoras rodoviárias; longas distâncias e Pará ↔ SP — Azul Cargo Express, LATAM Cargo, Gollog e rodoviário.
Regras:
- Valores em reais (BRL), apenas o frete. Não inclua isopor nem gelo: a embalagem térmica é calculada à parte pela empresa.
- Use preços realistas do mercado atual, com faixa mínima e máxima e um valor estimado dentro da faixa. Não invente promoções nem descontos contratuais.
- prazo_dias em dias corridos (0 para entrega no mesmo dia); null se não for possível estimar.
- Prefira opções que cumpram o prazo pedido e sejam adequadas a produto perecível; se uma opção não cumprir o prazo, diga isso na observação.
- observacao: uma frase curta, objetiva, em português, com a premissa principal (ex.: tipo de veículo, serviço, limite de peso).
- resumo: uma frase com a recomendação geral.
- Exatamente 3 opções, cada uma de uma plataforma/transportadora diferente.`;

/** Texto do pedido enviado à IA (somente dados operacionais, sem identificar cliente). */
export function montarPedidoIA(s: SolicitacaoIA, p: PremissasIA, hojeISO: string): string {
  const destino = [s.destino_endereco, s.destino_cidade, s.destino_uf, s.destino_cep].filter(Boolean).join(", ") || "não informado";
  const linhas = [
    `Data de hoje: ${hojeISO}`,
    `Tipo de envio: ${s.tipo}`,
    `Origem: ${s.origem}`,
    `Destino: ${destino}`,
    `Zona: ${p.zona ? (ZONA_ROTULO[p.zona as Zona] ?? p.zona) : "não informada"}`,
    `Distância: ${p.km != null ? `${p.km} km (${p.km_fonte === "rota" ? "rota rodoviária calculada" : "informada pelo solicitante"})` : "não informada"}`,
    `Peso: ${p.peso_kg ? `${p.peso_kg} kg` : "não informado"}`,
    `Volumes: ${p.volumes ?? "não informado"}`,
    `Proteção térmica: ${p.termico ? "sim (produto em isopor com gelo)" : "não"}`,
    `Prazo: ${p.dias_ate_limite == null ? "sem data limite" : p.dias_ate_limite === 0 ? "entregar hoje" : `entregar em até ${p.dias_ate_limite} dia(s)`}`,
  ];
  if (s.valor_pedido) linhas.push(`Valor da mercadoria: R$ ${s.valor_pedido}`);
  if (s.observacao) linhas.push(`Observação: ${String(s.observacao).slice(0, 300)}`);
  return linhas.join("\n");
}

/** Normaliza a resposta: até 3 plataformas distintas, valores ≥ 0, mínimo ≤ estimado ≤ máximo. */
export function normalizarOpcoesIA(bruto: unknown): OpcaoIA[] {
  const lista = Array.isArray((bruto as any)?.opcoes) ? (bruto as any).opcoes : [];
  const vistos = new Set<string>(); const out: OpcaoIA[] = [];
  for (const o of lista) {
    const plataforma = String(o?.plataforma ?? "").trim();
    const chave = plataforma.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!plataforma || vistos.has(chave)) continue;
    const vals = [num(o?.valor_min), num(o?.valor_estimado), num(o?.valor_max)].filter((v) => v > 0);
    if (!vals.length) continue;
    const valor_min = r2(Math.min(...vals)), valor_max = r2(Math.max(...vals));
    const est = num(o?.valor_estimado);
    const valor_estimado = r2(est ? Math.min(Math.max(est, valor_min), valor_max) : (valor_min + valor_max) / 2);
    const modal = (MODAIS_IA as readonly string[]).includes(o?.modal) ? (o.modal as ModalIA) : "rodoviario";
    const pz = Number(o?.prazo_dias);
    vistos.add(chave);
    out.push({ plataforma: plataforma.slice(0, 80), modal, valor_min, valor_max, valor_estimado, prazo_dias: o?.prazo_dias == null || !Number.isFinite(pz) || pz < 0 ? null : Math.round(pz), observacao: String(o?.observacao ?? "").trim().slice(0, 240) });
    if (out.length === 3) break;
  }
  return out;
}

/** Prestador cadastrado com o mesmo nome da plataforma (para pré-preencher a cotação manual). */
export function prestadorDaPlataforma(plataforma: string, prestadores: { id: string; nome: string; ativo?: boolean }[]): string | null {
  const n = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const alvo = n(plataforma); if (alvo.length < 3) return null;
  const p = prestadores.find((x) => x.ativo !== false && n(x.nome).length >= 3 && (n(x.nome) === alvo || alvo.includes(n(x.nome)) || n(x.nome).includes(alvo)));
  return p?.id ?? null;
}

/** Mensagem amigável para falhas do serviço de IA, pelo status HTTP. */
export function erroIA(status: number | undefined, msg?: string): string {
  if (status === 402) return "Os créditos de IA do workspace acabaram. Adicione créditos em Configurações › Planos e créditos para gerar novas estimativas.";
  if (status === 403) return msg && msg.length < 200 ? `A IA está bloqueada para este workspace: ${msg}` : "A IA está bloqueada para este workspace. Um administrador do workspace precisa liberar o uso.";
  if (status === 429) return "Muitas estimativas ao mesmo tempo. Aguarde um minuto e tente de novo.";
  if (status && status >= 500) return "O serviço de IA está instável agora. Tente novamente em alguns minutos.";
  return "Não foi possível gerar a estimativa agora.";
}
