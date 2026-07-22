import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Factory, PackageSearch, Loader2, Send, Search } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { carregarBomCompleta, type BomLinha } from "@/lib/pcp-bom";
import { criarRequisicaoProducao } from "@/lib/requisicao-producao.functions";

export const Route = createFileRoute("/_authenticated/producao/solicitacao-materiais")({
  component: SolicitacaoMateriaisPage,
  head: () => ({
    meta: [
      { title: "Solicitação de Materiais — Produção" },
      { name: "description", content: "Solicita materiais à Fábrica a partir da Ficha Técnica de um produto ou subconjunto." },
    ],
  }),
});

const ALMOX_FABRICA = "Alm_SP_Fabrica";
const ROLES_OK = new Set(["ADMINISTRADOR", "COORDENADOR_CONTROLE", "GERENTE"]);

type ProdutoOpt = { id: string; nome: string; grupo: string | null; familia: string | null; temBom: boolean };
type Node = {
  id_item: string;
  nome: string;
  um: string | null;
  qtd_unit: number; // qtd por 1 unidade do pai
  qtd_total: number; // qtd para quantidade planejada
  tem_filho: boolean;
  nivel: number;
  parent: string; // caminho pai (uid)
  uid: string; // path único
};

function trim(s: string | null | undefined) { return (s ?? "").trim(); }

