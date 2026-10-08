import { createFileRoute } from '@tanstack/react-router'
import { resolverCusto } from '@/lib/custo-contabil'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHUNK = 500

type LinhaEntrada = {
  id_produto?: unknown
  lote?: unknown
  origem?: unknown
  custo_contabil_sp?: unknown
  custo_contabil_para?: unknown
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

export const Route = createFileRoute('/api/public/import-custo-contabil')({
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

        let body: { arquivo?: string; linhas?: LinhaEntrada[] }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ error: 'JSON inválido' }, 400)
        }
        const linhas = Array.isArray(body?.linhas) ? body.linhas : null
        if (!linhas) return json({ error: 'campo "linhas" (array) é obrigatório' }, 400)

        // Regra: Pará usa Custo_Contabil_Para; os demais, Custo_Contabil_SP. Zero/vazio => sem contábil (vale o padrão).
        const erros: { linha: number; erro: string }[] = []
        const porChave = new Map<string, { id_produto: string; lote: string; origem: string; custo_contabil: number }>()
        let usandoContabil = 0
        let semContabil = 0
        let colunaSp = 0
        let colunaPara = 0

        linhas.forEach((r, i) => {
          const id_produto = txt(r.id_produto)
          const origem = txt(r.origem)
          if (!id_produto) return erros.push({ linha: i + 1, erro: 'id_produto vazio' })
          if (!origem) return erros.push({ linha: i + 1, erro: 'origem (almoxarifado) vazia' })
          const res = resolverCusto({
            origem,
            custoPadrao: null,
            contabilSp: r.custo_contabil_sp,
            contabilPara: r.custo_contabil_para,
          })
          const contabil = res.custo_contabil ?? 0
          if (res.coluna_contabil === 'Custo_Contabil_Para') colunaPara += 1
          else colunaSp += 1
          if (contabil > 0) usandoContabil += 1
          else semContabil += 1
          porChave.set(`${id_produto}|${txt(r.lote)}|${origem}`, {
            id_produto,
            lote: txt(r.lote),
            origem,
            custo_contabil: contabil,
          })
        })

        const payload = Array.from(porChave.values())
        if (payload.length === 0) {
          return json({ recebidas: linhas.length, enviadas: 0, atualizadas: 0, erros }, 400)
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          let atualizadas = 0
          let falhas = 0
          for (let i = 0; i < payload.length; i += CHUNK) {
            const fatia = payload.slice(i, i + CHUNK)
            const { data, error } = await supabaseAdmin.rpc('atualizar_custos_contabeis' as never, { p_linhas: fatia } as never)
            if (error) {
              falhas += fatia.length
              console.error('[import-custo-contabil] rpc', error)
            } else {
              atualizadas += Number((data as { atualizadas?: number } | null)?.atualizadas ?? 0)
            }
          }

          const arquivo = txt(body.arquivo) || 'API import-custo-contabil'
          const resumo = {
            recebidas: linhas.length,
            enviadas: payload.length,
            atualizadas,
            sem_correspondencia: Math.max(payload.length - atualizadas - falhas, 0),
            usando_contabil: usandoContabil,
            sem_contabil_usa_padrao: semContabil,
            linhas_coluna_sp: colunaSp,
            linhas_coluna_para: colunaPara,
            falhas,
          }
          await supabaseAdmin.from('audit_logs').insert({
            usuario: null,
            acao: 'SINCRONIZAR_CUSTO_CONTABIL_API',
            entidade: 'estoque_sistemico',
            payload: { arquivo, ...resumo, erros_validacao: erros.length },
          })

          return json({ ...resumo, erros })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[import-custo-contabil] falha', message)
          return json({ error: message }, 500)
        }
      },
    },
  },
})
