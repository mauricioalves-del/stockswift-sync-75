import { createFileRoute } from '@tanstack/react-router'
import { linhasPlanilhaErp } from '@/lib/farol-movimentados'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/public/import-movimentacao-erp')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => json({ error: 'método não permitido' }, 405),
      PUT: async () => json({ error: 'método não permitido' }, 405),
      DELETE: async () => json({ error: 'método não permitido' }, 405),
      PATCH: async () => json({ error: 'método não permitido' }, 405),
      POST: async ({ request }) => {
        const chave = process.env['IMPORT_API_KEY']
        const header = request.headers.get('x-import-key')
        if (!chave || !header || header !== chave) {
          return json({ error: 'não autorizado' }, 401)
        }

        let body: { arquivo?: unknown; linhas?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ error: 'JSON inválido' }, 400)
        }
        if (!body || typeof body !== 'object' || !Array.isArray(body.linhas)) {
          return json({ error: 'campo "linhas" (array) é obrigatório' }, 400)
        }
        const brutas = (body.linhas as unknown[]).filter(
          (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r),
        )
        const arquivo = typeof body.arquivo === 'string' && body.arquivo.trim() ? body.arquivo.trim() : null

        // Mesma conversão do botão "Importar movimentação (ERP)"
        const { linhas, erros } = linhasPlanilhaErp(brutas)
        if (!linhas.length) {
          return json({
            recebidas: body.linhas.length, processadas: 0, inseridas: 0, pares_limpos: 0, falhas: 0,
            erros: ['Nenhuma linha válida (colunas esperadas: id_produto, descricao, data, doc, desc_movimento, desc_almox, qtd, id_lote).', ...erros].slice(0, 20),
          }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const pares = [...new Map(linhas.map((l) => [`${l.desc_almox}|${l.data}`, { desc_almox: l.desc_almox, data: l.data }])).values()]
          // Limpeza direta por almoxarifado + datas (a RPC exige usuário logado)
          const porAlmox = new Map<string, string[]>()
          for (const p of pares) {
            const l = porAlmox.get(p.desc_almox) ?? []
            l.push(p.data)
            porAlmox.set(p.desc_almox, l)
          }
          for (const [almox, datas] of porAlmox) {
            const { error: delErr } = await supabaseAdmin
              .from('movimentacoes_erp' as never)
              .delete()
              .eq('desc_almox' as never, almox as never)
              .in('data' as never, datas as never)
            if (delErr) {
              console.error('[import-movimentacao-erp] delete', delErr)
              return json({ error: `Falha ao limpar ${almox || '(sem almoxarifado)'}: ${delErr.message}` }, 500)
            }
          }

          const payload = linhas.map((l) => ({ ...l, arquivo }))
          let inseridas = 0
          let falhas = 0
          const errosOut = [...erros]
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin.from('movimentacoes_erp' as never).insert(slice as never)
            if (error) {
              falhas += slice.length
              errosOut.push(`Lote ${i / CHUNK + 1}: ${error.message}`)
              console.error('[import-movimentacao-erp] insert', error)
            } else inseridas += slice.length
          }

          return json({
            recebidas: body.linhas.length,
            processadas: linhas.length,
            inseridas,
            pares_limpos: pares.length,
            falhas,
            erros: errosOut.slice(0, 20),
          }, falhas > 0 ? 500 : 200)
        } catch (e) {
          console.error('[import-movimentacao-erp]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
