import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, contaMembers } from '@/db/schemas/schema'
import { eq, and } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { criarRecorrencia, propagarEdicao, pularMes } from '@/lib/recorrencia-db'
import {
  criarEspelhoDoItem,
  definirEspelhoDaSerie,
  ensureEspelhoSchema,
  garantirEspelhoDoItem,
  mapaEspelhos,
  removerEspelhosDoItem,
  sincronizarLadoOposto,
} from '@/lib/espelho-db'
import { recorrencias } from '@/db/schemas/schema'
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
  // Espelho da casa: id da conta da casa (string) para ligar, null para desligar.
  espelharNaContaId: z.string().nullable().optional(),
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

    // Membro ativo de uma conta da casa: pode editar o que está nela
    // (inclui os espelhos de despesas pagas pelo outro).
    const [membro] = await db
      .select()
      .from(contaMembers)
      .where(and(
        eq(contaMembers.contaId, item.contaId),
        eq(contaMembers.userId, userId),
        eq(contaMembers.status, 'active'),
      ))
    if (membro) return true
  }
  return false
}

/** A conta é uma conta da casa acessível ao usuário? */
async function casaAcessivel(userId: string, contaId: string): Promise<boolean> {
  const [conta] = await db.select().from(contas).where(eq(contas.id, contaId))
  if (!conta || conta.tipo !== 'casa') return false
  if (conta.userId === userId) return true

  const [membro] = await db
    .select()
    .from(contaMembers)
    .where(and(
      eq(contaMembers.contaId, contaId),
      eq(contaMembers.userId, userId),
      eq(contaMembers.status, 'active'),
    ))
  return !!membro
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureEspelhoSchema()

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const [atual] = await db.select().from(items).where(eq(items.id, id))
  if (!atual) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const { espelharNaContaId: _espelho, ...camposItem } = parsed.data
  void _espelho
  const updates: Record<string, unknown> = { ...camposItem }
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

    // Se o usuário marcou "também é da casa" nesta mesma edição, o espelho
    // precisa nascer junto — antes este caminho devolvia cedo e descartava a
    // marca (o "marco e nada acontece" em lançamentos recorrentes antigos).
    if (parsed.data.espelharNaContaId) {
      const destino = parsed.data.espelharNaContaId
      const ok = await casaAcessivel(ctx.user.id, destino)
      if (!ok) {
        return NextResponse.json({
          error: 'ESPELHO_DESTINO_INVALIDO',
          message: 'Essa conta não é uma conta da casa que você participa.',
        }, { status: 400 })
      }
      try {
        await definirEspelhoDaSerie(criada.recorrencia.id, destino)
      } catch (err) {
        console.error('espelho ao criar série falhou', err)
        return NextResponse.json({
          error: 'ESPELHO_FALHOU',
          message: 'A despesa fixa foi criada, mas o espelho na casa falhou. Abra a aba Fixas e toque em "Também é da casa".',
        }, { status: 500 })
      }
    }

    const itemSerie = criada.primeiroItem
      ? await db.select().from(items).where(eq(items.id, criada.primeiroItem.id))
      : []
    const espelhos = criada.primeiroItem ? await mapaEspelhos([criada.primeiroItem.id]) : new Map()
    const primeiro = itemSerie[0] ?? criada.primeiroItem
    return NextResponse.json({
      item: primeiro
        ? { ...primeiro, espelhadoNaContaId: espelhos.get(primeiro.id) ?? null }
        : primeiro,
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

  // Liga/desliga o espelho na casa (antes de propagar, para pegar a série toda).
  // Nenhum caminho aqui é silencioso: se não der para espelhar, devolve erro.
  if (parsed.data.espelharNaContaId !== undefined) {
    const destino = parsed.data.espelharNaContaId
    if (destino) {
      const ok = await casaAcessivel(ctx.user.id, destino)
      if (!ok) {
        return NextResponse.json({
          error: 'ESPELHO_DESTINO_INVALIDO',
          message: 'Essa conta não é uma conta da casa que você participa.',
        }, { status: 400 })
      }
      if (atual.espelhoDe) {
        return NextResponse.json({
          error: 'JA_E_ESPELHO',
          message: 'Esta é uma cópia. Ligue o espelho no lançamento original.',
        }, { status: 400 })
      }

      try {
        if (atual.recorrenciaId) {
          const criados = await definirEspelhoDaSerie(atual.recorrenciaId, destino)
          // Série sem ocorrências antigas? garante ao menos a deste mês.
          if (criados === 0) await garantirEspelhoDoItem(updated, destino)
        } else {
          await criarEspelhoDoItem(updated, destino)
        }
      } catch (err) {
        console.error('espelho (PATCH) falhou', err)
        return NextResponse.json({
          error: 'ESPELHO_FALHOU',
          message: 'Não foi possível espelhar na conta da casa. Tente de novo.',
        }, { status: 500 })
      }
    } else if (atual.recorrenciaId) {
      await definirEspelhoDaSerie(atual.recorrenciaId, null)
    } else {
      await removerEspelhosDoItem(atual.id)
    }
  }

  // Auto-reparo: se a série pede espelho e a cópia desapareceu, recria.
  if (atual.recorrenciaId) {
    const [serie] = await db
      .select({ destino: recorrencias.espelharContaId })
      .from(recorrencias)
      .where(eq(recorrencias.id, atual.recorrenciaId))
    if (serie?.destino) await garantirEspelhoDoItem(updated, serie.destino)
  }

  // Mantém o outro lado igual: origem ↔ espelho representam a mesma despesa.
  if (!parsed.data.espelharNaContaId) {
    const { espelharNaContaId: _ignorado, ...campos } = parsed.data
    void _ignorado
    await sincronizarLadoOposto(atual, campos)
  }

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

  const espelhos = await mapaEspelhos([updated.id])
  return NextResponse.json({
    item: { ...updated, espelhadoNaContaId: espelhos.get(updated.id) ?? null },
    recorrenciaId: updated.recorrenciaId ?? null,
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureEspelhoSchema()

  const { id } = await params
  const ok = await canModify(ctx.user.id, id)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const [atual] = await db.select().from(items).where(eq(items.id, id))
  if (!atual) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // É um espelho: apagar aqui NÃO apaga o lançamento de quem pagou
  // e NÃO pula o mês da série.
  if (atual.espelhoDe) {
    await db.delete(items).where(eq(items.id, id))
    return NextResponse.json({ ok: true, eraEspelho: true, origemId: atual.espelhoDe })
  }

  // Origem com espelho: a cópia sai junto (senão ficaria órfã na casa).
  const copiasRemovidas = await removerEspelhosDoItem(id)

  // Excluir a ocorrência de uma despesa fixa = pular aquele mês (não volta).
  if (atual.recorrenciaId) {
    const resultado = await pularMes(ctx.user.id, atual.recorrenciaId, atual.mes)
    if (!resultado) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({
      ok: true, pulouMes: atual.mes, recorrenciaId: atual.recorrenciaId, copiasRemovidas,
    })
  }

  const deleted = await db.delete(items).where(eq(items.id, id)).returning()
  if (!deleted.length) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true, copiasRemovidas })
}
