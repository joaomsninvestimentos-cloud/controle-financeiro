import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { consolidarDuplicadas, listarDuplicadas } from '@/lib/recorrencia-db'
import { z } from 'zod'

/**
 * GET /api/recorrencias/duplicadas
 * Lista as despesas fixas que existem mais de uma vez na mesma conta.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const duplicadas = await listarDuplicadas(ctx.user.id)
  return NextResponse.json({ duplicadas })
}

const bodySchema = z.object({
  manterId: z.string().min(1),
  juntarIds: z.array(z.string().min(1)).min(1).max(20),
})

/**
 * POST /api/recorrencias/duplicadas
 * { manterId, juntarIds } → junta as séries na principal, sem duplicar meses.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const { manterId, juntarIds } = parsed.data
  if (juntarIds.includes(manterId)) {
    return NextResponse.json({
      error: 'MANTER_ENTRE_JUNTAR',
      message: 'A série que fica não pode estar na lista das que serão juntadas.',
    }, { status: 400 })
  }

  const resultado = await consolidarDuplicadas(ctx.user.id, manterId, juntarIds)
  if (!resultado) {
    return NextResponse.json({
      error: 'FORBIDDEN',
      message: 'Você não tem acesso a uma dessas despesas fixas.',
    }, { status: 403 })
  }

  return NextResponse.json({ ok: true, ...resultado })
}
