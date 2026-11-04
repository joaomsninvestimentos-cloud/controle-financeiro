import 'server-only'

import { db } from '@/db'
import { DDL_RECORRENCIA } from './recorrencia-ddl'
import { items, contas, contaMembers, recorrencias, recorrenciaPulos } from '@/db/schemas/schema'
import { and, eq, gt, inArray, or, sql, desc } from 'drizzle-orm'
import { espelharOcorrenciasNovas } from './espelho-db'
import { agruparDuplicadas, planejarConsolidacao } from './recorrencia-dup-logic'
import {
  dataDaOcorrencia,
  diaDoMes,
  HORIZONTE_MESES,
  mesAlvoGerado,
  mesesParaGerar,
  planejarOcorrencias,
} from './recorrencia'

type ItemRow = typeof items.$inferSelect
type RecorrenciaRow = typeof recorrencias.$inferSelect

let ensured = false

/**
 * Cria/ajusta o schema de recorrência em runtime (mesmo padrão de
 * `ensureMelhoriasTable`), para funcionar sem rodar migration no deploy.
 * Tudo é idempotente.
 */
export async function ensureRecorrenciaSchema() {
  if (ensured) return

  // Advisory lock: vários cold starts na Vercel podem rodar o DDL ao mesmo
  // tempo; serializar evita corrida na criação do índice único.
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensure_recorrencia_schema'))`)
      await criarSchema(tx)
    })
  } catch (err) {
    console.error('ensureRecorrenciaSchema: DDL em transação falhou, tentando direto', err)
    await criarSchema(db)
  }

  ensured = true
}

 
async function criarSchema(exec: any) {
  for (const instrucao of DDL_RECORRENCIA) {
    await exec.execute(sql.raw(instrucao))
  }
}

async function contasAcessiveis(userId: string): Promise<string[]> {
  const proprias = await db.select({ id: contas.id }).from(contas).where(eq(contas.userId, userId))
  const membros = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))
  return [...proprias.map(c => c.id), ...membros.map(m => m.contaId)]
}

export interface CriarRecorrenciaInput {
  userId: string
  contaId: string | null
  descricao: string
  valor: string
  tipo: string
  categoria: string
  /** Data da primeira ocorrência (YYYY-MM-DD). Define mês inicial e dia. */
  data: string
  /** Mês limite opcional (YYYY-MM). */
  ate?: string | null
  horizonte?: number
}

export interface CriarRecorrenciaResult {
  recorrencia: RecorrenciaRow
  /** Ocorrência do mês inicial (a que o usuário acabou de lançar). */
  primeiroItem: ItemRow
  /** Quantos meses foram gerados além do mês inicial. */
  geradas: number
}

/**
 * Cria a série e materializa as ocorrências (mês inicial + 12 meses).
 * Retorna também a ocorrência do mês inicial.
 */
export async function criarRecorrencia(input: CriarRecorrenciaInput): Promise<CriarRecorrenciaResult> {
  await ensureRecorrenciaSchema()

  const mesInicio = input.data.slice(0, 7)
  const dia = diaDoMes(input.data)
  const id = crypto.randomUUID()
  // "Repete até" anterior ao início não faz sentido: trata como "sem fim".
  const mesFim = input.ate && input.ate >= mesInicio ? input.ate : null

  const [serie] = await db.insert(recorrencias).values({
    id,
    userId: input.userId,
    contaId: input.contaId,
    descricao: input.descricao,
    valor: input.valor,
    tipo: input.tipo,
    categoria: input.categoria,
    dia: String(dia),
    mesInicio,
    mesFim,
    ativa: true,
  }).returning()

  const meses = mesesParaGerar({
    mesInicio,
    mesFim,
    horizonte: input.horizonte ?? HORIZONTE_MESES,
  })

  const rows = meses.map(mes => ({
    id: crypto.randomUUID(),
    userId: input.userId,
    contaId: input.contaId,
    descricao: input.descricao,
    valor: input.valor,
    tipo: input.tipo,
    categoria: input.categoria,
    data: dataDaOcorrencia(mes, dia),
    mes,
    recorrente: true,
    recorrenciaId: id,
  }))

  const inseridos = rows.length > 0
    ? await db.insert(items).values(rows).onConflictDoNothing().returning()
    : []

  const primeiroItem = inseridos.find(i => i.mes === mesInicio) ?? inseridos[0]

  return {
    recorrencia: serie,
    primeiroItem,
    geradas: Math.max(0, inseridos.length - 1),
  }
}

