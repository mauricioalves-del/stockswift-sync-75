import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500
const PAGE = 1000

type LinhaEntrada = {
  id_produto?: unknown
  produto?: unknown
  id_subconjunto?: unknown
  subconjunto?: unknown
  id_item?: unknown
  item?: unknown
  qtd?: unknown
  tem_filho?: unknown
  gera_oc?: unknown
  linha_origem?: unknown
  custo?: unknown
  item_unidade?: unknown
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

function bool(v: unknown): boolean {
  const s = txt(v).toLowerCase()
  return s === 'true' || s === '1' || s === 'sim' || s === 's' || s === 'x' || v === true
}

export const Route = createFileRoute('/api/public/import-ficha-tecnica-bom')({
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
          id_produto: string
          produto: string | null
          id_subconjunto: string
          subconjunto: string | null
          id_item: string
          item: string | null
          qtd: number
          tem_filho: boolean
          gera_oc: boolean
          linha_origem: string | null
          custo: number
          item_unidade: string | null
        }
        const validas: Valida[] = []

        linhas.forEach((r, i) => {
          const id_produto = txt(r.id_produto)
          const id_item = txt(r.id_item)
          const qtd = num(r.qtd)
          const custo = num(r.custo)
          if (!id_produto) return erros.push({ linha: i + 1, erro: 'id_produto vazio' })
          if (!id_item) return erros.push({ linha: i + 1, erro: 'id_item vazio' })
          if (Number.isNaN(qtd)) return erros.push({ linha: i + 1, erro: 'qtd inválida' })
          if (Number.isNaN(custo)) return erros.push({ linha: i + 1, erro: 'custo inválido' })
          validas.push({
            id_produto,
            produto: txt(r.produto) || null,
            id_subconjunto: txt(r.id_subconjunto),
            subconjunto: txt(r.subconjunto) || null,
            id_item,
            item: txt(r.item) || null,
            qtd,
            tem_filho: bool(r.tem_filho),
            gera_oc: bool(r.gera_oc),
            linha_origem: txt(r.linha_origem) || null,
            custo,
            item_unidade: txt(r.item_unidade) || null,
          })
        })

        if (validas.length === 0) {
          return json(
            { recebidas: linhas.length, processadas: 0, novos: 0, atualizados: 0, removidos: 0, falhas: 0, erros },
            400,
          )
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Dedup por (id_produto, id_subconjunto, id_item) — última linha vence
          const agg = new Map<string, Valida>()
          for (const r of validas) {
            agg.set(`${r.id_produto}|${r.id_subconjunto}|${r.id_item}`, r)
          }
          const payload = Array.from(agg.values())
          const chavesArquivo = new Set(agg.keys())
          const produtos = Array.from(new Set(payload.map((r) => r.id_produto)))

          // Existentes desses produtos (para novos/atualizados e remoção de ausentes)
          const existentes: { id: string; id_produto: string; id_subconjunto: string | null; id_item: string }[] = []
          for (let i = 0; i < produtos.length; i += CHUNK) {
            const bloco = produtos.slice(i, i + CHUNK)
            for (let from = 0; ; from += PAGE) {
              const { data, error } = await supabaseAdmin
                .from('ficha_tecnica_bom')
                .select('id, id_produto, id_subconjunto, id_item')
                .in('id_produto', bloco)
                .order('id', { ascending: true })
                .range(from, from + PAGE - 1)
              if (error) throw error
              const rows = data ?? []
              existentes.push(...rows)
              if (rows.length < PAGE) break
            }
          }
          const setJa = new Set(existentes.map((e) => `${e.id_produto}|${e.id_subconjunto ?? ''}|${e.id_item}`))
          const novos = payload.filter((p) => !setJa.has(`${p.id_produto}|${p.id_subconjunto}|${p.id_item}`)).length
          const atualizados = payload.length - novos

          // Upsert em blocos
          let ok = 0
          let falhas = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK).map((r) => ({ ...r, criado_por: null }))
            const { error } = await supabaseAdmin
              .from('ficha_tecnica_bom')
              .upsert(slice, { onConflict: 'id_produto,id_subconjunto,id_item' })
            if (error) {
              falhas += slice.length
              console.error('[import-ficha-tecnica-bom] upsert', error)
            } else ok += slice.length
          }

          // Remove itens do produto que não vieram mais no arquivo
          const obsoletos = existentes
            .filter((e) => !chavesArquivo.has(`${e.id_produto}|${e.id_subconjunto ?? ''}|${e.id_item}`))
            .map((e) => e.id)
          let removidos = 0
          for (let i = 0; i < obsoletos.length; i += CHUNK) {
            const ids = obsoletos.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin.from('ficha_tecnica_bom').delete().in('id', ids)
            if (!error) removidos += ids.length
          }

          return json({
            recebidas: linhas.length,
            processadas: ok,
            novos,
            atualizados,
            removidos,
            falhas,
            erros,
          })
        } catch (e) {
          console.error('[import-ficha-tecnica-bom]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
