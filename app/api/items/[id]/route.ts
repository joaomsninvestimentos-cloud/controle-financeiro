import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, contaMembers } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

const patchSchema = z.object({
  descricao: z.string().min(1).max(200).optional(),
  valor: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  tipo: z.enum(['receita', 'despesa']).optional(),
  categoria: z.string().min(1).max(50).optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  contaId: z.string().nullable().optional(),
  recorrente: z.boolean().optional(),
})

// Verifica se o usuário pode modificar o item:
// - é o próprio autor, OU
// - é dono da conta a que o item pertence
async function canModify(userId: string, itemId: string): Promise<boolean> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId))
  if (!item) return false
  // Próprio autor
  if (item.userId === userId) return true
  // Dono da conta
  if (item.contaId) {
    const [conta] = await db
      .select()
      .from(contas)
      .where(and(eq(contas.id, item.contaId), eq(contas.userId, userId)))
    if (conta) return true
  }
  return false
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.data && !parsed.data.mes) {
    updates.mes = parsed.data.data.substring(0, 7)
  }

  const [updated] = await db
    .update(items)
    .set(updates)
    .where(eq(items.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ item: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const deleted = await db.delete(items).where(eq(items.id, id)).returning()
  if (!deleted.length) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
