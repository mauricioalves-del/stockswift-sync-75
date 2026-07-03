import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNum } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/suprimentos/requisicoes/$id/ficha")({
  component: FichaSeparacaoPage,
  head: () => ({ meta: [{ title: "Ficha de Separação" }] }),
});

type Req = {
  id: string; numero: string; origem_solicitante: string; origem_fornecedora: string;
  tipo: string; status: string; solicitante: string | null; created_at: string;
  metodo_utilizado: string | null;
};
type Item = {
  id: string; id_produto: string; descricao: string; unidade: string;
  quantidade_solicitada: number; quantidade_separada: number;
  custo_unitario: number;
  status_item: string; motivo_nao_separacao: string | null;
  lotes_separados: Array<{ lote: string; data_validade: string | null; quantidade: number }>;
};
type Lote = { id_produto: string; lote: string; data_validade: string | null; quantidade: number };
type LoteSug = { lote: string; data_validade: string | null; quantidade: number };

function alocarFEFO(lotes: Lote[], qtd: number): { alocacoes: LoteSug[]; faltou: number } {
  const sorted = [...lotes].sort((a, b) => (a.data_validade ?? "9999-12-31").localeCompare(b.data_validade ?? "9999-12-31"));
  const out: LoteSug[] = [];
  let rest = qtd;
  for (const l of sorted) {
    if (rest <= 0) break;
    const usar = Math.min(Number(l.quantidade), rest);
    if (usar > 0) { out.push({ lote: l.lote, data_validade: l.data_validade, quantidade: usar }); rest -= usar; }
  }
  return { alocacoes: out, faltou: Math.max(0, rest) };
}

