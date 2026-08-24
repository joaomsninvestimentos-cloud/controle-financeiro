import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { contas, contaMembers, users } from '@/db/schemas/schema'
import { eq, and, or } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(1).max(50),
  cor: z.string().default('#8FB39A'),
  emoji: z.string().default('🏦'),
  saldoInicial: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  saldoInicialMes: z.string().regex(/^\d{4}-\d{2}$/).default(''),
})

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  // Contas próprias
  const proprias = await db.select().from(contas).where(eq(contas.userId, ctx.user.id))

  // Contas compartilhadas (onde o usuário é membro ativo)
  const memberships = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, ctx.user.id), eq(contaMembers.status, 'active')))

  const sharedIds = memberships.map(m => m.contaId)
  let shared: typeof proprias = []
  if (sharedIds.length > 0) {
    const results = await Promise.all(
      sharedIds.map(id => db.select().from(contas).where(eq(contas.id, id)))
    )
    shared = results.flat()
  }

  // Para cada conta, buscar membros
  const todasContas = [...proprias, ...shared]
  const contasComMembros = await Promise.all(
    todasContas.map(async (c) => {
      const membros = await db
        .select({
          id: contaMembers.id,
          userId: contaMembers.userId,
          role: contaMembers.role,
          inviteEmail: contaMembers.inviteEmail,
          status: contaMembers.status,
        })
        .from(contaMembers)
        .where(eq(contaMembers.contaId, c.id))

      // Buscar nomes dos membros ativos
      const membrosComNome = await Promise.all(
        membros.map(async (m) => {
          if (!m.userId) return { ...m, userName: null }
          const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, m.userId))
          return { ...m, userName: u?.name ?? null, userEmail: u?.email ?? null }
        })
      )

      return {
        ...c,
        isOwner: c.userId === ctx.user.id,
        membros: membrosComNome,
      }
    })
  )

  return NextResponse.json({ contas: contasComMembros })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const id = crypto.randomUUID()
  const [conta] = await db.insert(contas).values({
    id,
    userId: ctx.user.id,
    nome: parsed.data.nome,
    cor: parsed.data.cor,
    emoji: parsed.data.emoji,
    saldoInicial: parsed.data.saldoInicial,
    saldoInicialMes: parsed.data.saldoInicialMes,
    ativa: true,
  }).returning()

  return NextResponse.json({ conta: { ...conta, isOwner: true, membros: [] } }, { status: 201 })
}
