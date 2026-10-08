import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { notificarTarefaAtribuida } from "@/lib/tarefa-email.functions";
import { STATUS_OBS, fmtBRL, useTiposAcaoObsoleto, type AcaoObsoleto } from "@/lib/obsoletos";

export type AcaoObsDraft = Partial<AcaoObsoleto> & { id_produto: string };

const NENHUM = "__nenhum__";

export function AcaoObsoletoDialog({ draft, onOpenChange }: { draft: AcaoObsDraft | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const tipos = useTiposAcaoObsoleto();
  const usuarios = useUsuariosSistema();
  const [f, setF] = useState<any>({});

  useEffect(() => {
    if (!draft) return;
    setF({
      tipo_acao_id: draft.tipo_acao_id ?? "",
      quantidade: draft.quantidade ?? 0,
      custo_unitario: draft.custo_unitario ?? 0,
      valor_recuperado: draft.valor_recuperado ?? 0,
      saving_recuperado: draft.saving_recuperado ?? 0,
      status: draft.status ?? "PLANEJADA",
      data_acao: draft.data_acao ?? new Date().toISOString().slice(0, 10),
      responsavel_id: draft.responsavel_id ?? NENHUM,
      observacao: draft.observacao ?? "",
    });
  }, [draft]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const tipo = (tipos.data ?? []).find((t) => t.id === f.tipo_acao_id);
  const valorRisco = Number(f.quantidade || 0) * Number(f.custo_unitario || 0);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      if (!f.tipo_acao_id) throw new Error("Escolha o tipo de ação.");
      const { data: u } = await supabase.auth.getUser();
      const resp = (usuarios.data ?? []).find((x) => x.id === f.responsavel_id);
      const payload: any = {
        id_produto: draft.id_produto,
        descricao: draft.descricao ?? null,
        lote: draft.lote ?? null,
        almoxarifado: draft.almoxarifado ?? null,
        faixa: draft.faixa ?? null,
        dias_sem_mov: draft.dias_sem_mov ?? null,
        tipo_acao_id: f.tipo_acao_id,
        quantidade: Number(f.quantidade) || 0,
        custo_unitario: Number(f.custo_unitario) || 0,
        valor_em_risco: valorRisco,
        valor_recuperado: Number(f.valor_recuperado) || 0,
        saving_recuperado: Number(f.saving_recuperado) || 0,
        status: f.status,
        data_acao: f.data_acao,
        responsavel_id: resp?.id ?? null,
        responsavel_label: resp?.nome ?? null,
        observacao: f.observacao || null,
        concluido_em: f.status === "CONCLUIDA" ? (draft.concluido_em ?? new Date().toISOString()) : null,
      };
      if (draft.id) {
        const { error } = await (supabase as any).from("acoes_obsoleto").update(payload).eq("id", draft.id);
        if (error) throw error;
        return;
      }
      payload.criado_por = u.user?.id ?? null;
      const { data: nova, error } = await (supabase as any).from("acoes_obsoleto").insert(payload).select("id").single();
      if (error) throw error;
      if (resp) {
        const { data: tarefa, error: et } = await (supabase as any)
          .from("tarefas_operacionais")
          .insert({
            titulo: `Ação de obsoleto: ${tipo?.nome ?? "Obsoletos"} — ${payload.id_produto}`,
            descricao: `${payload.descricao ?? payload.id_produto} · Lote ${payload.lote || "—"} · ${payload.quantidade} un` +
              (payload.almoxarifado ? ` · ${payload.almoxarifado}` : ""),
            prioridade: "Alta",
            data_prevista: payload.data_acao,
            recorrencia: "Unica",
            responsavel_tipo: "Pessoa",
            responsavel_id: resp.id,
            responsavel_label: resp.nome,
            sku_ou_local: payload.id_produto,
            acao_obsoleto_id: nova.id,
            link_rota: "/obsoletos/acoes",
            observacao: payload.observacao,
            status: "Pendente",
            criado_por: u.user?.id ?? null,
          })
          .select("id")
          .single();
        if (et) throw et;
        try { await notificarTarefaAtribuida({ data: { tarefaId: tarefa.id } }); } catch { /* e-mail opcional */ }
      }
    },
    onSuccess: () => {
      toast.success("Ação salva");
      qc.invalidateQueries({ queryKey: ["obsoletos-acoes"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  return (
    <Dialog open={!!draft} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{draft?.id ? "Editar ação" : "Nova ação"} — {draft?.descricao || draft?.id_produto}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          SKU {draft?.id_produto} · Lote {draft?.lote || "—"} · {draft?.almoxarifado || "—"} · {draft?.dias_sem_mov ?? "—"} dias sem movimentação
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Tipo de ação</Label>
            <Select value={f.tipo_acao_id || undefined} onValueChange={(v) => set("tipo_acao_id", v)}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {(tipos.data ?? []).filter((t) => t.ativo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Quantidade</Label><Input type="number" value={f.quantidade} onChange={(e) => set("quantidade", e.target.value)} /></div>
          <div><Label className="text-xs">Custo unitário</Label><Input type="number" value={f.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} /></div>
          <div className="sm:col-span-2 text-xs text-muted-foreground">Valor em risco endereçado: <b>{fmtBRL(valorRisco)}</b></div>
          <div><Label className="text-xs">Receita recuperada (R$)</Label><Input type="number" value={f.valor_recuperado} onChange={(e) => set("valor_recuperado", e.target.value)} /></div>
          <div><Label className="text-xs">Saving / custo evitado (R$)</Label><Input type="number" value={f.saving_recuperado} onChange={(e) => set("saving_recuperado", e.target.value)} /></div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OBS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Data da ação</Label><Input type="date" value={f.data_acao} onChange={(e) => set("data_acao", e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Responsável {draft?.id ? "" : "(gera tarefa)"}</Label>
            <Select value={f.responsavel_id} onValueChange={(v) => set("responsavel_id", v)} disabled={!!draft?.id}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Sem responsável</SelectItem>
                {(usuarios.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label className="text-xs">Observação</Label><Textarea value={f.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