/**
 * Materializa as ocorrências que faltam das séries visíveis para o usuário
 * até o mês solicitado. Idempotente: pode ser chamada a cada leitura.
 */
export async function sincronizarRecorrencias(userId: string, mesSolicitado: string): Promise<ItemRow[]> {
  await ensureRecorrenciaSchema()

  const acessiveis = await contasAcessiveis(userId)
  const visibilidade = acessiveis.length > 0
    ? or(eq(recorrencias.userId, userId), inArray(recorrencias.contaId, acessiveis))
    : eq(recorrencias.userId, userId)

  const series = await db
    .select()
    .from(recorrencias)
    .where(and(eq(recorrencias.ativa, true), visibilidade))

  if (series.length === 0) return []

  const ids = series.map(s => s.id)

  const geradosPorSerie = await db
    .select({ recorrenciaId: items.recorrenciaId, ultimoMes: sql<string>`max(${items.mes})` })
    .from(items)
    .where(inArray(items.recorrenciaId, ids))
    .groupBy(items.recorrenciaId)

  const ultimoPorSerie = new Map(geradosPorSerie.map(r => [r.recorrenciaId, r.ultimoMes]))

  const pulos = await db
    .select()
    .from(recorrenciaPulos)
    .where(inArray(recorrenciaPulos.recorrenciaId, ids))

  const pulosPorSerie = new Map<string, string[]>()
  for (const p of pulos) {
    const lista = pulosPorSerie.get(p.recorrenciaId) ?? []
    lista.push(p.mes)
    pulosPorSerie.set(p.recorrenciaId, lista)
  }

  const planejadas = planejarOcorrencias(
    series.map(s => ({
      id: s.id,
      userId: s.userId,
      contaId: s.contaId,
      descricao: s.descricao,
      valor: s.valor,
      tipo: s.tipo,
      categoria: s.categoria,
      dia: s.dia,
      mesInicio: s.mesInicio,
      mesFim: s.mesFim,
    })),
    {
      ultimoPorSerie: Object.fromEntries(ultimoPorSerie),
      pulosPorSerie: Object.fromEntries(pulosPorSerie),
    },
    mesSolicitado,
  )

  const novos: Array<typeof items.$inferInsert> = planejadas.map(o => ({
    id: crypto.randomUUID(),
    userId: o.userId,
    contaId: o.contaId,
    descricao: o.descricao,
    valor: o.valor,
    tipo: o.tipo,
    categoria: o.categoria,
    data: o.data,
    mes: o.mes,
    recorrente: true,
    recorrenciaId: o.recorrenciaId,
  }))

  if (novos.length === 0) return []

  const inseridos = await inserirLotes(novos)

  // Séries marcadas como "despesa da casa": os meses novos nascem espelhados.
  const destinoPorSerie = new Map(
    series.filter(s => s.espelharContaId).map(s => [s.id, s.espelharContaId as string]),
  )
  for (const item of inseridos) {
    const destino = item.recorrenciaId ? destinoPorSerie.get(item.recorrenciaId) : undefined
    if (destino) await criarEspelhoSeguro(item, destino)
  }

  return inseridos
}

/** Espelha sem derrubar a sincronização se algo falhar no espelho. */
async function criarEspelhoSeguro(item: ItemRow, destino: string) {
  try {
    await espelharOcorrenciasNovas(item.recorrenciaId as string, destino)
  } catch (err) {
    console.error('espelharOcorrenciasNovas falhou', err)
  }
}

/** Insere em lotes para não estourar o limite de parâmetros do Postgres. */
async function inserirLotes(rows: Array<typeof items.$inferInsert>): Promise<ItemRow[]> {
  const inseridos: ItemRow[] = []
  for (let i = 0; i < rows.length; i += 100) {
    const lote = rows.slice(i, i + 100)
    const resultado = await db.insert(items).values(lote).onConflictDoNothing().returning()
    inseridos.push(...resultado)
  }
  return inseridos
}

/**
 * Converte os lançamentos antigos marcados como `recorrente` (etiqueta manual,
 * sem série) em séries de verdade. Idempotente: depois de vinculados, eles
 * deixam de ser selecionados.
 */
