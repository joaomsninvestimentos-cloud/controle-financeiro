import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { corrigirEspelhos, diagnosticarEspelhosDoUsuario } from '@/lib/espelho-db'

/**
 * GET /api/espelhos/diagnostico
 * Diz por que um lançamento marcado como "da casa" pode não estar aparecendo
 * lá: cópia faltando, na conta errada, sem conta, duplicada ou órfã.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const diagnostico = await diagnosticarEspelhosDoUsuario(ctx.user.id)
  return NextResponse.json({ ...diagnostico, acoes: diagnostico.plano.length })
}

/**
 * POST /api/espelhos/diagnostico
 * Executa o conserto do que é corrigível (o plano é recalculado no servidor,
 * nunca vem do cliente).
 */
export async function POST() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const antes = await diagnosticarEspelhosDoUsuario(ctx.user.id)

  if (antes.plano.length === 0) {
    return NextResponse.json({
      ok: true,
      nada: true,
      antes: antes.resumo,
      resultado: { criados: 0, movidos: 0, apagados: 0, falhas: 0 },
      depois: antes.resumo,
    })
  }

  const resultado = await corrigirEspelhos(ctx.user.id, antes.plano)
  const depois = await diagnosticarEspelhosDoUsuario(ctx.user.id)

  return NextResponse.json({
    ok: true,
    antes: antes.resumo,
    resultado,
    depois: depois.resumo,
    restantes: depois.problemas.filter(p => p.corrigivel).length,
  })
}
