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
};
type Item = {
  id: string; id_produto: string; descricao: string; unidade: string;
  quantidade_solicitada: number; quantidade_separada: number;
  status_item: string; motivo_nao_separacao: string | null;
  lotes_separados: Array<{ lote: string; data_validade: string | null; quantidade: number }>;
};
type Lote = { id_produto: string; lote: string; data_validade: string | null; quantidade: number };

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
      if (!reqQ.data || skus.length === 0) return {} as Record<string, Lote>;
      const { data } = await supabase.from("estoque_sistemico")
        .select("id_produto, lote, data_validade, quantidade")
        .eq("origem", reqQ.data.origem_fornecedora)
        .in("id_produto", skus)
        .gt("quantidade", 0);
      const map: Record<string, Lote> = {};
      for (const r of data ?? []) {
        const cur = map[r.id_produto];
        const rowV = r.data_validade ?? "9999-12-31";
        if (!cur || (cur.data_validade ?? "9999-12-31") > rowV) {
          map[r.id_produto] = r as Lote;
        }
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
            <h1 style={{ fontSize: "18pt", fontWeight: 700, margin: 0 }}>Ficha de Separação</h1>
            <div style={{ fontSize: "13pt", fontWeight: 600 }}>{r.numero}</div>
          </div>
          <div style={{ fontSize: "10pt", color: "#444" }}>
            Emitida em {new Date().toLocaleString("pt-BR")}
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
              <th style={{ width: "18%" }}>SKU</th>
              <th>Produto</th>
              <th style={{ width: "8%" }} className="num">Solic.</th>
              <th style={{ width: "6%" }}>Un.</th>
              <th style={{ width: "12%" }}>Lote sugerido</th>
              <th style={{ width: "10%" }}>Validade</th>
              {finalizada ? (
                <>
                  <th style={{ width: "9%" }} className="num">Separado</th>
                  <th style={{ width: "12%" }}>Status / Motivo</th>
                </>
              ) : (
                <th style={{ width: "12%" }}>Qtd separada</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(itensQ.data ?? []).map((i) => {
              const sug = lotesQ.data?.[i.id_produto];
              const lotesReg = i.lotes_separados ?? [];
              const primeiroReg = lotesReg[0];
              return (
                <tr key={i.id}>
                  <td className="check">☐</td>
                  <td style={{ fontFamily: "monospace", fontSize: "10pt" }}>{i.id_produto}</td>
                  <td>{i.descricao}</td>
                  <td className="num">{formatNum(i.quantidade_solicitada)}</td>
                  <td>{i.unidade}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "10pt" }}>
                    {finalizada
                      ? (primeiroReg?.lote ?? "—") + (lotesReg.length > 1 ? ` (+${lotesReg.length - 1})` : "")
                      : (sug?.lote ?? "—")}
                  </td>
                  <td>
                    {finalizada
                      ? (primeiroReg?.data_validade ? new Date(primeiroReg.data_validade).toLocaleDateString("pt-BR") : "—")
                      : (sug?.data_validade ? new Date(sug.data_validade).toLocaleDateString("pt-BR") : "—")}
                  </td>
                  {finalizada ? (
                    <>
                      <td className="num">{formatNum(i.quantidade_separada)}</td>
                      <td style={{ fontSize: "10pt" }}>
                        {i.status_item === "SEPARADO" && "Separado"}
                        {i.status_item === "SEPARADO_PARCIAL" && `Parcial — ${i.motivo_nao_separacao ?? ""}`}
                        {i.status_item === "NAO_SEPARADO" && `Não separado — ${i.motivo_nao_separacao ?? ""}`}
                        {i.status_item === "PENDENTE" && "Pendente"}
                      </td>
                    </>
                  ) : (
                    <td>&nbsp;</td>
                  )}
                </tr>
              );
            })}
            {(itensQ.data ?? []).length === 0 && (
              <tr><td colSpan={finalizada ? 9 : 8} style={{ textAlign: "center", padding: 20 }}>Nenhum item.</td></tr>
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
