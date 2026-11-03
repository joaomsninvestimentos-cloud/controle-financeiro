import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { aceitarConvite, infoConvite } from '@/lib/contas-db'

/**
 * GET  /api/convites/[token] → dados públicos do convite (tela /convite/[token])
 * POST /api/convites/[token] → aceita o convite (exige sessão)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || token.length > 64) {
    return NextResponse.json({ valido: false, motivo: 'invalido' })
  }

  const ctx = await getAuthContext()
  const info = await infoConvite(token, ctx.authorized ? ctx.user.id : undefined)

  return NextResponse.json({
    ...info,
    logado: ctx.authorized,
    usuario: ctx.authorized ? { name: ctx.user.name, email: ctx.user.email } : null,
  })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { token } = await params
  const resultado = await aceitarConvite(token, ctx.user.id)

  if (!resultado.ok) {
    const status = resultado.motivo === 'invalido' ? 404 : 409
    return NextResponse.json({ error: 'CONVITE_INVALIDO', motivo: resultado.motivo }, { status })
  }

  return NextResponse.json({
    ok: true,
    contaId: resultado.contaId,
    contaNome: resultado.contaNome,
  })
}