function FichaSeparacaoPage() {
  const { id } = Route.useParams();

  const reqQ = useQuery({
    queryKey: ["ficha-req", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requisicoes" as never).select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Req;
    },
  });
  const itensQ = useQuery({
    queryKey: ["ficha-itens", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requisicao_itens" as never)
        .select("*").eq("requisicao_id", id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });
  const lotesQ = useQuery({
    queryKey: ["ficha-lotes", id, reqQ.data?.origem_fornecedora, itensQ.data?.length ?? 0],
    queryFn: async () => {
      const skus = (itensQ.data ?? []).map((i) => i.id_produto);
      if (!reqQ.data || skus.length === 0) return {} as Record<string, Lote[]>;
      const { data } = await supabase.from("estoque_sistemico")
        .select("id_produto, lote, data_validade, quantidade")
        .eq("origem", reqQ.data.origem_fornecedora)
        .in("id_produto", skus)
        .gt("quantidade", 0);
      const map: Record<string, Lote[]> = {};
      for (const r of data ?? []) {
        (map[r.id_produto] ??= []).push(r as Lote);
      }
      return map;
    },
    enabled: !!reqQ.data && !!itensQ.data,
  });


  const solicQ = useQuery({
    queryKey: ["ficha-solic", reqQ.data?.solicitante],
    queryFn: async () => {
      if (!reqQ.data?.solicitante) return null;
      const { data } = await supabase.from("profiles").select("nome, email").eq("id", reqQ.data.solicitante).maybeSingle();
      return data;
    },
    enabled: !!reqQ.data?.solicitante,
  });

  useEffect(() => {
    if (reqQ.data && itensQ.data && lotesQ.data !== undefined) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [reqQ.data, itensQ.data, lotesQ.data]);

  if (reqQ.isLoading || itensQ.isLoading) return <Loader2 className="animate-spin m-8" />;
  const r = reqQ.data;
  if (!r) return <div className="p-8">Requisição não encontrada.</div>;
  const finalizada = ["SEPARADA_TOTAL", "SEPARADA_PARCIAL", "NAO_ATENDIDA", "ATENDIDA"].includes(r.status);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .ficha { box-shadow: none !important; border: none !important; padding: 0 !important; }
          nav, aside, header[data-app-shell], [data-sidebar] { display: none !important; }
        }
        .ficha table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        .ficha th, .ficha td { border: 1px solid #333; padding: 4px 6px; text-align: left; vertical-align: top; }
        .ficha th { background: #eee; font-weight: 600; }
        .ficha .num { text-align: right; font-variant-numeric: tabular-nums; }
        .ficha .check { width: 26px; text-align: center; }
      `}</style>

      <div className="no-print p-3 flex gap-2 justify-end print:hidden">
        <Button variant="outline" onClick={() => window.close()}>Fechar</Button>
        <Button onClick={() => window.print()}><Printer className="size-4 mr-1" /> Imprimir</Button>
      </div>

      <div className="ficha max-w-[210mm] mx-auto bg-white text-black p-6" style={{ fontFamily: "system-ui, sans-serif" }}>
        <div style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 style={{ fontSize: "18pt", fontWeight: 700, margin: 0 }}>
              {finalizada ? "Ficha de Separação" : "Pedido de Abastecimento"}
            </h1>
            <div style={{ fontSize: "13pt", fontWeight: 600 }}>{r.numero}</div>
          </div>
          <div style={{ fontSize: "10pt", color: "#444" }}>
            Emitida em {new Date().toLocaleString("pt-BR")}
            {r.metodo_utilizado ? ` · Método: ${r.metodo_utilizado}` : ""}
          </div>
        </div>

        <table style={{ marginBottom: 12, fontSize: "11pt" }}>
          <tbody>
            <tr>
              <th style={{ width: "20%" }}>Data da requisição</th>
              <td>{new Date(r.created_at).toLocaleString("pt-BR")}</td>
              <th style={{ width: "15%" }}>Tipo</th>
              <td>{r.tipo}</td>
            </tr>
            <tr>
              <th>Origem (fornecedor)</th>
              <td>{r.origem_fornecedora}</td>
              <th>Destino (solicitante)</th>
              <td>{r.origem_solicitante}</td>
            </tr>
            <tr>
              <th>Solicitante</th>
              <td colSpan={3}>{solicQ.data?.nome ?? solicQ.data?.email ?? "—"}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th className="check">☐</th>
              <th style={{ width: "14%" }}>SKU</th>
              <th>Produto</th>
              <th style={{ width: "12%" }}>Lote (FEFO)</th>
              <th style={{ width: "9%" }}>Validade</th>
              <th style={{ width: "8%" }} className="num">Qtd</th>
              <th style={{ width: "5%" }}>Un.</th>
              <th style={{ width: "9%" }} className="num">Custo</th>
              <th style={{ width: "10%" }} className="num">Valor</th>
              {finalizada && <th style={{ width: "10%" }}>Status</th>}
            </tr>
          </thead>
          <tbody>
            {(itensQ.data ?? []).flatMap((i) => {
              const cu = Number(i.custo_unitario ?? 0);
              // Se finalizada, usa lotes efetivamente separados; senão, sugere FEFO em cascata a partir do estoque
              const lotesReg = i.lotes_separados ?? [];
              const linhas: Array<{ lote: string; validade: string | null; qtd: number }> = finalizada
                ? lotesReg.map((l) => ({ lote: l.lote, validade: l.data_validade, qtd: Number(l.quantidade) }))
                : (() => {
                    const disp = lotesQ.data?.[i.id_produto] ?? [];
                    const { alocacoes, faltou } = alocarFEFO(disp, Number(i.quantidade_solicitada));
                    const rows = alocacoes.map((a) => ({ lote: a.lote, validade: a.data_validade, qtd: a.quantidade }));
                    if (faltou > 0) rows.push({ lote: "SEM LOTE", validade: null, qtd: faltou });
                    if (rows.length === 0) rows.push({ lote: "—", validade: null, qtd: Number(i.quantidade_solicitada) });
                    return rows;
                  })();

              return linhas.map((ln, idx) => (
                <tr key={`${i.id}-${idx}`}>
                  <td className="check">☐</td>
                  <td style={{ fontFamily: "monospace", fontSize: "10pt" }}>{idx === 0 ? i.id_produto : ""}</td>
                  <td>{idx === 0 ? i.descricao : ""}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "10pt" }}>{ln.lote}</td>
                  <td>{ln.validade ? new Date(ln.validade).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="num">{formatNum(ln.qtd)}</td>
                  <td>{idx === 0 ? i.unidade : ""}</td>
                  <td className="num">R$ {formatNum(cu)}</td>
                  <td className="num">R$ {formatNum(ln.qtd * cu)}</td>
                  {finalizada && (
                    <td style={{ fontSize: "10pt" }}>
                      {idx === 0 && (
                        <>
                          {i.status_item === "SEPARADO" && "Separado"}
                          {i.status_item === "SEPARADO_PARCIAL" && `Parcial — ${i.motivo_nao_separacao ?? ""}`}
                          {i.status_item === "NAO_SEPARADO" && `Não sep. — ${i.motivo_nao_separacao ?? ""}`}
                          {i.status_item === "PENDENTE" && "Pendente"}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ));
            })}
            {(itensQ.data ?? []).length === 0 && (
              <tr><td colSpan={finalizada ? 10 : 9} style={{ textAlign: "center", padding: 20 }}>Nenhum item.</td></tr>
            )}
          </tbody>
        </table>


        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, fontSize: "11pt" }}>
          <div>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, textAlign: "center" }}>
              Nome / Assinatura de quem separou
            </div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, textAlign: "center" }}>
              Data / Hora
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
