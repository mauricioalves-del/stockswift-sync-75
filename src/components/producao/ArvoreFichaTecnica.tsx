// Parte B — Árvore expansível de composição (Produto Acabado → Subconjuntos → Matérias-primas)
// com leitura cruzada de v_impacto_consumo. 100% leitura.
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ExternalLink, Wrench } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeCor, fmtBRL, labelClass, type Faixas } from "@/lib/dispersao";
import {
  agregarItem, carregarBomProduto, filhosDe,
  type BomNo, type ImpactoLinha,
} from "@/lib/ft-arvore";
import { SugerirRevisaoFTDialog, type AlvoRevisao } from "@/components/producao/SugerirRevisaoFTDialog";

export function ArvoreFichaTecnica({
  idProduto, descProduto, impacto, faixas,
}: {
  idProduto: string;
  descProduto?: string | null;
  impacto: ImpactoLinha[];
  faixas: Faixas;
}) {
  const bomQ = useQuery({
    queryKey: ["ft-arvore", idProduto],
    queryFn: () => carregarBomProduto(idProduto),
    staleTime: 5 * 60_000,
  });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<AlvoRevisao | null>(null);

  const rows = bomQ.data ?? [];
  const raizes = useMemo(() => filhosDe(rows, idProduto, idProduto), [rows, idProduto]);

  function toggle(path: string) {
    setAbertos((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  function renderNos(nos: BomNo[], nivel: number, prefixo: string): JSX.Element[] {
    const out: JSX.Element[] = [];
    for (const no of nos) {
      const path = `${prefixo}/${no.id_item}`;
      const aberto = abertos.has(path);
      const ag = agregarItem(impacto, no, idProduto, faixas);
      const critico = ag.cls === "CRITICO";
      const podeSugerir = !ag.semProducao && critico && ag.causa === "Estrutural";
      out.push(
        <TableRow key={path} className={nivel === 0 ? "" : "bg-muted/20"}>
          <TableCell className="font-mono text-xs whitespace-nowrap">
            <span style={{ paddingLeft: nivel * 16 }} className="inline-flex items-center gap-1">
              {no.tem_filho ? (
                <button onClick={() => toggle(path)} className="text-muted-foreground hover:text-foreground" aria-label="Expandir">
                  {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
              ) : (
                <span className="inline-block w-3.5" />
              )}
              {no.id_item}
            </span>
          </TableCell>
          <TableCell className="text-sm max-w-[280px] truncate" title={no.item ?? ""}>
            {no.item || <span className="text-muted-foreground italic">sem descrição</span>}
            {no.gera_oc && <Badge variant="outline" className="ml-2 text-[10px]">OP própria</Badge>}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {no.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {no.item_unidade ?? ""}
          </TableCell>
          {ag.semProducao ? (
            <TableCell colSpan={5} className="text-xs text-muted-foreground italic">Sem produção no período</TableCell>
          ) : (
            <>
              <TableCell className="text-right tabular-nums text-xs">{ag.previsto.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{ag.consumo.toFixed(2)}</TableCell>
              <TableCell className={"text-right tabular-nums text-xs " + (ag.dif > 0 ? "text-destructive" : ag.dif < 0 ? "text-success" : "")}>
                {ag.dif.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-xs">
                <Badge variant="outline" className={badgeCor(ag.cls)}>
                  {ag.pct === "NAO_PREVISTO" ? labelClass(ag.cls) : `${ag.pct.toFixed(1)}%`}
                </Badge>
              </TableCell>
              <TableCell className={"text-right tabular-nums text-xs " + (ag.impacto > 0 ? "text-destructive" : "text-success")}>
                {fmtBRL(ag.impacto)}
              </TableCell>
            </>
          )}
          <TableCell className="text-xs">
            {ag.causa ? (
              <Badge variant="outline" className={ag.causa === "Estrutural" ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/10 text-warning border-warning/30"}>
                {ag.causa}
              </Badge>
            ) : <span className="text-muted-foreground">—</span>}
          </TableCell>
          <TableCell className="text-right whitespace-nowrap">
            {!ag.semProducao && ag.cls !== "NORMAL" && (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                <Link to="/producao/dispersao" search={{ produto: ag.filtro.produto, material: ag.filtro.material } as any}>
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            )}
            {podeSugerir && (
              <Button
                size="sm" variant="outline" className="h-7 px-2 ml-1"
                onClick={() => setAlvo({
                  produtoRaiz: idProduto,
                  produtoDesc: descProduto ?? null,
                  materialId: no.id_item,
                  materialDesc: no.item,
                  gera_oc: no.gera_oc,
                  qtdAtual: no.qtd,
                  impactoLinhas: ag.linhas,
                  impactoRs: ag.impacto,
                })}
              >
                <Wrench className="size-3.5 mr-1" /> Sugerir FT
              </Button>
            )}
            {!ag.semProducao && critico && ag.causa === "Apontamento" && (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 ml-1">
                <Link to="/producao/material/$material" params={{ material: no.id_item }}>Apontamento</Link>
              </Button>
            )}
          </TableCell>
        </TableRow>,
      );
      if (no.tem_filho && aberto) {
        const filhos = filhosDe(rows, idProduto, no.id_item);
        if (filhos.length === 0) {
          out.push(
            <TableRow key={`${path}/vazio`}>
              <TableCell colSpan={9} className="text-xs text-muted-foreground italic" style={{ paddingLeft: (nivel + 1) * 16 + 16 }}>
                Composição não cadastrada para este subconjunto.
              </TableCell>
            </TableRow>,
          );
        } else {
          out.push(<Fragment key={`${path}/filhos`}>{renderNos(filhos, nivel + 1, path)}</Fragment>);
        }
      }
    }
    return out;
  }

  if (bomQ.isLoading) return <div className="p-3 text-xs text-muted-foreground">Carregando composição...</div>;
  if (!raizes.length) return <div className="p-3 text-xs text-muted-foreground">Sem composição cadastrada para este produto.</div>;

  return (
    <div className="border rounded-md overflow-auto">
      <SugerirRevisaoFTDialog alvo={alvo} open={!!alvo} onOpenChange={(v) => !v && setAlvo(null)} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Produto / Item</TableHead>
            <TableHead className="text-right">Ficha Técnica</TableHead>
            <TableHead className="text-right">Previsto</TableHead>
            <TableHead className="text-right">Consumo</TableHead>
            <TableHead className="text-right">Dif</TableHead>
            <TableHead className="text-right">Dispersão</TableHead>
            <TableHead className="text-right">Impacto (R$)</TableHead>
            <TableHead>Causa provável</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>{renderNos(raizes, 0, idProduto)}</TableBody>
      </Table>
    </div>
  );
}
