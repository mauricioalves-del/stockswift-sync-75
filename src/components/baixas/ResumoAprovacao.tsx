import { useMemo, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatNum } from "@/lib/inventory";
import {
  statusAprovacao,
  STATUS_APROVACAO_LABEL,
  STATUS_APROVACAO_TONE,
  assinaturaFeita,
  urlDocumento,
  urlFoto,
  type StatusAprovacao,
} from "@/lib/baixa-aprovacao";
import { FileText, ExternalLink, ImageOff } from "lucide-react";

export function BadgeAprovacao({ baixa }: { baixa: any }) {
  const st = statusAprovacao(baixa) as StatusAprovacao;
  return (
    <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${STATUS_APROVACAO_TONE[st]}`}>
      {STATUS_APROVACAO_LABEL[st]}
    </span>
  );
}

/** Cartões de resumo executivo da fila de aprovação. */
export function ResumoExecutivoBaixas({ itens }: { itens: any[] }) {
  const m = useMemo(() => {
    const valor = itens.reduce((s, b) => s + Number(b.valor_total ?? 0), 0);
    const reqs = new Set(itens.map((b) => b.solicitacao_id).filter((v) => v != null));
    const pend = itens.filter((b) => statusAprovacao(b) === "PENDENTE").length;
    const parcial = itens.filter((b) => statusAprovacao(b) === "PARCIAL").length;
    const porAlmox = new Map<string, number>();
    for (const b of itens) {
      const k = b.id_local ?? "—";
      porAlmox.set(k, (porAlmox.get(k) ?? 0) + Number(b.valor_total ?? 0));
    }
    const topAlmox = [...porAlmox.entries()].sort((a, b) => b[1] - a[1])[0];
    const maior = itens.reduce(
      (acc, b) => (Number(b.valor_total ?? 0) > Number(acc?.valor_total ?? -1) ? b : acc),
      null as any,
    );
    return { valor, reqs: reqs.size, pend, parcial, topAlmox, maior, qtd: itens.length };
  }, [itens]);

  const cards = [
    { label: "Valor total na fila", value: `R$ ${formatBRL(m.valor)}` },
    { label: "Itens pendentes", value: formatNum(m.qtd) },
    { label: "Requisições", value: formatNum(m.reqs) },
    { label: "Sem assinatura", value: formatNum(m.pend) },
    { label: "Aguardando 2ª assinatura", value: formatNum(m.parcial) },
    {
      label: "Maior valor unitário",
      value: m.maior ? `R$ ${formatBRL(Number(m.maior.valor_total ?? 0))}` : "—",
      hint: m.maior?.descricao ?? "",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{c.value}</p>
            {"hint" in c && c.hint ? (
              <p className="text-[10px] text-muted-foreground truncate">{c.hint}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {m.topAlmox && (
        <p className="col-span-2 lg:col-span-6 text-xs text-muted-foreground">
          Maior concentração de valor no almoxarifado <b>{m.topAlmox[0]}</b> (R$ {formatBRL(m.topAlmox[1])}).
        </p>
      )}
    </div>
  );
}

/** Resumo detalhado de um item (duplo clique na linha). */
export function DetalheBaixaDialog({ baixa, onClose }: { baixa: any | null; onClose: () => void }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoErro, setFotoErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDoc(null);
    if (baixa?.documento_baixa_url) {
      urlDocumento(baixa.documento_baixa_url).then((u) => vivo && setDoc(u));
    }
    return () => { vivo = false; };
  }, [baixa?.id, baixa?.documento_baixa_url]);

  useEffect(() => {
    let vivo = true;
    setFoto(null);
    setFotoErro(false);
    if (baixa?.foto_url) {
      urlFoto(baixa.foto_url).then((u) => {
        if (!vivo) return;
        setFoto(u);
        if (!u) setFotoErro(true);
      });
    }
    return () => { vivo = false; };
  }, [baixa?.id, baixa?.foto_url]);

  if (!baixa) return null;
  const linhas: [string, string][] = [
    ["Requisição", baixa.solicitacao_id ? `#${baixa.solicitacao_id}` : "—"],
    ["Código", String(baixa.codigo_produto ?? "—")],
    ["Descrição", String(baixa.descricao ?? "—")],
    ["Lote", String(baixa.lote || "—")],
    ["Quantidade", `${formatNum(Number(baixa.quantidade ?? 0))} ${baixa.unidade ?? ""}`.trim()],
    ["Custo unitário", `R$ ${formatBRL(Number(baixa.custo_unitario ?? 0))}`],
    ["Valor total", `R$ ${formatBRL(Number(baixa.valor_total ?? 0))}`],
    ["Motivo", String(baixa.motivo?.descricao ?? "—")],
    ["Almoxarifado", String(baixa.id_local ?? "—")],
    ["Origem do lançamento", String(baixa.origem_lancamento ?? "—")],
    ["Observação", String(baixa.observacao || "—")],
  ];

  const assinaturas: [string, boolean, string][] = [
    ["Diretor de Operações", assinaturaFeita(baixa, "DIRETOR_OPERACOES"),
      baixa.aprovado_diretor_operacoes_em ? new Date(baixa.aprovado_diretor_operacoes_em).toLocaleString("pt-BR") : "—"],
    ["Coordenador Financeiro", assinaturaFeita(baixa, "COORDENADOR_FINANCEIRO"),
      baixa.aprovado_coordenador_financeiro_em ? new Date(baixa.aprovado_coordenador_financeiro_em).toLocaleString("pt-BR") : "—"],
  ];

  return (
    <Dialog open={!!baixa} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Resumo da baixa <BadgeAprovacao baixa={baixa} />
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {linhas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1">
              <span className="text-muted-foreground text-xs">{k}</span>
              <span className="text-right font-medium">{v}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Assinaturas</p>
          {assinaturas.map(([nome, feita, quando]) => (
            <div key={nome} className="flex items-center justify-between text-sm border rounded px-3 py-1.5">
              <span>{nome}</span>
              <span className={feita ? "text-success text-xs" : "text-muted-foreground text-xs"}>
                {feita ? `Assinado — ${quando}` : "Pendente"}
              </span>
            </div>
          ))}
          {baixa.motivo_reprovacao && (
            <p className="text-xs text-destructive">Motivo da reprovação: {baixa.motivo_reprovacao}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Foto anexada</p>
          {!baixa.foto_url ? (
            <p className="text-xs text-muted-foreground">Nenhuma foto anexada a esta baixa.</p>
          ) : fotoErro ? (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <ImageOff className="size-3.5" /> Não foi possível carregar a foto anexada.
            </p>
          ) : foto ? (
            <a href={foto} target="_blank" rel="noreferrer" className="block">
              <img
                src={foto}
                alt={`Foto da baixa ${baixa.codigo_produto ?? ""}`}
                loading="lazy"
                onError={() => setFotoErro(true)}
                className="max-h-64 w-full object-contain rounded border bg-muted"
              />
              <span className="text-[10px] text-muted-foreground">Clique para abrir em tamanho real</span>
            </a>
          ) : (
            <div className="h-24 rounded border bg-muted animate-pulse" />
          )}
        </div>

        {baixa.documento_baixa_url && (
          <Button asChild variant="outline" disabled={!doc} className="w-full">
            <a href={doc ?? "#"} target="_blank" rel="noreferrer">
              <FileText className="size-4 mr-2" /> Abrir documento de aprovação
              <ExternalLink className="size-3.5 ml-2" />
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
