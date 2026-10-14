import { CLASSES_PORTFOLIO, chaveSkuPortfolio, elegivelPortfolio, type ClassePortfolio } from "@/lib/abastecimento-portfolio";

export type ItemValidacao = { sku: string; descricao: string; categoria: string | null; ativo: boolean; classe: ClassePortfolio; sem_classe: boolean; elegivel: boolean };
export type Validacao = {
  id: string; competencia: string; loja: string; versao: number; status: "VALIDADA" | "DESFEITA"; aprovador_id: string; aprovador_nome: string | null; aprovado_em: string;
  observacao: string | null; itens: ItemValidacao[]; totais: Record<string, number>; diff: { incluidos?: string[]; retirados?: string[]; reclassificados?: { sku: string; de: string; para: string }[]; primeira_validacao?: boolean };
  origem_upload: { arquivo: string | null; autor_nome: string | null; autor_email: string | null; registrado_em: string; skus: number }[];
  desfeita_em: string | null; motivo_desfazer: string | null;
};

/** Situação da competência numa loja: validada no mês, herdada da última aprovação, ou sem portfólio validado. */
export function situacaoCompetencia(vals: Validacao[], loja: string, competencia: string) {
  const ok = vals.filter((v) => v.loja === loja && v.status === "VALIDADA").sort((a, b) => b.aprovado_em.localeCompare(a.aprovado_em));
  const doMes = ok.find((v) => v.competencia === competencia);
  if (doMes) return { tipo: "VALIDADA" as const, validacao: doMes };
  const anterior = ok.find((v) => v.competencia < competencia);
  return anterior ? { tipo: "HERDADA" as const, validacao: anterior } : { tipo: "SEM" as const, validacao: null };
}

export const nomeMes = (c: string) => new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

type Cls = { sku: string; classe: ClassePortfolio; vigencia: string; registrado_em: string; inicio_inovacao: string | null };
/** Elegibilidade OOS pelo histórico: usa a classificação vigente na própria data (mudanças não alteram o passado). Sem classificação = Linha. */
export function criarElegibilidade(hist: Cls[]) {
  const porSku = new Map<string, Cls[]>();
  for (const c of [...hist].sort((a, b) => b.vigencia.localeCompare(a.vigencia) || b.registrado_em.localeCompare(a.registrado_em))) (porSku.get(c.sku) ?? porSku.set(c.sku, []).get(c.sku)!).push(c);
  return (sku: string, data: string) => {
    const c = porSku.get(chaveSkuPortfolio(sku))?.find((x) => x.vigencia <= data);
    return c ? elegivelPortfolio(c.classe, c.inicio_inovacao, data) : true;
  };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function documentoValidacao(v: Validacao, nomeLoja: string): string {
  const ativos = v.itens.filter((i) => i.ativo);
  const linhas = ativos.map((i) => `<tr><td>${esc(i.sku)}</td><td>${esc(i.descricao)}</td><td>${esc(CLASSES_PORTFOLIO[i.classe])}${i.sem_classe ? " *" : ""}</td><td>${i.elegivel ? "Elegível" : "Fora da meta OOS"}</td></tr>`).join("");
  const up = v.origem_upload.length ? v.origem_upload.map((u) => `<li>${esc(u.arquivo || "Edição manual")} — ${esc(u.autor_nome || u.autor_email || "—")} em ${dt(u.registrado_em)} (${u.skus} SKUs)</li>`).join("") : "<li>Nenhuma planilha de classificação registrada</li>";
  const d = v.diff;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Validação do Gestor ${esc(v.competencia)} ${esc(nomeLoja)} v${v.versao}</title>
<style>body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:12px}h1{font-size:20px;margin:0}h2{font-size:14px;margin-top:22px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}.box{border:1px solid #111;padding:12px;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.k{border:1px solid #ccc;padding:6px}.k b{display:block;font-size:16px}@media print{button{display:none}}</style></head><body>
<button onclick="print()">Imprimir / salvar PDF</button>
<h1>Termo de Validação do Portfólio — Abastecimento</h1><p>Mágio Chocolates · Documento gerado no ato da assinatura</p>
<div class="box"><b>Competência:</b> ${esc(nomeMes(v.competencia))} &nbsp; <b>Loja:</b> ${esc(nomeLoja)} &nbsp; <b>Versão:</b> ${v.versao} &nbsp; <b>Status:</b> ${v.status}<br>
<b>Aprovado por:</b> ${esc(v.aprovador_nome || v.aprovador_id)} &nbsp; <b>Data/hora da assinatura:</b> ${dt(v.aprovado_em)}<br><b>Identificador:</b> ${esc(v.id)}${v.observacao ? `<br><b>Observação:</b> ${esc(v.observacao)}` : ""}${v.status === "DESFEITA" ? `<br><b>Desfeita em:</b> ${v.desfeita_em ? dt(v.desfeita_em) : "—"} · ${esc(v.motivo_desfazer)}` : ""}</div>
<h2>Delegação do portfólio (upload da planilha de classificação)</h2><ul>${up}</ul>
<h2>Resumo</h2><div class="grid">${[["Total", v.totais.total], ["Ativos", v.totais.ativos], ["Elegíveis OOS", v.totais.elegiveis], ["Linha", v.totais.LINHA], ["MTO", v.totais.MTO], ["Inovação", v.totais.INOVACAO], ["Decomplex", v.totais.DECOMPLEX], ["Não ativos", v.totais.inativos]].map(([k, n]) => `<div class="k">${k}<b>${n ?? 0}</b></div>`).join("")}</div>
<h2>Alterações em relação à última validação</h2><p>${d.primeira_validacao ? "Primeira validação da loja." : `Incluídos: ${esc((d.incluidos ?? []).join(", ") || "nenhum")}<br>Retirados: ${esc((d.retirados ?? []).join(", ") || "nenhum")}<br>Reclassificados: ${esc((d.reclassificados ?? []).map((r) => `${r.sku} (${r.de}→${r.para})`).join(", ") || "nenhum")}`}</p>
<h2>Itens ativos do pedido (${ativos.length})</h2><table><thead><tr><th>SKU</th><th>Produto</th><th>Classe</th><th>Meta OOS</th></tr></thead><tbody>${linhas}</tbody></table>
<p style="margin-top:8px">* SKU sem classificação registrada: tratado como Linha.</p>
<div class="box" style="margin-top:40px">Assinatura eletrônica: ${esc(v.aprovador_nome || v.aprovador_id)} — ${dt(v.aprovado_em)}</div></body></html>`;
}

export function baixarDocumento(v: Validacao, nomeLoja: string) {
  const url = URL.createObjectURL(new Blob([documentoValidacao(v, nomeLoja)], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `Validacao_Portfolio_${v.competencia}_${v.loja}_v${v.versao}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
