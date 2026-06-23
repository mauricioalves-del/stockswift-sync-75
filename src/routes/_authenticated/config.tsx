import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/config")({
  component: ConfigPage,
  head: () => ({ meta: [{ title: "Configurações" }] }),
});

function ConfigPage() {
  const { isAdmin } = useRole();
  const [cego, setCego] = useState(false);

  useEffect(() => {
    supabase.from("app_config").select("valor").eq("chave", "inventario_cego").maybeSingle()
      .then(({ data }) => setCego(data?.valor === true || data?.valor === "true"));
  }, []);

  async function toggle(v: boolean) {
    setCego(v);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("app_config").upsert({ chave: "inventario_cego", valor: v, updated_by: me, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(v ? "Inventário cego ativado" : "Saldo sistêmico será exibido");
  }

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Parâmetros globais da operação</p>
      </div>

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
    </div>
  );
}
