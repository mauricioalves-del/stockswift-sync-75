// Estimativa de mercado por IA (3 plataformas externas) para uma solicitação de transporte.
// Grava o resultado em log_estimativas_ia em nome do usuário (RLS). Não cria cotação nem ordem de serviço.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embalagemTermica } from "./tms";
import { montarPedidoIA, normalizarOpcoesIA, type OpcaoIA, type PremissasIA } from "./cotacao-ia";

const OSRM = "https://router.project-osrm.org";

async function kmRodoviario(origem: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<number | null> {
  try {
    const r = await fetch(`${OSRM}/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=false`, { headers: { "User-Agent": "Magio-Logistica/1.0 (cotacao)" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    const m = j?.routes?.[0]?.distance; return Number.isFinite(m) ? Math.round(m / 100) / 10 : null;
  } catch { return null; }
}

export const estimarMercadoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { solicitacaoId: string }) => {
    if (!d || typeof d.solicitacaoId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.solicitacaoId)) throw new Error("Solicitação inválida.");
    return { solicitacaoId: d.solicitacaoId };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: s, error } = await sb.from("log_solicitacoes").select("*").eq("id", data.solicitacaoId).maybeSingle();
    if (error || !s) throw new Error("Solicitação não encontrada ou sem acesso.");
    if (s.status !== "cotacao") throw new Error("A solicitação já foi decidida; não é possível estimar novamente.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let km: number | null = s.km_estimado != null && +s.km_estimado > 0 ? +s.km_estimado : null;
    let km_fonte: PremissasIA["km_fonte"] = km != null ? "informado" : "sem_km";
    if (km == null && s.lat != null && s.lng != null) {
      const cfg = (await supabaseAdmin.from("app_config").select("valor").eq("chave", "log_origem").maybeSingle()).data?.valor as any;
      if (cfg?.lat && cfg?.lng) { km = await kmRodoviario({ lat: +cfg.lat, lng: +cfg.lng }, { lat: +s.lat, lng: +s.lng }); if (km != null) km_fonte = "rota"; }
    }
    const peso = +s.peso_kg || 0;
    const emb = s.termico ? ((await sb.from("log_embalagens").select("nome,tipo,capacidade_kg,custo").eq("ativo", true)).data ?? []).map((x: any) => ({ ...x, custo: +x.custo, capacidade_kg: x.capacidade_kg == null ? null : +x.capacidade_kg })) : [];
    const termica = s.termico ? embalagemTermica(peso, emb) : { custo: 0, itens: [] as string[] };
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const dias = s.data_limite ? Math.max(0, Math.round((Date.parse(s.data_limite) - Date.parse(hoje)) / 86400000)) : null;
    const premissas: PremissasIA = { km, km_fonte, peso_kg: peso, volumes: s.volumes ?? null, zona: s.zona ?? null, termico: !!s.termico, termica_custo: termica.custo, termica_itens: termica.itens, dias_ate_limite: dias };

    const { estimarComIA, MODELO_IA } = await import("./cotacao-ia.server");
    let signal: AbortSignal | undefined; try { signal = getRequest()?.signal; } catch { /* sem request */ }
    const { bruto, runId } = await estimarComIA(montarPedidoIA(s, premissas, hoje), signal);
    const opcoes = normalizarOpcoesIA(bruto);
    if (!opcoes.length) throw new Error("A IA não trouxe opções válidas para esta solicitação. Revise peso, destino e prazo e tente de novo.");
    const resumo = String((bruto as any)?.resumo ?? "").trim().slice(0, 400) || null;

    const ins = await sb.from("log_estimativas_ia").insert({ solicitacao_id: s.id, opcoes, premissas: { ...premissas, run_id: runId ?? null }, resumo, modelo: MODELO_IA, created_by: context.userId }).select("*").single();
    if (ins.error) throw new Error(ins.error.message.includes("row-level security") ? "Seu usuário ainda não foi aprovado para gerar estimativas." : ins.error.message);
    return { id: ins.data.id as string, opcoes: ins.data.opcoes as OpcaoIA[], resumo: (ins.data.resumo ?? null) as string | null, created_at: ins.data.created_at as string };
  });
