import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { db } from '@/db'
import { melhorias } from '@/db/schemas/schema'
import { eq, desc, and } from 'drizzle-orm'
import { ensureMelhoriasTable } from '@/lib/ensure-melhorias'
import { z } from 'zod'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureMelhoriasTable()
  const rows = await db
    .select()
    .from(melhorias)
    .where(eq(melhorias.userId, ctx.user.id))
    .orderBy(desc(melhorias.createdAt))
    .limit(50)

  return NextResponse.json({ melhorias: rows })
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['nova', 'lida', 'feita', 'descartada']),
})

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  await ensureMelhoriasTable()
  const [updated] = await db
    .update(melhorias)
    .set({ status: parsed.data.status })
    .where(and(eq(melhorias.id, parsed.data.id), eq(melhorias.userId, ctx.user.id)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ melhoria: updated })
}
