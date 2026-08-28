import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

type LinhaEntrada = {
  origem?: unknown
  sku?: unknown
  descricao?: unknown
  data_movimento?: unknown
  quantidade?: unknown
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function txt(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim()
}

function num(v: unknown): number {
  if (v === undefined || v === null || String(v).trim() === '') return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isNaN(n) ? NaN : n
}

function toIsoDate(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return ''
}

export const Route = createFileRoute('/api/public/import-consumo-cmd')({
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

        let body: { linhas?: LinhaEntrada[] }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ error: 'JSON inválido' }, 400)
        }

        const linhas = Array.isArray(body?.linhas) ? body.linhas : null
        if (!linhas) return json({ error: 'campo "linhas" (array) é obrigatório' }, 400)

        const erros: { linha: number; erro: string }[] = []
        type Valida = {
          origem: string
          sku: string
          descricao: string
          data_movimento: string
          quantidade: number
        }
        const validas: Valida[] = []

        linhas.forEach((r, i) => {
          const origem = txt(r.origem)
          const sku = txt(r.sku)
          const data_movimento = toIsoDate(txt(r.data_movimento))
          const quantidade = num(r.quantidade)
          if (!origem) return erros.push({ linha: i + 1, erro: 'origem vazia' })
          if (!sku) return erros.push({ linha: i + 1, erro: 'sku vazio' })
          if (!data_movimento) return erros.push({ linha: i + 1, erro: 'data_movimento inválida' })
          if (Number.isNaN(quantidade)) return erros.push({ linha: i + 1, erro: 'quantidade inválida' })
          validas.push({ origem, sku, descricao: txt(r.descricao), data_movimento, quantidade })
        })

        if (validas.length === 0) {
          return json({ recebidas: linhas.length, processadas: 0, novos: 0, atualizados: 0, falhas: 0, erros }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Dedup/soma por (origem, sku, data_movimento)
          const agg = new Map<string, Valida>()
          for (const r of validas) {
            const key = `${r.origem}|${r.sku}|${r.data_movimento}`
            const prev = agg.get(key)
            if (prev) {
              prev.quantidade += r.quantidade
              if (!prev.descricao && r.descricao) prev.descricao = r.descricao
            } else agg.set(key, { ...r })
          }
          const payload = Array.from(agg.values())

          // Novos x atualizados
          const skus = Array.from(new Set(payload.map((r) => r.sku)))
          const existentes: { origem: string; sku: string; data_movimento: string }[] = []
          for (let i = 0; i < skus.length; i += CHUNK) {
            const { data } = await supabaseAdmin
              .from('historico_consumo')
              .select('origem, sku, data_movimento')
              .in('sku', skus.slice(i, i + CHUNK))
            if (data) existentes.push(...data)
          }
          const setJa = new Set(existentes.map((e) => `${e.origem}|${e.sku}|${e.data_movimento}`))
          const novos = payload.filter((p) => !setJa.has(`${p.origem}|${p.sku}|${p.data_movimento}`)).length
          const atualizados = payload.length - novos

          let ok = 0
          let falhas = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK).map((r) => ({ ...r, importado_por: null }))
            const { error } = await supabaseAdmin
              .from('historico_consumo')
              .upsert(slice, { onConflict: 'origem,sku,data_movimento' })
            if (error) {
              falhas += slice.length
              console.error('[import-consumo-cmd] upsert', error)
            } else ok += slice.length
          }

          return json({
            recebidas: linhas.length,
            processadas: ok,
            novos,
            atualizados,
            falhas,
            erros,
          })
        } catch (e) {
          console.error('[import-consumo-cmd]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
