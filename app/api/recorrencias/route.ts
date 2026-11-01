import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { listarRecorrencias, sincronizarRecorrencias } from '@/lib/recorrencia-db'

/**
 * GET /api/recorrencias?mes=YYYY-MM
 * Lista as despesas fixas ativas do usuário (próprias + contas compartilhadas).
 * Se `mes` vier na query, garante antes as ocorrências daquele mês.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const mesValido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null

  if (mesValido) await sincronizarRecorrencias(ctx.user.id, mesValido)

  const recorrencias = await listarRecorrencias(ctx.user.id)
  return NextResponse.json({ recorrencias })
}
