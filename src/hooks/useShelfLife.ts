import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { faixaDeRisco, type Faixa, type CampanhaCalc, type CategoriaAcao, chaveLote } from "@/lib/shelf-life";

export type TipoAcao = {
  id: string;
  nome: string;
  categoria: CategoriaAcao;
  custo_padrao: number;
  ativo: boolean;
  ordem: number;
  motivo_baixa_id: string | null;
};

export function useTiposAcao() {
  return useQuery({
    queryKey: ["shelf-tipos-acao"],
    staleTime: 300_000,
    queryFn: async (): Promise<TipoAcao[]> => {
      const { data, error } = await (supabase as any)
        .from("tipos_acao_shelf_life")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as TipoAcao[];
    },
  });
}

export type CampanhaRow = CampanhaCalc & {
  almoxarifado: string | null;
  data_validade: string | null;
  responsavel: string | null;
  observacao: string | null;
  custo_acao: number;
};

export function useCampanhas() {
  const tipos = useTiposAcao();
  return useQuery({
    queryKey: ["shelf-campanhas", tipos.data?.length ?? 0],
    enabled: !tipos.isLoading,
    staleTime: 30_000,
    queryFn: async (): Promise<CampanhaRow[]> => {
      const rows = await fetchAll<any>((from, to) =>
        (supabase as any).from("campanhas_lote").select("*").order("data_acao", { ascending: false }).range(from, to),
      );
      const byId = new Map((tipos.data ?? []).map((t) => [t.id, t]));
      return rows.map((r) => {
        const t = r.tipo_acao_id ? byId.get(r.tipo_acao_id) : undefined;
        return { ...r, tipo_nome: t?.nome ?? null, categoria: (t?.categoria ?? "SAVING") as CategoriaAcao } as CampanhaRow;
      });
    },
  });
}

export type LoteRisco = {
  sku: string;
  descricao: string;
  lote: string;
  unidade: string;
  almoxarifado: string;
  id_local: string;
  quantidade: number;
  custo_unitario: number;
  valor: number;
  data_validade: string | null;
  dias: number | null;
  faixa: Faixa;
  grupo: string | null;
  familia: string | null;
};

/** Lotes com saldo > 0 dentro do radar de validade (<= 90 dias, vencidos ou sem validade). */
export function useLotesRisco() {
  const { almoxes, loading } = useMeusAlmoxarifados();
  return useQuery({
    queryKey: ["shelf-lotes-risco", almoxes?.join(",") ?? "all"],
    enabled: !loading,
    staleTime: 60_000,
    queryFn: async (): Promise<LoteRisco[]> => {
      const [estoque, grupos, familias] = await Promise.all([
        fetchAll<any>((from, to) => {
          let q = (supabase as any)
            .from("estoque_sistemico")
            .select("id_produto, descricao, lote, unidade, quantidade, custo_unitario, id_local, origem, data_validade")
            .gt("quantidade", 0)
            .range(from, to);
          if (almoxes && almoxes.length > 0) q = q.in("origem", almoxes);
          if (almoxes && almoxes.length === 0) q = q.in("origem", ["__nenhum__"]);
          return q;
        }),
        fetchAll<any>((from, to) =>
          (supabase as any).from("grupo_produtos").select("codigo_produto, grupo").range(from, to),
        ),
        fetchAll<any>((from, to) =>
          (supabase as any).from("familias").select("codigo_produto, familia").range(from, to),
        ),
      ]);

      const norm = (s: any) => String(s ?? "").trim().toUpperCase();
      const gMap = new Map(grupos.map((g) => [norm(g.codigo_produto), g.grupo as string]));
      const fMap = new Map(familias.map((f) => [norm(f.codigo_produto), f.familia as string]));
      const hoje = new Date();

      const out: LoteRisco[] = [];
      for (const r of estoque) {
        const faixa = faixaDeRisco(r.data_validade, hoje);
        if (!faixa) continue; // > 90 dias, fora do radar
        const qtd = Number(r.quantidade) || 0;
        const custo = Number(r.custo_unitario) || 0;
        const dias = r.data_validade
          ? Math.round(
              (new Date(`${String(r.data_validade).slice(0, 10)}T00:00:00`).getTime() -
                new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86_400_000,
            )
          : null;
        out.push({
          sku: String(r.id_produto ?? ""),
          descricao: String(r.descricao ?? ""),
          lote: String(r.lote ?? ""),
          unidade: String(r.unidade ?? ""),
          almoxarifado: String(r.origem ?? ""),
          id_local: String(r.id_local ?? ""),
          quantidade: qtd,
          custo_unitario: custo,
          valor: qtd * custo,
          data_validade: r.data_validade ?? null,
          dias,
          faixa,
          grupo: gMap.get(norm(r.id_produto)) ?? null,
          familia: fMap.get(norm(r.id_produto)) ?? null,
        });
      }
      out.sort((a, b) => (a.dias ?? 99999) - (b.dias ?? 99999));
      return out;
    },
  });
}

/** Mapa SKU+Lote → campanhas, para marcar "Com Ação" no mapeamento de risco. */
export function indexarCampanhasPorLote(campanhas: CampanhaRow[] | undefined) {
  const m = new Map<string, CampanhaRow[]>();
  for (const c of campanhas ?? []) {
    const k = chaveLote(c.sku, c.lote);
    const arr = m.get(k) ?? [];
    arr.push(c);
    m.set(k, arr);
  }
  return m;
}
