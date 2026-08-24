import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, contaMembers, users } from '@/db/schemas/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

const itemSchema = z.object({
  descricao: z.string().min(1).max(200),
  valor: z.string().regex(/^\d+(\.\d{1,2})?$/).refine(v => parseFloat(v) > 0),
  tipo: z.enum(['receita', 'despesa']),
  categoria: z.string().min(1).max(50),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  contaId: z.string().nullable().optional(),
  recorrente: z.boolean().optional().default(false),
})

const bodySchema = z.union([itemSchema, z.array(itemSchema).min(1).max(50)])

async function getContasAcessiveis(userId: string): Promise<string[]> {
  const proprias = await db.select({ id: contas.id }).from(contas).where(eq(contas.userId, userId))
  const membros = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))
  return [...proprias.map(c => c.id), ...membros.map(m => m.contaId)]
}

// Contas onde o usuário é dono
async function getContasProprias(userId: string): Promise<string[]> {
  const proprias = await db.select({ id: contas.id }).from(contas).where(eq(contas.userId, userId))
  return proprias.map(c => c.id)
}

// Enriches items with author name/email
async function enrichItems(rows: typeof items.$inferSelect[]) {
  const userIds = [...new Set(rows.map(i => i.userId))]
  if (userIds.length === 0) return rows.map(i => ({ ...i, autorNome: null, autorEmail: null }))

  const autores = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, userIds))

  const mapaAutores = Object.fromEntries(autores.map(u => [u.id, u]))

  return rows.map(i => ({
    ...i,
    autorNome: mapaAutores[i.userId]?.name ?? null,
    autorEmail: mapaAutores[i.userId]?.email ?? null,
  }))
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const contaId = searchParams.get('contaId')
  const todos = searchParams.get('todos') === '1'

  if (contaId) {
    const acessiveis = await getContasAcessiveis(ctx.user.id)
    if (!acessiveis.includes(contaId)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    const conditions = [eq(items.contaId, contaId)]
    if (mes && !todos) conditions.push(eq(items.mes, mes))

    const rows = await db
      .select()
      .from(items)
      .where(and(...conditions))
      .orderBy(desc(items.data), desc(items.createdAt))

    return NextResponse.json({ items: await enrichItems(rows) })
  }

  const conditions = [eq(items.userId, ctx.user.id)]
  if (mes && !todos) conditions.push(eq(items.mes, mes))

  const rows = await db
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.data), desc(items.createdAt))

  return NextResponse.json({ items: await enrichItems(rows) })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const itemsToInsert = Array.isArray(parsed.data) ? parsed.data : [parsed.data]

  const contaIds = [...new Set(itemsToInsert.map(i => i.contaId).filter(Boolean) as string[])]
  if (contaIds.length > 0) {
    const acessiveis = await getContasAcessiveis(ctx.user.id)
    const bloqueadas = contaIds.filter(id => !acessiveis.includes(id))
    if (bloqueadas.length > 0) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const rows = itemsToInsert.map(d => ({
    id: crypto.randomUUID(),
    userId: ctx.user.id,
    contaId: d.contaId ?? null,
    descricao: d.descricao,
    valor: d.valor,
    tipo: d.tipo,
    categoria: d.categoria,
    data: d.data,
    mes: d.mes,
    recorrente: d.recorrente ?? false,
  }))

  const inserted = await db.insert(items).values(rows).returning()
  const enriched = await enrichItems(inserted)

  if (Array.isArray(parsed.data)) {
    return NextResponse.json({ items: enriched }, { status: 201 })
  }
  return NextResponse.json({ item: enriched[0] }, { status: 201 })
}
