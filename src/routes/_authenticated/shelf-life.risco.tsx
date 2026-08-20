import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatNum } from "@/lib/inventory";
import { FAIXA_LABEL, FAIXA_TONE, type Faixa } from "@/lib/shelf-life";
import { indexarCampanhasPorLote, useCampanhas, useLotesRisco } from "@/hooks/useShelfLife";
import { chaveLote } from "@/lib/shelf-life";
import { ConfigFiltrosCard } from "@/components/shelf-life/ConfigFiltrosCard";
import { usePersistedState, useShelfConfig } from "@/hooks/useFiltrosShelfLife";
import { CampanhaDialog, type CampanhaDraft } from "@/components/shelf-life/CampanhaDialog";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronsUpDown, Download, HelpCircle, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shelf-life/risco")({
  component: MapeamentoRisco,
  head: () => ({
    meta: [
      { title: "Shelf Life — Mapeamento de Risco" },
      { name: "description", content: "Lotes próximos do vencimento por faixa de risco, valor exposto e ações vinculadas." },
      { property: "og:title", content: "Shelf Life — Mapeamento de Risco" },
      { property: "og:description", content: "Radar de validade por almoxarifado, grupo e família." },
    ],
  }),
});

type FiltrosRisco = {
  almox: string[];
  grupos: string[];
  familias: string[];
  faixas: string[];
  acao: string[];
  busca: string;
};

const FILTROS_PADRAO: FiltrosRisco = { almox: [], grupos: [], familias: [], faixas: [], acao: [], busca: "" };

type SortKey = "dias" | "valor" | "quantidade" | "sku" | "descricao" | "lote" | "almoxarifado" | "data_validade";

