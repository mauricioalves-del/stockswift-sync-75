import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Tags, Upload, Download, Save, Loader2, History, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRole } from "@/hooks/useRole";
import { CLASSES_PORTFOLIO, prepararPortfolio, ultimasClassificacoes, elegivelPortfolio, chaveSkuPortfolio, type ClassificacaoPortfolio, type ProdutoPortfolio, type PreviaPortfolio } from "@/lib/abastecimento-portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const portfolioQuery = queryOptions({
  queryKey:["abast-portfolio"],
  queryFn:async () => {
    const [historico,estoque,caixas,sortimento,grupos] = await Promise.all([
      fetchAll<ClassificacaoPortfolio>((f,t) => supabase.from("abast_classificacoes_portfolio").select("*").order("registrado_em",{ascending:false}).order("id").range(f,t)),
      fetchAll<{id_produto:string;descricao:string|null}>((f,t)=>supabase.from("estoque_sistemico").select("id_produto,descricao").order("id").range(f,t)),
      fetchAll<{id_produto:string;descricao:string|null}>((f,t)=>supabase.from("abast_produto").select("id_produto,descricao").order("id_produto").range(f,t)),
      fetchAll<{id_produto:string}>((f,t)=>supabase.from("abast_produto_loja").select("id_produto").order("loja").order("id_produto").range(f,t)),
      fetchAll<{codigo_produto:string}>((f,t)=>supabase.from("grupo_produtos").select("codigo_produto").order("id").range(f,t)),
    ]);
    const catalogo=new Map<string,ProdutoPortfolio>();
    for (const r of [...caixas,...estoque,...sortimento,...grupos.map(g=>({id_produto:g.codigo_produto}))]) {
      const k=chaveSkuPortfolio(r.id_produto); const old=catalogo.get(k);
      const descricao="descricao" in r ? String(r.descricao ?? "") : "";
      if (!old || (!old.descricao && descricao)) catalogo.set(k,{sku:r.id_produto,descricao:descricao || old?.descricao || ""});
    }
    return {historico,produtos:[...catalogo.values()]};
  },
});
export const Route=createFileRoute("/_authenticated/abastecimento/portfolio")({
  loader:({context})=>context.queryClient.ensureQueryData(portfolioQuery),
  component:PortfolioPage,
  head:()=>({meta:[{title:"Portfólio e Classificação — Abastecimento Mágio"},{name:"description",content:"Classificação de SKUs, prévia de importação e histórico de vigência do portfólio Mágio."},{property:"og:title",content:"Portfólio e Classificação — Mágio"},{property:"og:description",content:"Gestão auditável de Linha, MTO, Inovação e Decomplex no Abastecimento."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
});

function PortfolioPage(){
  const {data}=useSuspenseQuery(portfolioQuery); const {isAdmin}=useRole(); const qc=useQueryClient();
  const hoje=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  const [vigencia,setVigencia]=useState(hoje); const [busca,setBusca]=useState(""); const [classe,setClasse]=useState("TODOS");
  const [rows,setRows]=useState<Record<string,unknown>[]|null>(null); const [arquivo,setArquivo]=useState(""); const [salvando,setSalvando]=useState(false); const [historico,setHistorico]=useState(false);
  type Edicao={sku:string;skuOriginal:string;descricao:string;classe:string;vigencia:string;inicio_inovacao:string;versao_anterior:string|null};
  const [editando,setEditando]=useState<Edicao|null>(null);
  const novoCadastro=():Edicao=>({sku:"",skuOriginal:"",descricao:"",classe:"LINHA",vigencia,inicio_inovacao:"",versao_anterior:null});
  const file=useRef<HTMLInputElement>(null);
  const previa=useMemo(()=>rows ? prepararPortfolio(rows,data.produtos,data.historico,vigencia,hoje) : [],[rows,data,vigencia,hoje]);
  const atuais=[...ultimasClassificacoes(data.historico).values()];
  const lista=(historico ? data.historico : atuais).filter(r=>(classe==="TODOS" || r.classe===classe) && `${r.sku} ${r.descricao}`.toLowerCase().includes(busca.toLowerCase()));
  const erros=previa.reduce((s,r)=>s+r.erros.length,0);
  async function importar(f:File){
    try{ const w=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:false}); const nome=w.SheetNames[0]; if(!nome)throw new Error("Planilha vazia");
      const sheet=w.Sheets[nome]; if(!sheet)throw new Error("Aba inválida");
      const r=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:"",raw:false});
      if(!r.length || r.length>5000)throw new Error("A planilha deve conter entre 1 e 5000 linhas");
      setRows(r);setArquivo(f.name);
    }catch(e){toast.error(e instanceof Error ? e.message : "Não consegui ler a planilha");}
  }
  async function confirmar(){
    if(!isAdmin || !previa.length || erros)return; setSalvando(true);
    try{const payload=previa.map(r=>({sku:r.sku,descricao:r.descricao,classe:r.classe,vigencia:r.vigencia,inicio_inovacao:r.inicio_inovacao || null,versao_anterior:r.versao_anterior}));
      const {error}=await supabase.rpc("abast_importar_classificacoes",{p_arquivo:arquivo,p_itens:payload});if(error)throw error;
      await qc.invalidateQueries({queryKey:["abast-portfolio"]});setRows(null);toast.success(`${previa.length} classificações registradas`);
    }catch(e){toast.error(e instanceof Error ? e.message : "Importação não aplicada");}finally{setSalvando(false);}
  }
  function modelo(){const w=XLSX.utils.book_new(); const rs=atuais.length ? atuais.map(r=>({"SKU Sistema":data.produtos.find(p=>chaveSkuPortfolio(p.sku)===r.sku)?.sku ?? r.sku,Produto:r.descricao,Cluster:CLASSES_PORTFOLIO[r.classe],Vigência:vigencia,"Início Inovação":r.inicio_inovacao ?? ""})) : [{"SKU Sistema":"",Produto:"",Cluster:"",Vigência:vigencia,"Início Inovação":""}];
    const s=XLSX.utils.json_to_sheet(rs);s["!cols"]=[{wch:16},{wch:65},{wch:18},{wch:14},{wch:20}];XLSX.utils.book_append_sheet(w,s,"Classificação");XLSX.writeFile(w,"Modelo_Classificacao_Portfolio.xlsx");}
  function mudarInicio(r:PreviaPortfolio,v:string){setRows(old=>old?.map((x,i)=>i===r.linha-2 ? {...x,"Início Inovação":v}:x) ?? null);}
  async function salvarEdicao(){
    if(!editando)return; setSalvando(true);
    try{
      const skuNovo=chaveSkuPortfolio(editando.sku); if(!skuNovo)throw new Error("Informe o código do produto");
      const cadastroNovo=!editando.skuOriginal;
      if(!cadastroNovo && atuais.some(r=>r.sku===skuNovo && r.sku!==editando.skuOriginal))throw new Error(`O código ${skuNovo} já está na lista vigente`);
      if(cadastroNovo && atuais.some(r=>r.sku===skuNovo))throw new Error(`O código ${skuNovo} já está na lista vigente — use o lápis para editar`);
      const itens=[{sku:skuNovo,descricao:editando.descricao,classe:editando.classe,vigencia:editando.vigencia,inicio_inovacao:editando.classe==="INOVACAO" ? editando.inicio_inovacao||null : null,versao_anterior:editando.versao_anterior}];
      if(!cadastroNovo && skuNovo!==editando.skuOriginal)itens.push({sku:editando.skuOriginal,descricao:editando.descricao,classe:"REMOVIDO",vigencia:hoje,inicio_inovacao:null,versao_anterior:editando.versao_anterior});
      const {error}=await supabase.rpc("abast_importar_classificacoes",{p_arquivo:cadastroNovo ? "Cadastro manual" : "Edição manual",p_itens:itens});if(error)throw error;
      await qc.invalidateQueries({queryKey:["abast-portfolio"]});setEditando(null);toast.success(cadastroNovo ? "Item cadastrado no portfólio" : "Classificação atualizada");
    }catch(e){toast.error(e instanceof Error ? e.message : "Não foi possível salvar a edição");}finally{setSalvando(false);}
  }
  async function remover(r:ClassificacaoPortfolio){
    if(!window.confirm(`Remover ${r.sku} da lista do portfólio? O item sai da lista vigente e o histórico é mantido.`))return; setSalvando(true);
    try{const {error}=await supabase.rpc("abast_importar_classificacoes",{p_arquivo:"Remoção manual",p_itens:[{sku:r.sku,descricao:r.descricao,classe:"REMOVIDO",vigencia:hoje,versao_anterior:r.id}]});if(error)throw error;
      await qc.invalidateQueries({queryKey:["abast-portfolio"]});toast.success(`${r.sku} removido da lista`);
    }catch(e){toast.error(e instanceof Error ? e.message : "Não foi possível remover");}finally{setSalvando(false);}
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap justify-between items-center gap-3"><h1 className="text-2xl font-bold flex gap-2 items-center"><Tags className="size-6"/>Portfólio e Classificação</h1><Button variant="outline" onClick={()=>setHistorico(s=>!s)}><History className="size-4"/>{historico ? "Classificações atuais" : "Histórico"}</Button></header>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{["TODOS",...Object.keys(CLASSES_PORTFOLIO)].map(c=><Button key={c} variant={classe===c ? "secondary":"outline"} className="h-auto items-start flex-col p-3" onClick={()=>setClasse(c)}><span className="text-xs text-muted-foreground">{c==="TODOS" ? "Todos":CLASSES_PORTFOLIO[c as keyof typeof CLASSES_PORTFOLIO]}</span><span className="text-2xl font-bold">{atuais.filter(r=>c==="TODOS" || r.classe===c).length}</span></Button>)}</div>
    <section className="border-y py-4 flex flex-wrap gap-3 items-end"><div><Label htmlFor="portfolio-vigencia">Vigência</Label><Input id="portfolio-vigencia" type="date" min={hoje} value={vigencia} onChange={e=>setVigencia(e.target.value)}/></div><Button variant="outline" onClick={modelo}><Download className="size-4"/>Baixar modelo (.xlsx)</Button>{isAdmin && <Button onClick={()=>file.current?.click()}><Upload className="size-4"/>Importar lista</Button>}{isAdmin && <Button variant="outline" onClick={()=>setEditando(novoCadastro())}><Plus className="size-4"/>Cadastrar manualmente</Button>}<input ref={file} type="file" aria-label="Planilha de classificação" accept=".xlsx,.xls" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void importar(f);e.target.value="";}}/></section>
    {rows && <section className="space-y-3" aria-label="Prévia da importação"><div className="flex flex-wrap gap-3 items-center justify-between"><h2 className="font-semibold">Prévia · {arquivo} · {previa.length} SKUs</h2><Badge variant={erros ? "destructive":"secondary"}>{erros ? `${erros} inconsistência(s)` : "Pronto para confirmar"}</Badge></div><div className="max-h-96 overflow-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>Linha / SKU</TableHead><TableHead>Produto</TableHead><TableHead>Anterior → Nova</TableHead><TableHead>Início Inovação</TableHead><TableHead>Validação</TableHead></TableRow></TableHeader><TableBody>{previa.map(r=><TableRow key={r.linha}><TableCell>{r.linha} · {r.sku}</TableCell><TableCell className="whitespace-normal min-w-48 text-xs">{r.descricao}</TableCell><TableCell>{r.anterior} → {r.classe ? CLASSES_PORTFOLIO[r.classe]:"Inválida"}</TableCell><TableCell>{r.classe==="INOVACAO" ? <Input aria-label={`Início Inovação ${r.sku}`} type="date" max={r.vigencia} value={r.inicio_inovacao} onChange={e=>mudarInicio(r,e.target.value)}/> : "—"}</TableCell><TableCell className={r.erros.length ? "text-destructive":"text-success"}>{r.erros.join("; ") || "Válido"}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex gap-2"><Button disabled={!isAdmin || !!erros || salvando} onClick={()=>void confirmar()}>{salvando ? <Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}Confirmar {previa.length} classificações</Button><Button variant="outline" onClick={()=>setRows(null)}>Cancelar</Button></div></section>}
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{historico ? "Histórico de classificações":"Classificações registradas"}</h2><Input aria-label="Buscar SKU ou produto" placeholder="Buscar SKU ou produto" className="max-w-sm" value={busca} onChange={e=>setBusca(e.target.value)}/></div><div className="overflow-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Classe</TableHead><TableHead>Vigência</TableHead><TableHead>Situação na meta</TableHead>{historico ? <><TableHead>Anterior</TableHead><TableHead>Registro / Autor</TableHead></> : isAdmin && <TableHead className="w-24">Ações</TableHead>}</TableRow></TableHeader><TableBody>{lista.map(r=><TableRow key={r.id}><TableCell>{r.sku}</TableCell><TableCell className="whitespace-normal text-xs min-w-48">{r.descricao}</TableCell><TableCell>{(CLASSES_PORTFOLIO as Record<string,string>)[r.classe] ?? "Removido"}</TableCell><TableCell>{r.vigencia.split("-").reverse().join("/")}</TableCell><TableCell>{(r.classe as string)==="REMOVIDO" ? "Removido da lista" : r.vigencia>hoje ? "Vigência futura" : elegivelPortfolio(r.classe,r.inicio_inovacao,hoje) ? "Elegível por classe" : "Fora da meta OOS"}</TableCell>{historico ? <><TableCell>{r.classe_anterior ?? "—"}</TableCell><TableCell className="text-xs">{new Date(r.registrado_em).toLocaleString("pt-BR")}<br/>{r.autor_id}</TableCell></> : isAdmin && <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" title="Editar classificação" onClick={()=>setEditando({sku:r.sku,skuOriginal:r.sku,descricao:r.descricao,classe:r.classe,vigencia:r.vigencia>hoje ? r.vigencia : hoje,inicio_inovacao:r.inicio_inovacao ?? "",versao_anterior:r.id})}><Pencil className="size-4"/></Button><Button size="icon" variant="ghost" title="Remover da lista" disabled={salvando} onClick={()=>void remover(r)}><Trash2 className="size-4 text-destructive"/></Button></div></TableCell>}</TableRow>)}{!lista.length && <TableRow><TableCell colSpan={historico ? 7:6} className="text-center py-12 text-muted-foreground">Nenhuma classificação registrada</TableCell></TableRow>}</TableBody></Table></div></section>
    <Dialog open={!!editando} onOpenChange={(o)=>{if(!o)setEditando(null);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editando?.skuOriginal ? `Editar classificação · ${editando.skuOriginal}` : "Cadastrar item no portfólio"}</DialogTitle></DialogHeader>
        {editando && <div className="space-y-3">
          <div><Label>Código do produto (SKU)</Label><Input value={editando.sku} onChange={(e)=>setEditando({...editando,sku:e.target.value})}/>{chaveSkuPortfolio(editando.sku)!==editando.skuOriginal && <p className="text-xs text-amber-600 mt-1">O código será alterado de {editando.skuOriginal} para {chaveSkuPortfolio(editando.sku)}: o código antigo sai da lista vigente e o histórico é mantido.</p>}</div>
          <div><Label>Produto</Label><Input value={editando.descricao} onChange={(e)=>setEditando({...editando,descricao:e.target.value})}/></div>
          <div><Label>Classe</Label><Select value={editando.classe} onValueChange={(v)=>setEditando({...editando,classe:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(CLASSES_PORTFOLIO).map(([k,rot])=><SelectItem key={k} value={k}>{rot}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Vigência</Label><Input type="date" min={hoje} value={editando.vigencia} onChange={(e)=>setEditando({...editando,vigencia:e.target.value})}/></div>
          {editando.classe==="INOVACAO" && <div><Label>Início da Inovação</Label><Input type="date" max={editando.vigencia} value={editando.inicio_inovacao} onChange={(e)=>setEditando({...editando,inicio_inovacao:e.target.value})}/></div>}
          <p className="text-xs text-muted-foreground">A edição grava um novo registro no histórico (Edição manual), sem apagar o anterior.</p>
        </div>}
        <DialogFooter><Button variant="outline" onClick={()=>setEditando(null)}>Cancelar</Button><Button disabled={salvando || !editando?.descricao.trim()} onClick={()=>void salvarEdicao()}>{salvando ? <Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}