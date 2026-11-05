import 'server-only'

import { db } from '@/db'
import { items, recorrencias, contas, contaMembers } from '@/db/schemas/schema'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { DDL_ESPELHO } from './espelho-ddl'
import { apenasCamposSincronizados, montarEspelho } from './espelho-logic'
import {
  diagnosticarEspelhos,
  type AcaoCorrecao,
  type ContaRef,
  type Diagnostico,
} from './espelho-doctor-logic'

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
      // nunca herda a série: ver comentário em montarEspelho (índice único)
      recorrenciaId: null,
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

/**
 * Auto-reparo: cria os espelhos que faltam para as séries marcadas com
 * `espelhar_conta_id`. Cobre o caso em que a série foi criada mas a cópia não
 * (falha no meio do caminho, versão antiga do app, criação manual etc.).
 * Idempotente e barato: só olha séries que pedem espelho.
 */
export async function repararEspelhosFaltantes(userId: string): Promise<number> {
  await ensureEspelhoSchema()

  const series = await db
    .select({ id: recorrencias.id, contaDestino: recorrencias.espelharContaId })
    .from(recorrencias)
    .where(and(
      eq(recorrencias.userId, userId),
      eq(recorrencias.ativa, true),
      sql`${recorrencias.espelharContaId} IS NOT NULL`,
    ))

  let criados = 0
  for (const serie of series) {
    if (!serie.contaDestino) continue
    criados += await espelharOcorrenciasNovas(serie.id, serie.contaDestino)
  }
  return criados
}

/**
 * Auto-reparo para lançamentos avulsos: qualquer item do usuário que esteja
 * marcado em `alvoPorItem` mas ainda não tenha cópia ganha a cópia agora.
 */
export async function garantirEspelhoDoItem(item: ItemRow, contaDestinoId: string): Promise<boolean> {
  await ensureEspelhoSchema()
  const [existente] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.espelhoDe, item.id))
    .limit(1)
  if (existente) return false
  const criado = await criarEspelhoDoItem(item, contaDestinoId)
  return !!criado
}

/* ───────────── Diagnóstico e conserto dos espelhos ───────────── */

async function contasDoUsuario(userId: string): Promise<ContaRef[]> {
  const proprias = await db
    .select({ id: contas.id, nome: contas.nome, tipo: contas.tipo })
    .from(contas)
    .where(eq(contas.userId, userId))

  const membros = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))

  const compartilhadas = membros.length > 0
    ? await db
        .select({ id: contas.id, nome: contas.nome, tipo: contas.tipo })
        .from(contas)
        .where(inArray(contas.id, membros.map(m => m.contaId)))
    : []

  const mapa = new Map<string, ContaRef>()
  for (const c of [...proprias, ...compartilhadas]) {
    mapa.set(c.id, { id: c.id, nome: c.nome, tipo: c.tipo === 'casa' ? 'casa' : 'pessoal' })
  }
  return [...mapa.values()]
}

/** Lê o estado real e devolve os problemas + plano de correção. */
export async function diagnosticarEspelhosDoUsuario(userId: string): Promise<Diagnostico> {
  await ensureEspelhoSchema()

  const listaContas = await contasDoUsuario(userId)
  const idsContas = listaContas.map(c => c.id)

  const series = await db
    .select({
      id: recorrencias.id,
      descricao: recorrencias.descricao,
      contaId: recorrencias.contaId,
      espelharContaId: recorrencias.espelharContaId,
      ativa: recorrencias.ativa,
    })
    .from(recorrencias)
    .where(eq(recorrencias.userId, userId))

  const itens = idsContas.length > 0
    ? await db
        .select({
          id: items.id,
          descricao: items.descricao,
          contaId: items.contaId,
          recorrenciaId: items.recorrenciaId,
          espelhoDe: items.espelhoDe,
          mes: items.mes,
        })
        .from(items)
        .where(or(eq(items.userId, userId), inArray(items.contaId, idsContas)))
    : await db
        .select({
          id: items.id,
          descricao: items.descricao,
          contaId: items.contaId,
          recorrenciaId: items.recorrenciaId,
          espelhoDe: items.espelhoDe,
          mes: items.mes,
        })
        .from(items)
        .where(eq(items.userId, userId))

  return diagnosticarEspelhos({
    contas: listaContas,
    series,
    itens,
  })
}

export interface CorrecaoResultado {
  criados: number
  movidos: number
  apagados: number
  falhas: number
}

/** Executa o plano do diagnóstico (só o que é corrigível). */
export async function corrigirEspelhos(
  userId: string,
  plano: AcaoCorrecao[],
): Promise<CorrecaoResultado> {
  await ensureEspelhoSchema()

  const contasPermitidas = new Set((await contasDoUsuario(userId)).map(c => c.id))
  const resultado: CorrecaoResultado = { criados: 0, movidos: 0, apagados: 0, falhas: 0 }

  for (const acao of plano) {
    try {
      if (acao.tipo === 'criar') {
        if (!contasPermitidas.has(acao.destinoContaId)) { resultado.falhas++; continue }
        const [origemItem] = await db.select().from(items).where(eq(items.id, acao.origemItemId))
        if (!origemItem || origemItem.espelhoDe) { resultado.falhas++; continue }
        const criado = await criarEspelhoDoItem(origemItem, acao.destinoContaId)
        if (criado) resultado.criados++
        else resultado.falhas++
      } else if (acao.tipo === 'mover') {
        if (!contasPermitidas.has(acao.destinoContaId)) { resultado.falhas++; continue }
        const [atualizado] = await db
          .update(items)
          .set({ contaId: acao.destinoContaId })
          .where(and(eq(items.id, acao.espelhoId), sql`${items.espelhoDe} IS NOT NULL`))
          .returning()
        if (atualizado) resultado.movidos++
        else resultado.falhas++
      } else {
        // apagar espelho: nunca apaga lançamento de origem
        const apagados = await db
          .delete(items)
          .where(and(eq(items.id, acao.espelhoId), sql`${items.espelhoDe} IS NOT NULL`))
          .returning()
        resultado.apagados += apagados.length
      }
    } catch (err) {
      console.error('corrigirEspelhos: ação falhou', acao, err)
      resultado.falhas++
    }
  }

  return resultado
}
