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
  lote?: unknown
  origem?: unknown
  descricao?: unknown
  unidade?: unknown
  quantidade?: unknown
  custo_unitario?: unknown
  id_local?: unknown
  cliente?: unknown
  data_validade?: unknown
  ean?: unknown
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

// Mesma normalização de datas usada na tela (dd/mm/aaaa ou ISO).
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

export const Route = createFileRoute('/api/public/import-estoque-sistemico')({
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

        let body: {
          arquivo?: string
          modo?: string
          origens?: unknown
          linhas?: LinhaEntrada[]
        }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ error: 'JSON inválido' }, 400)
        }

        const linhas = Array.isArray(body?.linhas) ? body.linhas : null
        if (!linhas) return json({ error: 'campo "linhas" (array) é obrigatório' }, 400)

        const modo = body.modo === 'por_origem' ? 'por_origem' : 'completo'
        if (body.modo && body.modo !== 'completo' && body.modo !== 'por_origem') {
          return json({ error: 'modo deve ser "completo" ou "por_origem"' }, 400)
        }

        // 1. Validação linha a linha (espelha handleFile)
        const erros: { linha: number; erro: string }[] = []
        type Valida = {
          id_produto: string
          lote: string
          origem: string
          descricao: string
          unidade: string
          quantidade: number
          custo_unitario: number
          id_local: string
          cliente: string
          data_validade: string | null
          ean: string | null
        }
        const validas: Valida[] = []

        linhas.forEach((r, i) => {
          const id_produto = txt(r.id_produto)
          const origem = txt(r.origem)
          const quantidade = num(r.quantidade)
          if (!id_produto) return erros.push({ linha: i + 1, erro: 'id_produto vazio' })
          if (!origem) return erros.push({ linha: i + 1, erro: 'origem (almoxarifado) vazia' })
          if (Number.isNaN(quantidade)) return erros.push({ linha: i + 1, erro: 'quantidade inválida' })
          const custo = num(r.custo_unitario)
          if (Number.isNaN(custo)) return erros.push({ linha: i + 1, erro: 'custo_unitario inválido' })
          validas.push({
            id_produto,
            lote: txt(r.lote),
            origem,
            descricao: txt(r.descricao),
            unidade: txt(r.unidade) || 'UN',
            quantidade,
            custo_unitario: custo,
            id_local: txt(r.id_local),
            cliente: txt(r.cliente),
            data_validade: toIsoDate(txt(r.data_validade)) || null,
            ean: txt(r.ean) || null,
          })
        })

        if (validas.length === 0) {
          return json(
            { recebidas: linhas.length, processadas: 0, novos: 0, atualizados: 0, zerados: 0, falhas: 0, origens_novas: [], erros },
            400,
          )
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // 2. Origens novas cadastradas automaticamente
          const origens = Array.from(new Set(validas.map((r) => r.origem)))
          const { data: existentes } = await supabaseAdmin
            .from('origens')
            .select('codigo_origem')
            .in('codigo_origem', origens)
          const setExist = new Set((existentes ?? []).map((o) => o.codigo_origem))
          const novasOrigens = origens
            .filter((o) => !setExist.has(o))
            .map((o) => ({ codigo_origem: o, descricao: o }))
          if (novasOrigens.length) {
            await supabaseAdmin.from('origens').insert(novasOrigens)
          }

          // 3. Dedup/soma por chave (id_produto|lote|origem)
          const agg = new Map<string, Valida>()
          for (const r of validas) {
            const key = `${r.id_produto}|${r.lote}|${r.origem}`
            const prev = agg.get(key)
            if (prev) {
              prev.quantidade += r.quantidade
              if (!prev.ean && r.ean) prev.ean = r.ean
            } else {
              agg.set(key, { ...r })
            }
          }
          const payload = Array.from(agg.values())

          // 4. Novos x atualizados
          const skus = Array.from(new Set(payload.map((r) => r.id_produto)))
          const jaExistem: { id_produto: string; lote: string | null; origem: string | null }[] = []
          for (let i = 0; i < skus.length; i += CHUNK) {
            const { data } = await supabaseAdmin
              .from('estoque_sistemico')
              .select('id_produto, lote, origem')
              .in('id_produto', skus.slice(i, i + CHUNK))
            if (data) jaExistem.push(...data)
          }
          const setJa = new Set(jaExistem.map((e) => `${e.id_produto}|${e.lote ?? ''}|${e.origem ?? ''}`))
          const novos = payload.filter((p) => !setJa.has(`${p.id_produto}|${p.lote}|${p.origem}`)).length
          const atualizados = payload.length - novos

          // 5. Upsert em chunks
          let ok = 0
          let fail = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK).map((r) => ({
              id_produto: r.id_produto,
              lote: r.lote,
              descricao: r.descricao,
              unidade: r.unidade,
              quantidade: r.quantidade,
              custo_unitario: r.custo_unitario,
              id_local: r.id_local,
              origem: r.origem,
              cliente: r.cliente,
              data_validade: r.data_validade,
              ean: r.ean,
            }))
            const { error } = await supabaseAdmin
              .from('estoque_sistemico')
              .upsert(slice, { onConflict: 'id_produto,lote,origem' })
            if (error) {
              fail += slice.length
              console.error('[import-estoque] upsert', error)
            } else ok += slice.length
          }

          // 6. Zerar lotes ausentes conforme modo
          const chavesArquivo = new Set(payload.map((p) => `${p.id_produto}|${p.lote}|${p.origem}`))
          const origensFiltro =
            modo === 'por_origem'
              ? Array.isArray(body.origens) && body.origens.length
                ? (body.origens as unknown[]).map((o) => txt(o)).filter(Boolean)
                : origens
              : null

          let zerados = 0
          const obsoletos: string[] = []
          for (let from = 0; ; from += PAGE) {
            let q = supabaseAdmin
              .from('estoque_sistemico')
              .select('id, id_produto, lote, origem')
              .gt('quantidade', 0)
              .order('id', { ascending: true })
              .range(from, from + PAGE - 1)
            if (origensFiltro) q = q.in('origem', origensFiltro)
            const { data, error } = await q
            if (error) throw error
            const rows = data ?? []
            for (const e of rows) {
              if (!chavesArquivo.has(`${e.id_produto}|${e.lote ?? ''}|${e.origem ?? ''}`)) obsoletos.push(e.id)
            }
            if (rows.length < PAGE) break
          }
          for (let i = 0; i < obsoletos.length; i += CHUNK) {
            const ids = obsoletos.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin
              .from('estoque_sistemico')
              .update({ quantidade: 0, data_importacao: new Date().toISOString() })
              .in('id', ids)
            if (!error) zerados += ids.length
          }

          // 7. Logs (mesmos da tela)
          const arquivo = txt(body.arquivo) || 'API import-estoque-sistemico'
          await supabaseAdmin.from('importacoes_estoque').insert({
            usuario: null,
            arquivo,
            registros_processados: validas.length,
            novos,
            atualizados,
            erros: fail + erros.length,
            detalhes: {
              origem_lancamento: 'API',
              modo,
              origens_novas: novasOrigens.map((o) => o.codigo_origem),
              lotes_zerados: zerados,
              erros_validacao: erros,
            },
          })

          await supabaseAdmin.from('audit_logs').insert({
            usuario: null,
            acao: 'SINCRONIZAR_ESTOQUE_API',
            entidade: 'estoque_sistemico',
            payload: {
              arquivo,
              modo,
              total: validas.length,
              ok,
              fail,
              novos,
              atualizados,
              origens_novas: novasOrigens.length,
              lotes_zerados: zerados,
            },
          })

          return json({
            recebidas: linhas.length,
            processadas: payload.length,
            novos,
            atualizados,
            zerados,
            falhas: fail,
            modo,
            origens_novas: novasOrigens.map((o) => o.codigo_origem),
            erros,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[import-estoque] falha', message)
          return json({ error: message }, 500)
        }
      },
    },
  },
})
