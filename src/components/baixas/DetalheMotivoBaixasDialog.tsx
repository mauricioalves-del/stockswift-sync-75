import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/inventory";
import { ArrowDown, ArrowUp, Tag } from "lucide-react";

export type DetalheMotivoCtx = {
  motivoId: string;
  motivoNome: string;
  fromISO: string;
  toISO: string;
  almoxFilter: string; // "__all__" ou id_local
};

type Linha = {
  id: string;
  codigo_produto: string;
  descricao: string;
  lote: string | null;
  unidade: string | null;
  id_local: string | null;
  origem: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  data: string | null;
  status_fluxo: string | null;
  origem_lancamento: string | null;
  solicitante: string;
  responsavel: string | null;
  observacao: string | null;
  categoria: string | null;
  acao?: {
    id: string;
    tipo: string | null;
    status: string | null;
    data_acao: string | null;
    valor_recuperado: number;
    saving_recuperado: number;
    custo_acao: number;
  } | null;
};

type SortKey = "valor_total" | "quantidade" | "codigo_produto" | "data" | "custo_unitario";

const fmtData = (v: string | null) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");

export function DetalheMotivoBaixasDialog({
  ctx,
  onOpenChange,
}: {
  ctx: DetalheMotivoCtx | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("valor_total");
  const [asc, setAsc] = useState(false);

  const q = useQuery({
    queryKey: ["detalhe-motivo-baixas", ctx?.motivoId, ctx?.fromISO, ctx?.toISO, ctx?.almoxFilter],
    enabled: !!ctx,
    queryFn: async (): Promise<Linha[]> => {
      const c = ctx!;
      const baixas = await fetchAll<any>((from, to) => {
        let sel = (supabase as any)
          .from("baixa_operacional")
          .select(
            "id, codigo_produto, descricao, lote, unidade, id_local, origem, quantidade, custo_unitario, valor_total, data_ocorrencia, data_solicitacao, status_fluxo, origem_lancamento, solicitante_id, responsavel_nome, observacao, categoria",
          )
          .eq("motivo_baixa_id", c.motivoId)
          .eq("status_fluxo", "APROVADA")
          .gte("data_solicitacao", c.fromISO)
          .lte("data_solicitacao", c.toISO)
          .range(from, to);
        if (c.almoxFilter !== "__all__") sel = sel.eq("id_local", c.almoxFilter);
        return sel;
      });

      const ids = baixas.map((b) => b.id);
      const [profilesRes, tiposRes] = await Promise.all([
        supabase.from("profiles").select("id, nome, email"),
        (supabase as any).from("tipos_acao_shelf_life").select("id, nome"),
      ]);
      const nomeUsuario = new Map(
        ((profilesRes.data ?? []) as any[]).map((p) => [p.id, p.nome || p.email || String(p.id).slice(0, 8)]),
      );
      const nomeTipo = new Map(((tiposRes.data ?? []) as any[]).map((t) => [t.id, t.nome as string]));

      const acoes: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        if (!slice.length) continue;
        const { data } = await (supabase as any)
          .from("campanhas_lote")
          .select("id, baixa_operacional_id, tipo_acao_id, status, data_acao, valor_recuperado, saving_recuperado, custo_acao")
          .in("baixa_operacional_id", slice);
        acoes.push(...((data ?? []) as any[]));
      }
      const acaoPorBaixa = new Map(acoes.map((a) => [String(a.baixa_operacional_id), a]));

      return baixas.map((b) => {
        const a = acaoPorBaixa.get(String(b.id));
        return {
          id: b.id,
          codigo_produto: b.codigo_produto,
          descricao: b.descricao,
          lote: b.lote,
          unidade: b.unidade,
          id_local: b.id_local,
          origem: b.origem,
          quantidade: Number(b.quantidade) || 0,
          custo_unitario: Number(b.custo_unitario) || 0,
          valor_total: Number(b.valor_total) || 0,
          data: b.data_ocorrencia ?? b.data_solicitacao ?? null,
          status_fluxo: b.status_fluxo,
          origem_lancamento: b.origem_lancamento,
          solicitante: nomeUsuario.get(b.solicitante_id) ?? "—",
          responsavel: b.responsavel_nome,
          observacao: b.observacao,
          categoria: b.categoria,
          acao: a
            ? {
                id: a.id,
                tipo: a.tipo_acao_id ? nomeTipo.get(a.tipo_acao_id) ?? null : null,
                status: a.status ?? null,
                data_acao: a.data_acao ?? null,
                valor_recuperado: Number(a.valor_recuperado) || 0,
                saving_recuperado: Number(a.saving_recuperado) || 0,
                custo_acao: Number(a.custo_acao) || 0,
              }
            : null,
        } as Linha;
      });
    },
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = (q.data ?? []).filter((l) =>
      !termo
        ? true
        : [l.codigo_produto, l.descricao, l.lote, l.id_local, l.solicitante, l.acao?.tipo]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termo)),
    );
    const dir = asc ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [q.data, busca, sortKey, asc]);

  const totalValor = linhas.reduce((s, l) => s + l.valor_total, 0);
  const totalQtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const comAcao = linhas.filter((l) => l.acao).length;
  const recuperado = linhas.reduce((s, l) => s + (l.acao?.valor_recuperado ?? 0), 0);

  const th = (key: SortKey, label: string, align = "left") => (
    <th
      className={`py-1.5 px-2 cursor-pointer select-none whitespace-nowrap text-${align} hover:text-foreground`}
      onClick={() => (sortKey === key ? setAsc((v) => !v) : (setSortKey(key), setAsc(false)))}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === key && (asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </span>
    </th>
  );

  return (
    <Dialog open={!!ctx} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4" /> Baixas — {ctx?.motivoNome}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="secondary">{linhas.length} itens</Badge>
          <Badge variant="secondary">Total {formatBRL(totalValor)}</Badge>
          <Badge variant="secondary">Qtd {totalQtd.toLocaleString("pt-BR")}</Badge>
          <Badge variant="secondary">Com ação de shelf life: {comAcao}</Badge>
          <Badge variant="secondary">Recuperado {formatBRL(recuperado)}</Badge>
          <Input
            className="h-8 w-64 ml-auto"
            placeholder="Buscar SKU, descrição, lote, ação..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSortKey("valor_total");
              setAsc(false);
            }}
          >
            Ordenar por custo total
          </Button>
        </div>

        <div className="overflow-auto flex-1 border rounded-md mt-2">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur text-muted-foreground">
              <tr>
                <th className="py-1.5 px-2 text-left">#</th>
                {th("codigo_produto", "SKU")}
                <th className="py-1.5 px-2 text-left">Descrição</th>
                <th className="py-1.5 px-2 text-left">Lote</th>
                <th className="py-1.5 px-2 text-left">Local</th>
                <th className="py-1.5 px-2 text-left">Almox.</th>
                {th("quantidade", "Qtd", "right")}
                <th className="py-1.5 px-2 text-left">UN</th>
                {th("custo_unitario", "Custo unit.", "right")}
                {th("valor_total", "Custo total", "right")}
                {th("data", "Data")}
                <th className="py-1.5 px-2 text-left">Status</th>
                <th className="py-1.5 px-2 text-left">Origem</th>
                <th className="py-1.5 px-2 text-left">Solicitante</th>
                <th className="py-1.5 px-2 text-left">Ação shelf life</th>
                <th className="py-1.5 px-2 text-right">Recuperado</th>
                <th className="py-1.5 px-2 text-right">Saving</th>
                <th className="py-1.5 px-2 text-left">Observação</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={18} className="py-6 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {!q.isLoading && linhas.length === 0 && (
                <tr>
                  <td colSpan={18} className="py-6 text-center text-muted-foreground">
                    Nenhuma baixa encontrada.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => (
                <tr key={l.id} className="border-t hover:bg-muted/40">
                  <td className="py-1 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1 px-2 font-mono">{l.codigo_produto}</td>
                  <td className="py-1 px-2 max-w-[280px] truncate" title={l.descricao}>{l.descricao}</td>
                  <td className="py-1 px-2 font-mono">{l.lote || "—"}</td>
                  <td className="py-1 px-2">{l.id_local || "—"}</td>
                  <td className="py-1 px-2">{l.origem || "—"}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{l.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="py-1 px-2">{l.unidade || "—"}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{formatBRL(l.custo_unitario)}</td>
                  <td className="py-1 px-2 text-right tabular-nums font-semibold">{formatBRL(l.valor_total)}</td>
                  <td className="py-1 px-2 whitespace-nowrap">{fmtData(l.data)}</td>
                  <td className="py-1 px-2">{l.status_fluxo || "—"}</td>
                  <td className="py-1 px-2">{l.origem_lancamento || "—"}</td>
                  <td className="py-1 px-2 max-w-[160px] truncate" title={l.solicitante}>{l.solicitante}</td>
                  <td className="py-1 px-2 whitespace-nowrap">
                    {l.acao ? (
                      <Badge variant="outline" className="text-[10px]">
                        {l.acao.tipo || "Ação"} · {l.acao.status} · {fmtData(l.acao.data_acao)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Sem vínculo</span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{l.acao ? formatBRL(l.acao.valor_recuperado) : "—"}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{l.acao ? formatBRL(l.acao.saving_recuperado) : "—"}</td>
                  <td className="py-1 px-2 max-w-[260px] truncate" title={l.observacao ?? ""}>{l.observacao || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
