import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/resumo-tarefas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey")
          ?? request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { enviarResumoTarefas } = await import("@/lib/resumo-tarefas.server");
          const result = await enviarResumoTarefas(supabaseAdmin as any);
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("[resumo-tarefas]", err?.message ?? err);
          return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
