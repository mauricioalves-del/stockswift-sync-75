// Cadastros do TMS: prestadores (com acesso ao portal), tabelas de serviço por zona e modal, embalagens térmicas.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Secao } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { brl, Campo, Hero, inputCls, sb } from "@/components/logistica/ui";
import { ZONA_ROTULO, type Zona } from "@/lib/tms";

export const Route = createFileRoute("/_authenticated/logistica/cadastros")({ component: Cadastros, head: () => ({ meta: [{ title: "Cadastros de transporte — Controle Logístico" }] }) });
const MODAIS = ["aplicativo", "veiculo_proprio", "correios", "rodoviario", "aereo"];
const TIPOS = ["pj", "transportadora", "aplicativo", "aerea", "correios", "motorista"];

function Cadastros() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tms-cad"], queryFn: async () => {
    const [p, t, e, u] = await Promise.all([sb.from("log_prestadores").select("*").order("nome"), sb.from("log_tabelas_frete").select("*").order("zona"), sb.from("log_embalagens").select("*").order("tipo"), sb.from("profiles").select("id, nome, email").eq("aprovado", true).order("nome")]);
    return { pres: (p.data ?? []) as any[], tab: (t.data ?? []) as any[], emb: (e.data ?? []) as any[], users: (u.data ?? []) as any[] };
  } });
  const r = () => qc.invalidateQueries({ queryKey: ["tms-cad"] });
  const [np, setNp] = useState({ nome: "", tipo: "transportadora", documento: "", contato: "", email: "", telefone: "" });
  const [nt, setNt] = useState({ prestador_id: "", modal: "aplicativo", zona: "grande_sp", valor_fixo: "0", valor_km: "0", valor_kg: "0", minimo: "0", prazo_dias: "", termico: false, observacao: "" });
  const num = (v: string) => Number(String(v || "0").replace(",", "."));
  async function exec(p: any, ok: string) { const res = await p; if (res.error) return toast.error(res.error.message); toast.success(ok); r(); }
  const nomeP = (id: string) => q.data?.pres.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="w-full space-y-4">
      <Hero titulo="Cadastros de transporte" sub="Prestadores e acesso ao portal · tabelas de serviço (como cada um cobra por zona e modal) · embalagens térmicas usadas na cotação automática." />
      <Secao letra="A" titulo="Prestadores">
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Prestador", "Tipo", "Contato", "Site de cotação", "Usuário do portal", "Ativo"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{(q.data?.pres ?? []).map((p) => <tr key={p.id} className="border-t"><td className="px-2 py-1 font-semibold">{p.nome}</td><td className="px-2 py-1 text-xs">{p.tipo}</td><td className="px-2 py-1 text-xs">{[p.contato, p.email, p.telefone].filter(Boolean).join(" · ") || "—"}</td>
            <td className="px-2 py-1"><input className="h-8 w-56 rounded-md border bg-background px-2 text-xs" placeholder="https://… (site oficial)" defaultValue={p.site_cotacao ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.site_cotacao ?? "")) exec(sb.from("log_prestadores").update({ site_cotacao: v || null }).eq("id", p.id), "Site de cotação atualizado"); }} /></td>
            <td className="px-2 py-1"><select className="h-8 rounded-md border bg-background px-1 text-xs" value={p.user_id ?? ""} onChange={(e) => exec(sb.from("log_prestadores").update({ user_id: e.target.value || null }).eq("id", p.id), "Acesso atualizado")}><option value="">Sem acesso</option>{(q.data?.users ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select></td>
            <td className="px-2 py-1"><input type="checkbox" checked={p.ativo} onChange={(e) => exec(sb.from("log_prestadores").update({ ativo: e.target.checked }).eq("id", p.id), "Atualizado")} /></td></tr>)}</tbody></table>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-7">
          <Campo l="Nome" className="md:col-span-2"><input className={inputCls} value={np.nome} onChange={(e) => setNp({ ...np, nome: e.target.value })} /></Campo>
          <Campo l="Tipo"><select className={inputCls} value={np.tipo} onChange={(e) => setNp({ ...np, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
          <Campo l="CNPJ/CPF"><input className={inputCls} value={np.documento} onChange={(e) => setNp({ ...np, documento: e.target.value })} /></Campo>
          <Campo l="Contato"><input className={inputCls} value={np.contato} onChange={(e) => setNp({ ...np, contato: e.target.value })} /></Campo>
          <Campo l="E-mail"><input className={inputCls} value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} /></Campo>
          <div className="flex items-end"><Button className="w-full" onClick={() => np.nome && exec(sb.from("log_prestadores").insert(np), "Prestador cadastrado")}>Adicionar</Button></div>
        </div>
      </Secao>
      <Secao letra="B" titulo="Tabelas de serviço (base da cotação automática)">
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Prestador", "Modal", "Zona", "Fixo", "R$/km", "R$/kg", "Mínimo", "Prazo", "Térmica incl.", "Observação", ""].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{(q.data?.tab ?? []).map((t) => <tr key={t.id} className={`border-t ${t.ativo ? "" : "opacity-50"}`}><td className="px-2 py-1">{nomeP(t.prestador_id)}</td><td className="px-2 py-1 text-xs">{t.modal}</td><td className="px-2 py-1 text-xs">{ZONA_ROTULO[t.zona as Zona]}</td>
            <td className="px-2 py-1 tabular-nums">{brl(t.valor_fixo)}</td><td className="px-2 py-1 tabular-nums">{brl(t.valor_km)}</td><td className="px-2 py-1 tabular-nums">{brl(t.valor_kg)}</td><td className="px-2 py-1 tabular-nums">{brl(t.minimo)}</td><td className="px-2 py-1">{t.prazo_dias ?? "—"} d</td><td className="px-2 py-1">{t.termico ? "sim" : "não"}</td><td className="px-2 py-1 text-xs text-muted-foreground">{t.observacao}</td>
            <td className="px-2 py-1"><Button size="sm" variant="outline" onClick={() => exec(sb.from("log_tabelas_frete").update({ ativo: !t.ativo }).eq("id", t.id), "Atualizado")}>{t.ativo ? "Desativar" : "Ativar"}</Button></td></tr>)}</tbody></table>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <Campo l="Prestador" className="md:col-span-2"><select className={inputCls} value={nt.prestador_id} onChange={(e) => setNt({ ...nt, prestador_id: e.target.value })}><option value="">—</option>{(q.data?.pres ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
          <Campo l="Modal"><select className={inputCls} value={nt.modal} onChange={(e) => setNt({ ...nt, modal: e.target.value })}>{MODAIS.map((m) => <option key={m}>{m}</option>)}</select></Campo>
          <Campo l="Zona"><select className={inputCls} value={nt.zona} onChange={(e) => setNt({ ...nt, zona: e.target.value })}>{(Object.keys(ZONA_ROTULO) as Zona[]).map((z) => <option key={z} value={z}>{ZONA_ROTULO[z]}</option>)}</select></Campo>
          {(["valor_fixo", "valor_km", "valor_kg", "minimo", "prazo_dias"] as const).map((k) => <Campo key={k} l={{ valor_fixo: "Fixo (R$)", valor_km: "R$/km", valor_kg: "R$/kg", minimo: "Mínimo (R$)", prazo_dias: "Prazo (dias)" }[k]}><input className={inputCls} value={nt[k]} onChange={(e) => setNt({ ...nt, [k]: e.target.value })} /></Campo>)}
          <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={nt.termico} onChange={(e) => setNt({ ...nt, termico: e.target.checked })} />Já inclui proteção térmica</label>
          <Campo l="Observação" className="md:col-span-2"><input className={inputCls} value={nt.observacao} onChange={(e) => setNt({ ...nt, observacao: e.target.value })} /></Campo>
          <div className="flex items-end"><Button className="w-full" onClick={() => nt.prestador_id && exec(sb.from("log_tabelas_frete").insert({ ...nt, valor_fixo: num(nt.valor_fixo), valor_km: num(nt.valor_km), valor_kg: num(nt.valor_kg), minimo: num(nt.minimo), prazo_dias: nt.prazo_dias ? num(nt.prazo_dias) : null }), "Tabela cadastrada")}>Adicionar</Button></div>
        </div>
      </Secao>
      <Secao letra="D" titulo="Origem das entregas (centro das zonas do mapa)"><Origem /></Secao>
      <Secao letra="C" titulo="Embalagens térmicas">
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Embalagem", "Tipo", "Capacidade", "Custo"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{(q.data?.emb ?? []).map((e) => <tr key={e.id} className="border-t"><td className="px-2 py-1">{e.nome}</td><td className="px-2 py-1">{e.tipo}</td><td className="px-2 py-1">{e.capacidade_kg ? `${e.capacidade_kg} kg` : "—"}</td>
            <td className="px-2 py-1"><input className="h-8 w-24 rounded-md border bg-background px-1 text-right text-sm" defaultValue={e.custo} onBlur={(ev) => Number(ev.target.value.replace(",", ".")) !== +e.custo && exec(sb.from("log_embalagens").update({ custo: num(ev.target.value) }).eq("id", e.id), "Custo atualizado")} /></td></tr>)}</tbody></table>
      </Secao>
    </div>
  );
}

