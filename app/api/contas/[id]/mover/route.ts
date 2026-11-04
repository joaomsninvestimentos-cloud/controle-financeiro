import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { previaTransferencia, transferirRegistros } from '@/lib/contas-db'
import { z } from 'zod'

const bodySchema = z.object({
  paraContaId: z.string().min(1),
  incluirLancamentos: z.boolean().default(true),
  incluirFixas: z.boolean().default(true),
  incluirOrcamentos: z.boolean().default(false),
})

/**
 * GET /api/contas/[id]/mover?paraContaId=...&...
 * Prévia: quantas fixas, lançamentos e orçamentos seriam movidos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const paraContaId = searchParams.get('paraContaId') ?? ''

  if (!paraContaId) {
    return NextResponse.json({ error: 'SEM_DESTINO', message: 'Escolha a conta de destino.' }, { status: 400 })
  }
  if (paraContaId === id) {
    return NextResponse.json({ error: 'MESMA_CONTA', message: 'Escolha uma conta diferente.' }, { status: 400 })
  }

  const previa = await previaTransferencia({
    userId: ctx.user.id,
    deContaId: id,
    paraContaId,
    incluirLancamentos: searchParams.get('incluirLancamentos') !== '0',
    incluirFixas: searchParams.get('incluirFixas') !== '0',
    incluirOrcamentos: searchParams.get('incluirOrcamentos') === '1',
  })

  if (!previa) {
    return NextResponse.json({
      error: 'FORBIDDEN',
      message: 'Só quem criou a conta pode transferir, e o destino precisa ser acessível.',
    }, { status: 403 })
  }

  return NextResponse.json({ ok: true, ...previa })
}

/**
 * POST /api/contas/[id]/mover
 * Executa a transferência (troca só `conta_id`, numa transação).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT', message: 'Dados inválidos.' }, { status: 400 })
  }

  const { paraContaId, incluirLancamentos, incluirFixas, incluirOrcamentos } = parsed.data
  if (paraContaId === id) {
    return NextResponse.json({ error: 'MESMA_CONTA', message: 'Escolha uma conta diferente.' }, { status: 400 })
  }

  const resultado = await transferirRegistros({
    userId: ctx.user.id,
    deContaId: id,
    paraContaId,
    incluirLancamentos,
    incluirFixas,
    incluirOrcamentos,
  })

  if (!resultado) {
    return NextResponse.json({
      error: 'FORBIDDEN',
      message: 'Só quem criou a conta pode transferir, e o destino precisa ser acessível.',
    }, { status: 403 })
  }

  return NextResponse.json({ ok: true, ...resultado })
}
