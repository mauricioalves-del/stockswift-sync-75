import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { fetchAll } from "@/lib/fetch-all";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/suprimentos/risco-obsoletos")({
  component: RiscoObsoletos,
  head: () => ({
    meta: [
      { title: "Risco Obsoletos — Suprimentos" },
      { name: "description", content: "Itens em estoque sem movimentação, por faixa de dias e por empresa." },
    ],
  }),
});

type LinhaRisco = {
  id_produto: string;
  descricao: string | null;
  almoxarifado: string | null;
  id_local: string | null;
  lote: string | null;
  data_validade: string | null;
  saldo: number;
  valor: number;
  custo_unitario_medio: number | null;
  empresa: "Filial SP - Fabrica" | "Matriz Para";
  ultima_mov: string | null;
  dias_sem_mov: number | null;
  faixa: "30-60" | "61-90" | "+90" | "sem_registro" | "movimentado";
};

const FAIXAS_RISCO = ["30-60", "61-90", "+90", "sem_registro"] as const;

/** Grupos considerados por padrão na análise de risco. */
const GRUPOS_PADRAO = [
  "Produto Acabado",
  "Produto em Processo",
  "Embalagem",
  "Mercadoria de Revenda",
  "SubConjunto",
];

const FAIXA_LABEL: Record<string, string> = {
  "30-60": "30 a 60 dias",
  "61-90": "61 a 90 dias",
  "+90": "Mais de 90 dias",
  sem_registro: "Sem registro de movimentação",
  movimentado: "Movimentado (fora do farol)",
};

