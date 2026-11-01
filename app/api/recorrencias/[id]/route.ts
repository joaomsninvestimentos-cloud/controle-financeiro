import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { encerrarRecorrencia, pularMes } from '@/lib/recorrencia-db'
import { z } from 'zod'

const bodySchema = z.object({
  acao: z.enum(['encerrar', 'pular']).default('encerrar'),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
})

/**
 * PATCH /api/recorrencias/[id]
 * { acao: 'encerrar', mes } → para de gerar depois de `mes` (histórico fica).
 * { acao: 'pular', mes }    → remove só a ocorrência daquele mês.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const { acao, mes } = parsed.data

  if (acao === 'pular') {
    const resultado = await pularMes(ctx.user.id, id, mes)
    if (!resultado) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ ok: true, acao, removidas: resultado.removidas })
  }

  const resultado = await encerrarRecorrencia(ctx.user.id, id, mes)
  if (!resultado) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    acao,
    recorrencia: resultado.recorrencia,
    removidas: resultado.removidas,
  })
}

/** DELETE é equivalente a encerrar a série no mês informado (?mes=YYYY-MM). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') ?? ''
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const resultado = await encerrarRecorrencia(ctx.user.id, id, mes)
  if (!resultado) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  return NextResponse.json({ ok: true, recorrencia: resultado.recorrencia, removidas: resultado.removidas })
}
