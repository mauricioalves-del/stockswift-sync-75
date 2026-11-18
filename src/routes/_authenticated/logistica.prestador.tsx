// Portal do prestador: ordens atribuídas, atualização de status e lançamento de custos/cobranças com nota.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Secao } from "@/components/abast-dash/comum";
import { Button } from "@/components/ui/button";
import { brl, dataBR, Hero, ROT, sb, Status } from "@/components/logistica/ui";
import { NovoLancamento, TIPOS_LANC } from "@/components/logistica/Lancamentos";
import { PROXIMOS } from "@/lib/tms";

export const Route = createFileRoute("/_authenticated/logistica/prestador")({ component: Portal, head: () => ({ meta: [{ title: "Portal do prestador — Controle Logístico" }] }) });

function Portal() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tms-portal"], queryFn: async () => {
    const id = (await sb.rpc("log_meu_prestador")).data as string | null; if (!id) return { id: null } as any;
    const [p, o, l, cc] = await Promise.all([sb.from("log_prestadores").select("nome").eq("id", id).single(), sb.from("log_ordens").select("*").eq("prestador_id", id).order("numero", { ascending: false }), sb.from("log_lancamentos").select("*").eq("prestador_id", id).order("created_at", { ascending: false }), sb.from("log_centros_custo").select("centro_custo")]);
    return { id, nome: p.data?.nome, ord: (o.data ?? []) as any[], lan: (l.data ?? []) as any[], cc: ((cc.data ?? []) as any[]).map((x) => x.centro_custo) };
  } });
  const r = () => qc.invalidateQueries({ queryKey: ["tms-portal"] });
  async function mudar(o: any, status: string) {
    const extra: any = { status }; if (status === "coletada") extra.coletado_em = new Date().toISOString();
    if (status === "entregue") { const rec = prompt("Recebido por:"); if (!rec) return; extra.entregue_em = new Date().toISOString(); extra.recebedor = rec; }
    const res = await sb.from("log_ordens").update(extra).eq("id", o.id); if (res.error) return toast.error(res.error.message); r();
  }
  if (q.isLoading) return <p className="py-10 text-center text-muted-foreground">Carregando…</p>;
  if (!q.data?.id) return <div className="space-y-4"><Hero titulo="Portal do prestador" sub="Acesso de transportadores e prestadores de serviço." /><p className="py-10 text-center text-sm text-muted-foreground">Seu usuário ainda não está vinculado a um prestador. Peça ao gestor de logística para vincular em Controle Logístico › Cadastros.</p></div>;
  const d = q.data;
  return (
    <div className="w-full space-y-4">
      <Hero titulo={`Portal do prestador · ${d.nome}`} sub="Atualize o status das suas ordens e lance custos e cobranças com a nota — o gestor da Mágio aprova." />
      <Secao letra="A" titulo="Minhas ordens">
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["OS", "Previsão", "Valor aprovado", "Status", "Ações"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{d.ord.map((o: any) => <tr key={o.id} className="border-t"><td className="px-2 py-1">OS {o.numero}</td><td className="px-2 py-1">{dataBR(o.previsao)}</td><td className="px-2 py-1">{brl(o.valor_aprovado)}</td><td className="px-2 py-1"><Status s={o.status} /></td>
            <td className="px-2 py-1"><div className="flex gap-1">{(PROXIMOS[o.status] ?? []).filter((s) => s !== "cancelada").map((s) => <Button key={s} size="sm" variant="outline" onClick={() => mudar(o, s)}>{ROT[s]}</Button>)}</div></td></tr>)}</tbody></table>
      </Secao>
      <Secao letra="B" titulo="Lançar custo ou cobrança"><NovoLancamento prestadorId={d.id} ordens={d.ord.filter((o: any) => o.status !== "cancelada").map((o: any) => ({ id: o.id, numero: o.numero, rotulo: dataBR(o.previsao) }))} ccs={d.cc} onFim={r} /></Secao>
      <Secao letra="C" titulo="Meus lançamentos">
        <table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{["Data", "Tipo", "Descrição", "Nota", "Valor", "Status"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{d.lan.map((l: any) => <tr key={l.id} className="border-t"><td className="px-2 py-1">{dataBR(l.data)}</td><td className="px-2 py-1">{TIPOS_LANC[l.tipo]}</td><td className="px-2 py-1">{l.descricao}</td><td className="px-2 py-1">{l.nota_numero ?? (l.nota_path ? "anexada" : "—")}</td><td className="px-2 py-1">{brl(l.valor)}</td><td className="px-2 py-1"><Status s={l.status} />{l.motivo && <span className="ml-1 text-xs text-muted-foreground">{l.motivo}</span>}</td></tr>)}</tbody></table>
      </Secao>
    </div>
  );
}
