import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

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
};

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

  const totalPerda = itens.reduce((s, i) => s + (i.impacto > 0 ? i.impacto : 0), 0);
  const totalEconomia = itens.reduce((s, i) => s + (i.impacto < 0 ? -i.impacto : 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
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
                      <TableCell colSpan={8} className="bg-muted/30">
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
