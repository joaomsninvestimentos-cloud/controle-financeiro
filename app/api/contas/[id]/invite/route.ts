import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { contaMembers, contas } from '@/db/schemas/schema'
import { and, eq } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { criarConvite } from '@/lib/contas-db'
import { DIAS_VALIDADE_CONVITE, linkConvite, linkWhatsApp } from '@/lib/contas-logic'
import { z } from 'zod'

/**
 * POST /api/contas/[id]/invite
 * Gera um convite por link/código. O e-mail é OPCIONAL: o link funciona mesmo
 * para quem ainda não tem conta (o aceite fica em /convite/[token]).
 */
const inviteSchema = z.object({
  email: z.string().email().optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id: contaId } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = inviteSchema.safeParse(body ?? {})
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const convite = await criarConvite(contaId, ctx.user.id, { email: parsed.data.email ?? null })
  // null = conta não existe ou não é do usuário
  if (!convite) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const origem = req.nextUrl.origin
  const link = linkConvite(origem, convite.token)

  if (convite.jaMembro) {
    return NextResponse.json({
      ok: true,
      jaMembro: true,
      message: 'Essa pessoa já participa desta conta.',
    })
  }

  return NextResponse.json({
    ok: true,
    token: convite.token,
    link,
    whatsapp: linkWhatsApp(link, convite.nomeConta, ctx.user.name),
    expiraEm: convite.expiraEm.toISOString(),
    diasValidade: DIAS_VALIDADE_CONVITE,
    email: convite.email,
    message: 'Convite criado. Copie o link ou envie no WhatsApp (vale 7 dias).',
  }, { status: 201 })
}

// DELETE /api/contas/[id]/invite?memberId=... — remover membro/convite
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

  const [conta] = await db
    .select()
    .from(contas)
    .where(and(eq(contas.id, contaId), eq(contas.userId, ctx.user.id)))
  if (!conta) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  await db
    .delete(contaMembers)
    .where(and(eq(contaMembers.id, memberId), eq(contaMembers.contaId, contaId)))

  return NextResponse.json({ ok: true })
}
