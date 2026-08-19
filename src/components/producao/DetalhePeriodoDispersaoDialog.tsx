import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtBRL, STATUS_ACAO } from "@/lib/dispersao";
import { ChevronDown, ChevronRight, Factory, Plus } from "lucide-react";

export type LinhaPeriodo = {
  id_op: string;
  material: string;
  desc_material: string | null;
  um: string | null;
  qtd_previsto: number;
  qtd_consumo: number;
  qtd_dif: number;
  impacto: number;
  mes: string;
  data: string | null;
  produto?: string | null;
  desc_produto?: string | null;
};

type OpInfo = {
  numero_op: string;
  data: string | null;
  produto: string | null;
  desc_produto: string | null;
  /** Quantidade planejada cadastrada no PCP (quando a OP existe em ordens_producao). */
  qtd_prevista: number | null;
  /** Quantidade realizada cadastrada no PCP. */
  qtd_realizada: number | null;
  /** Quantidade produzida estimada pela ficha técnica (previsto do material ÷ qtd por unidade). */
  qtd_estimada: number | null;
  almoxarifado: string | null;
  status: string | null;
  /** Nº de materiais da OP no relatório de consumo. */
  materiais: number;
  previsto_total: number;
  consumo_total: number;
  cadastrada: boolean;
};


const fmtQtd = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (d: string | null) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "—";


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: string;
  /** ano_mes de referência para vincular as ações criadas. */
  anoMes: string | null;
  linhas: LinhaPeriodo[];
};