const FAIXA_COR: Record<string, string> = {
  "30-60": "#F2C14E",
  "61-90": "#F1704B",
  "+90": "#B23A2E",
  sem_registro: "#7B3B2E",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={"text-xl font-semibold mt-1 " + cls}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function FaixaBadge({ faixa }: { faixa: string }) {
  if (faixa === "30-60") return <Badge variant="outline" className="text-warning border-warning">30-60 dias</Badge>;
  if (faixa === "61-90") return <Badge variant="outline" className="text-destructive border-destructive">61-90 dias</Badge>;
  if (faixa === "+90") return <Badge className="bg-destructive text-destructive-foreground">+90 dias</Badge>;
  if (faixa === "sem_registro") return <Badge className="bg-destructive text-destructive-foreground">Sem registro</Badge>;
  return <Badge variant="outline">Movimentado</Badge>;
}

function RiscoObsoletos() {
  const [empresa, setEmpresa] = useState<string>("todas");
  const [faixaFilter, setFaixaFilter] = useState<string>("todas");
  const [almoxFilter, setAlmoxFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [grupoFilter, setGrupoFilter] = useState<string[]>(GRUPOS_PADRAO);

  const dataQ = useQuery({
    queryKey: ["risco-obsoletos"],
    queryFn: async () => {
      const all: LinhaRisco[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("v_risco_obsoletos")
          .select("id_produto, descricao, almoxarifado, id_local, lote, data_validade, saldo, valor, custo_unitario_medio, empresa, ultima_mov, dias_sem_mov, faixa")
          .neq("faixa", "movimentado")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...((data ?? []) as LinhaRisco[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  const gruposQ = useQuery({
    queryKey: ["grupo-produtos-mapa"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const rows = await fetchAll<{ codigo_produto: string; grupo: string }>((from, to) =>
        supabase.from("grupo_produtos").select("codigo_produto, grupo").range(from, to),
      );
      const exato = new Map<string, string>();
      const numerico = new Map<string, string>();
      for (const r of rows) {
        const cod = String(r.codigo_produto ?? "").trim();
        if (!cod) continue;
        exato.set(cod, r.grupo);
        const norm = cod.replace(/^0+(?=\d)/, "");
        if (/^\d+$/.test(norm) && !numerico.has(norm)) numerico.set(norm, r.grupo);
      }
      return { exato, numerico };
    },
  });

  const grupoDe = (id: string) => {
    const m = gruposQ.data;
    if (!m) return undefined;
    const cod = String(id ?? "").trim();
    return m.exato.get(cod) ?? (/^\d+$/.test(cod) ? m.numerico.get(cod.replace(/^0+(?=\d)/, "")) : undefined);
  };

  const linhas = dataQ.data ?? [];

  const almoxarifados = useMemo(
    () => Array.from(new Set(linhas.map((r) => r.almoxarifado).filter((v): v is string => !!v))).sort(),
    [linhas],
  );

  const listaGrupos = useMemo(() => {
    const s = new Set<string>(GRUPOS_PADRAO);
    linhas.forEach((r) => { const g = grupoDe(r.id_produto); if (g) s.add(g); });
    return Array.from(s).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, gruposQ.data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return linhas.filter((r) => {
      if (empresa !== "todas" && r.empresa !== empresa) return false;
      if (faixaFilter !== "todas" && r.faixa !== faixaFilter) return false;
      if (almoxFilter !== "todos" && r.almoxarifado !== almoxFilter) return false;
      if (grupoFilter.length > 0 && !(grupoDe(r.id_produto) && grupoFilter.includes(grupoDe(r.id_produto)!))) return false;
      if (q && !`${r.id_produto} ${r.descricao ?? ""}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [linhas, empresa, faixaFilter, almoxFilter, grupoFilter, busca, gruposQ.data]);

  const kpis = useMemo(() => {
    const porFaixa = (fx: string) => filtradas.filter((r) => r.faixa === fx);
    const soma = (rs: LinhaRisco[]) => rs.reduce((a, r) => a + (r.valor ?? 0), 0);
    return {
      totalItens: filtradas.length,
      totalValor: soma(filtradas),
      n3060: porFaixa("30-60").length,
      v3060: soma(porFaixa("30-60")),
      n6190: porFaixa("61-90").length,
      v6190: soma(porFaixa("61-90")),
      nMais90: porFaixa("+90").length,
      vMais90: soma(porFaixa("+90")),
      nSemReg: porFaixa("sem_registro").length,
      vSemReg: soma(porFaixa("sem_registro")),
    };
  }, [filtradas]);

  const graficoFaixa = useMemo(
    () =>
      FAIXAS_RISCO.map((fx) => ({
        faixa: FAIXA_LABEL[fx],
        valor: filtradas.filter((r) => r.faixa === fx).reduce((a, r) => a + (r.valor ?? 0), 0),
        cor: FAIXA_COR[fx],
      })),
    [filtradas],
  );

  const porAlmox = useMemo(() => {
    const m = new Map<string, any>();
    filtradas.forEach((r) => {
      const k = r.almoxarifado || "—";
      const e = m.get(k) ?? { nome: k, "30-60": 0, "61-90": 0, "+90": 0, sem_registro: 0, total: 0 };
      e[r.faixa] = (e[r.faixa] ?? 0) + (r.valor ?? 0);
      e.total += r.valor ?? 0;
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, any>();
    filtradas.forEach((r) => {
      const k = grupoDe(r.id_produto) || "Sem grupo";
      const e = m.get(k) ?? { nome: k, "30-60": 0, "61-90": 0, "+90": 0, sem_registro: 0, total: 0 };
      e[r.faixa] = (e[r.faixa] ?? 0) + (r.valor ?? 0);
      e.total += r.valor ?? 0;
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, gruposQ.data]);

  const topPorFaixa = (fx: string) => {
    const m = new Map<string, { id: string; descricao: string; custo: number }>();
    filtradas
      .filter((r) => r.faixa === fx)
      .forEach((r) => {
        const e = m.get(r.id_produto) ?? { id: r.id_produto, descricao: r.descricao || r.id_produto, custo: 0 };
        e.custo += r.valor ?? 0;
        m.set(r.id_produto, e);
      });
    return Array.from(m.values()).sort((a, b) => b.custo - a.custo);
  };

  const top3060 = useMemo(() => topPorFaixa("30-60"), [filtradas]);
  const top6190 = useMemo(() => topPorFaixa("61-90"), [filtradas]);
  const topMais90 = useMemo(() => topPorFaixa("+90"), [filtradas]);

  const [lista, setLista] = useState<string | null>(null);
  const itensLista = useMemo(
    () =>
      (lista ? filtradas.filter((r) => r.faixa === lista) : []).map((r) => ({
        id_produto: r.id_produto,
        descricao: r.descricao,
        almoxarifado: r.almoxarifado,
        lote: r.lote,
        saldo: r.saldo,
        valor: r.valor,
        empresa: r.empresa,
        ultima_mov: r.ultima_mov,
        dias_sem_mov: r.dias_sem_mov,
        grupo: grupoDe(r.id_produto),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, filtradas, gruposQ.data],
  );


  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Risco Obsoletos</h1>
        <p className="text-sm text-muted-foreground">
          Itens em estoque sem movimentação sistêmica (entradas, transferências, consumo em produção ou conclusão de OP).
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Buscar produto</label>
            <Input placeholder="Código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Faixa</label>
            <Select value={faixaFilter} onValueChange={setFaixaFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {FAIXAS_RISCO.map((fx) => (
                  <SelectItem key={fx} value={fx}>{FAIXA_LABEL[fx]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Empresa</label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="Filial SP - Fabrica">Filial SP - Fábrica</SelectItem>
                <SelectItem value="Matriz Para">Matriz Pará</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Almoxarifado</label>
            <Select value={almoxFilter} onValueChange={setAlmoxFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {almoxarifados.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Grupo</label>
            <MultiSelect
              options={listaGrupos.map((g) => ({ value: g, label: g }))}
              value={grupoFilter}
              onChange={setGrupoFilter}
              placeholder="Filtrar grupos…"
              allLabel="Todos"
              className="w-56"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Itens em risco" value={kpis.totalItens.toString()} sub={fmtBRL(kpis.totalValor)} tone="danger" />
        <Kpi label="30 a 60 dias" value={kpis.n3060.toString()} sub={fmtBRL(kpis.v3060)} />
        <Kpi label="61 a 90 dias" value={kpis.n6190.toString()} sub={fmtBRL(kpis.v6190)} />
        <Kpi label="Mais de 90 dias" value={kpis.nMais90.toString()} sub={fmtBRL(kpis.vMais90)} tone="danger" />
        <Kpi label="Sem registro de movimentação" value={kpis.nSemReg.toString()} sub={fmtBRL(kpis.vSemReg)} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Farol de Obsoletos</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graficoFaixa} layout="vertical" margin={{ left: 20, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="faixa" width={100} fontSize={11} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {graficoFaixa.map((entry, i) => <Cell key={i} fill={entry.cor} />)}
                  <LabelList dataKey="valor" position="right" formatter={(v: number) => fmtBRL(v)} style={{ fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Risco por Almoxarifado</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {!porAlmox.length ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porAlmox}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="nome" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => fmtBRL(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {FAIXAS_RISCO.map((fx) => (
                    <Bar key={fx} dataKey={fx} stackId="a" fill={FAIXA_COR[fx]} name={FAIXA_LABEL[fx]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Custo Total por Grupo e Faixa</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[300px] overflow-y-auto">
            {!porGrupo.length ? <Vazio /> : porGrupo.map((g) => {
              const t = g.total || 1;
              return (
                <div key={g.nome} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{g.nome}</span>
                    <span className="font-medium shrink-0">{fmtBRL(g.total)}</span>
                  </div>
                  <div className="flex h-4 w-full overflow-hidden rounded">
                    {FAIXAS_RISCO.map((fx) => ({ fx, p: ((g[fx] ?? 0) / t) * 100 }))
                      .filter(({ p }) => p > 0)
                      .map(({ fx, p }) => (
                        <div
                          key={fx}
                          title={`${FAIXA_LABEL[fx]}: ${p.toFixed(2)}%`}
                          style={{ width: `${p}%`, background: FAIXA_COR[fx] }}
                          className="flex items-center justify-center text-[10px] font-medium text-background"
                        >
                          {p >= 12 ? `${p.toFixed(1)}%` : ""}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TopCard title="Top 10 — 30 a 60 dias" cor={FAIXA_COR["30-60"]!} rows={top3060} onVerTudo={() => setLista("30-60")} />
        <TopCard title="Top 10 — 61 a 90 dias" cor={FAIXA_COR["61-90"]!} rows={top6190} onVerTudo={() => setLista("61-90")} />
        <TopCard title="Top 10 — Mais de 90 dias" cor={FAIXA_COR["+90"]!} rows={topMais90} onVerTudo={() => setLista("+90")} />
      </div>

      <ListaObsoletosDialog
        open={!!lista}
        onOpenChange={(v) => !v && setLista(null)}
        titulo={lista ? `Lista completa — ${FAIXA_LABEL[lista]}` : ""}
        {...(lista ? { cor: FAIXA_COR[lista] } : {})}
        itens={itensLista}
      />


      <Card>
        <CardHeader><CardTitle className="text-base">Itens em risco ({filtradas.length})</CardTitle></CardHeader>
        <CardContent>
          {dataQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item em risco no filtro atual.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Almoxarifado</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Última movimentação</TableHead>
                    <TableHead className="text-right">Dias sem mov.</TableHead>
                    <TableHead>Faixa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas
                    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
                    .slice(0, 500)
                    .map((r, i) => (
                      <TableRow key={`${r.id_produto}-${r.lote}-${i}`}>
                        <TableCell>
                          <div className="font-medium">{r.id_produto}</div>
                          <div className="text-xs text-muted-foreground">{r.descricao}</div>
                        </TableCell>
                        <TableCell>{r.almoxarifado}</TableCell>
                        <TableCell className="text-xs">{r.empresa === "Matriz Para" ? "Pará" : "SP"}</TableCell>
                        <TableCell>{r.lote}</TableCell>
                        <TableCell className="text-right">{r.saldo?.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right font-medium">{fmtBRL(r.valor ?? 0)}</TableCell>
                        <TableCell className="text-xs">{r.ultima_mov ?? "Nunca"}</TableCell>
                        <TableCell className="text-right">{r.dias_sem_mov ?? "—"}</TableCell>
                        <TableCell><FaixaBadge faixa={r.faixa} /></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {filtradas.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2">Mostrando os 500 itens de maior valor. Refine os filtros para ver os demais.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
