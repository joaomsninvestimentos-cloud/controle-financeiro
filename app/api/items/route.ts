import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { items, contas, contaMembers, users } from '@/db/schemas/schema'
import { eq, desc, and, inArray, or } from 'drizzle-orm'
import { getAuthContext } from '@/lib/auth'
import { criarRecorrencia, sincronizarRecorrencias, migrarRecorrentesLegados } from '@/lib/recorrencia-db'
import {
  criarEspelhoDoItem,
  definirEspelhoDaSerie,
  ensureEspelhoSchema,
  mapaEspelhos,
} from '@/lib/espelho-db'
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
  // Despesa fixa: "repete até" opcional (YYYY-MM). Ausente = até encerrar.
  recorrenteAte: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  // Despesa da casa paga pela conta pessoal: cria a cópia espelhada na casa.
  espelharNaContaId: z.string().nullable().optional(),
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

// Enriches items with author name/email
async function enrichItems(rows: typeof items.$inferSelect[]) {
  const userIds = [...new Set(rows.map(i => i.userId))]
  const espelhos = await mapaEspelhos(rows.map(i => i.id))
  const comEspelho = (lista: Array<Record<string, unknown>>) =>
    lista.map(i => ({ ...i, espelhadoNaContaId: espelhos.get(String(i.id)) ?? null }))

  if (userIds.length === 0) return comEspelho(rows.map(i => ({ ...i, autorNome: null, autorEmail: null })))

  const autores = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, userIds))

  const mapaAutores = Object.fromEntries(autores.map(u => [u.id, u]))

  return comEspelho(rows.map(i => ({
    ...i,
    autorNome: mapaAutores[i.userId]?.name ?? null,
    autorEmail: mapaAutores[i.userId]?.email ?? null,
  })))
}

/** A conta informada é uma conta da casa que o usuário acessa? */
async function contaDaCasaAcessivel(userId: string, contaId: string): Promise<boolean> {
  const acessiveis = await getContasAcessiveis(userId)
  if (!acessiveis.includes(contaId)) return false
  const [conta] = await db.select({ tipo: contas.tipo }).from(contas).where(eq(contas.id, contaId))
  return conta?.tipo === 'casa'
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.authorized) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureEspelhoSchema()

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const contaId = searchParams.get('contaId')
  const todos = searchParams.get('todos') === '1'

  if (contaId) {
    const acessiveis = await getContasAcessiveis(ctx.user.id)
    if (!acessiveis.includes(contaId)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    if (mes && !todos) {
      await migrarRecorrentesLegados(ctx.user.id)
      await sincronizarRecorrencias(ctx.user.id, mes)
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

  // Antes de listar o mês, garante as ocorrências das despesas fixas.
  if (mes && !todos) {
    await migrarRecorrentesLegados(ctx.user.id)
    await sincronizarRecorrencias(ctx.user.id, mes)
  }

  const acessiveis = await getContasAcessiveis(ctx.user.id)
  const visibilidade = acessiveis.length > 0
    ? or(eq(items.userId, ctx.user.id), inArray(items.contaId, acessiveis))
    : eq(items.userId, ctx.user.id)

  const conditions = [visibilidade]
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

  await ensureEspelhoSchema()

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

  // Destinos de espelho: precisam ser conta da casa acessível ao usuário.
  for (const d of itemsToInsert) {
    if (!d.espelharNaContaId) continue
    const ok = await contaDaCasaAcessivel(ctx.user.id, d.espelharNaContaId)
    if (!ok) return NextResponse.json({ error: 'ESPELHO_DESTINO_INVALIDO' }, { status: 400 })
  }

  const fixas = itemsToInsert.filter(d => d.recorrente)
  const avulsos = itemsToInsert.filter(d => !d.recorrente)

  const inseridos: typeof items.$inferSelect[] = []
  const series: Array<{ id: string; descricao: string; mesFim: string | null; geradas: number }> = []
  let geradas = 0

  for (const d of fixas) {
    const resultado = await criarRecorrencia({
      userId: ctx.user.id,
      contaId: d.contaId ?? null,
      descricao: d.descricao,
      valor: d.valor,
      tipo: d.tipo,
      categoria: d.categoria,
      data: d.data,
      ate: d.recorrenteAte ?? null,
    })
    if (resultado.primeiroItem) inseridos.push(resultado.primeiroItem)
    geradas += resultado.geradas
    // Despesa fixa marcada como "da casa": espelha a série inteira.
    if (d.espelharNaContaId) {
      await definirEspelhoDaSerie(resultado.recorrencia.id, d.espelharNaContaId)
    }
    series.push({
      id: resultado.recorrencia.id,
      descricao: resultado.recorrencia.descricao,
      mesFim: resultado.recorrencia.mesFim,
      geradas: resultado.geradas,
    })
  }

  if (avulsos.length > 0) {
    const rows = avulsos.map(d => ({
      id: crypto.randomUUID(),
      userId: ctx.user.id,
      contaId: d.contaId ?? null,
      descricao: d.descricao,
      valor: d.valor,
      tipo: d.tipo,
      categoria: d.categoria,
      data: d.data,
      mes: d.mes,
      recorrente: false,
    }))
    const inserted = await db.insert(items).values(rows).returning()
    inseridos.push(...inserted)

    // Lançamentos avulsos marcados como "da casa": cria a cópia na casa.
    for (let i = 0; i < inserted.length; i++) {
      const destino = avulsos[i]?.espelharNaContaId
      if (destino) await criarEspelhoDoItem(inserted[i], destino)
    }
  }

  const enriched = await enrichItems(inseridos)

  if (Array.isArray(parsed.data)) {
    return NextResponse.json({ items: enriched, recorrencias: series, geradas }, { status: 201 })
  }
  return NextResponse.json({
    item: enriched[0],
    recorrencia: series[0] ?? null,
    geradas: series[0]?.geradas ?? 0,
  }, { status: 201 })
}
