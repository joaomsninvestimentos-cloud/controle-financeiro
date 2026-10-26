import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { db } from '@/db'
import { melhorias } from '@/db/schemas/schema'
import { ensureMelhoriasTable } from '@/lib/ensure-melhorias'
import { FINBOT_DIRETRIZES, buildUserFinanceBlock } from '@/lib/finbot-prompt'
import { loadFinanceSnapshot, fmtBrl, parsearValor, mesLabel } from '@/lib/chat-context'
import { getLlmConfig, getLlmStatus } from '@/lib/llm'
import { buildOfflineReply } from '@/lib/finbot-fallback'
import { z } from 'zod'

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(24),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
})

const ideasSchema = z.object({
  ideas: z.array(z.object({
    titulo: z.string().min(4).max(80),
    descricao: z.string().min(8).max(400),
    justificativa: z.string().min(8).max(400),
    impacto: z.enum(['alto', 'medio', 'baixo']),
  })).max(5).optional(),
})

async function callLlm(system: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const config = getLlmConfig()
  if (!config) {
    const status = getLlmStatus()
    console.error('LLM não configurada. Faltando:', status.missing.join(' | '))
    return { ok: false as const, status: 503, error: 'LLM_NOT_CONFIGURED' }
  }

  const { baseUrl, apiKey: key, model } = config

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'x-bty-business': 'ReActUs',
      'x-bty-workspace': 'default',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      stream: false,
      system,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error(`LLM error (${response.status}) em ${baseUrl}:`, err.slice(0, 400))
    const isAuth = response.status === 401 || response.status === 403
    return { ok: false as const, status: 502, error: isAuth ? 'LLM_AUTH_FAILED' : 'LLM_ERROR' }
  }

  const data = await response.json() as { content?: Array<{ type: string; text: string }> }
  const text = data.content?.find(c => c.type === 'text')?.text?.trim() ?? ''
  if (!text) {
    console.error('LLM respondeu vazio em', baseUrl)
    return { ok: false as const, status: 502, error: 'LLM_EMPTY' }
  }
  return { ok: true as const, text }
}

function extractJsonBlock(text: string): { reply: string; ideas: z.infer<typeof ideasSchema>['ideas'] } {
  const match = text.match(/```json\s*([\s\S]*?)```/i)
  if (!match) return { reply: text.trim(), ideas: undefined }
  const reply = text.replace(match[0], '').trim()
  try {
    const parsed = ideasSchema.safeParse(JSON.parse(match[1]))
    if (!parsed.success) return { reply, ideas: undefined }
    return { reply, ideas: parsed.data.ideas }
  } catch {
    return { reply, ideas: undefined }
  }
}

