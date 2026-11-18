// Lançamento de custos e cobranças com nota (usado pelo prestador e pelo gestor).
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Campo, enviarDoc, inputCls, sb } from "./ui";

export const TIPOS_LANC: Record<string, string> = { frete: "Frete / serviço", km: "Quilometragem", combustivel: "Combustível", estacionamento: "Estacionamento", pedagio: "Pedágio", manutencao: "Manutenção", embalagem: "Isopor / gelox", servico_mensal: "Serviço mensal (fixo)", outros: "Outros" };
export function NovoLancamento({ prestadorId, ordens, ccs, onFim }: { prestadorId: string; ordens: { id: string; numero: number; rotulo: string }[]; ccs: string[]; onFim: () => void }) {
  const [f, setF] = useState({ ordem_id: "", tipo: "frete", descricao: "", quantidade: "", valor: "", centro_custo: "", nota_numero: "", data: new Date().toISOString().slice(0, 10) });
  const [arq, setArq] = useState<File | null>(null); const [env, setEnv] = useState(false);
  async function salvar() {
    const valor = Number(f.valor.replace(",", ".")); if (!(valor >= 0) || !f.valor) return toast.error("Informe o valor.");
    if (!arq && !f.nota_numero) return toast.error("Anexe a nota/recibo ou informe o número da nota.");
    setEnv(true);
    try {
      const nota_path = arq ? await enviarDoc(`lancamentos/${prestadorId}`, arq) : null;
      const r = await sb.from("log_lancamentos").insert({ prestador_id: prestadorId, ordem_id: f.ordem_id || null, tipo: f.tipo, descricao: f.descricao || null, quantidade: f.quantidade ? Number(f.quantidade.replace(",", ".")) : null, valor, centro_custo: f.centro_custo || null, nota_numero: f.nota_numero || null, nota_path, data: f.data });
      if (r.error) throw r.error; toast.success("Lançamento enviado para aprovação."); setF({ ...f, descricao: "", quantidade: "", valor: "", nota_numero: "" }); setArq(null); onFim();
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setEnv(false); }
  }
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
    <Campo l="Ordem de serviço" className="md:col-span-2"><select className={inputCls} value={f.ordem_id} onChange={(e) => setF({ ...f, ordem_id: e.target.value })}><option value="">Sem ordem (custo avulso)</option>{ordens.map((o) => <option key={o.id} value={o.id}>OS {o.numero} · {o.rotulo}</option>)}</select></Campo>
    <Campo l="Tipo"><select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_LANC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
    <Campo l="Data"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
    <Campo l="Descrição (trecho, local…)" className="md:col-span-2"><input className={inputCls} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
    <Campo l={f.tipo === "km" ? "Km" : "Quantidade"}><input className={inputCls} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></Campo>
    <Campo l="Valor (R$)"><input className={inputCls} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
    <Campo l="Centro de custo" className="md:col-span-2"><select className={inputCls} value={f.centro_custo} onChange={(e) => setF({ ...f, centro_custo: e.target.value })}><option value="">— (o da ordem)</option>{ccs.map((c) => <option key={c}>{c}</option>)}</select></Campo>
    <Campo l="Nº da nota / recibo"><input className={inputCls} value={f.nota_numero} onChange={(e) => setF({ ...f, nota_numero: e.target.value })} /></Campo>
    <Campo l="Arquivo da nota (PDF/foto)"><input type="file" accept=".pdf,image/*,.xml" className="mt-1 block w-full text-xs" onChange={(e) => setArq(e.target.files?.[0] ?? null)} /></Campo>
    <div className="col-span-2 flex justify-end md:col-span-4"><Button size="sm" onClick={salvar} disabled={env}>{env ? "Enviando…" : "Enviar para aprovação"}</Button></div>
  </div>;
}
