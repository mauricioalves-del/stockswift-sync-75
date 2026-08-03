import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTiposAcao, type CampanhaRow } from "@/hooks/useShelfLife";
import { useRole } from "@/hooks/useRole";
import { STATUS_CAMPANHA } from "@/lib/shelf-life";
import { formatBRL } from "@/lib/inventory";
import { usePrecoVendaPorSku, useParametroDesconto } from "@/hooks/usePrecosVenda";
import { calcularPrecoComDesconto, chaveSku, ehDescontoColaborador } from "@/lib/precos-venda";
import { montarMensagemQueima } from "@/lib/whatsapp-message";

export type CampanhaDraft = Partial<CampanhaRow> & { sku: string; lote: string; unidade?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: CampanhaDraft | null;
};

export function CampanhaDialog({ open, onOpenChange, draft }: Props) {
  const qc = useQueryClient();
  const tipos = useTiposAcao();
  const { isAdmin, role } = useRole();
  const podeVincular = isAdmin || role === "COORDENADOR_CONTROLE";

  const precos = usePrecoVendaPorSku();
  const paramDesc = useParametroDesconto();

  const [form, setForm] = useState<any>({});
  const [salvarPreco, setSalvarPreco] = useState(false);
  useEffect(() => {
    if (!open || !draft) return;
    setSalvarPreco(false);
    setForm({
      id: draft.id,
      sku: draft.sku ?? "",
      descricao: draft.descricao ?? "",
      lote: draft.lote ?? "",
      unidade: draft.unidade ?? "",
      almoxarifado: draft.almoxarifado ?? "",
      data_validade: draft.data_validade ?? "",
      tipo_acao_id: draft.tipo_acao_id ?? "",
      quantidade_enderecada: draft.quantidade_enderecada ?? 0,
      valor_estimado_recuperado: draft.valor_estimado_recuperado ?? 0,
      valor_estimado_saving: draft.valor_estimado_saving ?? 0,
      custo_acao: draft.custo_acao ?? 0,
      responsavel: draft.responsavel ?? "",
      data_acao: draft.data_acao ?? new Date().toISOString().slice(0, 10),
      status: draft.status ?? "PLANEJADA",
      observacao: draft.observacao ?? "",
      baixa_operacional_id: draft.baixa_operacional_id ?? "",
      preco_venda_referencia: (draft as any).preco_venda_referencia ?? "",
      percentual_desconto_aplicado: (draft as any).percentual_desconto_aplicado ?? "",
    });
  }, [open, draft]);

  const tipoSel = useMemo(
    () => (tipos.data ?? []).find((t) => t.id === form.tipo_acao_id),
    [tipos.data, form.tipo_acao_id],
  );

  const isDescColab = ehDescontoColaborador(tipoSel?.nome);
  const precoCadastrado = precos.map.get(chaveSku(form.sku));
  const semPrecoCadastrado = !precoCadastrado || !(Number(precoCadastrado.pr_venda) > 0);

  // Pré-preenche preço/desconto ao selecionar "Desconto Colaborador"
  useEffect(() => {
    if (!open || !isDescColab) return;
    setForm((f: any) => ({
      ...f,
      preco_venda_referencia:
        f.preco_venda_referencia !== "" && f.preco_venda_referencia != null
          ? f.preco_venda_referencia
          : precoCadastrado?.pr_venda ?? "",
      percentual_desconto_aplicado:
        f.percentual_desconto_aplicado !== "" && f.percentual_desconto_aplicado != null
          ? f.percentual_desconto_aplicado
          : paramDesc.data?.percentual_desconto ?? 60,
    }));
  }, [open, isDescColab, precoCadastrado?.pr_venda, paramDesc.data?.percentual_desconto]);

  const precoVendaNum = Number(form.preco_venda_referencia) || 0;
  const percentualNum = Number(form.percentual_desconto_aplicado);
  const precoComDesconto = calcularPrecoComDesconto(
    precoVendaNum,
    Number.isFinite(percentualNum) ? percentualNum : (paramDesc.data?.percentual_desconto ?? 60),
  );

  // Baixas do mesmo SKU+Lote, para vínculo manual
  const baixas = useQuery({
    queryKey: ["shelf-baixas-lote", form.sku, form.lote],
    enabled: open && podeVincular && !!form.sku,
    queryFn: async () => {
      let q = (supabase as any)
        .from("baixa_operacional")
        .select("id, codigo_produto, lote, quantidade, valor_total, data_ocorrencia, data_solicitacao")
        .eq("codigo_produto", form.sku)
        .order("data_solicitacao", { ascending: false })
        .limit(30);
      if (form.lote) q = q.eq("lote", form.lote);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const payload: any = {
        sku: String(form.sku ?? "").trim(),
        descricao: form.descricao || null,
        lote: String(form.lote ?? "").trim(),
        almoxarifado: form.almoxarifado || null,
        data_validade: form.data_validade || null,
        tipo_acao_id: form.tipo_acao_id || null,
        quantidade_enderecada: Number(form.quantidade_enderecada) || 0,
        valor_estimado_recuperado: Number(form.valor_estimado_recuperado) || 0,
        valor_estimado_saving: Number(form.valor_estimado_saving) || 0,
        custo_acao: Number(form.custo_acao) || 0,
        responsavel: form.responsavel || null,
        data_acao: form.data_acao || new Date().toISOString().slice(0, 10),
        status: form.status,
        observacao: form.observacao || null,
        baixa_operacional_id: form.baixa_operacional_id || null,
        preco_venda_referencia: isDescColab ? precoVendaNum : null,
        percentual_desconto_aplicado: isDescColab ? (Number.isFinite(percentualNum) ? percentualNum : null) : null,
        preco_com_desconto: isDescColab ? precoComDesconto : null,
      };
      if (!payload.sku) throw new Error("Informe o SKU.");
      if (!payload.tipo_acao_id) throw new Error("Selecione o tipo de ação.");

      if (form.id) {
        const { error } = await (supabase as any).from("campanhas_lote").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("campanhas_lote").insert({ ...payload, criado_por: uid });
        if (error) throw error;
      }

      if (isDescColab && salvarPreco && precoVendaNum > 0) {
        await (supabase as any).from("precos_venda").upsert(
          {
            sku: payload.sku,
            descricao: payload.descricao,
            pr_venda: precoVendaNum,
            importado_por: uid,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: "sku" },
        );
      }

      // Automação WhatsApp — nunca bloqueia a criação da ação.
      // Dispara SEMPRE que a ação for "Desconto Colaborador" (sem gate de preço),
      // para que exista sempre um registro em auditoria.
      let whatsapp: { enviado: boolean; motivo?: string } = { enviado: false };
      if (isDescColab) {
        try {
          whatsapp = (await notificarWhatsappColaboradores({
            data: {
              descricao: payload.descricao ?? payload.sku,
              precoVenda: precoVendaNum,
              precoComDesconto,
              quantidade: payload.quantidade_enderecada,
              unidade: form.unidade || null,
              dataValidade: payload.data_validade,
              sku: payload.sku,
              lote: payload.lote,
            },
          })) as any;
        } catch (e: any) {
          console.error("[whatsapp] falha ao chamar a automação", e);
          whatsapp = { enviado: false, motivo: String(e?.message ?? e) };
        }
      }
      return whatsapp;

    },
    onSuccess: (whatsapp: any) => {
      toast.success(form.id ? "Ação atualizada." : "Ação criada.");
      if (isDescColab) {
        if (whatsapp?.enviado) toast.success("Mensagem enviada no grupo de WhatsApp.");
        else if (whatsapp?.motivo) toast.warning(`WhatsApp não enviado: ${whatsapp.motivo}`);
      }
      qc.invalidateQueries({ queryKey: ["shelf-campanhas"] });
      qc.invalidateQueries({ queryKey: ["precos-venda"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar a ação."),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar Ação de Lote" : "Nova Ação de Lote"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>SKU</Label>
            <Input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
          </div>
          <div>
            <Label>Lote</Label>
            <Input value={form.lote ?? ""} onChange={(e) => set("lote", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Produto</Label>
            <Input value={form.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} />
          </div>
          <div>
            <Label>Almoxarifado</Label>
            <Input value={form.almoxarifado ?? ""} onChange={(e) => set("almoxarifado", e.target.value)} />
          </div>
          <div>
            <Label>Validade do lote</Label>
            <Input type="date" value={form.data_validade ?? ""} onChange={(e) => set("data_validade", e.target.value)} />
          </div>

          <div>
            <Label>Tipo de ação</Label>
            <Select value={form.tipo_acao_id ?? ""} onValueChange={(v) => set("tipo_acao_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(tipos.data ?? []).filter((t) => t.ativo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} — {t.categoria === "RECEITA" ? "Receita" : "Saving"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? "PLANEJADA"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_CAMPANHA.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isDescColab && (
            <div className="sm:col-span-2 rounded-md border border-warning/40 bg-warning/5 p-3 space-y-3">
              <div className="text-sm font-medium">Desconto Colaborador</div>
              {semPrecoCadastrado && (
                <p className="text-xs text-warning">
                  SKU sem Preço de Venda cadastrado — informe o preço abaixo para calcular o desconto.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Preço de Venda (R$)</Label>
                  <Input type="number" step="0.01" value={form.preco_venda_referencia ?? ""}
                    onChange={(e) => set("preco_venda_referencia", e.target.value)} />
                </div>
                <div>
                  <Label>% Desconto</Label>
                  <Input type="number" step="0.1" value={form.percentual_desconto_aplicado ?? ""}
                    onChange={(e) => set("percentual_desconto_aplicado", e.target.value)} />
                </div>
                <div>
                  <Label>Preço com Desconto</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">
                    {formatBRL(precoComDesconto)}
                  </div>
                </div>
              </div>
              {semPrecoCadastrado && (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={salvarPreco} onCheckedChange={(v) => setSalvarPreco(!!v)} />
                  Salvar como Preço de Venda deste SKU
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">
                Ao salvar, a mensagem de queima de estoque é enviada automaticamente no grupo de WhatsApp dos
                colaboradores (falha no envio não impede o registro da ação).
              </p>
            </div>
          )}


          <div>
            <Label>Quantidade endereçada</Label>
            <Input type="number" step="0.001" value={form.quantidade_enderecada ?? 0}
              onChange={(e) => set("quantidade_enderecada", e.target.value)} />
          </div>
          <div>
            <Label>Custo da ação (R$)</Label>
            <Input type="number" step="0.01" value={form.custo_acao ?? 0}
              onChange={(e) => set("custo_acao", e.target.value)} />
          </div>

          <div>
            <Label>
              Valor recuperado (R$)
              {tipoSel?.categoria === "RECEITA" && <span className="ml-1 text-xs text-success">usado no indicador</span>}
            </Label>
            <Input type="number" step="0.01" value={form.valor_estimado_recuperado ?? 0}
              disabled={tipoSel && tipoSel.categoria !== "RECEITA"}
              onChange={(e) => set("valor_estimado_recuperado", e.target.value)} />
          </div>
          <div>
            <Label>
              Saving estimado (R$)
              {tipoSel && tipoSel.categoria !== "RECEITA" && <span className="ml-1 text-xs text-success">usado no indicador</span>}
            </Label>
            <Input type="number" step="0.01" value={form.valor_estimado_saving ?? 0}
              disabled={tipoSel?.categoria === "RECEITA"}
              onChange={(e) => set("valor_estimado_saving", e.target.value)} />
          </div>

          <div>
            <Label>Responsável</Label>
            <Input value={form.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value)} />
          </div>
          <div>
            <Label>Data da ação</Label>
            <Input type="date" value={form.data_acao ?? ""} onChange={(e) => set("data_acao", e.target.value)} />
          </div>

          {podeVincular && (
            <div className="sm:col-span-2">
              <Label>Baixa operacional vinculada (opcional)</Label>
              <Select value={form.baixa_operacional_id || "__none__"}
                onValueChange={(v) => set("baixa_operacional_id", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem vínculo</SelectItem>
                  {(baixas.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b.data_ocorrencia ?? b.data_solicitacao ?? "").slice(0, 10)} · Lote {b.lote || "—"} ·{" "}
                      {Number(b.quantidade)} un · {formatBRL(Number(b.valor_total))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="sm:col-span-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={form.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
