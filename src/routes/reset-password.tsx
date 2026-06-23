import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPwd,
});

function ResetPwd() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // supabase parses recovery hash automatically on getSession
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setReady(true); // allow form anyway; will fail gracefully
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada");
    navigate({ to: "/dashboard" });
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Definir nova senha</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="np">Nova senha</Label>
              <Input id="np" type="password" minLength={6} required value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>Atualizar senha</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