/**
 * Diagnóstico da configuração do FinBot (sem expor chaves).
 * GET /api/chat responde { configured, baseUrl, model, missing }.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  return NextResponse.json(getLlmStatus())
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const { messages, mes } = parsed.data
  const snap = await loadFinanceSnapshot(ctx.user.id, mes)

  const topCats = Object.entries(snap.totalMes.porCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, val]) => `- ${cat}: ${fmtBrl(val)}`)
    .join('\n') || '- (sem despesas registradas)'

  const orcsStatus = snap.orcsUsuario.length
    ? snap.orcsUsuario.map(o => {
        const gasto = snap.totalMes.porCategoria[o.categoria] ?? 0
        const limite = parsearValor(o.limite)
        const pct = limite > 0 ? Math.round(gasto / limite * 100) : 0
        return `- ${o.categoria}: ${fmtBrl(gasto)} de ${fmtBrl(limite)} (${pct}%)${gasto > limite ? ' EXCEDEU' : ''}`
      }).join('\n')
    : '- (nenhum orçamento neste mês)'

  const recentes = snap.itensMes.slice(0, 12).map(i =>
    `- ${i.data}: ${i.tipo === 'receita' ? '+' : '-'}${fmtBrl(parsearValor(i.valor))} — ${i.descricao} (${i.categoria})`
  ).join('\n') || '- (nenhum lançamento ainda)'

  const dados = buildUserFinanceBlock({
    nome: ctx.user.name,
    mesLabel: mesLabel(mes),
    mesAntLabel: mesLabel(snap.mesAnt),
    receitas: fmtBrl(snap.totalMes.receitas),
    despesas: fmtBrl(snap.totalMes.despesas),
    saldo: fmtBrl(snap.totalMes.saldo),
    nLancamentos: snap.itensMes.length,
    receitasAnt: fmtBrl(snap.totalAnt.receitas),
    despesasAnt: fmtBrl(snap.totalAnt.despesas),
    saldoAnt: fmtBrl(snap.totalAnt.saldo),
    topCats,
    orcsStatus,
    contas: snap.contasUsuario.length ? snap.contasUsuario.map(c => c.nome).join(', ') : 'nenhuma',
    recentes,
    recorrentes: snap.recorrentes,
  })

  const lastUser = messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
  const pediuMelhoria = /melhor(ia|ias)|sugira|sugestão|sugestao|ideia|ideias|desenvolvedor|guarde|anote|falta no app|poderia ter/i.test(lastUser)

  const system = `${FINBOT_DIRETRIZES}

${dados}

FORMATO DE SAÍDA:
- Responda ao usuário em texto normal (markdown simples: **negrito**, listas com - ).
- Se o usuário pediu melhorias, ideias de produto, ou você identificar 1–3 gaps claros nos dados dele, acrescente NO FINAL um bloco:

\`\`\`json
{"ideas":[{"titulo":"...","descricao":"...","justificativa":"...","impacto":"alto|medio|baixo"}]}
\`\`\`

- O bloco json é interno: descreva as ideias também em português no texto, de forma curta.
- Se não houver ideia nova e relevante, NÃO inclua o bloco json.
${pediuMelhoria ? '\nO usuário pediu ideias/melhorias nesta mensagem: extraia pelo menos 1 ideia concreta se fizer sentido.' : ''}`

  const llm = await callLlm(system, messages)
  if (!llm.ok) {
    // Nunca deixa o chat sem resposta: devolve o resumo calculado localmente
    // e mantém o detalhe técnico (sem chaves) para quem administra o app.
    const topCategoria = Object.entries(snap.totalMes.porCategoria)
      .sort((a, b) => b[1] - a[1])[0]

    const orcamentosExcedidos = snap.orcsUsuario
      .map(o => {
        const gasto = snap.totalMes.porCategoria[o.categoria] ?? 0
        const limite = parsearValor(o.limite)
        return { categoria: o.categoria, gasto, limite }
      })
      .filter(o => o.limite > 0 && o.gasto > o.limite)

    const reply = buildOfflineReply({
      mesLabel: mesLabel(mes),
      receitas: snap.totalMes.receitas,
      despesas: snap.totalMes.despesas,
      saldo: snap.totalMes.saldo,
      nLancamentos: snap.itensMes.length,
      topCategoria: topCategoria ? { nome: topCategoria[0], valor: topCategoria[1] } : undefined,
      orcamentosExcedidos,
      motivo: llm.error as 'LLM_NOT_CONFIGURED' | 'LLM_AUTH_FAILED' | 'LLM_ERROR' | 'LLM_EMPTY',
      faltando: llm.error === 'LLM_NOT_CONFIGURED' ? getLlmStatus().missing : undefined,
    })

    return NextResponse.json({ reply, offline: true, error: llm.error })
  }

  const { reply, ideas } = extractJsonBlock(llm.text)
  let saved = 0

  if (ideas && ideas.length > 0) {
    try {
      await ensureMelhoriasTable()
      const rows = ideas.map(idea => ({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        userName: ctx.user.name,
        titulo: idea.titulo,
        descricao: idea.descricao,
        justificativa: idea.justificativa,
        impacto: idea.impacto,
        status: 'nova',
      }))
      await db.insert(melhorias).values(rows)
      saved = rows.length
    } catch (err) {
      console.error('melhorias insert failed', err)
    }
  }

  const finalReply = saved > 0
    ? `${reply}\n\n_${saved} ideia(s) enviada(s) para o desenvolvedor._`
    : reply || 'Não consegui montar uma resposta agora. Tente de novo.'

  return NextResponse.json({ reply: finalReply, ideasSaved: saved })
}
