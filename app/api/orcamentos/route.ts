import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { orcamentos } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  categoria: z.string().min(1),
  limite: z.string().regex(/^\d+(\.\d{1,2})?$/),
  contaId: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')

  const conditions = [eq(orcamentos.userId, ctx.user.id)]
  if (mes) conditions.push(eq(orcamentos.mes, mes))

  const result = await db.select().from(orcamentos).where(and(...conditions))
  return NextResponse.json({ orcamentos: result })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  // Upsert: se já existe orçamento para esse mês+categoria, atualiza
  const existing = await db
    .select()
    .from(orcamentos)
    .where(and(
      eq(orcamentos.userId, ctx.user.id),
      eq(orcamentos.mes, parsed.data.mes),
      eq(orcamentos.categoria, parsed.data.categoria),
    ))

  if (existing.length > 0) {
    const [updated] = await db
      .update(orcamentos)
      .set({ limite: parsed.data.limite })
      .where(eq(orcamentos.id, existing[0].id))
      .returning()
    return NextResponse.json({ orcamento: updated })
  }

  const id = crypto.randomUUID()
  const [orc] = await db.insert(orcamentos).values({
    id,
    userId: ctx.user.id,
    contaId: parsed.data.contaId ?? null,
    mes: parsed.data.mes,
    categoria: parsed.data.categoria,
    limite: parsed.data.limite,
  }).returning()

  return NextResponse.json({ orcamento: orc }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 })

  await db.delete(orcamentos).where(and(eq(orcamentos.id, id), eq(orcamentos.userId, ctx.user.id)))
  return NextResponse.json({ ok: true })
}
