// Edge Function: Lista diária de Movimentados (contagem) — Geral, Processo, Qualidade e Pará.
// Gera as mesmas planilhas "Movimentação - <Almox> dd.mm.xlsx" (aba Movimentados: Grupo, Data, Id_Produto, descricao,
// Unid., Sistema, Entrada, Saídas, Contagem, Teste, Dif, Obs, Prejuízo) a partir da movimentação do ERP importada no
// Farol de Movimentados (movimentacoes_erp) e do saldo atual do sistema (estoque_sistemico). Regras em ./logica.ts.
//
// Disparo:
//  * pg_cron, dias úteis às 18h de Brasília (21h UTC), com header x-cron-secret = app_config.lista_movimentados_cron_secret
//    → cada lista vai para os cadastrados em Cadastros → E-mails com a finalidade do seu almoxarifado:
//      "Lista de Movimentados - Fabrica" (Geral), "- Processo", "- Qualidade", "- Pará" (sem diferença de acento/maiúsculas).
//      Quem estiver na finalidade "Lista de Movimentados" (sem almox) recebe as quatro.
//  * Usuário logado (Authorization: Bearer <jwt>), corpo { acao: "baixar" | "enviar", data?: "AAAA-MM-DD" }
//    → "baixar" devolve os arquivos em base64; "enviar" manda o e-mail na hora.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { LISTAS, montarLista, nomeArquivo, planilha, type MovErp, type Saldo } from "./logica.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send";
const FINALIDADE = "Lista de Movimentados";
// Sufixo da finalidade de cada lista (Geral = almoxarifado da Fábrica).
const SUFIXO: Record<string, string> = { GERAL: "fabrica", PROCESSO: "processo", QUALIDADE: "qualidade", PARA: "para" };
// Nome do almoxarifado no assunto do e-mail (padrão: "Contagem de movimentados >> 05-11-2026 >> Almoxarifado Fabrica").
const NOME_EMAIL: Record<string, string> = { GERAL: "Fabrica", PROCESSO: "Processo", QUALIDADE: "Qualidade", PARA: "Pará" };
const normFin = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bde\b/g, " ").replace(/[^a-z0-9]+/g, "");
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function getCfg(admin: any, chave: string): Promise<string | null> {
  const { data } = await admin.from("app_config").select("valor").eq("chave", chave).maybeSingle();
  const v = data?.valor;
  if (v == null || v === "") return null;
  return typeof v === "string" ? v : String(v);
}

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function lerTudo<T>(q: (de: number, ate: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Monta um .xlsx (aba "Movimentados") no layout das planilhas, devolvendo base64. */
function gerarXlsx(linhas: ReturnType<typeof montarLista>): string {
  const p = planilha(linhas);
  const ws: any = XLSX.utils.aoa_to_sheet([p.cabecalho]);
  p.linhas.forEach((l, i) => {
    l.forEach((v, c) => {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c });
      if (v && typeof v === "object") ws[ref] = { t: "s", f: (v as { f: string }).f };
      else if (v === null) return;
      else if (c === 1) ws[ref] = { t: "d", v: new Date(`${v}T00:00:00Z`), z: "dd/mm/yyyy" };
      else ws[ref] = typeof v === "number" ? { t: "n", v } : { t: "s", v: String(v) };
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, p.linhas.length), c: p.cabecalho.length - 1 } });
  ws["!cols"] = [{ wch: 20 }, { wch: 11 }, { wch: 13 }, { wch: 42 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 24 }, { wch: 10 }, { hidden: true }];
  ws["!autofilter"] = { ref: ws["!ref"] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimentados");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const linhas76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");

function rawEmail(o: { from: string | null; replyTo: string | null; to: string[]; subject: string; html: string; anexos: { nome: string; base64: string }[] }): string {
  const h: string[] = [];
  if (o.from) h.push(`From: ${o.from}`);
  h.push(`To: ${o.to.join(", ")}`);
  if (o.replyTo) h.push(`Reply-To: ${o.replyTo}`);
  h.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(o.subject)))}?=`, "MIME-Version: 1.0");
  const b = "----=_lista_mov_" + crypto.randomUUID().replace(/-/g, "");
  h.push(`Content-Type: multipart/mixed; boundary="${b}"`);
  let msg = h.join("\r\n") + "\r\n\r\n" + `--${b}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${o.html}\r\n`;
  for (const a of o.anexos) {
    const nome = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(a.nome)))}?=`;
    msg += `--${b}\r\nContent-Type: ${XLSX_MIME}; name="${nome}"\r\nContent-Disposition: attachment; filename="${nome}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${linhas76(a.base64)}\r\n`;
  }
  return b64url(msg + `--${b}--`);
}

