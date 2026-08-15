import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useMeusAlmoxarifados } from "@/hooks/useMeusAlmoxarifados";
import { almoxEfetivos } from "@/hooks/useFiltrosShelfLife";
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
  custo_unitario?: number | null;
  categoria_financeira?: string | null;
  quantidade_recuperada?: number | null;
  valor_recuperado?: number | null;
  saving_recuperado?: number | null;
  preco_venda_referencia?: number | null;
  percentual_desconto_aplicado?: number | null;
  preco_com_desconto?: number | null;
  recalculado_em?: string | null;
  recalculado_por?: string | null;
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
export function useLotesRisco(opts?: { almoxAtivos?: string[]; somenteComSaldo?: boolean }) {
  const { almoxes: permitidos, loading } = useMeusAlmoxarifados();
  const almoxes = almoxEfetivos(permitidos, opts?.almoxAtivos ?? []);
  const somenteComSaldo = opts?.somenteComSaldo !== false;
  return useQuery({
    queryKey: ["shelf-lotes-risco", almoxes?.join(",") ?? "all", somenteComSaldo],
    enabled: !loading,
    // Fonte única e sempre atual: estoque_sistemico (atualizado pela Sincronização do Lote_Sistema).
    staleTime: 0,
    refetchOnMount: "always",
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

/**
 * Vínculo automático: amarra baixas às ações abertas do mesmo SKU+Lote.
 * 1) Preferência para a baixa cujo motivo corresponde ao tipo da ação (ex.: Degustação).
 * 2) Caso não haja, vincula qualquer baixa elegível do mesmo SKU+Lote dentro da
 *    janela de validade (validade até validade + 7 dias), respeitando a regra do banco.
 * Baixas já vinculadas a outra ação nunca são reutilizadas.
 * Retorna a quantidade de vínculos criados.
 */
export async function autoVincularBaixas(): Promise<number> {
  const [tiposRes, campanhasRes, motivosRes, vinculadasRes] = await Promise.all([
    (supabase as any).from("tipos_acao_shelf_life").select("id, nome, motivo_baixa_id"),
    (supabase as any)
      .from("campanhas_lote")
      .select("id, sku, lote, data_validade, tipo_acao_id, status, baixa_operacional_id")
      .is("baixa_operacional_id", null)
      .neq("status", "CANCELADA"),
    (supabase as any).from("motivo_baixa").select("id, descricao"),
    (supabase as any).from("campanhas_lote").select("baixa_operacional_id").not("baixa_operacional_id", "is", null),
  ]);

  const campanhas = (campanhasRes.data ?? []) as any[];
  if (!campanhas.length) return 0;

  const tipos = (tiposRes.data ?? []) as any[];
  const motivos = (motivosRes.data ?? []) as any[];
  const motivoIdPorNome = new Map<string, string>(motivos.map((m) => [String(m.descricao).trim().toLowerCase(), m.id]));
  const motivoDoTipo = new Map<string, string | null>(
    tipos.map((t) => [t.id, t.motivo_baixa_id ?? motivoIdPorNome.get(String(t.nome).trim().toLowerCase()) ?? null]),
  );

  const usadas = new Set<string>(
    ((vinculadasRes.data ?? []) as any[]).map((c) => String(c.baixa_operacional_id)),
  );

  const skus = Array.from(new Set(campanhas.map((c) => c.sku)));
  const baixas = await fetchAll<any>((from, to) =>
    (supabase as any)
      .from("baixa_operacional")
      .select("id, codigo_produto, lote, motivo_baixa_id, data_ocorrencia, data_solicitacao")
      .in("codigo_produto", skus)
      .range(from, to),
  );

  const porChave = new Map<string, any[]>();
  for (const b of baixas) {
    const k = chaveLote(b.codigo_produto, b.lote);
    const arr = porChave.get(k) ?? [];
    arr.push(b);
    porChave.set(k, arr);
  }

  let n = 0;
  for (const c of campanhas) {
    const candidatas = (porChave.get(chaveLote(c.sku, c.lote)) ?? []).filter(
      (b) => !usadas.has(String(b.id)) && baixaDentroDaJanela(dataDaBaixa(b), c.data_validade),
    );
    if (!candidatas.length) continue;

    const motivoId = c.tipo_acao_id ? motivoDoTipo.get(c.tipo_acao_id) : null;
    const escolhida =
      (motivoId ? candidatas.find((b) => b.motivo_baixa_id === motivoId) : undefined) ?? candidatas[0];
    if (!escolhida) continue;

    const { error } = await (supabase as any)
      .from("campanhas_lote")
      .update({ baixa_operacional_id: escolhida.id })
      .eq("id", c.id)
      .is("baixa_operacional_id", null);
    if (!error) {
      usadas.add(String(escolhida.id));
      n++;
    }
  }
  return n;
}


/**
 * Conjunto de chaves SKU||Lote que ainda possuem saldo em estoque_sistemico.
 * Usado para sinalizar campanhas cujo lote já foi totalmente consumido/baixado.
 */
export function useLotesComSaldo() {
  return useQuery({
    queryKey: ["shelf-lotes-com-saldo"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<Set<string>> => {
      const rows = await fetchAll<any>((from, to) =>
        (supabase as any)
          .from("estoque_sistemico")
          .select("id_produto, lote, quantidade")
          .gt("quantidade", 0)
          .range(from, to),
      );
      return new Set(rows.map((r) => chaveLote(String(r.id_produto ?? ""), r.lote)));
    },
  });
}
