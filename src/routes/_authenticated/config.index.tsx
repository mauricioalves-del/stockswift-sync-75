import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { EyeOff, Shield, ChevronRight, Warehouse, MessageSquare } from "lucide-react";


export const Route = createFileRoute("/_authenticated/config/")({
  component: ConfigPage,
  head: () => ({ meta: [{ title: "Configurações" }] }),
});

function ConfigPage() {
  const { isAdmin, role } = useRole();
  const [cego, setCego] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const isCoord = role === "COORDENADOR_CONTROLE";
  const podeGerirInv = isAdmin || role === "GERENTE" || isCoord;
  const podeGerirWebhook = isAdmin || isCoord;

  useEffect(() => {
    supabase.from("app_config").select("valor").eq("chave", "inventario_cego").maybeSingle()
      .then(({ data }) => setCego(data?.valor === true || data?.valor === "true"));
    supabase.from("app_config").select("valor").eq("chave", "slack_webhook_baixas").maybeSingle()
      .then(({ data }) => {
        const v = data?.valor;
        setWebhook(typeof v === "string" ? v : "");
      });
  }, []);

  async function toggle(v: boolean) {
    setCego(v);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("app_config").upsert({ chave: "inventario_cego", valor: v, updated_by: me, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(v ? "Inventário cego ativado" : "Saldo sistêmico será exibido");
  }

  async function salvarWebhook() {
    setWebhookSaving(true);
    try {
      const me = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("app_config").upsert({
        chave: "slack_webhook_baixas", valor: webhook, updated_by: me, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Webhook do Slack atualizado");
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao salvar");
    } finally {
      setWebhookSaving(false);
    }
  }


  if (!isAdmin && !isCoord) return <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Parâmetros globais da operação</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><EyeOff className="size-4" /> Inventário Cego</CardTitle>
            <CardDescription>Quando ativado, oculta o saldo sistêmico do operador durante a contagem.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="cego-switch">Ocultar saldo sistêmico</Label>
              <Switch id="cego-switch" checked={cego} onCheckedChange={toggle} />
            </div>
          </CardContent>
        </Card>
      )}

      {(isCoord || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Shield className="size-4" /> Perfis e Permissões</CardTitle>
            <CardDescription>Matriz de acesso por perfil e módulo. Disponível para Administrador e Coordenador de Controle.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/config/perfis">Abrir matriz de permissões <ChevronRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {podeGerirInv && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Warehouse className="size-4" /> Parâmetros de Inventário</CardTitle>
            <CardDescription>Almoxarifado padrão por usuário — usado na contagem quando a missão não define um.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/config/inventario">Configurar almoxarifado padrão <ChevronRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

