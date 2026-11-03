import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { criarConta, listarContas } from '@/lib/contas-db'
import { tipoValido } from '@/lib/contas-logic'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(1).max(50),
  cor: z.string().default('#8FB39A'),
  emoji: z.string().default('🏦'),
  saldoInicial: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  saldoInicialMes: z.string().regex(/^\d{4}-\d{2}$/).default(''),
  // 'pessoal' (privada, uma por usuário) | 'casa' (compartilhada)
  tipo: z.enum(['pessoal', 'casa']).default('pessoal'),
})

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  // Garante a conta pessoal (backfill para usuários criados antes disso)
  const contasDoUsuario = await listarContas(ctx.user.id, ctx.user.name)

  return NextResponse.json({ contas: contasDoUsuario })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const conta = await criarConta({
    userId: ctx.user.id,
    nome: parsed.data.nome,
    cor: parsed.data.cor,
    emoji: parsed.data.emoji,
    saldoInicial: parsed.data.saldoInicial,
    saldoInicialMes: parsed.data.saldoInicialMes,
    tipo: tipoValido(parsed.data.tipo) ? parsed.data.tipo : 'pessoal',
  })

  return NextResponse.json({ conta }, { status: 201 })
}
