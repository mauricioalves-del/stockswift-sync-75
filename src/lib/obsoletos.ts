import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";

export type ItemObsoleto = {
  id_produto: string;
  descricao: string | null;
  almoxarifado: string | null;
  lote: string | null;
  saldo: number;
  valor: number;
  custo_unitario_medio: number | null;
  empresa: string | null;
  ultima_mov: string | null;
  dias_sem_mov: number | null;
  faixa: string;
};

export type TipoAcaoObsoleto = { id: string; nome: string; categoria: string; ativo: boolean; ordem: number };

export type AcaoObsoleto = {
  id: string;
  id_produto: string;
  descricao: string | null;
  lote: string | null;
  almoxarifado: string | null;
  faixa: string | null;
  dias_sem_mov: number | null;
  tipo_acao_id: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_em_risco: number;
  valor_recuperado: number;
  saving_recuperado: number;
  status: string;
  data_acao: string;
  responsavel_id: string | null;
  responsavel_label: string | null;
  observacao: string | null;
  concluido_em: string | null;
  created_at: string;
};

export const FAIXA_OBS_LABEL: Record<string, string> = {
  "30-60": "30 a 60 dias",
  "61-90": "61 a 90 dias",
  "+90": "Mais de 90 dias",
};

export const STATUS_OBS = [
  { value: "PLANEJADA", label: "Planejada" },
  { value: "EM_ANDAMENTO", label: "Em Andamento" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "CANCELADA", label: "Cancelada" },
];

export const chaveObs = (sku: string, almox?: string | null, lote?: string | null) =>
  `${(sku ?? "").trim().toUpperCase()}||${(almox ?? "").trim().toUpperCase()}||${(lote ?? "").trim().toUpperCase()}`;

/** Itens hoje em risco de obsolescência (mesma fonte da tela Risco Obsoletos). */
export function useItensObsoletos() {
  return useQuery({
    queryKey: ["obsoletos-itens"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ItemObsoleto[]> =>
      fetchAll<ItemObsoleto>((from, to) =>
        (supabase as any)
          .from("v_risco_obsoletos")
          .select("id_produto, descricao, almoxarifado, lote, saldo, valor, custo_unitario_medio, empresa, ultima_mov, dias_sem_mov, faixa")
          .neq("faixa", "movimentado")
          .range(from, to),
      ),
  });
}

export function useTiposAcaoObsoleto() {
  return useQuery({
    queryKey: ["obsoletos-tipos"],
    staleTime: 300_000,
    queryFn: async (): Promise<TipoAcaoObsoleto[]> => {
      const { data, error } = await (supabase as any).from("tipos_acao_obsoleto").select("*").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAcoesObsoleto() {
  return useQuery({
    queryKey: ["obsoletos-acoes"],
    staleTime: 30_000,
    queryFn: async (): Promise<AcaoObsoleto[]> =>
      fetchAll<AcaoObsoleto>((from, to) =>
        (supabase as any).from("acoes_obsoleto").select("*").order("data_acao", { ascending: false }).range(from, to),
      ),
  });
}

/**
 * Confirmação pela movimentação: a ação é confirmada quando o item saiu do radar
 * de obsoletos ou voltou a ter movimentação depois da data da ação.
 */
export function confirmadoPorMovimento(a: AcaoObsoleto, atuais: Map<string, ItemObsoleto>): boolean {
  const atual = atuais.get(chaveObs(a.id_produto, a.almoxarifado, a.lote));
  if (!atual) return true;
  return !!atual.ultima_mov && atual.ultima_mov.slice(0, 10) >= a.data_acao.slice(0, 10);
}

export const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
