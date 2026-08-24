import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { contas, contaMembers, users } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { z } from 'zod'

// POST /api/contas/[id]/invite  — convidar por email
const inviteSchema = z.object({ email: z.string().email() })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id: contaId } = await params

  // Apenas dono pode convidar
  const [conta] = await db.select().from(contas).where(and(eq(contas.id, contaId), eq(contas.userId, ctx.user.id)))
  if (!conta) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const email = parsed.data.email.toLowerCase()

  // Verificar se já existe convite/membro para este email
  const existing = await db
    .select()
    .from(contaMembers)
    .where(and(eq(contaMembers.contaId, contaId), eq(contaMembers.inviteEmail, email)))
  if (existing.length > 0) return NextResponse.json({ error: 'ALREADY_INVITED' }, { status: 409 })

  // Verificar se o usuário já existe
  const [targetUser] = await db.select().from(users).where(eq(users.email, email))

  const token = crypto.randomUUID()
  const memberId = crypto.randomUUID()

  await db.insert(contaMembers).values({
    id: memberId,
    contaId,
    userId: targetUser?.id ?? null,
    role: 'member',
    inviteEmail: email,
    inviteToken: token,
    status: targetUser ? 'active' : 'pending', // se já tem conta, ativa direto
  })

  return NextResponse.json({
    ok: true,
    token,
    userExists: !!targetUser,
    message: targetUser
      ? `${targetUser.name} foi adicionado à conta "${conta.nome}".`
      : `Convite gerado. Quando ${email} criar uma conta no app, o acesso será liberado automaticamente.`,
  }, { status: 201 })
}

// DELETE /api/contas/[id]/invite  — remover membro
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id: contaId } = await params
  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('memberId')
  if (!memberId) return NextResponse.json({ error: 'MISSING_MEMBER_ID' }, { status: 400 })

  // Apenas dono pode remover
  const [conta] = await db.select().from(contas).where(and(eq(contas.id, contaId), eq(contas.userId, ctx.user.id)))
  if (!conta) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  await db.delete(contaMembers).where(and(eq(contaMembers.id, memberId), eq(contaMembers.contaId, contaId)))
  return NextResponse.json({ ok: true })
}