export async function migrarRecorrentesLegados(userId: string): Promise<number> {
  await ensureRecorrenciaSchema()

  const legados = await db
    .select()
    .from(items)
    .where(and(
      eq(items.userId, userId),
      eq(items.recorrente, true),
      sql`${items.recorrenciaId} IS NULL`,
    ))
    .orderBy(items.mes)

  if (legados.length === 0) return 0

  const grupos = new Map<string, ItemRow[]>()
  for (const item of legados) {
    const chave = [
      item.descricao.trim().toLowerCase(),
      item.valor,
      item.tipo,
      item.categoria,
      item.contaId ?? '',
      diaDoMes(item.data),
    ].join('|')
    const lista = grupos.get(chave) ?? []
    lista.push(item)
    grupos.set(chave, lista)
  }

  let migrados = 0

  for (const grupo of grupos.values()) {
    const base = grupo[0]
    const primeiroMes = grupo.reduce((min, i) => (i.mes < min ? i.mes : min), base.mes)
    const id = crypto.randomUUID()

    await db.insert(recorrencias).values({
      id,
      userId: base.userId,
      contaId: base.contaId,
      descricao: base.descricao,
      valor: base.valor,
      tipo: base.tipo,
      categoria: base.categoria,
      dia: String(diaDoMes(base.data)),
      mesInicio: primeiroMes,
      mesFim: null,
      ativa: true,
    }).onConflictDoNothing()

    const ids = grupo.map(i => i.id)
    await db.update(items).set({ recorrenciaId: id }).where(inArray(items.id, ids))
    migrados += ids.length
  }

  return migrados
}

async function podeGerenciar(userId: string, recorrenciaId: string): Promise<RecorrenciaRow | null> {
  const [serie] = await db.select().from(recorrencias).where(eq(recorrencias.id, recorrenciaId))
  if (!serie) return null
  if (serie.userId === userId) return serie

  if (serie.contaId) {
    const [conta] = await db
      .select({ id: contas.id })
      .from(contas)
      .where(and(eq(contas.id, serie.contaId), eq(contas.userId, userId)))
    if (conta) return serie
  }

  return null
}

export interface EncerrarResult {
  recorrencia: RecorrenciaRow
  /** Quantas ocorrências futuras foram removidas. */
  removidas: number
}

/**
 * Encerra a série: mantém o mês de referência (e todo o histórico) e remove as
 * ocorrências dos meses seguintes.
 */
export async function encerrarRecorrencia(userId: string, recorrenciaId: string, mesReferencia: string): Promise<EncerrarResult | null> {
  const serie = await podeGerenciar(userId, recorrenciaId)
  if (!serie) return null

  await ensureRecorrenciaSchema()

  const removidas = await db
    .delete(items)
    .where(and(eq(items.recorrenciaId, recorrenciaId), gt(items.mes, mesReferencia)))
    .returning()

  const [atualizada] = await db
    .update(recorrencias)
    .set({
      ativa: false,
      mesFim: serie.mesFim && serie.mesFim < mesReferencia ? serie.mesFim : mesReferencia,
    })
    .where(eq(recorrencias.id, recorrenciaId))
    .returning()

  return { recorrencia: atualizada, removidas: removidas.length }
}

/**
 * Pula um mês específico: remove a ocorrência daquele mês e marca o mês para
 * que a geração automática não a recrie.
 */
export async function pularMes(userId: string, recorrenciaId: string, mes: string): Promise<{ removidas: number } | null> {
  const serie = await podeGerenciar(userId, recorrenciaId)
  if (!serie) return null

  await ensureRecorrenciaSchema()

  await db.insert(recorrenciaPulos).values({ recorrenciaId, mes }).onConflictDoNothing()

  const removidas = await db
    .delete(items)
    .where(and(eq(items.recorrenciaId, recorrenciaId), eq(items.mes, mes)))
    .returning()

  return { removidas: removidas.length }
}

/**
 * Propaga uma edição de ocorrência para a série e para os meses seguintes
 * ("vale deste mês em diante"). O passado não muda.
 */
