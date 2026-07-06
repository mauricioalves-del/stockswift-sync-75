// Extrai o código numérico (Id_Produto/EAN) do conteúdo lido de um QR/código de barras.
// QR de rastreabilidade pode conter URL, querystring ou texto — priorizamos o maior bloco numérico.
export function extrairCodigoNumericoQR(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const nums: string[] = s.match(/\d+/g) ?? [];
  if (nums.length === 0) return "";
  return nums.reduce((a, b) => (b.length >= a.length ? b : a));
}

// Alias para leitura semântica em outros módulos.
export const parseQrCodeEstoque = extrairCodigoNumericoQR;
