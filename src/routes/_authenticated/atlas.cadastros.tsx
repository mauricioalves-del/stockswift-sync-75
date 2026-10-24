import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/atlas/cadastros")({
  component: AtlasCadastros,
  head: () => ({ meta: [{ title: "Cadastros — Atlas" }] }),
});

const sb = supabase as any;
type Produto = { sku: string; descricao: string | null; categoria_produto: string | null; unidade: string | null; custo_unitario: number | null; ativo: boolean | null };
type Almox = { codigo: string; nome_exibicao: string | null; ativo: boolean | null; participa_contagem_diaria: boolean | null; codigo_origem?: string | null };
type Hipotese = { codigo: string; nome: string | null; descricao: string | null; peso_padrao: number | null; ativo: boolean | null };
const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function lerTudo<T>(tabela: string, ordem: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select("*").order(ordem).range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Campo editável que grava ao sair (ou Enter). */
function Celula({ valor, onSalvar, num, largura = "w-full", desabilitado }: { valor: string | number | null; onSalvar: (v: string) => void; num?: boolean; largura?: string; desabilitado?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const mostrado = txt ?? (valor == null ? "" : String(valor));
  const salvar = () => { if (txt === null) return; const v = txt.trim(); setTxt(null); if (v !== (valor == null ? "" : String(valor))) onSalvar(v); };
  return <Input className={`h-7 ${largura} ${num ? "text-right" : ""}`} inputMode={num ? "decimal" : undefined} value={mostrado} disabled={desabilitado} onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTxt(null); }} />;
}
const numero = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

