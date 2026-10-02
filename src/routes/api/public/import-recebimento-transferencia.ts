import { createFileRoute } from '@tanstack/react-router'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

type LinhaEntrada = {
  estado?: unknown
  nr_nf?: unknown
  serie?: unknown
  dt_emissao?: unknown
  empresa?: unknown
  almox?: unknown
  cod_prod?: unknown
  desc_produto?: unknown
  qtd?: unknown
  vt_total_item?: unknown
  lote?: unknown
  nota_cancelada?: unknown
  dt_recebimento?: unknown
  recebimento?: unknown
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

// Datas da planilha representam um dia civil; sem componente de hora (o
// recebimento é rastreado por dia, igual ao restante da tela de import).
function toIsoDate(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400_000)
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return ''
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0].slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export const Route = createFileRoute('/api/public/import-recebimento-transferencia')({
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

        // 1. Validação linha a linha (espelha a tela manual de importação)
        const erros: { linha: number; erro: string }[] = []
        type Valida = {
          estado: string
          nr_nf: string
          serie: string
          dt_emissao: string
          empresa: string
          almox: string
          cod_prod: string
          desc_produto: string
          qtd: number
          vt_total_item: number
          lote: string
          nota_cancelada: string
          dt_recebimento: string
          recebimento: string
        }
        const vistos = new Set<string>()
        const validas: Valida[] = []

        linhas.forEach((r, i) => {
          const nr_nf = txt(r.nr_nf)
          const cod_prod = txt(r.cod_prod)
          const lote = txt(r.lote)
          const dt_emissao = toIsoDate(r.dt_emissao)
          const empresa = txt(r.empresa)
          const almox = txt(r.almox)
          const recebimento = txt(r.recebimento)
          const qtd = num(r.qtd)
          const vt_total_item = num(r.vt_total_item)

          if (!nr_nf) return erros.push({ linha: i + 1, erro: 'nr_nf vazio' })
          if (!cod_prod) return erros.push({ linha: i + 1, erro: 'cod_prod vazio' })
          if (!lote) return erros.push({ linha: i + 1, erro: 'lote vazio' })
          if (!dt_emissao) return erros.push({ linha: i + 1, erro: 'dt_emissao inválida ou vazia' })
          if (!empresa) return erros.push({ linha: i + 1, erro: 'empresa (DE) vazia' })
          if (!almox) return erros.push({ linha: i + 1, erro: 'almox (PARA) vazio' })
          if (!recebimento) return erros.push({ linha: i + 1, erro: 'recebimento vazio' })
          if (Number.isNaN(qtd)) return erros.push({ linha: i + 1, erro: 'qtd inválida' })
          if (Number.isNaN(vt_total_item)) return erros.push({ linha: i + 1, erro: 'vt_total_item inválido' })

          // O extrator de origem às vezes repete a mesma linha várias vezes
          // (mesma NF + produto + lote, mesmos valores) — duplicatas exatas,
          // não quantidades a somar. Mantém só a primeira ocorrência.
          const chaveDedup = `${nr_nf}|${cod_prod}|${lote}`
          if (vistos.has(chaveDedup)) return
          vistos.add(chaveDedup)

          validas.push({
            estado: txt(r.estado),
            nr_nf,
            serie: txt(r.serie),
            dt_emissao,
            empresa,
            almox,
            cod_prod,
            desc_produto: txt(r.desc_produto),
            qtd,
            vt_total_item,
            lote,
            nota_cancelada: txt(r.nota_cancelada),
            dt_recebimento: toIsoDate(r.dt_recebimento),
            recebimento,
          })
        })

        if (validas.length === 0) {
          return json({ recebidas: linhas.length, processadas: 0, novos: 0, atualizados: 0, falhas: 0, erros }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Descobre quais chaves já existem, para reportar novos vs. atualizados.
          const chaves = validas.map((r) => `${r.nr_nf}|${r.cod_prod}|${r.lote}`)
          const { data: existentesRaw, error: selErr } = await supabaseAdmin
            .from('notas_transferencia_recebimento')
            .select('nr_nf, cod_prod, lote')
          if (selErr) throw selErr
          const existentes = new Set((existentesRaw ?? []).map((r: any) => `${r.nr_nf}|${r.cod_prod}|${r.lote}`))
          const novos = chaves.filter((c) => !existentes.has(c)).length
          const atualizados = chaves.length - novos

          const payload = validas.map((r) => ({
            estado: r.estado || null,
            nr_nf: r.nr_nf,
            serie: r.serie || null,
            dt_emissao: r.dt_emissao,
            empresa: r.empresa,
            almox: r.almox,
            cod_prod: r.cod_prod,
            desc_produto: r.desc_produto || null,
            qtd: r.qtd,
            vt_total_item: r.vt_total_item,
            lote: r.lote,
            nota_cancelada: r.nota_cancelada || null,
            dt_recebimento: r.dt_recebimento || null,
            recebimento: r.recebimento,
            importado_por: null,
            updated_at: new Date().toISOString(),
          }))

          let ok = 0
          let falhas = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK)
            const { error } = await supabaseAdmin
              .from('notas_transferencia_recebimento')
              .upsert(slice, { onConflict: 'nr_nf,cod_prod,lote' })
            if (error) {
              falhas += slice.length
              console.error('[import-recebimento-transferencia] upsert', error)
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
          console.error('[import-recebimento-transferencia]', e)
          return json({ error: (e as Error).message ?? 'erro interno' }, 500)
        }
      },
    },
  },
})
