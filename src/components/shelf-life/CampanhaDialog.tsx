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
import { copiarEAbrirWhatsApp, montarAvisoInterno, montarMensagemQueima } from "@/lib/whatsapp-message";
import { WhatsAppFallbackDialog } from "@/components/shelf-life/WhatsAppFallbackDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageCircle } from "lucide-react";
import {
  baixaEhExecucaoDaAcao,
  categoriaFinanceira,
  custoAcaoCalculado,
  ehCategoriaVendas,
  quantidadeRecuperada as calcQtdRecuperada,
  savingRecuperadoCalculado,
  sufixoTipoAcao,
  valorRecuperadoCalculado,
} from "@/lib/shelf-life-financeiro";
import { RotateCcw } from "lucide-react";
import { dataDaBaixa, formatarDataBR } from "@/lib/shelf-life-recalculo";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { notificarTarefaAtribuida } from "@/lib/tarefa-email.functions";


export type CampanhaDraft = Partial<CampanhaRow> & {
  sku: string;
  lote: string;
  unidade?: string | null;
  custo_unitario?: number | null;
};

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
  const podeRecalcular = podeVincular;

  const usuarios = useUsuariosSistema();
  const precos = usePrecoVendaPorSku();
  const paramDesc = useParametroDesconto();

  const [form, setForm] = useState<any>({});
  const [salvarPreco, setSalvarPreco] = useState(false);
  const [mensagemFallback, setMensagemFallback] = useState<string | null>(null);
  const [forcarRecalculo, setForcarRecalculo] = useState(false);

  useEffect(() => {
    if (!open || !draft) return;
    setSalvarPreco(false);
    setForcarRecalculo(false);
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
      custo_unitario: (draft as any).custo_unitario ?? 0,
      valor_recuperado: (draft as any).valor_recuperado ?? 0,
      saving_recuperado: (draft as any).saving_recuperado ?? 0,
      status_original: draft.status ?? "PLANEJADA",
      responsavel: draft.responsavel ?? "",
      responsavel_id: "",
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

  const categoria = categoriaFinanceira(tipoSel?.nome);
  const isVendas = ehCategoriaVendas(tipoSel?.nome);
  const isDescColab = ehDescontoColaborador(tipoSel?.nome);
  const precoCadastrado = precos.map.get(chaveSku(form.sku));
  const semPrecoCadastrado = !precoCadastrado || !(Number(precoCadastrado.pr_venda) > 0);

  // Pré-preenche preço/desconto ao selecionar um tipo da categoria Vendas.
  useEffect(() => {
    if (!open || !isVendas) return;
    setForm((f: any) => ({
      ...f,
      preco_venda_referencia:
        f.preco_venda_referencia !== "" && f.preco_venda_referencia != null
          ? f.preco_venda_referencia
          : precoCadastrado?.pr_venda ?? "",
      percentual_desconto_aplicado:
        f.percentual_desconto_aplicado !== "" && f.percentual_desconto_aplicado != null
          ? f.percentual_desconto_aplicado
          : isDescColab
            ? paramDesc.data?.percentual_desconto ?? 60
            : 0,
    }));
  }, [open, isVendas, isDescColab, precoCadastrado?.pr_venda, paramDesc.data?.percentual_desconto]);

  const precoVendaNum = Number(form.preco_venda_referencia) || 0;
  const percentualNum = Number(form.percentual_desconto_aplicado);
  const percentualEfetivo = Number.isFinite(percentualNum)
    ? percentualNum
    : isDescColab
      ? paramDesc.data?.percentual_desconto ?? 60
      : 0;
  const precoComDesconto = calcularPrecoComDesconto(precoVendaNum, percentualEfetivo);

  // Baixas elegíveis: mesmo SKU + mesmo lote, sem restrição de data,
  // desde que ainda não estejam vinculadas a outra ação.
  const baixas = useQuery({
    queryKey: ["shelf-baixas-lote", form.sku, form.lote, form.data_validade, form.id],
    enabled: open && podeVincular && !!form.sku,
    queryFn: async () => {
      let q = (supabase as any)
        .from("baixa_operacional")
        .select("id, codigo_produto, lote, quantidade, valor_total, data_ocorrencia, data_solicitacao, status_fluxo, descricao, motivo_baixa_id")
        .eq("codigo_produto", form.sku)
        .order("data_solicitacao", { ascending: false })
        .limit(100);
      if (form.lote) q = q.eq("lote", form.lote);
      const { data, error } = await q;
      if (error) throw error;

      const candidatas = (data ?? []) as any[];
      if (!candidatas.length) return [] as any[];

      const { data: vinculadas } = await (supabase as any)
        .from("campanhas_lote")
        .select("id, baixa_operacional_id")
        .in("baixa_operacional_id", candidatas.map((b: any) => b.id));
      const ocupadas = new Set(
        (vinculadas ?? [])
          .filter((v: any) => v.id !== form.id)
          .map((v: any) => v.baixa_operacional_id),
      );
      return candidatas.filter((b: any) => !ocupadas.has(b.id)) as any[];
    },
  });

  const baixaSel = useMemo(
    () => (baixas.data ?? []).find((b) => b.id === form.baixa_operacional_id),
    [baixas.data, form.baixa_operacional_id],
  );

  // Motivos de baixa (para identificar quando a baixa é a execução da ação).
  const motivos = useQuery({
    queryKey: ["motivos-baixa-lista"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivo_baixa").select("id, descricao");
      if (error) throw error;
      return (data ?? []) as { id: string; descricao: string }[];
    },
  });
  const motivoDaBaixa = useMemo(
    () => (motivos.data ?? []).find((m) => m.id === baixaSel?.motivo_baixa_id)?.descricao ?? null,
    [motivos.data, baixaSel],
  );
  // Baixa cujo motivo corresponde ao tipo da ação = execução da ação, não perda.
  const baixaExecucao = !!form.baixa_operacional_id
    && baixaEhExecucaoDaAcao(tipoSel?.nome, motivoDaBaixa, {
      motivoIdDoTipo: (tipoSel as any)?.motivo_baixa_id ?? null,
      motivoIdDaBaixa: baixaSel?.motivo_baixa_id ?? null,
    });

  // ——— Metodologia financeira ———
  const qtdEnderecada = Number(form.quantidade_enderecada) || 0;
  const custoUnit = Number(form.custo_unitario) || 0;
  const qtdBaixa = form.baixa_operacional_id ? Number(baixaSel?.quantidade ?? 0) : null;
  const qtdRecuperada = calcQtdRecuperada(qtdEnderecada, qtdBaixa, baixaExecucao);
  const custoAcao = custoAcaoCalculado(qtdEnderecada, custoUnit);
  const valorPrevisto = valorRecuperadoCalculado({
    categoria,
    quantidadeRecuperada: qtdRecuperada,
    custoUnitario: custoUnit,
    precoPraticado: precoComDesconto,
  });
  const savingPrevisto = savingRecuperadoCalculado(valorPrevisto, custoAcao);

  const jaConcluida = form.status_original === "CONCLUIDA";
  const vaiConcluir = form.status === "CONCLUIDA";
  // Congela ao concluir: só recalcula na transição para Concluída ou via botão Recalcular.
  const congelar = jaConcluida && !forcarRecalculo;
  const valorOficial = congelar ? Number(form.valor_recuperado) || 0 : vaiConcluir ? valorPrevisto : 0;
  const savingOficial = congelar ? Number(form.saving_recuperado) || 0 : vaiConcluir ? savingPrevisto : 0;

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
        quantidade_enderecada: qtdEnderecada,
        custo_unitario: custoUnit,
        custo_acao: custoAcao,
        categoria_financeira: categoria,
        quantidade_recuperada: vaiConcluir || forcarRecalculo ? qtdRecuperada : congelar ? undefined : 0,
        valor_recuperado: valorOficial,
        saving_recuperado: savingOficial,
        // legado: mantém os indicadores antigos coerentes
        valor_estimado_recuperado: categoria === "Vendas" ? valorOficial : 0,
        valor_estimado_saving: categoria === "Vendas" ? 0 : valorOficial,
        responsavel: form.responsavel || null,
        data_acao: form.data_acao || new Date().toISOString().slice(0, 10),
        status: form.status,
        observacao: form.observacao || null,
        baixa_operacional_id: form.baixa_operacional_id || null,
        preco_venda_referencia: isVendas ? precoVendaNum : null,
        percentual_desconto_aplicado: isVendas ? percentualEfetivo : null,
        preco_com_desconto: isVendas ? precoComDesconto : null,
      };
      if (payload.quantidade_recuperada === undefined) delete payload.quantidade_recuperada;
      if (forcarRecalculo) {
        payload.recalculado_em = new Date().toISOString();
        payload.recalculado_por = uid;
      }
      if (!payload.sku) throw new Error("Informe o SKU.");
      if (!payload.tipo_acao_id) throw new Error("Selecione o tipo de ação.");

      const valorAnterior = Number(form.valor_recuperado) || 0;

      let tarefaCriada: { ok: boolean; email?: string | null } | null = null;

      if (form.id) {
        const { error } = await (supabase as any).from("campanhas_lote").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: nova, error } = await (supabase as any)
          .from("campanhas_lote").insert({ ...payload, criado_por: uid }).select("id").single();
        if (error) throw error;

        // Atribuição: gera pendência em Tarefas para o usuário responsável.
        const respId = form.responsavel_id || null;
        if (respId) {
          const resp = (usuarios.data ?? []).find((u) => u.id === respId);
          const { data: tarefa, error: errTarefa } = await (supabase as any)
            .from("tarefas_operacionais")
            .insert({
              titulo: `Ação de lote: ${tipoSel?.nome ?? "Shelf Life"} — ${payload.sku}`,
              descricao: `${payload.descricao ?? payload.sku} · Lote ${payload.lote || "—"} · ${payload.quantidade_enderecada} un` +
                (payload.almoxarifado ? ` · ${payload.almoxarifado}` : ""),
              prioridade: "Alta",
              data_prevista: payload.data_acao,
              recorrencia: "Unica",
              responsavel_tipo: "Pessoa",
              responsavel_id: respId,
              responsavel_label: resp?.nome ?? null,
              sku_ou_local: payload.sku,
              observacao: payload.observacao ?? null,
              status: "Pendente",
              criado_por: uid,
            })
            .select("id")
            .single();
          if (errTarefa) throw errTarefa;

          try {
            const r: any = await notificarTarefaAtribuida({ data: { tarefaId: (tarefa as any).id } });
            tarefaCriada = { ok: !!r?.ok, email: resp?.email ?? null };
          } catch {
            tarefaCriada = { ok: false, email: resp?.email ?? null };
          }
        }
      }

      if (forcarRecalculo && form.id) {
        await (supabase as any).from("audit_logs").insert({
          usuario: uid,
          acao: "shelf_life_recalculo_valor",
          entidade: "campanhas_lote",
          entidade_id: String(form.id),
          payload: {
            valor_recuperado_antes: valorAnterior,
            valor_recuperado_depois: valorOficial,
            saving_antes: Number(form.saving_recuperado) || 0,
            saving_depois: savingOficial,
            motivo: form.observacao || "Recálculo manual",
          },
        });
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

      return tarefaCriada;
    },
    onSuccess: async (tarefaCriada) => {
      toast.success(form.id ? "Ação atualizada." : "Ação criada.");
      if (tarefaCriada) {
        if (tarefaCriada.ok) toast.success(`Tarefa atribuída e e-mail enviado para ${tarefaCriada.email ?? "o responsável"}.`);
        else toast.warning("Tarefa atribuída, mas o e-mail de notificação não pôde ser enviado.");
      }
      qc.invalidateQueries({ queryKey: ["shelf-campanhas"] });
      qc.invalidateQueries({ queryKey: ["precos-venda"] });
      qc.invalidateQueries({ queryKey: ["minhas-tarefas-pendentes"] });
      qc.invalidateQueries({ queryKey: ["minhas_tarefas"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar a ação."),
  });

  // ——— Envio manual de WhatsApp (opcional, independente do salvar) ———
  const podeEnviarWhats =
    !!String(form.sku ?? "").trim() &&
    !!String(form.descricao ?? "").trim() &&
    !!form.tipo_acao_id &&
    qtdEnderecada > 0;

  const enviarWhatsApp = async () => {
    const mensagem = isVendas
      ? montarMensagemQueima({
          descricao: form.descricao || form.sku,
          precoVenda: precoVendaNum,
          precoComDesconto,
          quantidade: qtdEnderecada,
          unidade: form.unidade || null,
          dataValidade: form.data_validade || null,
          sku: form.sku,
          lote: form.lote,
        })
      : montarAvisoInterno({
          tipoAcao: tipoSel?.nome ?? categoria,
          descricao: form.descricao || form.sku,
          sku: form.sku,
          lote: form.lote,
          almoxarifado: form.almoxarifado,
          quantidade: qtdEnderecada,
          unidade: form.unidade || null,
          dataValidade: form.data_validade || null,
          responsavel: form.responsavel,
        });

    const copiado = await copiarEAbrirWhatsApp(mensagem);
    if (copiado) {
      toast.success("Mensagem copiada! Cole (Ctrl+V) no grupo do WhatsApp Web que acabou de abrir.");
      return;
    }
    setMensagemFallback(mensagem);
  };


  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const ReadOnlyValor = ({ valor }: { valor: number }) => (
    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">
      {formatBRL(valor)}
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex-1">{form.id ? "Editar Ação de Lote" : "Nova Ação de Lote"}</DialogTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-success"
                      disabled={!podeEnviarWhats}
                      onClick={enviarWhatsApp}
                      aria-label="Enviar aviso no WhatsApp"
                    >
                      <MessageCircle className="size-5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {podeEnviarWhats ? "Enviar aviso no WhatsApp" : "Preencha os campos obrigatórios"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
                    {t.nome} — {sufixoTipoAcao(t.nome)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoSel && (
              <p className="mt-1 text-[11px] text-muted-foreground">Categoria financeira: {categoria}</p>
            )}
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

          {isVendas && (
            <div className="sm:col-span-2 rounded-md border border-warning/40 bg-warning/5 p-3 space-y-3">
              <div className="text-sm font-medium">
                {isDescColab ? "Desconto Colaborador" : "Venda — preço praticado"}
              </div>
              {semPrecoCadastrado && (
                <p className="text-xs text-warning">
                  SKU sem Preço de Venda cadastrado — informe o preço abaixo para calcular a receita.
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
                  <Label>Preço praticado</Label>
                  <ReadOnlyValor valor={precoComDesconto} />
                </div>
              </div>
              {semPrecoCadastrado && (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={salvarPreco} onCheckedChange={(v) => setSalvarPreco(!!v)} />
                  Salvar como Preço de Venda deste SKU
                </label>
              )}
              {isDescColab && (
                <p className="text-[11px] text-muted-foreground">
                  Ao salvar, a mensagem de queima de estoque é copiada e o WhatsApp Web é aberto para colar no grupo
                  dos colaboradores.
                </p>
              )}
            </div>
          )}

          <div>
            <Label>Quantidade endereçada</Label>
            <Input type="number" step="0.001" value={form.quantidade_enderecada ?? 0}
              onChange={(e) => set("quantidade_enderecada", e.target.value)} />
          </div>
          <div>
            <Label>Custo unitário (R$)</Label>
            <Input type="number" step="0.0001" value={form.custo_unitario ?? 0}
              onChange={(e) => set("custo_unitario", e.target.value)} />
          </div>

          <div>
            <Label>Custo da ação (R$)</Label>
            <ReadOnlyValor valor={custoAcao} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Quantidade endereçada × custo unitário — valor total em risco.
            </p>
          </div>
          <div>
            <Label>Quantidade recuperada</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">
              {qtdRecuperada}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Valor recuperado (R$)</Label>
              {jaConcluida && podeRecalcular && (
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                  onClick={() => setForcarRecalculo((v) => !v)}>
                  <RotateCcw className="size-3 mr-1" /> {forcarRecalculo ? "Cancelar recálculo" : "Recalcular"}
                </Button>
              )}
            </div>
            <ReadOnlyValor valor={congelar ? Number(form.valor_recuperado) || 0 : valorPrevisto} />
            {!congelar && !vaiConcluir && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Estimado ao concluir: {formatBRL(valorPrevisto)}
              </p>
            )}
            {forcarRecalculo && (
              <p className="mt-1 text-[11px] text-warning">
                Recálculo manual será gravado em auditoria ao salvar.
              </p>
            )}
          </div>
          <div>
            <Label>Saving Recuperado (R$)</Label>
            <ReadOnlyValor valor={congelar ? Number(form.saving_recuperado) || 0 : savingPrevisto} />
            {!congelar && !vaiConcluir && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Estimado ao concluir: {formatBRL(savingPrevisto)}
              </p>
            )}
            {categoria === "Descarte" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Descarte: perda integral — saving negativo é esperado.
              </p>
            )}
          </div>

          <div>
            <Label>Responsável</Label>
            <Select
              value={form.responsavel_id || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") { set("responsavel_id", ""); return; }
                const u = (usuarios.data ?? []).find((x) => x.id === v);
                setForm((f: any) => ({ ...f, responsavel_id: v, responsavel: u?.nome ?? f.responsavel }));
              }}
            >
              <SelectTrigger><SelectValue placeholder={form.responsavel || "Selecione o usuário"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem responsável</SelectItem>
                {(usuarios.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}{u.email ? ` · ${u.email}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.id && form.responsavel_id && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ao salvar, uma pendência será criada em Tarefas e o usuário receberá um e-mail.
              </p>
            )}
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
                      BAIXA · {formatarDataBR(dataDaBaixa(b))} · Lote {b.lote || "—"} · {Number(b.quantidade)} un ·{" "}
                      {formatBRL(Number(b.valor_total))} · {b.status_fluxo ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.baixa_operacional_id ? (
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Quantidade da baixa vinculada: {qtdBaixa ?? 0}
                    <br />
                    Quantidade que será considerada recuperada: {qtdRecuperada} (mínimo 0)
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-destructive"
                    onClick={() => {
                      if (window.confirm("Deseja remover a baixa operacional vinculada a esta ação?")) {
                        set("baixa_operacional_id", "");
                      }
                    }}
                  >
                    Desvincular
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Vincula qualquer baixa do mesmo SKU + lote, sem restrição de data.
                  {!baixas.isLoading && (baixas.data ?? []).length === 0 && (
                    <> — nenhuma baixa disponível para este SKU/lote.</>
                  )}
                </p>
              )}
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

    <WhatsAppFallbackDialog mensagem={mensagemFallback} onClose={() => setMensagemFallback(null)} />

    </>
  );
}
