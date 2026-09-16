// Testa conectividade TCP crua com o SQL Server do parceiro (De Mendes).
// Não faz login nem query — só verifica se a porta responde a partir do Supabase.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const host = "db.demendes.com.br";
  const port = 1822;
  const inicio = Date.now();

  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: host, port }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout_10s")), 10000)
      ),
    ]);
    const ms = Date.now() - inicio;
    conn.close();
    return new Response(
      JSON.stringify({ ok: true, host, port, latencia_ms: ms, mensagem: "Conexão TCP estabelecida com sucesso." }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const ms = Date.now() - inicio;
    return new Response(
      JSON.stringify({
        ok: false,
        host,
        port,
        tempo_ate_falhar_ms: ms,
        erro: String(e?.message ?? e),
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
