// Função de diagnóstico: testa se o Supabase consegue abrir uma conexão TCP
// com o SQL Server do parceiro (db.demendes.com.br:1822), sem fazer login nem
// trocar dados — só verifica se o handshake TCP é aceito pela rede/firewall.
// Protegida por segredo compartilhado (header x-cron-secret).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const secretEsperado = Deno.env.get("TESTE_DEMENDES_SECRET");
  const secretRecebido = req.headers.get("x-cron-secret");
  if (!secretEsperado || secretRecebido !== secretEsperado) {
    return json({ ok: false, code: "FORBIDDEN", error: "Segredo inválido ou ausente" }, 403);
  }

  const host = "db.demendes.com.br";
  const port = 1822;
  const inicio = performance.now();

  try {
    const conexaoPromise = Deno.connect({ hostname: host, port });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout após 8s")), 8000)
    );
    const conn = await Promise.race([conexaoPromise, timeoutPromise]);
    const latenciaMs = Math.round(performance.now() - inicio);
    (conn as Deno.Conn).close();
    return json({ ok: true, host, port, latencia_ms: latenciaMs, mensagem: "Conexão TCP aceita pelo firewall/rede do parceiro." });
  } catch (err) {
    const latenciaMs = Math.round(performance.now() - inicio);
    return json({
      ok: false,
      host,
      port,
      latencia_ms: latenciaMs,
      erro: (err as Error).message ?? String(err),
      mensagem: "Não foi possível abrir conexão TCP — provavelmente bloqueado por firewall do parceiro.",
    });
  }
});
