import 'server-only'

import { db } from '@/db'
import { items, recorrencias } from '@/db/schemas/schema'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { DDL_ESPELHO } from './espelho-ddl'
import { apenasCamposSincronizados, montarEspelho } from './espelho-logic'

type ItemRow = typeof items.$inferSelect

let ensured = false

/** Cria as colunas do espelho em runtime (idempotente, com advisory lock). */
export async function ensureEspelhoSchema() {
  if (ensured) return

  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensure_espelho_schema'))`)
      await aplicar(tx as any)
    })
  } catch (err) {
    console.error('ensureEspelhoSchema: DDL em transação falhou, tentando direto', err)
    await aplicar(db as any)
  }

  ensured = true
}

async function aplicar(exec: any) {
  for (const instrucao of DDL_ESPELHO) {
    await exec.execute(sql.raw(instrucao))
  }
}

/**
 * Cria (ou atualiza) o espelho de um lançamento na conta da casa.
 * Idempotente: chamar duas vezes não duplica.
 */
export async function criarEspelhoDoItem(item: ItemRow, contaDestinoId: string): Promise<ItemRow | null> {
  await ensureEspelhoSchema()

  if (!item.contaId || item.contaId === contaDestinoId) return null

  const [existente] = await db
    .select()
    .from(items)
    .where(eq(items.espelhoDe, item.id))
    .limit(1)

  const dados = montarEspelho(
    {
      id: item.id,
      userId: item.userId,
      contaId: item.contaId,
      descricao: item.descricao,
      valor: item.valor,
      tipo: item.tipo,
      categoria: item.categoria,
      data: item.data,
      mes: item.mes,
      recorrente: item.recorrente,
      recorrenciaId: item.recorrenciaId,
      espelhoDe: item.espelhoDe,
    },
    contaDestinoId,
    existente?.id ?? crypto.randomUUID(),
  )

  if (existente) {
    const [atualizado] = await db
      .update(items)
      .set({ ...(apenasCamposSincronizados(dados) as Record<string, string>), contaId: contaDestinoId })
      .where(eq(items.id, existente.id))
      .returning()
    return atualizado ?? null
  }

  const [criado] = await db
    .insert(items)
    .values({
      id: dados.id,
      userId: dados.userId,
      contaId: contaDestinoId,
      descricao: dados.descricao,
      valor: dados.valor,
      tipo: dados.tipo,
      categoria: dados.categoria,
      data: dados.data,
      mes: dados.mes,
      recorrente: dados.recorrente,
      recorrenciaId: dados.recorrenciaId ?? null,
      espelhoDe: item.id,
    })
    .returning()

  return criado ?? null
}

/** Ids dos itens que já têm espelho (para pintar o selo na lista). */
export async function mapaEspelhos(itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map()
  await ensureEspelhoSchema()

  const linhas = await db
    .select({ espelhoDe: items.espelhoDe, contaId: items.contaId })
    .from(items)
    .where(inArray(items.espelhoDe, itemIds))

  const mapa = new Map<string, string>()
  for (const linha of linhas) {
    if (linha.espelhoDe && linha.contaId) mapa.set(linha.espelhoDe, linha.contaId)
  }
  return mapa
}

/** Remove as cópias geradas a partir de um lançamento. Devolve quantas saíram. */
export async function removerEspelhosDoItem(itemId: string): Promise<number> {
  await ensureEspelhoSchema()
  const removidos = await db.delete(items).where(eq(items.espelhoDe, itemId)).returning()
  return removidos.length
}

/**
 * Propaga os campos compartilhados para o outro lado.
 * Origem → espelho, ou espelho → origem (a decisão do produto é que os dois
 * lados representam a mesma despesa, então ficam sempre iguais).
 */
export async function sincronizarLadoOposto(item: ItemRow, campos: Record<string, unknown>): Promise<void> {
  await ensureEspelhoSchema()
  const sincronizaveis = apenasCamposSincronizados(campos)
  if (Object.keys(sincronizaveis).length === 0) return

  if (item.espelhoDe) {
    // Editaram a cópia na casa → reflete no lançamento de quem pagou.
    await db.update(items).set(sincronizaveis as Record<string, string>).where(eq(items.id, item.espelhoDe))
    return
  }

  await db
    .update(items)
    .set(sincronizaveis as Record<string, string>)
    .where(eq(items.espelhoDe, item.id))
}

/**
 * Liga/desliga o espelho de uma série inteira (despesa fixa).
 * Ao ligar, cria as cópias de todos os meses já gerados.
 */
export async function definirEspelhoDaSerie(
  recorrenciaId: string,
  contaDestinoId: string | null,
): Promise<number> {
  await ensureEspelhoSchema()

  await db
    .update(recorrencias)
    .set({ espelharContaId: contaDestinoId })
    .where(eq(recorrencias.id, recorrenciaId))

  const doMesmoLado = await db
    .select()
    .from(items)
    .where(and(eq(items.recorrenciaId, recorrenciaId), isNull(items.espelhoDe)))

  if (!contaDestinoId) {
    for (const item of doMesmoLado) await removerEspelhosDoItem(item.id)
    return 0
  }

  let criados = 0
  for (const item of doMesmoLado) {
    const espelho = await criarEspelhoDoItem(item, contaDestinoId)
    if (espelho) criados++
  }
  return criados
}

/** Espelha as ocorrências recém-geradas de séries marcadas (chamado na sync). */
export async function espelharOcorrenciasNovas(recorrenciaId: string, contaDestinoId: string): Promise<number> {
  await ensureEspelhoSchema()

  const semEspelho = await db
    .select()
    .from(items)
    .where(and(eq(items.recorrenciaId, recorrenciaId), isNull(items.espelhoDe)))

  let criados = 0
  for (const item of semEspelho) {
    const espelho = await criarEspelhoDoItem(item, contaDestinoId)
    if (espelho) criados++
  }
  return criados
}