function AtlasCadastros() {
  const { role } = useRole();
  const pode = role === "ADMINISTRADOR" || role === "GERENTE";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlas-cadastros"],
    queryFn: async () => {
      const [produtos, almox, hip, origens] = await Promise.all([
        lerTudo<Produto>("atlas_produtos", "sku"), lerTudo<Almox>("atlas_almoxarifados", "codigo"), lerTudo<Hipotese>("atlas_hipoteses", "codigo"),
        sb.from("origens").select("codigo_origem, descricao, ativo").order("codigo_origem").then((r: any) => (r.data ?? []) as { codigo_origem: string; descricao: string; ativo: boolean }[]),
      ]);
      return { produtos, almox, hip, origens };
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["atlas-cadastros"] });

  async function salvar(tabela: string, chave: string, id: string, patch: Record<string, unknown>, rotulo: string) {
    const { error } = await sb.from(tabela).update(patch).eq(chave, id);
    if (error) toast.error(`Não consegui salvar ${rotulo}: ${error.message}`); else { toast.success(`${rotulo} salvo.`); recarregar(); }
  }
  async function inserir(tabela: string, linha: Record<string, unknown>, rotulo: string) {
    const { error } = await sb.from(tabela).insert(linha);
    if (error) { toast.error(`Não consegui cadastrar ${rotulo}: ${error.message}`); return false; }
    toast.success(`${rotulo} cadastrado.`); recarregar(); return true;
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Database className="size-6" /> Cadastros do Atlas</h1>
        <p className="text-sm text-muted-foreground">Base de produtos, almoxarifados e hipóteses de divergência usada pelos módulos do Atlas. Os almoxarifados são ligados aos almoxarifados do Stock Savvy (cadastro Almox), para que o histórico do Atlas e os dados daqui falem do mesmo lugar. {pode ? "Edite direto nas células: Enter ou sair do campo salva." : "Somente gestores editam."}</p>
      </div>
      {q.error && <Card><CardContent className="py-4 text-sm text-destructive">Não consegui ler os cadastros do Atlas: {(q.error as Error).message}</CardContent></Card>}
      <Tabs defaultValue="almox">
        <TabsList>
          <TabsTrigger value="almox">Almoxarifados ({q.data?.almox.length ?? 0})</TabsTrigger>
          <TabsTrigger value="produtos">Produtos ({q.data?.produtos.length ?? 0})</TabsTrigger>
          <TabsTrigger value="hip">Hipóteses ({q.data?.hip.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="almox"><AbaAlmox dados={q.data?.almox ?? []} origens={q.data?.origens ?? []} pode={pode} salvar={salvar} inserir={inserir} /></TabsContent>
        <TabsContent value="produtos"><AbaProdutos dados={q.data?.produtos ?? []} pode={pode} salvar={salvar} inserir={inserir} /></TabsContent>
        <TabsContent value="hip"><AbaHipoteses dados={q.data?.hip ?? []} pode={pode} salvar={salvar} inserir={inserir} /></TabsContent>
      </Tabs>
    </div>
  );
}

type Acoes = { pode: boolean; salvar: (t: string, k: string, id: string, p: Record<string, unknown>, r: string) => void; inserir: (t: string, l: Record<string, unknown>, r: string) => Promise<boolean> };

function AbaAlmox({ dados, origens, pode, salvar, inserir }: Acoes & { dados: Almox[]; origens: { codigo_origem: string; descricao: string; ativo: boolean }[] }) {
  const [novo, setNovo] = useState({ codigo: "", nome: "" });
  const temColuna = dados.length === 0 || dados.some((a) => "codigo_origem" in a);
  /** Almox do Stock Savvy com o mesmo nome (ignora prefixo Almox_/Alm_, acentos e separadores). */
  const sugestao = (a: Almox) => {
    const k = sem(a.codigo.replace(/^almox_?|^alm_?/i, "")); const n = sem(a.nome_exibicao ?? "");
    return origens.find((o) => sem(o.codigo_origem.replace(/^almox_?|^alm_?/i, "")) === k) ?? origens.find((o) => n && sem(o.descricao ?? "") === n);
  };
  return (
    <Card><CardContent className="space-y-3 pt-4">
      {!temColuna && <p className="text-xs text-amber-700">A ligação com o Almox do Stock Savvy aparece depois que a migration da fase 2 for aplicada.</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Código no Atlas</th><th className="p-2">Nome</th><th className="p-2 text-center">Ativo</th><th className="p-2 text-center" title="Entra no denominador da Cobertura de Conferência (contagem diária)">Contagem diária</th><th className="p-2">Almox no Stock Savvy</th></tr></thead>
          <tbody>
            {dados.map((a) => {
              const sug = !a.codigo_origem ? sugestao(a) : undefined;
              return (
                <tr key={a.codigo} className={`border-b last:border-0 ${a.ativo === false ? "text-muted-foreground" : ""}`}>
                  <td className="p-2 font-mono text-xs">{a.codigo}</td>
                  <td className="p-2"><Celula valor={a.nome_exibicao} desabilitado={!pode} onSalvar={(v) => salvar("atlas_almoxarifados", "codigo", a.codigo, { nome_exibicao: v || null }, a.codigo)} /></td>
                  <td className="p-2 text-center"><input type="checkbox" className="size-4" checked={a.ativo !== false} disabled={!pode} onChange={(e) => salvar("atlas_almoxarifados", "codigo", a.codigo, { ativo: e.target.checked }, a.codigo)} /></td>
                  <td className="p-2 text-center"><input type="checkbox" className="size-4" checked={!!a.participa_contagem_diaria} disabled={!pode} onChange={(e) => salvar("atlas_almoxarifados", "codigo", a.codigo, { participa_contagem_diaria: e.target.checked }, a.codigo)} /></td>
                  <td className="p-2 min-w-[220px]">
                    {temColuna ? (
                      <>
                        <Select value={a.codigo_origem ?? "nenhum"} disabled={!pode} onValueChange={(v) => salvar("atlas_almoxarifados", "codigo", a.codigo, { codigo_origem: v === "nenhum" ? null : v }, a.codigo)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="nenhum">Sem correspondente</SelectItem>{origens.map((o) => <SelectItem key={o.codigo_origem} value={o.codigo_origem}>{o.codigo_origem}{o.descricao ? ` · ${o.descricao}` : ""}{o.ativo ? "" : " (inativo)"}</SelectItem>)}</SelectContent>
                        </Select>
                        {sug && pode && <button type="button" className="mt-0.5 text-[11px] text-primary hover:underline" onClick={() => salvar("atlas_almoxarifados", "codigo", a.codigo, { codigo_origem: sug.codigo_origem }, a.codigo)}>usar {sug.codigo_origem}</button>}
                      </>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pode && (
        <div className="flex flex-wrap items-end gap-2">
          <div><div className="mb-1 text-xs text-muted-foreground">Código</div><Input className="w-48" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} placeholder="Almox_SP_..." /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Nome</div><Input className="w-56" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
          <Button variant="outline" className="gap-1" onClick={async () => { if (!novo.codigo.trim()) { toast.error("Informe o código."); return; } if (await inserir("atlas_almoxarifados", { codigo: novo.codigo.trim(), nome_exibicao: novo.nome.trim() || null, ativo: true, participa_contagem_diaria: true }, novo.codigo.trim())) setNovo({ codigo: "", nome: "" }); }}><Plus className="size-4" /> Cadastrar</Button>
        </div>
      )}
    </CardContent></Card>
  );
}

function AbaProdutos({ dados, pode, salvar, inserir }: Acoes & { dados: Produto[] }) {
  const [busca, setBusca] = useState(""); const [limite, setLimite] = useState(200);
  const [novo, setNovo] = useState({ sku: "", descricao: "", categoria: "", unidade: "", custo: "" });
  const lista = useMemo(() => { const b = sem(busca); return b ? dados.filter((p) => sem(`${p.sku} ${p.descricao ?? ""} ${p.categoria_produto ?? ""}`).includes(b)) : dados; }, [dados, busca]);
  return (
    <Card><CardContent className="space-y-3 pt-4">
      <Input placeholder="Buscar por SKU, descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
      <div className="max-h-[60vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">SKU</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2">Unid.</th><th className="p-2 text-right">Custo unit.</th><th className="p-2 text-center">Ativo</th></tr></thead>
          <tbody>
            {lista.slice(0, limite).map((p) => (
              <tr key={p.sku} className={`border-b last:border-0 ${p.ativo === false ? "text-muted-foreground" : ""}`}>
                <td className="p-2 font-mono text-xs">{p.sku}</td>
                <td className="p-2 min-w-[240px]"><Celula valor={p.descricao} desabilitado={!pode} onSalvar={(v) => salvar("atlas_produtos", "sku", p.sku, { descricao: v || null }, p.sku)} /></td>
                <td className="p-2 min-w-[140px]"><Celula valor={p.categoria_produto} desabilitado={!pode} onSalvar={(v) => salvar("atlas_produtos", "sku", p.sku, { categoria_produto: v || null }, p.sku)} /></td>
                <td className="p-2"><Celula valor={p.unidade} largura="w-16" desabilitado={!pode} onSalvar={(v) => salvar("atlas_produtos", "sku", p.sku, { unidade: v || null }, p.sku)} /></td>
                <td className="p-2"><Celula valor={p.custo_unitario} num largura="w-24 ml-auto" desabilitado={!pode} onSalvar={(v) => { const n = numero(v); if (n !== null && !Number.isFinite(n)) { toast.error("Custo inválido."); return; } salvar("atlas_produtos", "sku", p.sku, { custo_unitario: n }, p.sku); }} /></td>
                <td className="p-2 text-center"><input type="checkbox" className="size-4" checked={p.ativo !== false} disabled={!pode} onChange={(e) => salvar("atlas_produtos", "sku", p.sku, { ativo: e.target.checked }, p.sku)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">Mostrando {Math.min(limite, lista.length)} de {lista.length}{lista.length > limite && <button type="button" className="text-primary hover:underline" onClick={() => setLimite(limite + 500)}>mostrar mais</button>}</div>
      {pode && (
        <div className="flex flex-wrap items-end gap-2">
          <div><div className="mb-1 text-xs text-muted-foreground">SKU</div><Input className="w-36" value={novo.sku} onChange={(e) => setNovo({ ...novo, sku: e.target.value })} /></div>
          <div className="min-w-[220px] flex-1"><div className="mb-1 text-xs text-muted-foreground">Descrição</div><Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Categoria</div><Input className="w-40" value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Unid.</div><Input className="w-20" value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Custo</div><Input className="w-24" inputMode="decimal" value={novo.custo} onChange={(e) => setNovo({ ...novo, custo: e.target.value })} /></div>
          <Button variant="outline" className="gap-1" onClick={async () => {
            const sku = novo.sku.trim(); if (!sku) { toast.error("Informe o SKU."); return; }
            if (dados.some((p) => p.sku === sku)) { toast.error(`O SKU ${sku} já está cadastrado.`); return; }
            if (await inserir("atlas_produtos", { sku, descricao: novo.descricao.trim() || null, categoria_produto: novo.categoria.trim() || null, unidade: novo.unidade.trim() || null, custo_unitario: numero(novo.custo.trim()), ativo: true }, sku)) setNovo({ sku: "", descricao: "", categoria: "", unidade: "", custo: "" });
          }}><Plus className="size-4" /> Cadastrar</Button>
        </div>
      )}
    </CardContent></Card>
  );
}

function AbaHipoteses({ dados, pode, salvar, inserir }: Acoes & { dados: Hipotese[] }) {
  const [novo, setNovo] = useState({ codigo: "", nome: "", peso: "" });
  return (
    <Card><CardContent className="space-y-3 pt-4">
      <p className="text-xs text-muted-foreground">Hipóteses de causa das divergências. O peso padrão entra no cálculo da hipótese por regras na investigação de Divergências.</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Código</th><th className="p-2">Nome</th><th className="p-2">Descrição</th><th className="p-2 text-right">Peso padrão</th><th className="p-2 text-center">Ativa</th></tr></thead>
          <tbody>
            {dados.map((h) => (
              <tr key={h.codigo} className={`border-b last:border-0 ${h.ativo === false ? "text-muted-foreground" : ""}`}>
                <td className="p-2 font-mono text-xs">{h.codigo}</td>
                <td className="p-2 min-w-[180px]"><Celula valor={h.nome} desabilitado={!pode} onSalvar={(v) => salvar("atlas_hipoteses", "codigo", h.codigo, { nome: v || null }, h.codigo)} /></td>
                <td className="p-2 min-w-[280px]"><Celula valor={h.descricao} desabilitado={!pode} onSalvar={(v) => salvar("atlas_hipoteses", "codigo", h.codigo, { descricao: v || null }, h.codigo)} /></td>
                <td className="p-2"><Celula valor={h.peso_padrao} num largura="w-20 ml-auto" desabilitado={!pode} onSalvar={(v) => { const n = numero(v); if (n !== null && !Number.isFinite(n)) { toast.error("Peso inválido."); return; } salvar("atlas_hipoteses", "codigo", h.codigo, { peso_padrao: n }, h.codigo); }} /></td>
                <td className="p-2 text-center"><input type="checkbox" className="size-4" checked={h.ativo !== false} disabled={!pode} onChange={(e) => salvar("atlas_hipoteses", "codigo", h.codigo, { ativo: e.target.checked }, h.codigo)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pode && (
        <div className="flex flex-wrap items-end gap-2">
          <div><div className="mb-1 text-xs text-muted-foreground">Código</div><Input className="w-48" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} placeholder="Ex.: Erro_Apontamento" /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Nome</div><Input className="w-56" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Peso</div><Input className="w-20" inputMode="decimal" value={novo.peso} onChange={(e) => setNovo({ ...novo, peso: e.target.value })} /></div>
          <Button variant="outline" className="gap-1" onClick={async () => {
            const c = novo.codigo.trim(); if (!c) { toast.error("Informe o código."); return; }
            if (await inserir("atlas_hipoteses", { codigo: c, nome: novo.nome.trim() || null, peso_padrao: numero(novo.peso.trim()), ativo: true }, c)) setNovo({ codigo: "", nome: "", peso: "" });
          }}><Plus className="size-4" /> Cadastrar</Button>
        </div>
      )}
    </CardContent></Card>
  );
}
