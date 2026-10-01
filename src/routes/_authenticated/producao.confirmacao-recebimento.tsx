import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, PackageCheck, User } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/producao/confirmacao-recebimento")({
  component: ConfirmacaoRecebimentoPage,
  head: () => ({ meta: [
    { title: "Confirmação de Recebimento — Controle Operacional" },
    { name: "description", content: "Confirmação de recebimento das transferências Fábrica → Loja, com responsável e apontamento de inconformidades." },
  ] }),
});

type LinhaTransferencia = {
  id_produto: string;
  descricao: string;
  numero_requisicao: string;
  lote_movimentado: string;
  qtd_movimentado: number;
  data: string;
};

type ItemForm = {
  id_produto: string;
  descricao: string;
  lote_movimentado: string;
  qtd_transferida: number;
  temInconformidade: boolean;
  qtdRecebida: string;
  motivo: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function ConfirmacaoRecebimentoPage() {
  const qc = useQueryClient();
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const requisicaoFoco = searchParams.get("requisicao");

  const usuarios = useUsuariosSistema();

  const usuarioLogadoQ = useQuery({
    queryKey: ["usuario-logado-confirmacao"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const responsavelLogado = useMemo(() => {
    const uid = usuarioLogadoQ.data;
    if (!uid) return null;
    return (usuarios.data ?? []).find((u) => u.id === uid) ?? null;
  }, [usuarioLogadoQ.data, usuarios.data]);

  const transferenciasQ = useQuery({
    queryKey: ["transferencias-recebimento"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("v_transferencias_fabrica_loja")
        .select("id_produto, descricao, numero_requisicao, lote_movimentado, qtd_movimentado, data")
        .order("numero_requisicao", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as LinhaTransferencia[];
    },
  });

  const confirmadasQ = useQuery({
    queryKey: ["confirmacoes-recebimento"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("confirmacoes_recebimento")
        .select("id, numero_requisicao, data, responsavel_nome, confirmado_em, observacao_geral, confirmacoes_recebimento_itens(id_produto, descricao, lote_movimentado, qtd_transferida, qtd_recebida, tem_inconformidade, motivo_inconformidade)")
      if (error) throw error;
      return rows ?? [];
    },
  });

  const porRequisicao = useMemo(() => {
    const m = new Map<string, LinhaTransferencia[]>();
    (transferenciasQ.data ?? []).forEach((r) => {
      const arr = m.get(r.numero_requisicao) ?? [];
      arr.push(r);
      m.set(r.numero_requisicao, arr);
    });
    return m;
  }, [transferenciasQ.data]);

  const dataPorRequisicao = useMemo(() => {
    const m = new Map<string, string>();
    (transferenciasQ.data ?? []).forEach((r) => {
      const cur = m.get(r.numero_requisicao);
      if (!cur || r.data < cur) m.set(r.numero_requisicao, r.data);
    });
    return m;
  }, [transferenciasQ.data]);

  const confirmadasPorRequisicao = useMemo(() => {
    const m = new Map<string, any>();
    (confirmadasQ.data ?? []).forEach((c: any) => m.set(c.numero_requisicao, c));
    return m;
  }, [confirmadasQ.data]);

  const loading = transferenciasQ.isLoading || confirmadasQ.isLoading;
  const requisicoes = [...porRequisicao.keys()];

  const pendentes = useMemo(
    () => requisicoes.filter((r) => !confirmadasPorRequisicao.has(r)),
    [requisicoes, confirmadasPorRequisicao],
  );
  const confirmadas = useMemo(
    () => requisicoes.filter((r) => confirmadasPorRequisicao.has(r)),
    [requisicoes, confirmadasPorRequisicao],
  );

  const [statusFiltro, setStatusFiltro] = useState<"todos" | "sem_divergencia" | "com_divergencia">("todos");
  const confirmadasFiltradas = useMemo(() => {
    if (statusFiltro === "todos") return confirmadas;
    return confirmadas.filter((r) => {
      const c = confirmadasPorRequisicao.get(r);
      const temDivergencia = (c?.confirmacoes_recebimento_itens ?? []).some((i: any) => i.tem_inconformidade);
      return statusFiltro === "com_divergencia" ? temDivergencia : !temDivergencia;
    });
  }, [confirmadas, confirmadasPorRequisicao, statusFiltro]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><PackageCheck className="size-6" /> Confirmação de Recebimento</h1>
        <p className="text-sm text-muted-foreground">
          Transferências Fábrica → Loja. Confirme com o responsável e aponte eventuais inconformidades.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!loading && (
        <Tabs defaultValue="pendentes">
          <TabsList>
            <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
            <TabsTrigger value="confirmados">Confirmados ({confirmadas.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pendentes" className="space-y-4 pt-4">
            {pendentes.length === 0 && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma transferência pendente de confirmação.</CardContent></Card>
            )}
            {pendentes.map((req) => {
              const itens = porRequisicao.get(req) ?? [];
              return (
                <RequisicaoCard
                  key={req}
                  numeroRequisicao={req}
                  data={dataPorRequisicao.get(req) ?? todayISO()}
                  itens={itens}
                  confirmada={null}
                  responsavelLogado={responsavelLogado}
                  focoInicial={requisicaoFoco === req}
                  onConfirmado={() => {
                    qc.invalidateQueries({ queryKey: ["confirmacoes-recebimento"] });
                  }}
                />
              );
            })}
          </TabsContent>

          <TabsContent value="confirmados" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              {([
                ["todos", "Todos"],
                ["sem_divergencia", "Sem divergências"],
                ["com_divergencia", "Com divergências"],
              ] as const).map(([value, label]) => (
                <Badge
                  key={value}
                  variant={statusFiltro === value ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => setStatusFiltro(value)}
                >
                  {label}
                </Badge>
              ))}
            </div>

            {confirmadasFiltradas.length === 0 && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma confirmação encontrada com esse filtro.</CardContent></Card>
            )}
            {confirmadasFiltradas.map((req) => {
              const itens = porRequisicao.get(req) ?? [];
              const confirmada = confirmadasPorRequisicao.get(req);
              return (
                <RequisicaoCard
                  key={req}
                  numeroRequisicao={req}
                  data={dataPorRequisicao.get(req) ?? todayISO()}
                  itens={itens}
                  confirmada={confirmada}
                  responsavelLogado={responsavelLogado}
                  focoInicial={false}
                  onConfirmado={() => {}}
                />
              );
            })}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function RequisicaoCard(props: {
  numeroRequisicao: string;
  data: string;
  itens: LinhaTransferencia[];
  confirmada: any | null;
  responsavelLogado: { id: string; nome: string; email: string } | null;
  focoInicial: boolean;
  onConfirmado: () => void;
}) {
  const { numeroRequisicao, data, itens, confirmada, responsavelLogado, focoInicial, onConfirmado } = props;
  const [aberto, setAberto] = useState(focoInicial && !confirmada);
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<ItemForm[]>(() =>
    itens.map((it) => ({
      id_produto: it.id_produto,
      descricao: it.descricao,
      lote_movimentado: it.lote_movimentado,
      qtd_transferida: Number(it.qtd_movimentado) || 0,
      temInconformidade: false,
      qtdRecebida: String(it.qtd_movimentado ?? ""),
      motivo: "",
    })),
  );

  useEffect(() => {
    if (focoInicial && !confirmada) {
      const el = document.getElementById(`req-${numeroRequisicao}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvar = useMutation({
    mutationFn: async () => {
      const resp = responsavelLogado;
      if (!resp) throw new Error("Não foi possível identificar o usuário logado.");
      for (const l of linhas) {
        if (l.temInconformidade && !l.motivo.trim()) {
          throw new Error(`Informe o motivo da inconformidade em ${l.id_produto} — ${l.descricao}.`);
        }
        if (l.temInconformidade && l.qtdRecebida.trim() === "") {
          throw new Error(`Informe a quantidade recebida em ${l.id_produto} — ${l.descricao}.`);
        }
      }

      const { data: cab, error: e1 } = await (supabase as any)
        .from("confirmacoes_recebimento")
        .insert({
          numero_requisicao: numeroRequisicao,
          data,
          responsavel_id: resp.id,
          responsavel_nome: resp.nome,
          observacao_geral: observacao.trim() || null,
        })
        .select("id")
        .single();
      if (e1) throw e1;

      const itensPayload = linhas.map((l) => ({
        confirmacao_id: cab.id,
        id_produto: l.id_produto,
        descricao: l.descricao,
        lote_movimentado: l.lote_movimentado,
        qtd_transferida: l.qtd_transferida,
        qtd_recebida: l.temInconformidade ? Number(l.qtdRecebida) || 0 : l.qtd_transferida,
        tem_inconformidade: l.temInconformidade,
        motivo_inconformidade: l.temInconformidade ? l.motivo.trim() : null,
      }));
      const { error: e2 } = await (supabase as any).from("confirmacoes_recebimento_itens").insert(itensPayload);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success(`Recebimento da requisição ${numeroRequisicao} confirmado.`);
      onConfirmado();
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Não foi possível confirmar o recebimento.");
    },
  });

  const qtdTotal = itens.reduce((s, i) => s + (Number(i.qtd_movimentado) || 0), 0);

  if (confirmada) {
    const itensConf = confirmada.confirmacoes_recebimento_itens ?? [];
    const temInconformidade = itensConf.some((i: any) => i.tem_inconformidade);
    return (
      <Card id={`req-${numeroRequisicao}`} className="border-green-600/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-600" /> Requisição {numeroRequisicao} — confirmada <span className="text-muted-foreground font-normal text-sm">· {fmtDataBR(confirmada.data ?? data)}</span>
            </span>
            <Badge variant={temInconformidade ? "destructive" : "secondary"}>
              {temInconformidade ? "Com inconformidade" : "Sem divergências"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <User className="size-3.5" /> {confirmada.responsavel_nome} · {new Date(confirmada.confirmado_em).toLocaleString("pt-BR")}
          </div>
          {confirmada.observacao_geral && (
            <p className="text-sm bg-muted/40 rounded-md p-2">{confirmada.observacao_geral}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Transferido</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead>Inconformidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensConf.map((it: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{it.id_produto}</TableCell>
                  <TableCell>{it.descricao}</TableCell>
                  <TableCell className="font-mono text-xs">{it.lote_movimentado}</TableCell>
                  <TableCell className="text-right">{fmtNum(Number(it.qtd_transferida))}</TableCell>
                  <TableCell className="text-right">{fmtNum(Number(it.qtd_recebida))}</TableCell>
                  <TableCell className="text-xs">
                    {it.tem_inconformidade ? <span className="text-destructive">{it.motivo_inconformidade}</span> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id={`req-${numeroRequisicao}`}>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setAberto((v) => !v)}>
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <span>Requisição {numeroRequisicao} <span className="text-muted-foreground font-normal text-sm">· {fmtDataBR(data)} — {itens.length} item(ns), {fmtNum(qtdTotal)} un.</span></span>
          <Badge variant="outline">Pendente de confirmação</Badge>
        </CardTitle>
      </CardHeader>
      {aberto && (
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Responsável pelo recebimento</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/30 text-sm font-medium">
                <User className="size-3.5 text-muted-foreground" />
                {responsavelLogado?.nome ?? "Identificando usuário..."}
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Transferido</TableHead>
                <TableHead className="text-center">Inconformidade</TableHead>
                <TableHead className="text-right">Qtd. recebida</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={l.id_produto + l.lote_movimentado + i}>
                  <TableCell className="font-mono text-xs">{l.id_produto}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{l.descricao}</TableCell>
                  <TableCell className="font-mono text-xs">{l.lote_movimentado}</TableCell>
                  <TableCell className="text-right">{fmtNum(l.qtd_transferida)}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={l.temInconformidade}
                      onCheckedChange={(v) =>
                        setLinhas((prev) => prev.map((x, xi) => (xi === i ? { ...x, temInconformidade: v, qtdRecebida: v ? x.qtdRecebida : String(x.qtd_transferida) } : x)))
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      disabled={!l.temInconformidade}
                      value={l.temInconformidade ? l.qtdRecebida : String(l.qtd_transferida)}
                      onChange={(e) => setLinhas((prev) => prev.map((x, xi) => (xi === i ? { ...x, qtdRecebida: e.target.value } : x)))}
                      className="w-24 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      disabled={!l.temInconformidade}
                      placeholder={l.temInconformidade ? "Motivo da inconformidade..." : "—"}
                      value={l.motivo}
                      onChange={(e) => setLinhas((prev) => prev.map((x, xi) => (xi === i ? { ...x, motivo: e.target.value } : x)))}
                      className="min-w-[180px]"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div>
            <Label className="text-xs">Observação geral (opcional)</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end">
            <Button disabled={!responsavelLogado || salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? "Confirmando..." : "Confirmar Recebimento"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