function MapeamentoRisco() {
  const { almoxAtivos, somenteComSaldo } = useShelfConfig();
  const lotes = useLotesRisco({ almoxAtivos, somenteComSaldo });
  const campanhas = useCampanhas();
  const [f, setF] = usePersistedState<FiltrosRisco>("shelf-life:risco:filtros", FILTROS_PADRAO);
  const [draft, setDraft] = useState<CampanhaDraft | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "valor", dir: "desc" });

  const set = <K extends keyof FiltrosRisco>(k: K, v: FiltrosRisco[K]) => setF((p) => ({ ...p, [k]: v }));

  const idx = useMemo(() => indexarCampanhasPorLote(campanhas.data), [campanhas.data]);
  const rows = lotes.data ?? [];

  const opts = useMemo(() => {
    const a = new Set<string>(), g = new Set<string>(), fa = new Set<string>();
    rows.forEach((r) => {
      if (r.almoxarifado) a.add(r.almoxarifado);
      if (r.grupo) g.add(r.grupo);
      if (r.familia) fa.add(r.familia);
    });
    const s = (x: Set<string>) => Array.from(x).sort();
    return { almox: s(a), grupos: s(g), familias: s(fa) };
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = (f.busca ?? "").trim().toUpperCase();
    const inSel = (sel: string[], v: string | null) => sel.length === 0 || (v != null && sel.includes(v));
    return rows.filter((r) => {
      if (!inSel(f.almox, r.almoxarifado)) return false;
      if (!inSel(f.grupos, r.grupo)) return false;
      if (!inSel(f.familias, r.familia)) return false;
      if (!inSel(f.faixas, r.faixa)) return false;
      const temAcao = (idx.get(chaveLote(r.sku, r.lote)) ?? []).length > 0;
      if (f.acao.length === 1) {
        if (f.acao[0] === "COM" && !temAcao) return false;
        if (f.acao[0] === "SEM" && temAcao) return false;
      }
      if (q && !(`${r.sku} ${r.descricao} ${r.lote}`.toUpperCase().includes(q))) return false;
      return true;
    });
  }, [rows, f, idx]);

  const ordenadas = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (sort.key === "dias" || sort.key === "valor" || sort.key === "quantidade") {
        const na = va == null ? Number.NEGATIVE_INFINITY : Number(va);
        const nb = vb == null ? Number.NEGATIVE_INFINITY : Number(vb);
        if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
        if (Number.isNaN(na)) return 1 * dir;
        if (Number.isNaN(nb)) return -1 * dir;
        return (na - nb) * dir;
      }
      return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
    });
  }, [filtradas, sort]);

  const kpis = useMemo(() => {
    const base = filtradas;
    const soma = (fn: (x: Faixa) => boolean) => base.filter((r) => fn(r.faixa)).reduce((s, r) => s + r.valor, 0);
    return {
      v30: soma((x) => x === "30" || x === "VENCIDO"),
      v60: soma((x) => x === "60"),
      v90: soma((x) => x === "90"),
      vencido: soma((x) => x === "VENCIDO"),
      pendente: soma((x) => x === "PENDENTE"),
      qtdPendente: base.filter((r) => r.faixa === "PENDENTE").length,
      total: base.reduce((s, r) => s + r.valor, 0),
    };
  }, [filtradas]);

  function exportar() {
    const data = filtradas.map((r) => ({
      SKU: r.sku, Produto: r.descricao, Lote: r.lote, Almoxarifado: r.almoxarifado,
      Validade: r.data_validade ?? "", "Dias para Vencer": r.dias ?? "",
      Quantidade: r.quantidade, "Custo Unit.": r.custo_unitario, Valor: r.valor,
      Faixa: FAIXA_LABEL[r.faixa], Grupo: r.grupo ?? "", Família: r.familia ?? "",
      "Ação Vinculada": (idx.get(chaveLote(r.sku, r.lote)) ?? []).map((c) => c.tipo_nome).join(", "),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Risco");
    XLSX.writeFile(wb, `ShelfLife_Risco_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Mapeamento de Risco</h1>
          <p className="text-sm text-muted-foreground">Lotes com saldo vencidos ou a vencer em até 90 dias.</p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={!filtradas.length}>
          <Download className="size-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Kpi title="Vencidos" value={kpis.vencido} icon={<AlertTriangle className="size-4 text-destructive" />} tone="destructive" />
        <Kpi title="Risco 30 dias" value={kpis.v30} icon={<CalendarClock className="size-4 text-destructive" />} tone="destructive" />
        <Kpi title="Risco 60 dias" value={kpis.v60} icon={<CalendarClock className="size-4 text-warning" />} tone="warning" />
        <Kpi title="Risco 90 dias" value={kpis.v90} icon={<CalendarClock className="size-4 text-info" />} tone="info" />
        <Kpi
          title={`Pendente de Validade (${kpis.qtdPendente} lotes)`}
          value={kpis.pendente}
          icon={<HelpCircle className="size-4" />}
          tone="muted"
          hint="Problema de dado: lote sem validade registrada."
        />
      </div>

      <ConfigFiltrosCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="SKU, produto ou lote" value={f.busca} onChange={(e) => set("busca", e.target.value)} />
          </div>
          <FiltroMulti label="Almoxarifado" value={f.almox} onChange={(v) => set("almox", v)} options={opts.almox} />
          <FiltroMulti label="Grupo" value={f.grupos} onChange={(v) => set("grupos", v)} options={opts.grupos} />
          <FiltroMulti label="Família" value={f.familias} onChange={(v) => set("familias", v)} options={opts.familias} />
          <div>
            <Label className="text-xs">Faixa</Label>
            <MultiSelect
              options={(["VENCIDO", "30", "60", "90", "PENDENTE"] as Faixa[]).map((x) => ({ value: x, label: FAIXA_LABEL[x] }))}
              value={f.faixas}
              onChange={(v) => set("faixas", v)}
              allLabel="Todas"
            />
          </div>
          <div>
            <Label className="text-xs">Status de Ação</Label>
            <MultiSelect
              options={[{ value: "SEM", label: "Sem Ação" }, { value: "COM", label: "Com Ação" }]}
              value={f.acao}
              onChange={(v) => set("acao", v)}
            />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">
            {filtradas.length} lote(s) · {formatBRL(kpis.total)} em risco
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {lotes.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando lotes...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader k="sku" label="SKU" />
                  <SortHeader k="descricao" label="Produto" />
                  <SortHeader k="lote" label="Lote" />
                  <SortHeader k="almoxarifado" label="Almox" />
                  <SortHeader k="data_validade" label="Validade" />
                  <SortHeader k="dias" label="Dias" align="right" />
                  <SortHeader k="quantidade" label="Qtd" align="right" />
                  <SortHeader k="valor" label="Valor" align="right" />
                  <TableHead>Faixa</TableHead>
                  <TableHead>Ação Vinculada</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.slice(0, 500).map((r, i) => {
                  const acoes = idx.get(chaveLote(r.sku, r.lote)) ?? [];
                  return (
                    <TableRow key={`${r.sku}-${r.lote}-${r.almoxarifado}-${i}`}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{r.descricao}</TableCell>
                      <TableCell className="font-mono text-xs">{r.lote || "—"}</TableCell>
                      <TableCell className="text-xs">{r.almoxarifado}</TableCell>
                      <TableCell className="text-xs">{r.data_validade ? r.data_validade.slice(0, 10).split("-").reverse().join("/") : "—"}</TableCell>
                      <TableCell className="text-right">{r.dias ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatNum(r.quantidade)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(r.valor)}</TableCell>
                      <TableCell><Badge className={FAIXA_TONE[r.faixa]} variant="secondary">{FAIXA_LABEL[r.faixa]}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {acoes.length ? acoes.map((c) => c.tipo_nome).join(", ") : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setDraft({
                          sku: r.sku, lote: r.lote, descricao: r.descricao,
                          almoxarifado: r.almoxarifado, data_validade: r.data_validade,
                          quantidade_enderecada: r.quantidade,
                          custo_unitario: r.custo_unitario, unidade: r.unidade,
                        })}>
                          <Plus className="size-3.5 mr-1" /> Ação
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtradas.length && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">Nenhum lote no radar com os filtros atuais.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {filtradas.length > 500 && (
            <p className="text-xs text-muted-foreground pt-2">Exibindo os 500 lotes mais críticos. Use os filtros ou exporte para ver todos.</p>
          )}
        </CardContent>
      </Card>

      <CampanhaDialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)} draft={draft} />
    </div>
  );
}

function SortHeader({ k, label, align }: { k: SortKey; label: string; align?: "right" }) {
  const sort = { key: "valor", dir: "desc" } as { key: SortKey; dir: "asc" | "desc" }; // placeholder — real state comes via closure? No, must lift.
  return null;
}

function FiltroMulti({ label, value, onChange, options }: { label: string; value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <MultiSelect options={options.map((o) => ({ value: o, label: o }))} value={value} onChange={onChange} />
    </div>
  );
}


function Kpi({ title, value, icon, tone, hint }: { title: string; value: number; icon: React.ReactNode; tone: string; hint?: string }) {
  const border = tone === "destructive" ? "border-destructive/40" : tone === "warning" ? "border-warning/40" : tone === "info" ? "border-info/40" : "border-border";
  return (
    <Card className={`border ${border}`}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span className="truncate">{title}</span></div>
        <div className="text-xl font-bold mt-1">{formatBRL(value)}</div>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