export async function propagarEdicao(
  item: ItemRow,
  campos: {
    descricao?: string
    valor?: string
    tipo?: string
    categoria?: string
    contaId?: string | null
    data?: string
  },
): Promise<void> {
  if (!item.recorrenciaId) return

  const serieUpdate: Partial<typeof recorrencias.$inferInsert> = {}
  if (campos.descricao !== undefined) serieUpdate.descricao = campos.descricao
  if (campos.valor !== undefined) serieUpdate.valor = campos.valor
  if (campos.tipo !== undefined) serieUpdate.tipo = campos.tipo
  if (campos.categoria !== undefined) serieUpdate.categoria = campos.categoria
  if (campos.contaId !== undefined) serieUpdate.contaId = campos.contaId
  if (campos.data !== undefined) serieUpdate.dia = String(diaDoMes(campos.data))

  if (Object.keys(serieUpdate).length > 0) {
    await db.update(recorrencias).set(serieUpdate).where(eq(recorrencias.id, item.recorrenciaId))
  }

  const futurosUpdate: Partial<typeof items.$inferInsert> = {}
  if (campos.descricao !== undefined) futurosUpdate.descricao = campos.descricao
  if (campos.valor !== undefined) futurosUpdate.valor = campos.valor
  if (campos.tipo !== undefined) futurosUpdate.tipo = campos.tipo
  if (campos.categoria !== undefined) futurosUpdate.categoria = campos.categoria
  if (campos.contaId !== undefined) futurosUpdate.contaId = campos.contaId
  futurosUpdate.recorrente = true

  const futuros = await db
    .select({ id: items.id, mes: items.mes })
    .from(items)
    .where(and(eq(items.recorrenciaId, item.recorrenciaId), gt(items.mes, item.mes)))

  for (const futuro of futuros) {
    const patch: Partial<typeof items.$inferInsert> = { ...futurosUpdate }
    if (campos.data !== undefined) {
      patch.data = dataDaOcorrencia(futuro.mes, diaDoMes(campos.data))
    }
    await db.update(items).set(patch).where(eq(items.id, futuro.id))
  }
}

export interface RecorrenciaResumo {
  id: string
  descricao: string
  valor: string
  tipo: string
  categoria: string
  dia: number
  mesInicio: string
  mesFim: string | null
  contaId: string | null
  proximaData: string
  ocorrencias: number
}

/** Séries visíveis para o usuário, com resumo pronto para a UI. */
export async function listarRecorrencias(userId: string): Promise<RecorrenciaResumo[]> {
  await ensureRecorrenciaSchema()

  const acessiveis = await contasAcessiveis(userId)
  const visibilidade = acessiveis.length > 0
    ? or(eq(recorrencias.userId, userId), inArray(recorrencias.contaId, acessiveis))
    : eq(recorrencias.userId, userId)

  const series = await db
    .select()
    .from(recorrencias)
    .where(and(eq(recorrencias.ativa, true), visibilidade))
    .orderBy(desc(recorrencias.createdAt))

  if (series.length === 0) return []

  const ids = series.map(s => s.id)
  const contagens = await db
    .select({ recorrenciaId: items.recorrenciaId, total: sql<number>`count(*)::int` })
    .from(items)
    // espelhos não contam como ocorrência da série (são cópias)
    .where(and(inArray(items.recorrenciaId, ids), sql`${items.espelhoDe} IS NULL`))
    .groupBy(items.recorrenciaId)

  const totalPorSerie = new Map(contagens.map(c => [c.recorrenciaId, c.total]))

  return series.map(s => {
    const dia = Number(s.dia) || 1
    const agora = new Date()
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const alvo = mesAlvoGerado({ mesInicio: s.mesInicio, mesFim: s.mesFim })
    const referencia = alvo > mesAtual ? alvo : mesAtual
    return {
      id: s.id,
      descricao: s.descricao,
      valor: s.valor,
      tipo: s.tipo,
      categoria: s.categoria,
      dia,
      mesInicio: s.mesInicio,
      mesFim: s.mesFim,
      contaId: s.contaId,
      proximaData: dataDaOcorrencia(referencia, dia),
      ocorrencias: totalPorSerie.get(s.id) ?? 0,
    }
  })
}

/* ───────────── Duplicadas: listar e consolidar ───────────── */

export interface DuplicadaCompleta {
  chave: string
  descricao: string
  valor: string
  contaId: string | null
  principal: { id: string; mesInicio: string }
  outras: Array<{ id: string; mesInicio: string; ocorrencias: number }>
  ocorrenciasTotal: number
  itensEnvolvidos: number
}

