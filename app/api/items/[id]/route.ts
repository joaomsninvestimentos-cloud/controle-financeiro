import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, contaMembers } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { criarRecorrencia, propagarEdicao, pularMes } from '@/lib/recorrencia-db'
import { z } from 'zod'

const patchSchema = z.object({
  descricao: z.string().min(1).max(200).optional(),
  valor: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  tipo: z.enum(['receita', 'despesa']).optional(),
  categoria: z.string().min(1).max(50).optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  contaId: z.string().nullable().optional(),
  recorrente: z.boolean().optional(),
})

// Verifica se o usuário pode modificar o item:
// - é o próprio autor, OU
// - é dono da conta a que o item pertence
async function canModify(userId: string, itemId: string): Promise<boolean> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId))
  if (!item) return false
  // Próprio autor
  if (item.userId === userId) return true
  // Dono da conta
  if (item.contaId) {
    const [conta] = await db
      .select()
      .from(contas)
      .where(and(eq(contas.id, item.contaId), eq(contas.userId, userId)))
    if (conta) return true
  }
  return false
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const [atual] = await db.select().from(items).where(eq(items.id, id))
  if (!atual) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.data && !parsed.data.mes) {
    updates.mes = parsed.data.data.substring(0, 7)
  }

  // Marcou como despesa fixa um lançamento avulso → cria a série a partir dele.
  if (parsed.data.recorrente === true && !atual.recorrenciaId) {
    const criada = await criarRecorrencia({
      userId: ctx.user.id,
      contaId: atual.contaId,
      descricao: parsed.data.descricao ?? atual.descricao,
      valor: parsed.data.valor ?? atual.valor,
      tipo: parsed.data.tipo ?? atual.tipo,
      categoria: parsed.data.categoria ?? atual.categoria,
      data: parsed.data.data ?? atual.data,
    })
    await db.delete(items).where(eq(items.id, id))
    const itemSerie = criada.primeiroItem
      ? await db.select().from(items).where(eq(items.id, criada.primeiroItem.id))
      : []
    return NextResponse.json({
      item: itemSerie[0] ?? criada.primeiroItem,
      recorrencia: criada.recorrencia,
      geradas: criada.geradas,
    })
  }

  // Desmarcou "despesa fixa" nesta ocorrência → só ela sai da série.
  if (parsed.data.recorrente === false && atual.recorrenciaId) {
    updates.recorrenciaId = null
  }

  const [updated] = await db
    .update(items)
    .set(updates)
    .where(eq(items.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Faz parte de uma despesa fixa: a edição vale deste mês em diante.
  if (atual.recorrenciaId && parsed.data.recorrente !== false) {
    await propagarEdicao(atual, {
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      tipo: parsed.data.tipo,
      categoria: parsed.data.categoria,
      contaId: parsed.data.contaId,
      data: parsed.data.data,
    })
  }

  return NextResponse.json({ item: updated, recorrenciaId: updated.recorrenciaId ?? null })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const [atual] = await db.select().from(items).where(eq(items.id, id))
  if (!atual) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Excluir a ocorrência de uma despesa fixa = pular aquele mês (não volta).
  if (atual.recorrenciaId) {
    const resultado = await pularMes(ctx.user.id, atual.recorrenciaId, atual.mes)
    if (!resultado) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ ok: true, pulouMes: atual.mes, recorrenciaId: atual.recorrenciaId })
  }

  const deleted = await db.delete(items).where(eq(items.id, id)).returning()
  if (!deleted.length) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
