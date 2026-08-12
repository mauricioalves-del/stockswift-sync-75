import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-atlas-sync-secret',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const COLUNAS =
  'id, codigo_produto, id_local, motivo_baixa_id, quantidade, valor_total, status_fluxo, data_ocorrencia, data_solicitacao, responsavel_nome'

const PAGE_SIZE = 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/public/atlas-exportar-baixas')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async () => json({ error: 'método não permitido' }, 405),
      PUT: async () => json({ error: 'método não permitido' }, 405),
      DELETE: async () => json({ error: 'método não permitido' }, 405),
      PATCH: async () => json({ error: 'método não permitido' }, 405),
      GET: async ({ request }) => {
        const secret = process.env['ATLAS_SYNC_SECRET']
        const header = request.headers.get('x-atlas-sync-secret')
        if (!secret || !header || header !== secret) {
          return json({ error: 'não autorizado' }, 401)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const linhas: unknown[] = []
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabaseAdmin
              .from('baixa_operacional')
              .select(COLUNAS)
              .order('id', { ascending: true })
              .range(from, from + PAGE_SIZE - 1)
            if (error) throw error
            if (!data || data.length === 0) break
            linhas.push(...data)
            if (data.length < PAGE_SIZE) break
          }
          return json(linhas, 200)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return json({ error: message }, 500)
        }
      },
    },
  },
})