function Origem() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["log-origem"], queryFn: async () => (await sb.from("app_config").select("valor").eq("chave", "log_origem").maybeSingle()).data?.valor ?? {} });
  const [f, setF] = useState<{ nome: string; lat: string; lng: string } | null>(null);
  const v = f ?? { nome: q.data?.nome ?? "", lat: String(q.data?.lat ?? ""), lng: String(q.data?.lng ?? "") };
  async function salvar() {
    const lat = Number(v.lat.replace(",", ".")), lng = Number(v.lng.replace(",", "."));
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 34 || Math.abs(lng) > 75) return toast.error("Coordenada inválida (ex.: -23.55 e -46.63).");
    const { error } = await sb.from("app_config").upsert({ chave: "log_origem", valor: { nome: v.nome || "Origem", lat, lng }, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message); toast.success("Origem atualizada"); setF(null); qc.invalidateQueries({ queryKey: ["log-origem"] }); qc.invalidateQueries({ queryKey: ["logistica"] });
  }
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
    <Campo l="Nome" className="md:col-span-2"><input className={inputCls} value={v.nome} onChange={(e) => setF({ ...v, nome: e.target.value })} /></Campo>
    <Campo l="Latitude"><input className={inputCls} value={v.lat} onChange={(e) => setF({ ...v, lat: e.target.value })} /></Campo>
    <Campo l="Longitude"><input className={inputCls} value={v.lng} onChange={(e) => setF({ ...v, lng: e.target.value })} /></Campo>
    <div className="flex items-end"><Button className="w-full" onClick={salvar}>Salvar</Button></div>
    <p className="col-span-2 text-xs text-muted-foreground md:col-span-5">No Google Maps, clique com o botão direito sobre a fábrica e copie as coordenadas. As zonas de entrega são anéis de 10, 25, 50 e 150 km a partir deste ponto.</p>
  </div>;
}