function SolicitacaoMateriaisPage() {
  const nav = useNavigate();
  const { role, loading: roleLoading } = useRole();
  const autorizado = !!role && ROLES_OK.has(role);

  const [grupoSel, setGrupoSel] = useState<string>("__all__");
  const [familiaSel, setFamiliaSel] = useState<string>("__all__");
  const [produtoSel, setProdutoSel] = useState<ProdutoOpt | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");
  const [obs, setObs] = useState("");

  const [rows, setRows] = useState<(Node & { editQtd: number; excluir: boolean })[]>([]);
  const [gerando, setGerando] = useState(false);
  const criar = useServerFn(criarRequisicaoProducao);

  // BOM completa
  const bomQ = useQuery({
    queryKey: ["solmat", "bom"],
    queryFn: async () => carregarBomCompleta(),
    staleTime: 5 * 60 * 1000,
  });

  // Grupos disponíveis
  const gruposQ = useQuery({
    queryKey: ["solmat", "grupos"],
    queryFn: async (): Promise<string[]> => {
      const { data } = await (supabase as any).from("grupo_produtos").select("grupo");
      return Array.from(new Set(((data ?? []) as { grupo: string }[]).map((d) => d.grupo).filter(Boolean))).sort();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Produtos + descrições (fonte principal: ficha_tecnica_bom para nomes)
  const produtosQ = useQuery({
    queryKey: ["solmat", "produtos", grupoSel],
    queryFn: async (): Promise<ProdutoOpt[]> => {
      // 1. Todos os produtos do cadastro (grupo_produtos), com grupo
      const cad: { codigo_produto: string; grupo: string }[] = [];
      let from = 0; const size = 1000;
      while (true) {
        let qry = (supabase as any).from("grupo_produtos").select("codigo_produto,grupo").range(from, from + size - 1);
        if (grupoSel !== "__all__") qry = qry.eq("grupo", grupoSel);
        const { data, error } = await qry;
        if (error) throw error;
        const rows = (data ?? []) as any[];
        cad.push(...rows);
        if (rows.length < size) break;
        from += size;
      }
      const codigos = new Set(cad.map((r) => trim(r.codigo_produto)).filter(Boolean));
      const grupoByCod = new Map<string, string | null>();
      for (const r of cad) grupoByCod.set(trim(r.codigo_produto), r.grupo ?? null);

      // 2. Famílias/descrições
      const familiaByCod = new Map<string, string | null>();
      const descByCod = new Map<string, string>();
      const arr = Array.from(codigos);
      for (let i = 0; i < arr.length; i += 500) {
        const slice = arr.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("familias").select("codigo_produto,familia,descricao_produto").in("codigo_produto", slice);
        for (const r of (data ?? []) as any[]) {
          const cod = trim(r.codigo_produto);
          familiaByCod.set(cod, r.familia ?? null);
          if (r.descricao_produto) descByCod.set(cod, String(r.descricao_produto));
        }
      }

      // 3. Descrições via BOM (produto raiz) — preferencial
      const comBom = new Set<string>();
      let bf = 0; const bs = 1000;
      while (true) {
        const { data } = await (supabase as any)
          .from("ficha_tecnica_bom").select("id_produto,produto")
          .order("id_produto", { ascending: true }).range(bf, bf + bs - 1);
        const rows = (data ?? []) as any[];
        for (const r of rows) {
          const id = trim(r.id_produto);
          if (!codigos.has(id)) continue;
          comBom.add(id);
          if (r.produto && !descByCod.has(id)) descByCod.set(id, String(r.produto));
        }
        if (rows.length < bs) break;
        bf += bs;
      }

      return Array.from(codigos).map((id) => ({
        id,
        nome: descByCod.get(id) ?? id,
        grupo: grupoByCod.get(id) ?? null,
        familia: familiaByCod.get(id) ?? null,
        temBom: comBom.has(id),
      })).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: !!gruposQ.data,
  });

  // Saldo Alm_SP_Fabrica
  const saldoFabricaQ = useQuery({
    queryKey: ["solmat", "saldo-fabrica"],
    queryFn: async (): Promise<Record<string, number>> => {
      const map: Record<string, number> = {};
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("estoque_sistemico").select("id_produto,quantidade,custo_unitario,unidade")
          .eq("origem", ALMOX_FABRICA).range(from, from + size - 1);
        if (error) throw error;
        const rows = (data ?? []) as any[];
        for (const r of rows) {
          const id = trim(r.id_produto);
          map[id] = (map[id] ?? 0) + Number(r.quantidade || 0);
        }
        if (rows.length < size) break;
        from += size;
      }
      return map;
    },
    staleTime: 60 * 1000,
  });

  // Índices BOM
  const porProduto = useMemo(() => {
    const m = new Map<string, BomLinha[]>();
    for (const r of (bomQ.data ?? []) as BomLinha[]) {
      const arr = m.get(trim(r.id_produto)) ?? [];
      arr.push(r);
      m.set(trim(r.id_produto), arr);
    }
    return m;
  }, [bomQ.data]);

  // Filtros
  const familias = useMemo(() => {
    const s = new Set<string>();
    for (const p of produtosQ.data ?? []) if (p.familia) s.add(p.familia);
    return Array.from(s).sort();
  }, [produtosQ.data]);

  const listaPicker = useMemo(() => {
    const term = pickerFilter.trim().toLowerCase();
    const list = (produtosQ.data ?? []).filter((p) => familiaSel === "__all__" || p.familia === familiaSel);
    if (!term) return list.slice(0, 200);
    return list.filter((p) =>
      p.id.toLowerCase().includes(term) || p.nome.toLowerCase().includes(term)
    ).slice(0, 200);
  }, [produtosQ.data, familiaSel, pickerFilter]);

  function quebrarFichaTecnica() {
    if (!produtoSel) { toast.error("Selecione um produto."); return; }
    if (!produtoSel.temBom) { toast.error("Este item não tem Ficha Técnica cadastrada."); return; }
    if (!(quantidade > 0)) { toast.error("Informe uma quantidade válida."); return; }
    const out: (Node & { editQtd: number; excluir: boolean })[] = [];
    const visitados = new Set<string>();
    function walk(idPai: string, mult: number, nivel: number, path: string) {
      if (visitados.has(idPai)) return;
      const filhos = porProduto.get(idPai);
      if (!filhos?.length) return;
      const next = new Set(visitados); next.add(idPai);
      for (const f of filhos) {
        const uid = `${path}>${f.id_item}`;
        const qtdTot = Number(f.qtd || 0) * mult;
        out.push({
          id_item: trim(f.id_item),
          nome: f.item ?? trim(f.id_item),
          um: f.item_unidade,
          qtd_unit: Number(f.qtd || 0),
          qtd_total: qtdTot,
          tem_filho: !!f.tem_filho,
          nivel,
          parent: path,
          uid,
          editQtd: qtdTot,
          excluir: false,
        });
        if (f.tem_filho) {
          // Passa a visitados original (não next) — visitados serve só para cortar ciclo direto
          walk(trim(f.id_item), qtdTot, nivel + 1, uid);
        }
      }
    }
    walk(produtoSel.id, quantidade, 0, produtoSel.id);
    setRows(out);
    if (!out.length) toast.info("Ficha técnica sem itens.");
    else toast.success(`${out.length} linha(s) na estrutura.`);
  }

  function updRow(uid: string, patch: Partial<{ editQtd: number; excluir: boolean }>) {
    setRows((prev) => prev.map((r) => r.uid === uid ? { ...r, ...patch } : r));
  }

  // Consolida os itens ativos por SKU para envio
  const itensParaEnvio = useMemo(() => {
    const agg = new Map<string, { id_produto: string; descricao: string; unidade: string; quantidade: number }>();
    for (const r of rows) {
      if (r.excluir) continue;
      if (!(r.editQtd > 0)) continue;
      const cur = agg.get(r.id_item);
      if (cur) cur.quantidade += r.editQtd;
      else agg.set(r.id_item, {
        id_produto: r.id_item,
        descricao: r.nome,
        unidade: r.um ?? "UN",
        quantidade: r.editQtd,
      });
    }
    return Array.from(agg.values());
  }, [rows]);

  async function enviarSolicitacao() {
    if (!produtoSel) return;
    if (!itensParaEnvio.length) { toast.error("Nenhum item selecionado."); return; }
    setGerando(true);
    try {
      const { numero, id } = await criar({
        data: {
          produto_id: produtoSel.id,
          produto_nome: produtoSel.nome,
          quantidade_planejada: quantidade,
          observacao: obs || null,
          itens: itensParaEnvio,
        },
      });
      toast.success(`Requisição ${numero} criada.`);
      nav({ to: "/suprimentos/requisicoes/$id", params: { id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar requisição.");
    } finally {
      setGerando(false);
    }
  }

  if (roleLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!autorizado) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Esta tela é restrita a Administrador, Coordenador de Controle ou Gerente.
        </CardContent></Card>
      </div>
    );
  }

  const saldoFabrica = saldoFabricaQ.data ?? {};

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Factory className="size-6" /> Solicitação de Materiais
        </h1>
        <p className="text-sm text-muted-foreground">
          Explode a Ficha Técnica de um produto/subconjunto e gera uma Requisição de Produção para separação pela Fábrica.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Produto / Subproduto a produzir</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Grupo</Label>
            <Select value={grupoSel} onValueChange={(v) => { setGrupoSel(v); setFamiliaSel("__all__"); setProdutoSel(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(gruposQ.data ?? []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Família</Label>
            <Select value={familiaSel} onValueChange={setFamiliaSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {familias.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Produto</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {produtoSel ? `${produtoSel.nome} (${produtoSel.id})` : "Selecionar…"}
                  </span>
                  <Search className="size-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Buscar por código ou descrição…" value={pickerFilter} onValueChange={setPickerFilter} />
                  <CommandList>
                    <CommandEmpty>{produtosQ.isLoading ? "Carregando…" : "Nenhum produto."}</CommandEmpty>
                    <CommandGroup>
                      {listaPicker.map((p) => (
                        <CommandItem key={p.id} value={p.id} onSelect={() => {
                          setProdutoSel(p); setPickerOpen(false); setRows([]);
                        }}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{p.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.id} · {p.grupo ?? "—"}{p.familia ? ` · ${p.familia}` : ""}
                            </div>
                          </div>
                          {!p.temBom && <Badge variant="outline" className="ml-2">sem FT</Badge>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">Quantidade a produzir</Label>
            <Input type="number" min={0} step="any" value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value || 0))} />
          </div>
          <div className="md:col-span-3 flex items-end">
            <Button onClick={quebrarFichaTecnica} disabled={!produtoSel || !(quantidade > 0) || bomQ.isLoading}>
              <PackageSearch className="size-4 mr-1" />
              Quebrar Ficha Técnica
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Estrutura explodida</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Todos os itens vêm incluídos. Ajuste as quantidades manualmente e desmarque o que a Produção já tem em estoque.
              A árvore não faz netting automático — a decisão de excluir subconjuntos já prontos é sua.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Incluir</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>UN</TableHead>
                    <TableHead className="text-right">Qtd necessária</TableHead>
                    <TableHead className="text-right">Saldo Fábrica</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const saldo = saldoFabrica[r.id_item] ?? 0;
                    const suficiente = saldo >= r.editQtd && r.editQtd > 0;
                    return (
                      <TableRow key={r.uid} className={r.excluir ? "opacity-50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={!r.excluir}
                            onCheckedChange={(v) => updRow(r.uid, { excluir: !v })}
                          />
                        </TableCell>
                        <TableCell>
                          <div style={{ paddingLeft: r.nivel * 16 }}>
                            <div className="text-sm">{r.nome}</div>
                            <div className="text-xs text-muted-foreground font-mono">{r.id_item}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{r.um ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} step="any"
                            className="w-28 text-right tabular-nums"
                            value={r.editQtd}
                            onChange={(e) => updRow(r.uid, { editQtd: Number(e.target.value || 0) })}
                            disabled={r.excluir}
                          />
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-xs ${suficiente ? "text-success" : "text-muted-foreground"}`}>
                          {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </TableCell>
                        <TableCell>
                          {r.tem_filho ? (
                            <Badge variant="outline">Subconjunto</Badge>
                          ) : (
                            <Badge variant="secondary">Matéria-Prima</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col md:flex-row md:items-end gap-3 pt-2">
              <div className="flex-1">
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
              <div className="text-sm text-muted-foreground">
                <div><strong>{itensParaEnvio.length}</strong> item(ns) na solicitação</div>
                <div>Origem: <strong>Alm_SP_Fabrica</strong> → Destino: <strong>Alm_SP_Processo</strong></div>
              </div>
              <Button size="lg" onClick={enviarSolicitacao} disabled={gerando || !itensParaEnvio.length}>
                {gerando ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                Solicitar Materiais
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
