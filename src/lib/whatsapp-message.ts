export type MensagemQueimaInput = {
  descricao: string;
  precoVenda: number;
  precoComDesconto: number;
  quantidade: number;
  unidade?: string | null;
  dataValidade?: string | null;
  sku?: string | null;
  lote?: string | null;
  /** Família do produto (tabela familias): define o emoji ao lado do nome. */
  familia?: string | null;
};

export type AvisoInternoInput = {
  tipoAcao: string;
  descricao: string;
  sku?: string | null;
  lote?: string | null;
  almoxarifado?: string | null;
  quantidade: number;
  unidade?: string | null;
  dataValidade?: string | null;
  responsavel?: string | null;
};

function brl(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtd(v: number, unidade?: string | null) {
  const n = Number(v) || 0;
  const un = String(unidade ?? "").trim().toUpperCase();
  if (!un || un === "UN" || un === "PC") return String(Math.round(n));
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function dataBR(iso?: string | null) {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

const CABECALHO = ["📢ATENÇÃO COLABORADORES📢", "", "🔥SUPER QUEIMA DE ESTOQUE🔥", "Confira:", ""];
const RODAPE = ["", "Estoque limitado!", "Corra antes que acabe! 🏃💨"];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Emoji por FAMÍLIA do produto (comparação sem acento e por trecho, tolera "Povos Indiginas" etc.).
// A primeira regra que combinar vence. Para mudar um emoji, é só editar esta lista.
const EMOJI_POR_FAMILIA: [string, string][] = [
  ["grane", "🍬"],                // Granéis / granel: bombons
  ["flowpack", "🍬"],
  ["encontro de sabores", "🍫"],  // barras
  ["povos", "🍫"],                // Povos da Floresta e Povos Indígenas: barras
  ["biscoito", "🍪"],
  ["bolo", "🍰"],
  ["caixa", "🎁"],                // Caixa de presente e Caixa - Língua de onça
  ["embalagem", "📦"],
  ["lua cheia", "🌕"],
  ["polpa", "🍇"],
  ["producao", "🏭"],
  ["revenda", "🛒"],
  ["sorvete", "🍦"],
];

// Plano B quando o SKU não tem família cadastrada: pelo nome do produto.
const EMOJI_POR_NOME: [RegExp, string][] = [
  [/\bmini ovos?\b/, "🐰"],
  [/\bovos?\b/, "🍫"],
  [/\bbomb(om|ons)\b/, "🍬"],
  [/\bcaixa\b/, "🎁"],
  [/\bbarra\b/, "🍫"],
];

/** Emoji que acompanha o nome do produto na mensagem. Padrão: 🍫. */
export function emojiDoProduto(familia?: string | null, descricao?: string | null): string {
  const f = semAcento(String(familia ?? ""));
  for (const [chave, emoji] of EMOJI_POR_FAMILIA) if (f.includes(chave)) return emoji;
  const d = semAcento(String(descricao ?? ""));
  for (const [regra, emoji] of EMOJI_POR_NOME) if (regra.test(d)) return emoji;
  return "🍫";
}

/** Busca a família de cada SKU (tabela familias). Em caso de falha, devolve vazio e o emoji sai pelo nome. */
export async function buscarFamiliasPorSku(supabase: any, skus: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(skus.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  try {
    const { data } = await supabase.from("familias").select("codigo_produto, familia").in("codigo_produto", ids);
    for (const f of data ?? []) {
      const k = String(f.codigo_produto);
      if (f.familia && !mapa.has(k)) mapa.set(k, String(f.familia));
    }
  } catch {
    /* sem família: usa o emoji pelo nome do produto */
  }
  return mapa;
}

/** §3.1 — Template individual para ações da categoria Vendas. */
export function montarMensagemQueima(i: MensagemQueimaInput): string {
  return [
    ...CABECALHO,
    `${i.descricao} ${emojiDoProduto(i.familia, i.descricao)}`,
    ` -> De: R$ ${brl(i.precoVenda)}`,
    ` -> Por: R$ ${brl(i.precoComDesconto)}`,
    ` Estoque: ${qtd(i.quantidade, i.unidade)}`,
    ` Validade: ${dataBR(i.dataValidade)}`,
    ...RODAPE,
  ].join("\n");
}

/** §3.2 — Template individual para as demais categorias (sem preço De/Por). */
export function montarAvisoInterno(i: AvisoInternoInput): string {
  return [
    `📦 AVISO — ${i.tipoAcao}`,
    "",
    `${i.descricao} (SKU ${i.sku || "—"} · Lote ${i.lote || "—"})`,
    `Almoxarifado: ${i.almoxarifado || "—"}`,
    `Quantidade endereçada: ${qtd(i.quantidade, i.unidade)}`,
    `Validade: ${dataBR(i.dataValidade)}`,
    `Responsável: ${i.responsavel || "—"}`,
  ].join("\n");
}

/** §3.3 — Template consolidado (envio em massa), só itens de categoria Vendas. */
export function montarMensagemQueimaLote(itens: MensagemQueimaInput[]): string {
  const blocos = itens.flatMap((i, idx) => [
    `${idx + 1}) ${i.descricao} ${emojiDoProduto(i.familia, i.descricao)}`,
    ` -> De: R$ ${brl(i.precoVenda)} / Por: R$ ${brl(i.precoComDesconto)}`,
    ` Estoque: ${qtd(i.quantidade, i.unidade)} · Validade: ${dataBR(i.dataValidade)}`,
    "",
  ]);
  if (blocos.length) blocos.pop();
  return [...CABECALHO, ...blocos, ...RODAPE].join("\n");
}

/**
 * Copia a mensagem e abre o WhatsApp Web em nova aba.
 * Retorna true quando a cópia funcionou (senão o chamador exibe o modal de fallback).
 */
export async function copiarEAbrirWhatsApp(mensagem: string): Promise<boolean> {
  let copiado = false;
  try {
    await navigator.clipboard.writeText(mensagem);
    copiado = true;
  } catch {
    copiado = false;
  }
  window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
  return copiado;
}
