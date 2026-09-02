import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

type LinhaEntrada = {
  id_produto?: unknown
  descricao?: unknown
  data?: unknown
  doc?: unknown
  desc_movimento?: unknown
  desc_almox?: unknown
  qtd?: unknown
  id_lote?: unknown
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

// Mesma conversão da tela manual: datas da planilha representam um dia civil;
// meio-dia UTC evita que o fuso desloque 01/09 para 31/08.
function toIsoDateTime(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    // serial Excel (dias desde 1899-12-30)
    const ms = Math.round((v - 25569) * 86400_000)
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return ''
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, d.getUTCHours() % 12, 0)).toISOString()
  }
  const s = String(v).trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/)
  if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1], br[4] ? +br[4] : 12, +(br[5] ?? 0))).toISOString()
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (isoM) return new Date(Date.UTC(+isoM[1], +isoM[2] - 1, +isoM[3], isoM[4] ? +isoM[4] : 12, +(isoM[5] ?? 0))).toISOString()
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export const Route = createFileRoute('/api/public/import-movimentacao-fefo')({
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

        // 1. Validação linha a linha (espelha a tela manual)
        const erros: { linha: number; erro: string }[] = []
        type Valida = {
          id_produto: string
          descricao: string
          data: string
          dia: string
          doc: string
          desc_movimento: string
          desc_almox: string
          qtd: number
          id_lote: string
        }
        const validas: Valida[] = []

        linhas.forEach((r, i) => {
          const id_produto = txt(r.id_produto)
          const data = toIsoDateTime(r.data)
          const qtd = num(r.qtd)
          if (!id_produto) return erros.push({ linha: i + 1, erro: 'id_produto vazio' })
          if (!data) return erros.push({ linha: i + 1, erro: 'data inválida' })
          if (Number.isNaN(qtd)) return erros.push({ linha: i + 1, erro: 'qtd inválida' })
          validas.push({
            id_produto,
            descricao: txt(r.descricao),
            data,
            dia: data.slice(0, 10),
            doc: txt(r.doc),
            desc_movimento: txt(r.desc_movimento),
            desc_almox: txt(r.desc_almox),
            qtd,
            id_lote: txt(r.id_lote),
          })
        })

        if (validas.length === 0) {
          return json({ recebidas: linhas.length, processadas: 0, novos: 0, atualizados: 0, removidos: 0, falhas: 0, quebras: 0, dias: [], erros }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const dias = Array.from(new Set(validas.map((r) => r.dia))).sort()

          // 2. Escopo por dia: reimportar um dia substitui somente aquele dia
          let removidos = 0
          for (const dia of dias) {
            const ini = `${dia}T03:00:00.000Z` // 00:00 SP
            const fim = `${new Date(new Date(dia + 'T00:00:00Z').getTime() + 86400_000).toISOString().slice(0, 10)}T03:00:00.000Z`
            const { error: delErr, count } = await supabaseAdmin
              .from('movimentacoes_diarias')
              .delete({ count: 'exact' })
              .gte('data', ini)
              .lt('data', fim)
            if (delErr) throw delErr
            removidos += count ?? 0
          }

          // 3. Insert em chunks
          const payload = validas.map((r) => ({
            id_produto: r.id_produto,
            descricao: r.descricao,
            data: r.data,
            doc: r.doc,
            desc_movimento: r.desc_movimento,
            desc_almox: r.desc_almox,
            qtd: r.qtd,
            id_lote: r.id_lote,
            importado_por: null,
          }))
          let ok = 0
          let falhas = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin.from('movimentacoes_diarias').insert(slice)
            if (error) {
              falhas += slice.length
              console.error('[import-movimentacao-fefo] insert', error)
            } else ok += slice.length
          }

          // 4. Reprocessa o motor FEFO para cada dia afetado (igual à tela)
          let quebras = 0
          const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
          for (const dia of dias.filter((d) => d === hoje)) {
            const { data, error } = await supabaseAdmin.rpc('processar_fefo', { _data: hoje })
            if (error) throw error
            const r = Array.isArray(data) ? data[0] : data
            quebras += Number(r?.quebras ?? 0)
          }

          return json({
            recebidas: linhas.length,
            processadas: ok,
            novos: ok,
            atualizados: 0,
            removidos,
            falhas,
            quebras,
            dias,
            erros,
          })
        } catch (e) {
          console.error('[import-movimentacao-fefo]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
