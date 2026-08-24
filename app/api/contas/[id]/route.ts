import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { contas, contaMembers, users } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

const patchSchema = z.object({
  nome: z.string().min(1).max(50).optional(),
  cor: z.string().optional(),
  emoji: z.string().optional(),
  saldoInicial: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  saldoInicialMes: z.string().optional(),
  ativa: z.boolean().optional(),
})

async function canAccess(userId: string, contaId: string) {
  // Owner
  const [conta] = await db.select().from(contas).where(and(eq(contas.id, contaId), eq(contas.userId, userId)))
  if (conta) return { conta, isOwner: true }
  // Member
  const [member] = await db
    .select()
    .from(contaMembers)
    .where(and(eq(contaMembers.contaId, contaId), eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))
  if (member) {
    const [c] = await db.select().from(contas).where(eq(contas.id, contaId))
    return { conta: c, isOwner: false }
  }
  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const access = await canAccess(ctx.user.id, id)
  if (!access || !access.isOwner) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const [updated] = await db.update(contas).set(parsed.data).where(eq(contas.id, id)).returning()
  return NextResponse.json({ conta: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const access = await canAccess(ctx.user.id, id)
  if (!access || !access.isOwner) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  await db.delete(contas).where(eq(contas.id, id))
  return NextResponse.json({ ok: true })
}
