// Desempenho: no navegador, supabase.auth.getUser() fazia uma chamada de rede ao servidor de autenticação a cada uso
// (dezenas por tela). A sessão já está no navegador e o token é renovado pelo próprio cliente; o servidor continua
// validando o token em cada consulta (RLS). Aqui getUser passa a ler a sessão local, com reserva na chamada original.
import { supabase } from "@/integrations/supabase/client";

if (typeof window !== "undefined") {
  const auth = supabase.auth as any;
  if (!auth.__getUserRapido) {
    const original = auth.getUser.bind(auth);
    auth.getUser = async (jwt?: string) => {
      if (jwt) return original(jwt);
      const { data, error } = await auth.getSession();
      if (!error && data?.session?.user) return { data: { user: data.session.user }, error: null };
      return original();
    };
    auth.__getUserRapido = true;
  }
}