export function DetalhePeriodoDispersaoDialog({ open, onOpenChange, label, anoMes, linhas }: Props) {
  const qc = useQueryClient();
  const { role, isAdmin } = useRole();
  const isCoord = role === "COORDENADOR_CONTROLE";
  const isGerente = role === "GERENTE";
  const podeGerir = isAdmin || isCoord || isGerente;
  const [aberto, setAberto] = useState<string | null>(null);

  const itens = useMemo(() => {
    const map = new Map<string, {
      material: string; desc_material: string; um: string | null;
      ops: Set<string>; previsto: number; consumo: number; dif: number; impacto: number;
    }>();
    for (const r of linhas) {
      const cur = map.get(r.material) ?? {
        material: r.material, desc_material: r.desc_material || r.material, um: r.um,
        ops: new Set<string>(), previsto: 0, consumo: 0, dif: 0, impacto: 0,
      };
      cur.ops.add(r.id_op);
      cur.previsto += Number(r.qtd_previsto ?? 0);
      cur.consumo += Number(r.qtd_consumo ?? 0);
      cur.dif += Number(r.qtd_dif ?? 0);
      cur.impacto += Number(r.impacto ?? 0);
      map.set(r.material, cur);
    }
    return Array.from(map.values())
      .map((m) => ({ ...m, ops: m.ops.size }))
      .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto));
  }, [linhas]);

  const acoesQ = useQuery({
    queryKey: ["dispersao", "acoes-periodo", anoMes ?? "todos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dispersao_acoes_corretivas")
        .select("*")
        .order("data_abertura", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const acoesPorMaterial = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of acoesQ.data ?? []) {
      if (!a.material) continue;
      const arr = map.get(a.material) ?? [];
      arr.push(a);
      map.set(a.material, arr);
    }
    return map;
  }, [acoesQ.data]);

  const opsPeriodo = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.id_op).filter(Boolean))),
    [linhas],
  );

  /** Dados das ordens de produção do período (consumo importado + ficha técnica + cadastro de OP). */
  const opsQ = useQuery({
    queryKey: ["dispersao", "ops-periodo", opsPeriodo.length, opsPeriodo[0] ?? "", opsPeriodo[opsPeriodo.length - 1] ?? ""],
    enabled: open && opsPeriodo.length > 0,
    queryFn: async (): Promise<Map<string, OpInfo>> => {
      const map = new Map<string, OpInfo>();
      const chunks: string[][] = [];
      for (let i = 0; i < opsPeriodo.length; i += 200) chunks.push(opsPeriodo.slice(i, i + 200));

      // 1) Consumo importado: todas as linhas de cada OP (base real dos dados)
      const consumoPorOp = new Map<string, any[]>();
      for (const chunk of chunks) {
        const linhasOp = await fetchAll<any>((f, t) =>
          (supabase as any)
            .from("producao_consumo")
            .select("id_op, produto, desc_produto, material, qtd_previsto, qtd_consumo, qtd_produzida, data_producao")
            .in("id_op", chunk)
            .order("id_op")
            .range(f, t),
        );
        for (const r of linhasOp) {
          const arr = consumoPorOp.get(r.id_op) ?? [];
          arr.push(r);
          consumoPorOp.set(r.id_op, arr);
        }
      }

      // 2) Ficha técnica dos produtos envolvidos → estimativa de quantidade produzida
      const produtos = Array.from(
        new Set(
          Array.from(consumoPorOp.values())
            .map((rows) => rows.find((r) => r.produto)?.produto)
            .filter(Boolean),
        ),
      ) as string[];
      const bom = new Map<string, number>(); // `${produto}|${material}` -> qtd por unidade
      for (let i = 0; i < produtos.length; i += 100) {
        const parte = produtos.slice(i, i + 100);
        const rows = await fetchAll<any>((f, t) =>
          (supabase as any)
            .from("ficha_tecnica_bom")
            .select("id_produto, id_item, qtd")
            .in("id_produto", parte)
            .order("id_produto")
            .range(f, t),
        );
        for (const b of rows) {
          const k = `${b.id_produto}|${b.id_item}`;
          bom.set(k, (bom.get(k) ?? 0) + Number(b.qtd ?? 0));
        }
      }

      for (const [idOp, rows] of consumoPorOp) {
        const base = rows.find((r) => r.produto) ?? rows[0];
        const produto = base?.produto ?? null;
        const estimativas: number[] = [];
        if (produto) {
          for (const r of rows) {
            const porUnidade = bom.get(`${produto}|${r.material}`);
            const previsto = Number(r.qtd_previsto ?? 0);
            if (porUnidade && porUnidade > 0 && previsto > 0) estimativas.push(previsto / porUnidade);
          }
        }
        estimativas.sort((a, b) => a - b);
        const mediana = estimativas.length
          ? estimativas[Math.floor(estimativas.length / 2)]
          : null;
        const realizadaImportada = rows.map((r) => r.qtd_produzida).find((v) => v != null);

        map.set(idOp, {
          numero_op: idOp,
          data: rows.map((r) => r.data_producao).find(Boolean) ?? null,
          produto,
          desc_produto: base?.desc_produto ?? null,
          qtd_prevista: null,
          qtd_realizada: realizadaImportada != null ? Number(realizadaImportada) : null,
          qtd_estimada: mediana != null ? Number(mediana.toFixed(2)) : null,
          almoxarifado: null,
          status: null,
          materiais: new Set(rows.map((r) => r.material)).size,
          previsto_total: rows.reduce((s, r) => s + Number(r.qtd_previsto ?? 0), 0),
          consumo_total: rows.reduce((s, r) => s + Number(r.qtd_consumo ?? 0), 0),
          cadastrada: false,
        });
      }

      // 3) Enriquecimento opcional com o cadastro de OPs do PCP (quando existir)
      for (const chunk of chunks) {
        const { data: ops } = await (supabase as any)
          .from("ordens_producao")
          .select("numero_op, produto, desc_produto, quantidade_planejada, quantidade_produzida_real, almoxarifado_producao, status, data_planejada, data_conclusao_real")
          .in("numero_op", chunk);
        for (const o of (ops ?? []) as any[]) {
          const cur = map.get(o.numero_op);
          if (!cur) continue;
          map.set(o.numero_op, {
            ...cur,
            data: cur.data ?? o.data_conclusao_real ?? o.data_planejada ?? null,
            produto: cur.produto ?? o.produto ?? null,
            desc_produto: cur.desc_produto ?? o.desc_produto ?? null,
            qtd_prevista: o.quantidade_planejada != null ? Number(o.quantidade_planejada) : null,
            qtd_realizada: o.quantidade_produzida_real != null ? Number(o.quantidade_produzida_real) : cur.qtd_realizada,
            almoxarifado: o.almoxarifado_producao || null,
            status: o.status || null,
            cadastrada: true,
          });
        }
      }
      return map;
    },
  });


  const linhasPorMaterial = useMemo(() => {
    const map = new Map<string, LinhaPeriodo[]>();
    for (const l of linhas) {
      const arr = map.get(l.material) ?? [];
      arr.push(l);
      map.set(l.material, arr);
    }
    return map;
  }, [linhas]);



  const totalPerda = itens.reduce((s, i) => s + (i.impacto > 0 ? i.impacto : 0), 0);
  const totalEconomia = itens.reduce((s, i) => s + (i.impacto < 0 ? -i.impacto : 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhe do período · {label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 text-sm">
          <span>Itens: <strong>{itens.length}</strong></span>
          <span className="text-destructive">Perda: <strong>{fmtBRL(totalPerda)}</strong></span>
          <span className="text-success">Economia: <strong>{fmtBRL(totalEconomia)}</strong></span>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Material</TableHead>
                <TableHead className="text-right">OPs</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Consumo</TableHead>
                <TableHead className="text-right">Dif.</TableHead>
                <TableHead className="text-right">Impacto (R$)</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => {
                const acoes = acoesPorMaterial.get(i.material) ?? [];
                const expandido = aberto === i.material;
                return [
                  <TableRow
                    key={i.material}
                    className="cursor-pointer"
                    onClick={() => setAberto(expandido ? null : i.material)}
                  >
                    <TableCell>{expandido ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{i.material}</div>
                      <div className="text-muted-foreground">{i.desc_material}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.ops}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.previsto.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.dif.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${i.impacto > 0 ? "text-destructive" : "text-success"}`}>
                      {fmtBRL(i.impacto)}
                    </TableCell>
                    <TableCell className="text-right">
                      {acoes.length > 0
                        ? <Badge variant="outline">{acoes.length}</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>,
                  expandido ? (
                    <TableRow key={`${i.material}-det`}>
                      <TableCell colSpan={8} className="bg-muted/30 space-y-4">
                        <OrdensDoMaterial
                          linhas={linhasPorMaterial.get(i.material) ?? []}
                          ops={opsQ.data}
                          carregando={opsQ.isLoading}
                        />
                        <Acompanhamento
                          material={i.material}
                          descMaterial={i.desc_material}
                          anoMes={anoMes}
                          acoes={acoes}
                          podeGerir={podeGerir}
                          canConcluir={isAdmin || isCoord}
                          onChanged={() => qc.invalidateQueries({ queryKey: ["dispersao"] })}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
              {itens.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">Sem itens neste período.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Acompanhamento({
  material, descMaterial, anoMes, acoes, podeGerir, canConcluir, onChanged,
}: {
  material: string; descMaterial: string; anoMes: string | null; acoes: any[];
  podeGerir: boolean; canConcluir: boolean; onChanged: () => void;
}) {
  const [criando, setCriando] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (!descricao.trim()) { toast.error("Descreva a ação."); return; }
    setSalvando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("dispersao_acoes_corretivas").insert({
      material,
      ano_mes: anoMes,
      descricao_acao: descricao.trim(),
      responsavel: responsavel.trim() || null,
      status: "ABERTA",
      aberto_por: userData?.user?.id ?? null,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ação criada");
    setDescricao(""); setResponsavel(""); setCriando(false);
    onChanged();
  }

  async function alterarStatus(id: string, novo: string) {
    if (novo === "CONCLUIDA" && !canConcluir) {
      toast.error("Apenas Administrador/Coordenador pode concluir.");
      return;
    }
    const patch: any = { status: novo };
    patch.data_conclusao = novo === "CONCLUIDA" ? new Date().toISOString() : null;
    const { error } = await (supabase as any).from("dispersao_acoes_corretivas").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado");
    onChanged();
  }

  return (
    <div className="space-y-3 py-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">Acompanhamento de ações · {descMaterial}</div>
        {podeGerir && !criando && (
          <Button size="sm" variant="outline" onClick={() => setCriando(true)}>
            <Plus className="size-4" /> Criar ação
          </Button>
        )}
      </div>

      {criando && (
        <div className="space-y-2 rounded-md border bg-background p-3">
          <Textarea
            placeholder="Descreva a ação corretiva para este item"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-[240px]"
              placeholder="Responsável"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
            <Button size="sm" onClick={criar} disabled={salvando}>Salvar ação</Button>
            <Button size="sm" variant="ghost" onClick={() => setCriando(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {acoes.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nenhuma ação registrada para este item.</div>
      ) : (
        <div className="space-y-2">
          {acoes.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
              <div className="min-w-[240px] flex-1">
                <div className="text-sm">{a.descricao_acao}</div>
                <div className="text-[11px] text-muted-foreground">
                  Aberta em {new Date(a.data_abertura).toLocaleDateString("pt-BR")}
                  {a.responsavel ? ` · ${a.responsavel}` : ""}
                  {a.ano_mes ? ` · ${a.ano_mes}` : ""}
                  {a.data_conclusao ? ` · concluída em ${new Date(a.data_conclusao).toLocaleDateString("pt-BR")}` : ""}
                </div>
              </div>
              {podeGerir ? (
                <Select value={a.status} onValueChange={(v) => alterarStatus(a.id, v)}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_ACAO.map((s) => (
                      <SelectItem key={s.v} value={s.v} disabled={s.v === "CONCLUIDA" && !canConcluir}>{s.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{STATUS_ACAO.find((s) => s.v === a.status)?.l ?? a.status}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ordens de produção ligadas ao material no período, com dados da OP. */
function OrdensDoMaterial({
  linhas, ops, carregando,
}: {
  linhas: LinhaPeriodo[];
  ops?: Map<string, OpInfo>;
  carregando: boolean;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, LinhaPeriodo & { chaveData: string | null }>();
    for (const l of linhas) {
      const cur = map.get(l.id_op);
      if (!cur) { map.set(l.id_op, { ...l, chaveData: l.data }); continue; }
      cur.qtd_previsto += Number(l.qtd_previsto ?? 0);
      cur.qtd_consumo += Number(l.qtd_consumo ?? 0);
      cur.qtd_dif += Number(l.qtd_dif ?? 0);
      cur.impacto += Number(l.impacto ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto));
  }, [linhas]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Factory className="size-4" />
        Ordens de produção ({rows.length})
        {carregando && <span className="text-muted-foreground">carregando dados das OPs…</span>}
      </div>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OP</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Almoxarifado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Qtd. prevista (OP)</TableHead>
              <TableHead className="text-right">Qtd. realizada (OP)</TableHead>
              <TableHead className="text-right">Previsto (mat.)</TableHead>
              <TableHead className="text-right">Consumo (mat.)</TableHead>
              <TableHead className="text-right">Dif.</TableHead>
              <TableHead className="text-right">Impacto (R$)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const op = ops?.get(r.id_op);
              return (
                <TableRow key={r.id_op}>
                  <TableCell className="text-xs font-medium">{r.id_op}</TableCell>
                  <TableCell className="text-xs">{fmtData(op?.data ?? r.data)}</TableCell>
                  <TableCell className="text-xs">
                    <div>{op?.produto ?? r.produto ?? "—"}</div>
                    <div className="text-muted-foreground">{op?.desc_produto ?? r.desc_produto ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">{op?.almoxarifado ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {op?.status ? <Badge variant="outline">{op.status}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQtd(op?.qtd_prevista)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQtd(op?.qtd_realizada)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQtd(r.qtd_previsto)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQtd(r.qtd_consumo)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtQtd(r.qtd_dif)}</TableCell>
                  <TableCell className={`text-right text-xs tabular-nums font-medium ${r.impacto > 0 ? "text-destructive" : "text-success"}`}>
                    {fmtBRL(r.impacto)}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={11} className="py-4 text-center text-xs text-muted-foreground">Sem OPs para este material.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
