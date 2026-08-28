import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

type LinhaEntrada = {
  data_producao?: unknown
  id_op?: unknown
  produto?: unknown
  desc_produto?: unknown
  material?: unknown
  desc_material?: unknown
  um?: unknown
  qtd_consumo?: unknown
  qtd_previsto?: unknown
  qtd_produzida?: unknown
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

export const Route = createFileRoute('/api/public/import-consumo-op')({
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
        const validas: Record<string, unknown>[] = []

        linhas.forEach((r, i) => {
          const id_op = txt(r.id_op)
          const material = txt(r.material)
          const data_producao = toIsoDate(txt(r.data_producao))
          const qtd_consumo = num(r.qtd_consumo)
          const qtd_previsto = num(r.qtd_previsto)
          if (!id_op) return erros.push({ linha: i + 1, erro: 'id_op vazio' })
          if (!material) return erros.push({ linha: i + 1, erro: 'material vazio' })
          if (!data_producao) return erros.push({ linha: i + 1, erro: 'data_producao inválida' })
          if (Number.isNaN(qtd_consumo)) return erros.push({ linha: i + 1, erro: 'qtd_consumo inválida' })
          if (Number.isNaN(qtd_previsto)) return erros.push({ linha: i + 1, erro: 'qtd_previsto inválida' })
          const qp = txt(r.qtd_produzida) === '' ? null : num(r.qtd_produzida)
          validas.push({
            ano_mes: data_producao.slice(0, 7),
            data_producao,
            id_op,
            produto: txt(r.produto) || null,
            desc_produto: txt(r.desc_produto) || null,
            material,
            desc_material: txt(r.desc_material) || null,
            um: txt(r.um) || null,
            qtd_consumo,
            qtd_previsto,
            qtd_produzida: qp !== null && Number.isNaN(qp) ? null : qp,
            criado_por: null,
          })
        })

        if (validas.length === 0) {
          return json({ recebidas: linhas.length, processadas: 0, removidos: 0, falhas: 0, erros }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          const { count: anteriores } = await supabaseAdmin
            .from('producao_consumo')
            .select('id', { count: 'exact', head: true })

          // Snapshot completo: substitui toda a base (mesmo comportamento da tela)
          const { error: deleteError } = await supabaseAdmin
            .from('producao_consumo')
            .delete()
            .not('id', 'is', null)
          if (deleteError) throw deleteError

          let ok = 0
          let falhas = 0
          for (let i = 0; i < validas.length; i += CHUNK) {
            const slice = validas.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin.from('producao_consumo').insert(slice as never)
            if (error) {
              falhas += slice.length
              console.error('[import-consumo-op] insert', error)
            } else ok += slice.length
          }

          return json({
            recebidas: linhas.length,
            processadas: ok,
            removidos: anteriores ?? 0,
            falhas,
            erros,
          })
        } catch (e) {
          console.error('[import-consumo-op]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