async function enviarGmail(raw: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY"), GMAIL_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GMAIL_KEY) return { ok: false, status: 0, body: "Credenciais do Gmail (connector) ausentes" };
  const r = await fetch(GMAIL_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GMAIL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const segredo = req.headers.get("x-cron-secret");
    let acao: "baixar" | "enviar" = "enviar"; let usuario: string | null = null;
    if (segredo) {
      const esperado = await getCfg(admin, "lista_movimentados_cron_secret");
      if (!esperado || segredo !== esperado) return json({ ok: false, error: "Não autorizado" }, 401);
    } else {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ ok: false, error: "Não autorizado" }, 401);
      const { data: ok } = await admin.rpc("equipe_aprovada_para_leitura", { _uid: u.user.id });
      if (!ok) return json({ ok: false, error: "Usuário sem acesso" }, 403);
      usuario = u.user.email ?? u.user.id;
      acao = body?.acao === "baixar" ? "baixar" : "enviar";
    }
    const dia: string = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.data ?? "")) ? body.data : hojeSP();
    const diaFmt = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

    const [movs, saldos, grupos] = await Promise.all([
      lerTudo<MovErp>((de, ate) => admin.from("movimentacoes_erp").select("data, desc_almox, id_produto, descricao, doc, desc_movimento, qtd").eq("data", dia).range(de, ate)),
      lerTudo<any>((de, ate) => admin.from("estoque_sistemico").select("id_produto, origem, quantidade, id_local, unidade, custo_unitario").in("origem", LISTAS.map((l) => l.saldo)).range(de, ate)),
      lerTudo<any>((de, ate) => admin.from("grupo_produtos").select("codigo_produto, grupo").range(de, ate)),
    ]);
    const un = (r: any) => (/^(KG|PC|UN|UND|UNI|LT|CX|G|ML|L)$/i.test(String(r.id_local ?? "")) ? String(r.id_local).toUpperCase() : (r.unidade || null));
    const sal: Saldo[] = saldos.map((r) => ({ id_produto: r.id_produto, almox: r.origem, quantidade: Number(r.quantidade) || 0, unidade: un(r), custo: r.custo_unitario ?? null }));
    const mapaGrupos = new Map<string, string>(grupos.map((g) => [String(g.codigo_produto).replace(/^0+/, ""), g.grupo]));

    const listas = LISTAS.map((l) => {
      const linhas = montarLista(l.id, dia, movs, sal, mapaGrupos);
      return { id: l.id, almox: l.arquivo, nome: nomeArquivo(l.id, dia), linhas: linhas.length, base64: linhas.length ? gerarXlsx(linhas) : null };
    });

    if (acao === "baixar") return json({ ok: true, data: dia, movimentos: movs.length, listas });

    // Destinatários por almoxarifado: finalidade "Lista de Movimentados - <Almox>"; a finalidade geral recebe todas.
    const { data: destsAll, error: derr } = await admin.from("cadastro_emails").select("email, finalidade").eq("ativo", true);
    if (derr) throw derr;
    // Aceita "Lista de Movimentados - Fabrica" e "lista-movimentados-fabrica".
    const dests = (destsAll ?? []).filter((d: any) => normFin(d.finalidade).startsWith(normFin(FINALIDADE)));
    const base = normFin(FINALIDADE);
    const paraLista = (id: string) => [...new Set((dests ?? []).filter((d: any) => {
      const f = normFin(d.finalidade);
      return f === base || f === `${base}${SUFIXO[id]}`;
    }).map((d: any) => String(d.email).trim().toLowerCase()))];
    if (!(dests ?? []).length) return json({ ok: false, code: "MISSING_RECIPIENTS", error: `Nenhum destinatário ativo para '${FINALIDADE} - <Almox>'. Cadastre em Cadastros → E-mails.` });

    const from = await getCfg(admin, "resend_from"), replyTo = await getCfg(admin, "resend_reply_to");
    const envios: { almox: string; linhas: number; destinatarios: string[]; ok: boolean; erro?: string }[] = [];
    // Cada almoxarifado tem o seu disparo (body.almox = GERAL | PROCESSO | QUALIDADE | PARA); sem almox, envia os quatro.
    const alvo = typeof body?.almox === "string" ? String(body.almox).toUpperCase() : null;
    const hoje = hojeSP();
    for (const l of listas) {
      if (alvo && l.id !== alvo) continue;
      const to = paraLista(l.id);
      if (!to.length) { envios.push({ almox: l.almox, linhas: l.linhas, destinatarios: [], ok: false, erro: "sem destinatário cadastrado" }); continue; }
      // Padrão do e-mail que já é usado na operação.
      const dataAssunto = `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`;
      const assunto = `Contagem de movimentados >> ${dataAssunto} >> Almoxarifado ${NOME_EMAIL[l.id]}`;
      const quando = dia === hoje ? `de hoje, ${diaFmt}` : `do dia ${diaFmt}`;
      const p = (t: string) => `<p style="font-family:Arial,sans-serif;font-size:14px;color:#222;margin:0 0 14px">${t}</p>`;
      const html = `<div>${p("Prezados,")}${
        !movs.length ? p(`A movimentação do ERP referente à operação ${quando} ainda não foi importada no sistema, por isso a lista de contagem não pôde ser gerada.`) + p("Assim que a movimentação for importada, a lista será enviada.")
        : l.linhas ? p(`Segue produtos movimentados referente a operação ${quando}.`) + p("Por gentileza, realizar contagem dos respectivos itens.")
        : p(`Não houve produtos movimentados no Almoxarifado ${esc(NOME_EMAIL[l.id])} referente a operação ${quando}.`) + p("Não há itens para contagem.")
      }</div>`;
      const r = await enviarGmail(rawEmail({ from, replyTo, to, subject: assunto, html, anexos: l.base64 ? [{ nome: l.nome, base64: l.base64 }] : [] }));
      envios.push({ almox: l.almox, linhas: l.linhas, destinatarios: to, ok: r.ok, erro: r.ok ? undefined : `${r.status}: ${r.body.slice(0, 200)}` });
    }
    await admin.from("audit_logs").insert({
      usuario: null, acao: envios.every((e) => e.ok || !e.destinatarios.length) ? "LISTA_MOVIMENTADOS_ENVIADA" : "LISTA_MOVIMENTADOS_FALHA", entidade: "movimentacoes_erp",
      payload: { data: dia, disparo: usuario ?? "agendado", envios },
    });
    const falhas = envios.filter((e) => e.destinatarios.length && !e.ok);
    if (falhas.length) return json({ ok: false, code: "GMAIL_ERROR", error: falhas.map((f) => `${f.almox}: ${f.erro}`).join(" | "), envios });
    const destinatarios = [...new Set(envios.flatMap((e) => e.destinatarios))];
    return json({ ok: true, data: dia, movimentos: movs.length, destinatarios, envios, listas: listas.map((l) => ({ almox: l.almox, linhas: l.linhas })) });
  } catch (e: any) {
    console.error("lista-movimentados", e);
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
