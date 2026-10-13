// Carrega do banco tudo o que a camada de dados do Abastecimento v2 precisa (uma consulta compartilhada pelas telas).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import type { Bruto } from "@/lib/abastecimento-dados";

async function seguro<T>(f: () => Promise<T>, vazio: T): Promise<T> { try { return await f(); } catch { return vazio; } }

export function useAbastBruto(habilitado: boolean) {
  return useQuery({
    enabled: habilitado, queryKey: ["abast-v2"], staleTime: 30_000,
    queryFn: async (): Promise<Bruto> => {
      const sb = supabase as any;
      const { data: lojas } = await sb.from("abast_lojas").select("codigo, nome, almoxarifado").eq("ativo", true).order("ordem");
      const { data: cfg } = await sb.from("abast_config").select("chave, valor");
      const c = Object.fromEntries((cfg ?? []).map((x: any) => [x.chave, x.valor]));
      const almox = (lojas ?? []).map((l: any) => l.almoxarifado);
      const desde = new Date(Date.now() - 130 * 86400000).toISOString().slice(0, 10);
      const [consenso, grupos, familias, abcRaw, periodos, consumo, estoque, notasRaw, produtos, exposicoes, pedidos] = await Promise.all([
        seguro(() => fetchAll<any>((f, t) => sb.from("abast_consenso").select("loja, id_produto, mes, unidades, tipo, produto, linha").order("loja").order("id_produto").order("mes").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("grupo_produtos").select("grupo, codigo_produto").order("codigo_produto").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("familias").select("codigo_produto, familia").order("codigo_produto").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("classificacao_abc").select("codigo_produto, classe").order("codigo_produto").range(f, t)), []),
        seguro(async () => ((await sb.from("periodos_sazonais").select("*").eq("ativo", true)).data ?? []) as any[], []),
        seguro(() => fetchAll<any>((f, t) => sb.from("historico_consumo").select("origem, sku, data_movimento, quantidade").in("origem", almox).gte("data_movimento", desde).order("origem").order("sku").order("data_movimento").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("estoque_sistemico").select("id_produto, descricao, origem, quantidade, custo_unitario").gt("quantidade", 0).order("id_produto").order("origem").order("lote").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("notas_transferencia_recebimento").select("cod_prod, almox, qtd, nota_cancelada").eq("recebimento", "Pendente").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("abast_produto").select("id_produto, full_case").order("id_produto").range(f, t)), []),
        seguro(() => fetchAll<any>((f, t) => sb.from("abast_produto_loja").select("loja, id_produto, exposicao").order("loja").order("id_produto").range(f, t)), []),
        seguro(async () => {
          const { data: ps, error } = await sb.from("abast_pedidos").select("id, loja, status").in("status", ["ABERTO", "EM_SEPARACAO", "SEPARADO", "ENVIADO"]);
          if (error) throw error;
          if (!ps?.length) return [] as any[];
          const { data: its } = await sb.from("abast_pedido_itens").select("pedido_id, id_produto, qtd_pedida, qtd_separada").in("pedido_id", ps.map((p: any) => p.id));
          const m = new Map<string, any>(ps.map((p: any) => [p.id, p]));
          return (its ?? []).map((i: any) => ({ loja: m.get(i.pedido_id).loja, id_produto: i.id_produto, qtd: Number(i.qtd_pedida), separada: Number(i.qtd_separada) || 0, status: m.get(i.pedido_id).status }));
        }, [] as any[]),
      ]);
      return {
        lojas: (lojas ?? []) as Bruto["lojas"], cd: String(c.cd_almoxarifado || "Alm_SP_Fabrica"),
        params: { diasMin: Number(c.dias_min) || 5, diasIdeal: Number(c.dias_ideal) || 10, diasMax: Number(c.dias_max) || 15, diasSeguranca: Number(c.dias_seguranca) || 0 },
        consenso, grupos, familias, abc: abcRaw.map((x: any) => ({ codigo_produto: x.codigo_produto, classe: x.classe })), periodos: periodos as Bruto["periodos"],
        consumo, estoque, notas: notasRaw.filter((n: any) => n.nota_cancelada !== "S").map((n: any) => ({ cod_prod: n.cod_prod, almox: n.almox, qtd: Number(n.qtd) || 0 })),
        pedidosAbertos: pedidos, produtos, exposicoes,
      };
    },
  });
}
