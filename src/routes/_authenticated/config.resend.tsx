import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Send, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/config/resend")({
  component: ResendConfigPage,
  head: () => ({ meta: [{ title: "Configurações — Resend" }] }),
});

const CHAVES = [
  { chave: "resend_from", label: "Remetente (From)", placeholder: 'Baixas <baixas@seudominio.com.br>', hint: "Formato: 'Nome <email@dominio>'. Domínio precisa estar verificado em resend.com/domains. Sem valor, usa onboarding@resend.dev (apenas para o dono da conta)." },
  { chave: "resend_reply_to", label: "Responder para (Reply-To)", placeholder: "fiscal@seudominio.com.br", hint: "Opcional. E-mail que receberá as respostas." },
  { chave: "resend_subject_prefix", label: "Prefixo do assunto", placeholder: "[PROD] ", hint: "Opcional. Prefixo aplicado a todos os assuntos (ex.: [HOMOL], [PROD])." },
] as const;

function ResendConfigPage() {
  const { isAdmin } = useRole();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_config")
        .select("chave, valor")
        .in("chave", CHAVES.map(c => c.chave));
      const next: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        next[r.chave] = typeof r.valor === "string" ? r.valor : (r.valor ?? "");
      });
      setVals(next);
      setLoading(false);
    })();
  }, []);

  async function salvar() {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const me = (await supabase.auth.getUser()).data.user?.id;
      const rows = CHAVES.map(c => ({
        chave: c.chave,
        valor: (vals[c.chave] ?? "").trim(),
        updated_by: me,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("app_config").upsert(rows);
      if (error) throw error;
      toast.success("Parâmetros do Resend salvos");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function enviarTeste() {
    if (!testTo.trim()) return toast.error("Informe um e-mail de destino");
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("solicitar-baixa-fiscal", {
        body: { test: true, test_to: testTo.trim() },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Falha no envio");
      toast.success(`E-mail de teste enviado para ${testTo.trim()}`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha no envio de teste");
    } finally {
      setTesting(false);
    }
  }

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito ao Administrador.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="size-6" /> Parâmetros do Resend</h1>
        <p className="text-sm text-muted-foreground">Configurações de envio de e-mail (Baixa Fiscal) sem editar código. Estes valores têm prioridade sobre variáveis de ambiente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
          <CardDescription>Deixe em branco para usar o padrão (onboarding@resend.dev, sem reply-to, sem prefixo).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            CHAVES.map((c) => (
              <div key={c.chave} className="space-y-1">
                <Label htmlFor={c.chave}>{c.label}</Label>
                <Input
                  id={c.chave}
                  value={vals[c.chave] ?? ""}
                  placeholder={c.placeholder}
                  onChange={(e) => setVals((v) => ({ ...v, [c.chave]: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
            ))
          )}
          <div className="flex justify-end">
            <Button onClick={salvar} disabled={saving || loading}>
              <Save className="size-4 mr-1" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviar e-mail de teste</CardTitle>
          <CardDescription>Envia uma mensagem simples usando as configurações acima. Útil para validar remetente e chave do Resend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="test-to">Destinatário</Label>
            <Input
              id="test-to"
              type="email"
              value={testTo}
              placeholder="voce@empresa.com"
              onChange={(e) => setTestTo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Se o remetente ainda usa onboarding@resend.dev, só o dono da conta Resend receberá.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={enviarTeste} disabled={testing} variant="secondary">
              <Send className="size-4 mr-1" /> {testing ? "Enviando..." : "Enviar teste"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
