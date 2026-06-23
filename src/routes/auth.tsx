import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({ meta: [{ title: "Entrar — Inventário Cloud" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Login state
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  // Signup state
  const [sNome, setSNome] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  // Reset state
  const [rEmail, setREmail] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: sEmail,
      password: sPwd,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome: sNome },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cadastro realizado. Verifique seu e-mail (se confirmação estiver ativa) ou faça login.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(rEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de recuperação enviado.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary to-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
            <Boxes className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inventário Cloud</h1>
            <p className="text-xs text-muted-foreground">Operação industrial em nuvem</p>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Acesso ao sistema</CardTitle>
            <CardDescription>Entre, cadastre-se ou recupere sua senha.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
                <TabsTrigger value="reset">Recuperar</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="li-email">E-mail</Label>
                    <Input id="li-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div>
                    <Label htmlFor="li-pwd">Senha</Label>
                    <Input id="li-pwd" type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="su-nome">Nome</Label>
                    <Input id="su-nome" required value={sNome} onChange={(e) => setSNome(e.target.value)} maxLength={100} />
                  </div>
                  <div>
                    <Label htmlFor="su-email">E-mail</Label>
                    <Input id="su-email" type="email" required value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="su-pwd">Senha</Label>
                    <Input id="su-pwd" type="password" required minLength={6} value={sPwd} onChange={(e) => setSPwd(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Cadastrar"}
                  </Button>
                  <p className="text-xs text-muted-foreground">O primeiro usuário cadastrado torna-se ADMINISTRADOR automaticamente.</p>
                </form>
              </TabsContent>

              <TabsContent value="reset">
                <form onSubmit={handleReset} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="rs-email">E-mail</Label>
                    <Input id="rs-email" type="email" required value={rEmail} onChange={(e) => setREmail(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Enviar link de recuperação"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/dashboard" className="hover:underline">← voltar</Link>
        </p>
      </div>
    </div>
  );
}
