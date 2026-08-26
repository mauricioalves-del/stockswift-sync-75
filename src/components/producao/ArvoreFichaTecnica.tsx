// Parte B — Árvore expansível de composição (Produto Acabado → Subconjuntos → Matérias-primas)
// com leitura cruzada de v_impacto_consumo. 100% leitura.
// Os filhos de cada nó são carregados sob demanda a partir de id_subconjunto.
import { Fragment, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ExternalLink, Wrench } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeCor, fmtBRL, labelClass, type Faixas } from "@/lib/dispersao";
import { agregarItem, carregarFilhos, type BomNo, type ImpactoLinha } from "@/lib/ft-arvore";
import { SugerirRevisaoFTDialog, type AlvoRevisao } from "@/components/producao/SugerirRevisaoFTDialog";

type Ctx = {
  idProduto: string;
  descProduto?: string | null;
  impacto: ImpactoLinha[];
  faixas: Faixas;
  setAlvo: (a: AlvoRevisao) => void;
};

function LinhaNo({ no, nivel, path, ctx }: { no: BomNo; nivel: number; path: string; ctx: Ctx }): ReactElement {
  const [aberto, setAberto] = useState(false);
  const ag = agregarItem(ctx.impacto, no, ctx.idProduto, ctx.faixas);
  const critico = ag.cls === "CRITICO";
  const podeSugerir = !ag.semProducao && critico && ag.causa === "Estrutural";

  return (
    <Fragment>
      <TableRow className={nivel === 0 ? "" : "bg-muted/20"}>
        <TableCell className="font-mono text-xs whitespace-nowrap">
          <span style={{ paddingLeft: nivel * 16 }} className="inline-flex items-center gap-1">
            {no.tem_filho ? (
              <button onClick={() => setAberto((v) => !v)} className="text-muted-foreground hover:text-foreground" aria-label="Expandir">
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
              onClick={() => ctx.setAlvo({
                produtoRaiz: ctx.idProduto,
                produtoDesc: ctx.descProduto ?? null,
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
      </TableRow>
      {no.tem_filho && aberto && <Filhos idNo={no.id_item} nivel={nivel + 1} path={path} ctx={ctx} />}
    </Fragment>
  );
}

function Filhos({ idNo, nivel, path, ctx }: { idNo: string; nivel: number; path: string; ctx: Ctx }) {
  const q = useQuery({
    queryKey: ["ft-arvore", "filhos", idNo],
    queryFn: () => carregarFilhos(idNo),
    staleTime: 5 * 60_000,
  });
  if (q.isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="text-xs text-muted-foreground italic" style={{ paddingLeft: nivel * 16 + 16 }}>
          Carregando composição...
        </TableCell>
      </TableRow>
    );
  }
  const filhos = q.data ?? [];
  if (!filhos.length) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="text-xs text-muted-foreground italic" style={{ paddingLeft: nivel * 16 + 16 }}>
          Composição não cadastrada para este subconjunto.
        </TableCell>
      </TableRow>
    );
  }
  return (
    <Fragment>
      {filhos.map((f) => (
        <LinhaNo key={`${path}/${f.id_item}`} no={f} nivel={nivel} path={`${path}/${f.id_item}`} ctx={ctx} />
      ))}
    </Fragment>
  );
}

export function ArvoreFichaTecnica({
  idProduto, descProduto, impacto, faixas,
}: {
  idProduto: string;
  descProduto?: string | null;
  impacto: ImpactoLinha[];
  faixas: Faixas;
}) {
  const [alvo, setAlvo] = useState<AlvoRevisao | null>(null);
  const raizesQ = useQuery({
    queryKey: ["ft-arvore", "filhos", idProduto],
    queryFn: () => carregarFilhos(idProduto),
    staleTime: 5 * 60_000,
  });

  if (raizesQ.isLoading) return <div className="p-3 text-xs text-muted-foreground">Carregando composição...</div>;
  const raizes = raizesQ.data ?? [];
  if (!raizes.length) return <div className="p-3 text-xs text-muted-foreground">Sem composição cadastrada para este produto.</div>;

  const ctx: Ctx = { idProduto, descProduto, impacto, faixas, setAlvo };

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
        <TableBody>
          {raizes.map((r) => (
            <LinhaNo key={`${idProduto}/${r.id_item}`} no={r} nivel={0} path={`${idProduto}/${r.id_item}`} ctx={ctx} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
