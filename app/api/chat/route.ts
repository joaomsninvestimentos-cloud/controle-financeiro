import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, orcamentos } from '@/db/schemas/schema'
import { eq, and, desc } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'

const BTY_LLM_BASE = process.env.BTY_LLM_SERVER_BASE_URL!
const BTY_LLM_KEY = process.env.BTY_LLM_SERVER_API_KEY!

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function parsear(t: string) {
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(t) || 0
}

function mesLabel(ym: string) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const [y, m] = ym.split('-')
  return `${meses[parseInt(m,10)-1]} ${y}`
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { messages, mes } = await req.json() as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    mes: string // YYYY-MM atual selecionado no app
  }

  if (!messages?.length) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  // ── Montar contexto financeiro do usuário ──────────────────────────────────
  const mesMesAnterior = (() => {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })()

  // Items dos últimos 2 meses
  const [itensMes, itensMesAnt, contasUsuario, orcsUsuario] = await Promise.all([
    db.select().from(items).where(and(eq(items.userId, ctx.user.id), eq(items.mes, mes))).orderBy(desc(items.data)),
    db.select().from(items).where(and(eq(items.userId, ctx.user.id), eq(items.mes, mesMesAnterior))).orderBy(desc(items.data)),
    db.select().from(contas).where(eq(contas.userId, ctx.user.id)),
    db.select().from(orcamentos).where(and(eq(orcamentos.userId, ctx.user.id), eq(orcamentos.mes, mes))),
  ])

  // Calcular totais
  const calc = (its: typeof itensMes) => {
    const receitas = its.filter(i => i.tipo === 'receita').reduce((a, i) => a + parsear(i.valor), 0)
    const despesas = its.filter(i => i.tipo === 'despesa').reduce((a, i) => a + parsear(i.valor), 0)
    const porCategoria: Record<string, number> = {}
    for (const i of its.filter(i => i.tipo === 'despesa')) {
      porCategoria[i.categoria] = (porCategoria[i.categoria] ?? 0) + parsear(i.valor)
    }
    return { receitas, despesas, saldo: receitas - despesas, porCategoria }
  }

  const totalMes = calc(itensMes)
  const totalAnt = calc(itensMesAnt)

  // Top categorias de despesa
  const topCats = Object.entries(totalMes.porCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, val]) => `  - ${cat}: ${fmt(val)}`)
    .join('\n')

  // Orçamentos e status
  const orcsStatus = orcsUsuario.map(o => {
    const gasto = totalMes.porCategoria[o.categoria] ?? 0
    const limite = parsear(o.limite)
    const pct = Math.round(gasto / limite * 100)
    return `  - ${o.categoria}: gasto ${fmt(gasto)} de ${fmt(limite)} (${pct}%)${gasto > limite ? ' ⚠️ EXCEDEU' : ''}`
  }).join('\n')

  // Lançamentos recentes do mês (últimos 10)
  const recentes = itensMes.slice(0, 10).map(i =>
    `  - ${i.data}: ${i.tipo === 'receita' ? '+' : '-'}${fmt(parsear(i.valor))} — ${i.descricao} (${i.categoria})`
  ).join('\n')

  const systemPrompt = `Você é o assistente financeiro pessoal do app "Meu Controle Financeiro". Seu nome é **FinBot** 🤖.

Você ajuda o usuário a entender seus dados financeiros, dá dicas personalizadas e responde perguntas sobre o app.
Seja sempre amigável, direto e use emojis com moderação. Responda sempre em português brasileiro.

━━━ DADOS FINANCEIROS ATUAIS DO USUÁRIO ━━━

👤 Usuário: ${ctx.user.name}
📅 Mês em análise: ${mesLabel(mes)}

📊 RESUMO DE ${mesLabel(mes).toUpperCase()}:
  Receitas:  ${fmt(totalMes.receitas)}
  Despesas:  ${fmt(totalMes.despesas)}
  Saldo:     ${fmt(totalMes.saldo)}
  Nº de lançamentos: ${itensMes.length}

📊 RESUMO DE ${mesLabel(mesMesAnterior).toUpperCase()} (comparativo):
  Receitas:  ${fmt(totalAnt.receitas)}
  Despesas:  ${fmt(totalAnt.despesas)}
  Saldo:     ${fmt(totalAnt.saldo)}

💸 TOP DESPESAS POR CATEGORIA EM ${mesLabel(mes)}:
${topCats || '  (sem despesas registradas)'}

${orcsStatus ? `🎯 ORÇAMENTOS DO MÊS:\n${orcsStatus}` : ''}

🏦 CONTAS CADASTRADAS: ${contasUsuario.length > 0 ? contasUsuario.map(c => c.nome).join(', ') : 'nenhuma'}

📋 ÚLTIMOS 10 LANÇAMENTOS:
${recentes || '  (nenhum lançamento ainda)'}

━━━ FUNCIONALIDADES DO APP ━━━
- Lançamentos por mês separados (cada mês é independente)
- Contas bancárias com saldo arrastado mês a mês
- Contas compartilhadas (convite por e-mail, auditoria de quem lançou)
- Lançamentos em lote
- Orçamentos por categoria com barra de progresso
- Alerta quando despesas passam 80% das receitas
- Repetição automática de lançamentos recorrentes
- Exportação para CSV/Excel
- Gráficos (barras por mês, pizza por categoria, evolução do saldo)
- PWA instalável no celular

Quando sugerir melhorias para o app, seja criativo e pense no que seria mais útil para controle financeiro pessoal e empresarial.
Quando falar de valores, use sempre o formato brasileiro (R$ 1.234,56).`

  // Chamar Claude via Anthropic protocol
  const response = await fetch(`${BTY_LLM_BASE}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': BTY_LLM_KEY,
      'anthropic-version': '2023-06-01',
      'x-bty-business': 'ReActUs',
      'x-bty-workspace': 'default',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.6',
      max_tokens: 1024,
      stream: false,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('LLM error:', err)
    return NextResponse.json({ error: 'LLM_ERROR' }, { status: 500 })
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content?.find(c => c.type === 'text')?.text ?? 'Desculpe, não consegui responder agora.'

  return NextResponse.json({ reply: text })
}
