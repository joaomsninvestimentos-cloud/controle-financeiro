import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { contas, contaMembers, items, orcamentos } from '@/db/schemas/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'
import { planMoveConta, validateMoveInput } from '@/lib/contas-logic'

const bodySchema = z.object({
  paraContaId: z.string().min(1),
  incluirLancamentos: z.boolean().optional().default(true),
  incluirOrcamentos: z.boolean().optional().default(false),
})

async function isOwner(userId: string, contaId: string) {
  const [conta] = await db
    .select()
    .from(contas)
    .where(and(eq(contas.id, contaId), eq(contas.userId, userId)))
  return conta ?? null
}

async function canAccess(userId: string, contaId: string) {
  const owned = await isOwner(userId, contaId)
  if (owned) return { conta: owned, isOwner: true }
  const [member] = await db
    .select()
    .from(contaMembers)
    .where(and(
      eq(contaMembers.contaId, contaId),
      eq(contaMembers.userId, userId),
      eq(contaMembers.status, 'active'),
    ))
  if (member) {
    const [c] = await db.select().from(contas).where(eq(contas.id, contaId))
    return c ? { conta: c, isOwner: false } : null
  }
  return null
}

async function loadPlan(
  deContaId: string,
  paraContaId: string,
  incluirLancamentos: boolean,
  incluirOrcamentos: boolean,
) {
  const [itensOrigem, orcsOrigem, orcsDestino] = await Promise.all([
    db.select({
      id: items.id,
      contaId: items.contaId,
      recorrente: items.recorrente,
    }).from(items).where(eq(items.contaId, deContaId)),
    db.select({
      id: orcamentos.id,
      contaId: orcamentos.contaId,
      mes: orcamentos.mes,
      categoria: orcamentos.categoria,
    }).from(orcamentos).where(eq(orcamentos.contaId, deContaId)),
    db.select({
      id: orcamentos.id,
      contaId: orcamentos.contaId,
      mes: orcamentos.mes,
      categoria: orcamentos.categoria,
    }).from(orcamentos).where(eq(orcamentos.contaId, paraContaId)),
  ])

  return planMoveConta({
    deContaId,
    incluirLancamentos,
    incluirOrcamentos,
    items: itensOrigem,
    orcamentosOrigem: orcsOrigem,
    orcamentosDestino: orcsDestino,
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const paraContaId = req.nextUrl.searchParams.get('paraContaId') ?? ''
  const incluirLancamentos = req.nextUrl.searchParams.get('incluirLancamentos') !== '0'
  const incluirOrcamentos = req.nextUrl.searchParams.get('incluirOrcamentos') === '1'

  const invalid = validateMoveInput(id, paraContaId)
  if (invalid === 'MISSING_DESTINATION') {
    return NextResponse.json({ error: 'MISSING_DESTINATION' }, { status: 400 })
  }
  if (invalid === 'SAME_ACCOUNT') {
    return NextResponse.json({ error: 'SAME_ACCOUNT' }, { status: 400 })
  }

  const origem = await isOwner(ctx.user.id, id)
  if (!origem) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const destino = await canAccess(ctx.user.id, paraContaId)
  if (!destino) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const plan = await loadPlan(id, paraContaId, incluirLancamentos, incluirOrcamentos)
  return NextResponse.json({ ok: true, ...plan.counts })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const { paraContaId, incluirLancamentos, incluirOrcamentos } = parsed.data
  const invalid = validateMoveInput(id, paraContaId)
  if (invalid === 'MISSING_DESTINATION') {
    return NextResponse.json({ error: 'MISSING_DESTINATION' }, { status: 400 })
  }
  if (invalid === 'SAME_ACCOUNT') {
    return NextResponse.json({ error: 'SAME_ACCOUNT' }, { status: 400 })
  }

  const origem = await isOwner(ctx.user.id, id)
  if (!origem) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const destino = await canAccess(ctx.user.id, paraContaId)
  if (!destino) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const plan = await loadPlan(id, paraContaId, incluirLancamentos, incluirOrcamentos)

  if (plan.itemIds.length > 0) {
    await db.update(items).set({ contaId: paraContaId }).where(inArray(items.id, plan.itemIds))
  }
  if (plan.orcamentoIds.length > 0) {
    await db.update(orcamentos).set({ contaId: paraContaId }).where(inArray(orcamentos.id, plan.orcamentoIds))
  }

  return NextResponse.json({ ok: true, ...plan.counts })
}
