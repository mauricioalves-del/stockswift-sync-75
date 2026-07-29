import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatNum } from "@/lib/inventory";
import { FAIXA_LABEL, FAIXA_TONE, type Faixa } from "@/lib/shelf-life";
import { indexarCampanhasPorLote, useCampanhas, useLotesRisco } from "@/hooks/useShelfLife";
import { chaveLote } from "@/lib/shelf-life";
import { CampanhaDialog, type CampanhaDraft } from "@/components/shelf-life/CampanhaDialog";
import { AlertTriangle, CalendarClock, Download, HelpCircle, Plus } from "lucide-react";

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

const TODAS = "__todas__";

function MapeamentoRisco() {
  const lotes = useLotesRisco();
  const campanhas = useCampanhas();
  const [almox, setAlmox] = useState(TODAS);
  const [grupo, setGrupo] = useState(TODAS);
  const [familia, setFamilia] = useState(TODAS);
  const [faixa, setFaixa] = useState<string>(TODAS);
  const [acao, setAcao] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<CampanhaDraft | null>(null);

  const idx = useMemo(() => indexarCampanhasPorLote(campanhas.data), [campanhas.data]);
  const rows = lotes.data ?? [];

  const opts = useMemo(() => {
    const a = new Set<string>(), g = new Set<string>(), f = new Set<string>();
    rows.forEach((r) => {
      if (r.almoxarifado) a.add(r.almoxarifado);
      if (r.grupo) g.add(r.grupo);
      if (r.familia) f.add(r.familia);
    });
    const s = (x: Set<string>) => Array.from(x).sort();
    return { almox: s(a), grupos: s(g), familias: s(f) };
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return rows.filter((r) => {
      if (almox !== TODAS && r.almoxarifado !== almox) return false;
      if (grupo !== TODAS && r.grupo !== grupo) return false;
      if (familia !== TODAS && r.familia !== familia) return false;
      if (faixa !== TODAS && r.faixa !== faixa) return false;
      const temAcao = (idx.get(chaveLote(r.sku, r.lote)) ?? []).length > 0;
      if (acao === "COM" && !temAcao) return false;
      if (acao === "SEM" && temAcao) return false;
      if (q && !(`${r.sku} ${r.descricao} ${r.lote}`.toUpperCase().includes(q))) return false;
      return true;
    });
  }, [rows, almox, grupo, familia, faixa, acao, busca, idx]);

  const kpis = useMemo(() => {
    const base = filtradas;
    const soma = (fn: (f: Faixa) => boolean) => base.filter((r) => fn(r.faixa)).reduce((s, r) => s + r.valor, 0);
    return {
      v30: soma((f) => f === "30" || f === "VENCIDO"),
      v60: soma((f) => f === "60"),
      v90: soma((f) => f === "90"),
      vencido: soma((f) => f === "VENCIDO"),
      pendente: soma((f) => f === "PENDENTE"),
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input placeholder="SKU, produto ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <FiltroSelect label="Almoxarifado" value={almox} onChange={setAlmox} options={opts.almox} />
          <FiltroSelect label="Grupo" value={grupo} onChange={setGrupo} options={opts.grupos} />
          <FiltroSelect label="Família" value={familia} onChange={setFamilia} options={opts.familias} />
          <div>
            <Label className="text-xs">Faixa</Label>
            <Select value={faixa} onValueChange={setFaixa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas</SelectItem>
                {(["VENCIDO", "30", "60", "90", "PENDENTE"] as Faixa[]).map((f) => (
                  <SelectItem key={f} value={f}>{FAIXA_LABEL[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status de Ação</Label>
            <Select value={acao} onValueChange={setAcao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                <SelectItem value="SEM">Sem Ação</SelectItem>
                <SelectItem value="COM">Com Ação</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Almox</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Faixa</TableHead>
                  <TableHead>Ação Vinculada</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 500).map((r, i) => {
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

function FiltroSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todos</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
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
