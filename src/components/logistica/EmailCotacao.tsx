// Pedido de cotação por e-mail para a transportadora (e-mail do cadastro do prestador): texto executivo com os
// dados da carga e da entrega, revisável antes de enviar, aberto no Outlook (Microsoft 365) ou no app de e-mail.
import { useEffect, useMemo, useState } from "react";
import { Copy, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const brl = (v: any) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "a combinar");
function proximoDiaUtil() { const d = new Date(); do { d.setDate(d.getDate() + 1); } while ([0, 6].includes(d.getDay())); return d.toLocaleDateString("pt-BR"); }

export function textoEmailCotacao(sol: any, prestador: { nome: string; contato?: string | null }, remetente: string) {
  const destino = [sol.destino_endereco, [sol.destino_cidade, sol.destino_uf].filter(Boolean).join("/"), sol.destino_cep ? `CEP ${sol.destino_cep}` : null].filter(Boolean).join(" · ");
  const assunto = `Solicitação de cotação de frete — Mágio Chocolates · ${sol.destino_cidade ?? "destino"}${sol.destino_uf ? `/${sol.destino_uf}` : ""}${sol.pedido ? ` · Pedido ${sol.pedido}` : ""} · Ref. #${sol.numero}`;
  const corpo = [
    `Prezados(as)${prestador.contato ? ` ${prestador.contato}` : ""} — ${prestador.nome},`,
    "",
    "A Mágio Chocolates solicita cotação de frete para o embarque abaixo.",
    "",
    "DADOS DA CARGA",
    `• Mercadoria: chocolates e produtos alimentícios${sol.termico ? " — exige proteção térmica (sensível a temperatura)" : " — carga sensível a calor, manter protegida do sol e de altas temperaturas"}`,
    `• Peso bruto: ${sol.peso_kg ? `${Number(sol.peso_kg).toLocaleString("pt-BR")} kg` : "a informar"}${sol.volumes ? ` · Volumes: ${sol.volumes}` : ""}`,
    `• Valor da mercadoria (NF): ${brl(sol.valor_pedido)}`,
    sol.pedido ? `• Pedido: ${sol.pedido}` : null,
    "",
    "COLETA",
    `• Origem: ${sol.origem || "Fábrica Mágio (São Paulo/SP)"}`,
    "",
    "ENTREGA",
    sol.cliente ? `• Destinatário: ${sol.cliente}` : null,
    `• Endereço: ${destino || "a informar"}`,
    `• Data limite de entrega: ${dataBR(sol.data_limite)}`,
    sol.km_estimado ? `• Distância estimada: ${Number(sol.km_estimado).toLocaleString("pt-BR")} km` : null,
    sol.observacao ? `• Observações: ${sol.observacao}` : null,
    "",
    "PEDIMOS QUE A PROPOSTA INFORME",
    "• Valor total do frete com todas as taxas (frete-peso, ad valorem, GRIS, pedágio, TDE e coleta/entrega)",
    "• Prazo de coleta e prazo de entrega",
    "• Modalidade (rodoviário, aéreo ou fracionado) e condições para carga sensível à temperatura",
    "• Validade da proposta e condições de pagamento",
    "",
    `Agradecemos o retorno até ${proximoDiaUtil()}.`,
    "",
    "Atenciosamente,",
    remetente,
    "Logística · Mágio Chocolates",
  ].filter((l) => l !== null).join("\n");
  return { assunto, corpo };
}

export function EmailCotacao({ sol, prestador, aberto, onFechar }: { sol: any; prestador: any | null; aberto: boolean; onFechar: () => void }) {
  const [remetente, setRemetente] = useState("");
  useEffect(() => { supabase.auth.getUser().then(async ({ data }) => { const { data: p } = await (supabase as any).from("profiles").select("nome, email").eq("id", data.user?.id).maybeSingle(); setRemetente(p?.nome || p?.email || ""); }); }, []);
  const base = useMemo(() => (prestador ? textoEmailCotacao(sol, prestador, remetente || "Equipe de Logística") : { assunto: "", corpo: "" }), [sol, prestador, remetente]);
  const [para, setPara] = useState(""); const [assunto, setAssunto] = useState(""); const [corpo, setCorpo] = useState("");
  useEffect(() => { if (aberto && prestador) { setPara(prestador.email ?? ""); setAssunto(base.assunto); setCorpo(base.corpo); } }, [aberto, prestador, base]);
  if (!prestador) return null;
  const q = (s: string) => encodeURIComponent(s);
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${q(para)}&subject=${q(assunto)}&body=${q(corpo)}`;
  const mailto = `mailto:${para}?subject=${q(assunto)}&body=${q(corpo)}`;
  const ok = /\S+@\S+\.\S+/.test(para);
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5" />Cotação por e-mail · {prestador.nome}</DialogTitle></DialogHeader>
      <div className="space-y-2 text-sm">
        <label className="block text-xs font-semibold text-muted-foreground">Para</label>
        <Input value={para} onChange={(e) => setPara(e.target.value)} placeholder="e-mail da transportadora" />
        {!prestador.email && <p className="text-xs text-amber-700">Este prestador não tem e-mail no cadastro. Informe aqui ou cadastre em Controle Logístico › Cadastros.</p>}
        <label className="block text-xs font-semibold text-muted-foreground">Assunto</label>
        <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        <label className="block text-xs font-semibold text-muted-foreground">Mensagem (revise antes de enviar)</label>
        <textarea className="min-h-[340px] w-full rounded-md border bg-background p-2 font-mono text-xs leading-relaxed" value={corpo} onChange={(e) => setCorpo(e.target.value)} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(`Assunto: ${assunto}\n\n${corpo}`).then(() => toast.success("Texto copiado."))}><Copy className="mr-1 size-4" />Copiar texto</Button>
        <Button variant="outline" disabled={!ok} onClick={() => { window.location.href = mailto; }}><Mail className="mr-1 size-4" />App de e-mail</Button>
        <Button disabled={!ok} onClick={() => { window.open(outlook, "_blank", "noopener"); toast.success("E-mail aberto no Outlook: confira e clique em Enviar."); }}><Send className="mr-1 size-4" />Abrir no Outlook</Button>
      </div>
    </DialogContent></Dialog>
  );
}