/** Séries ativas do usuário que representam a mesma despesa mais de uma vez. */
export async function listarDuplicadas(userId: string): Promise<DuplicadaCompleta[]> {
  const series = await listarRecorrencias(userId)
  const grupos = agruparDuplicadas(series.map(s => ({
    id: s.id,
    descricao: s.descricao,
    valor: s.valor,
    contaId: s.contaId,
    mesInicio: s.mesInicio,
    ativa: true,
    ocorrencias: s.ocorrencias,
  })))

  return grupos.map(g => ({
    chave: g.chave,
    descricao: g.descricao,
    valor: g.valor,
    contaId: g.contaId,
    principal: { id: g.principal.id, mesInicio: g.principal.mesInicio },
    outras: g.outras.map(s => ({ id: s.id, mesInicio: s.mesInicio, ocorrencias: s.ocorrencias })),
    ocorrenciasTotal: g.ocorrenciasTotal,
    itensEnvolvidos: g.ocorrenciasTotal,
  }))
}

export interface ConsolidacaoResultado {
  mantidas: number
  encerradas: number
  movidos: number
  removidos: number
  espelhosRemovidos: number
}

/**
 * Junta séries duplicadas na mais antiga:
 * - meses que só a duplicada tinha passam para a principal;
 * - meses repetidos ficam com a ocorrência da principal (a duplicada sai,
 *   com o espelho dela), para não contar duas vezes;
 * - a duplicada é encerrada e, se ela espelhava na casa e a principal não,
 *   a marca passa para a principal.
 */
export async function consolidarDuplicadas(
  userId: string,
  manterId: string,
  juntarIds: string[],
): Promise<ConsolidacaoResultado | null> {
  await ensureRecorrenciaSchema()

  const principal = await podeGerenciar(userId, manterId)
  if (!principal) return null

  const alvos = juntarIds.filter(id => id !== manterId)
  const seriesParaJuntar: RecorrenciaRow[] = []
  for (const id of alvos) {
    const serie = await podeGerenciar(userId, id)
    if (!serie) return null
    seriesParaJuntar.push(serie)
  }
  if (seriesParaJuntar.length === 0) return null

  const itens = await db
    .select({
      id: items.id,
      recorrenciaId: items.recorrenciaId,
      mes: items.mes,
      espelhoDe: items.espelhoDe,
    })
    .from(items)
    .where(inArray(items.recorrenciaId, [manterId, ...alvos]))

  const plano = planejarConsolidacao(
    itens
      .filter(i => i.recorrenciaId !== null)
      .map(i => ({
        id: i.id,
        recorrenciaId: i.recorrenciaId as string,
        mes: i.mes,
        espelhoDe: i.espelhoDe ?? null,
      })),
    manterId,
    alvos,
  )

  if (plano.removerEspelhos.length > 0) {
    await db.delete(items).where(inArray(items.id, plano.removerEspelhos))
  }
  if (plano.remover.length > 0) {
    await db.delete(items).where(inArray(items.id, plano.remover))
  }
  if (plano.mover.length > 0) {
    await db.update(items).set({ recorrenciaId: manterId }).where(inArray(items.id, plano.mover))
  }

  const mesFim = principal.mesFim ?? seriesParaJuntar.map(s => s.mesFim).filter(Boolean).sort().pop() ?? null
  const espelhoDaCasa = principal.espelharContaId
    ?? seriesParaJuntar.map(s => s.espelharContaId).find(Boolean)
    ?? null

  await db
    .update(recorrencias)
    .set({ espelharContaId: espelhoDaCasa, mesFim })
    .where(eq(recorrencias.id, manterId))

  await db
    .update(recorrencias)
    .set({ ativa: false })
    .where(inArray(recorrencias.id, alvos))

  // A principal pode ter ficado sem cópia na casa: garante agora.
  if (espelhoDaCasa) {
    await espelharOcorrenciasNovas(manterId, espelhoDaCasa)
  }

  return {
    mantidas: 1,
    encerradas: alvos.length,
    movidos: plano.mover.length,
    removidos: plano.remover.length,
    espelhosRemovidos: plano.removerEspelhos.length,
  }
}
