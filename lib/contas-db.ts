import 'server-only'

import { db } from '@/db'
import { contas, contaMembers, users, items, recorrencias, orcamentos } from '@/db/schemas/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { planejarTransferencia } from './mover-logic'
import { DDL_CONTAS } from './contas-ddl'
import {
  avaliarConvite,
  diasRestantes,
  nomeContaPessoal,
  tipoValido,
  validadeConvite,
  type ContaResumo,
  type TipoConta,
} from './contas-logic'

let ensured = false

/** Cria/ajusta o schema de contas em runtime (idempotente, com advisory lock). */
export async function ensureContasSchema() {
  if (ensured) return

  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensure_contas_schema'))`)
       
      await aplicar(tx as any)
    })
  } catch (err) {
    console.error('ensureContasSchema: DDL em transação falhou, tentando direto', err)
     
    await aplicar(db as any)
  }

  ensured = true
}

 
async function aplicar(exec: any) {
  for (const instrucao of DDL_CONTAS) {
    await exec.execute(sql.raw(instrucao))
  }
}

export interface ContaComMembros {
  id: string
  nome: string
  cor: string
  emoji: string
  saldoInicial: string
  saldoInicialMes: string
  ativa: boolean
  tipo: TipoConta
  userId: string
  isOwner: boolean
  membros: Array<{
    id: string
    userId: string | null
    role: string
    inviteEmail: string | null
    status: string
    userName: string | null
    userEmail: string | null
    conviteExpiraEmDias?: number
  }>
}

const nomeEmoji = '👤'
const coresPessoais = ['#8FB39A', '#B8A9D4', '#D4A0A0', '#A0B8D4', '#E8A87C', '#A0D4C4']

/**
 * Garante a conta pessoal do usuário (cria se não existir).
 * Idempotente: pode ser chamada em todo login/cadastro e em backfill.
 */
export async function garantirContaPessoal(userId: string, nomeUsuario: string): Promise<string> {
  await ensureContasSchema()

  const existentes = await db
    .select({ id: contas.id })
    .from(contas)
    .where(and(eq(contas.userId, userId), eq(contas.tipo, 'pessoal')))
    .limit(1)

  if (existentes.length > 0) return existentes[0].id

  const id = crypto.randomUUID()
  const indice = Math.abs(hashSimples(userId)) % coresPessoais.length

  await db.insert(contas).values({
    id,
    userId,
    nome: nomeContaPessoal(nomeUsuario),
    cor: coresPessoais[indice],
    emoji: nomeEmoji,
    saldoInicial: '0',
    saldoInicialMes: '',
    ativa: true,
    tipo: 'pessoal',
  })

  return id
}

function hashSimples(valor: string): number {
  let h = 0
  for (let i = 0; i < valor.length; i++) h = (h << 5) - h + valor.charCodeAt(i)
  return h
}

/**
 * Backfill: usuários que já existiam (criados antes das contas pessoais)
 * precisam de uma conta pessoal para o seletor funcionar. Roda uma vez por
 * request "de leitura" e é idempotente.
 */
export async function backfillContasPessoais(userId: string, nomeUsuario: string): Promise<string> {
  return garantirContaPessoal(userId, nomeUsuario)
}

/** Contas acessíveis (próprias + compartilhadas ativas), com membros. */
export async function listarContas(userId: string, nomeUsuario: string): Promise<ContaComMembros[]> {
  await garantirContaPessoal(userId, nomeUsuario)

  const proprias = await db.select().from(contas).where(eq(contas.userId, userId))

  const memberships = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))

  const idsCompartilhados = memberships
    .map(m => m.contaId)
    .filter(id => !proprias.some(c => c.id === id))

  const compartilhadas = idsCompartilhados.length > 0
    ? await db.select().from(contas).where(inArray(contas.id, idsCompartilhados))
    : []

  const todas = [...proprias, ...compartilhadas]
  if (todas.length === 0) return []

  const membrosTodos = await db
    .select()
    .from(contaMembers)
    .where(inArray(contaMembers.contaId, todas.map(c => c.id)))

  const usuariosDosMembros = [...new Set(membrosTodos.map(m => m.userId).filter(Boolean) as string[])]
  const pessoas = usuariosDosMembros.length > 0
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, usuariosDosMembros))
    : []

  const porId = new Map(pessoas.map(p => [p.id, p]))
  const agora = new Date()

  return todas.map(c => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    emoji: c.emoji,
    saldoInicial: c.saldoInicial,
    saldoInicialMes: c.saldoInicialMes,
    ativa: c.ativa,
    tipo: tipoValido(c.tipo) ? c.tipo : 'pessoal',
    userId: c.userId,
    isOwner: c.userId === userId,
    membros: membrosTodos
      .filter(m => m.contaId === c.id)
      .map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        inviteEmail: m.inviteEmail,
        status: m.status,
        userName: m.userId ? porId.get(m.userId)?.name ?? null : null,
        userEmail: m.userId ? porId.get(m.userId)?.email ?? null : null,
        conviteExpiraEmDias: m.status === 'pending' ? diasRestantes(m.inviteExpiresAt, agora) : undefined,
      })),
  }))
}

export interface CriarContaInput {
  userId: string
  nome: string
  cor: string
  emoji: string
  saldoInicial: string
  saldoInicialMes: string
  tipo?: TipoConta
}

export async function criarConta(input: CriarContaInput): Promise<ContaComMembros> {
  await ensureContasSchema()

  const tipo: TipoConta = tipoValido(input.tipo) ? input.tipo : 'pessoal'

  // Só uma conta pessoal por usuário: se já existe, devolve a existente.
  if (tipo === 'pessoal') {
    const [existente] = await db
      .select()
      .from(contas)
      .where(and(eq(contas.userId, input.userId), eq(contas.tipo, 'pessoal')))
      .limit(1)
    if (existente) {
      return {
        ...existente,
        tipo: 'pessoal',
        isOwner: true,
        membros: [],
      } as ContaComMembros
    }
  }

  const id = crypto.randomUUID()
  const [conta] = await db.insert(contas).values({
    id,
    userId: input.userId,
    nome: input.nome,
    cor: input.cor,
    emoji: input.emoji,
    saldoInicial: input.saldoInicial,
    saldoInicialMes: input.saldoInicialMes,
    ativa: true,
    tipo,
  }).returning()

  return { ...conta, tipo, isOwner: true, membros: [] } as ContaComMembros
}

/* ───────────────────────── Convites ───────────────────────── */

export interface ConviteGerado {
  token: string
  memberId: string
  expiraEm: Date
  /** E-mail opcional: quando informado, o convite já nasce vinculado à pessoa. */
  email: string | null
  jaMembro: boolean
  nomeConta: string
}

/**
 * Gera um convite por link/código para a conta. Sem e-mail obrigatório:
 * o link funciona para quem ainda não tem conta (diferente do convite antigo,
 * que ficava pendente para sempre porque não havia rota de aceite).
 */
export async function criarConvite(
  contaId: string,
  donoId: string,
  opcoes: { email?: string | null; agora?: Date } = {},
): Promise<ConviteGerado | null> {
  await ensureContasSchema()

  const [conta] = await db
    .select()
    .from(contas)
    .where(and(eq(contas.id, contaId), eq(contas.userId, donoId)))

  if (!conta) return null

  const agora = opcoes.agora ?? new Date()
  const expiraEm = validadeConvite(agora)
  const email = opcoes.email?.trim().toLowerCase() || null
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)

  // Se já existe convite pendente para esse e-mail (ou um convite aberto),
  // reaproveita a linha e renova o token em vez de duplicar membros.
  const existentes = await db
    .select()
    .from(contaMembers)
    .where(eq(contaMembers.contaId, contaId))

  const alvo = existentes.find(m =>
    email ? m.inviteEmail === email : (m.status === 'pending' && !m.userId),
  )

  if (alvo) {
    if (alvo.status === 'active') {
      return {
        token: alvo.inviteToken ?? token,
        memberId: alvo.id,
        expiraEm,
        email,
        jaMembro: true,
        nomeConta: conta.nome,
      }
    }

    await db
      .update(contaMembers)
      .set({
        inviteToken: token,
        inviteEmail: email,
        inviteExpiresAt: expiraEm,
        inviteUsedAt: null,
        inviteRole: 'member',
        status: 'pending',
      })
      .where(eq(contaMembers.id, alvo.id))

    return { token, memberId: alvo.id, expiraEm, email, jaMembro: false, nomeConta: conta.nome }
  }

  const memberId = crypto.randomUUID()
  await db.insert(contaMembers).values({
    id: memberId,
    contaId,
    userId: null,
    role: 'member',
    inviteEmail: email,
    inviteToken: token,
    inviteRole: 'member',
    inviteExpiresAt: expiraEm,
    status: 'pending',
  })

  return { token, memberId, expiraEm, email, jaMembro: false, nomeConta: conta.nome }
}

export interface InfoConvitePublica {
  valido: boolean
  motivo?: 'invalido' | 'expirado' | 'usado'
  contaNome?: string
  contaEmoji?: string
  donoNome?: string
  expiraEmDias?: number
  jaMembro?: boolean
}

/** Dados do convite para a tela /convite/[token] (sem exigir login). */
export async function infoConvite(token: string, usuarioId?: string): Promise<InfoConvitePublica> {
  await ensureContasSchema()

  const [membro] = await db
    .select()
    .from(contaMembers)
    .where(eq(contaMembers.inviteToken, token))
    .limit(1)

  if (!membro) return { valido: false, motivo: 'invalido' }

  const [conta] = await db.select().from(contas).where(eq(contas.id, membro.contaId))
  if (!conta) return { valido: false, motivo: 'invalido' }

  // Convite aceito anteriormente: mostra como já membro (não é erro).
  const aceito = membro.inviteUsedAt !== null && membro.status === 'active'
  if (aceito) {
    const [dono] = await db.select({ name: users.name }).from(users).where(eq(users.id, conta.userId))
    return {
      valido: true,
      contaNome: conta.nome,
      contaEmoji: conta.emoji,
      donoNome: dono?.name,
      jaMembro: !usuarioId || membro.userId === usuarioId,
    }
  }

  const avaliacao = avaliarConvite(
    {
      status: membro.status,
      inviteToken: membro.inviteToken,
      inviteExpiresAt: membro.inviteExpiresAt,
      inviteUsedAt: membro.inviteUsedAt,
      userId: membro.userId,
    },
    usuarioId ?? '',
  )

  if (!avaliacao.ok) return { valido: false, motivo: avaliacao.motivo }

  const [dono] = await db.select({ name: users.name }).from(users).where(eq(users.id, conta.userId))

  return {
    valido: true,
    contaNome: conta.nome,
    contaEmoji: conta.emoji,
    donoNome: dono?.name,
    expiraEmDias: diasRestantes(membro.inviteExpiresAt),
    jaMembro: avaliacao.estado === 'ja_membro',
  }
}

export interface AceiteResultado {
  ok: boolean
  motivo?: 'invalido' | 'expirado' | 'usado' | 'forbidden'
  contaId?: string
  contaNome?: string
}

/** Aceita o convite: vincula o usuário logado à conta compartilhada. */
export async function aceitarConvite(token: string, userId: string): Promise<AceiteResultado> {
  await ensureContasSchema()

  const [membro] = await db
    .select()
    .from(contaMembers)
    .where(eq(contaMembers.inviteToken, token))
    .limit(1)

  if (!membro) return { ok: false, motivo: 'invalido' }

  const [conta] = await db.select().from(contas).where(eq(contas.id, membro.contaId))
  if (!conta) return { ok: false, motivo: 'invalido' }

  // Já é membro ativo: sucesso idempotente.
  if (membro.status === 'active' && membro.userId === userId) {
    return { ok: true, contaId: conta.id, contaNome: conta.nome }
  }
  if (membro.status === 'active' && membro.userId && membro.userId !== userId) {
    return { ok: false, motivo: 'usado' }
  }

  const avaliacao = avaliarConvite(
    {
      status: membro.status,
      inviteToken: membro.inviteToken,
      inviteExpiresAt: membro.inviteExpiresAt,
      inviteUsedAt: membro.inviteUsedAt,
      userId: membro.userId,
    },
    userId,
  )

  if (!avaliacao.ok) return { ok: false, motivo: avaliacao.motivo }

  // Dono do convite não precisa "entrar": já é dono.
  if (conta.userId === userId) {
    return { ok: true, contaId: conta.id, contaNome: conta.nome }
  }

  await db
    .update(contaMembers)
    .set({
      userId,
      status: 'active',
      inviteUsedAt: new Date(),
      inviteEmail: membro.inviteEmail ?? null,
    })
    .where(eq(contaMembers.id, membro.id))

  return { ok: true, contaId: conta.id, contaNome: conta.nome }
}

/** Contas do usuário no formato leve usado pela barra de troca rápida. */
export async function contasResumo(userId: string, nomeUsuario: string): Promise<ContaResumo[]> {
  const completas = await listarContas(userId, nomeUsuario)
  return completas.map(c => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    isOwner: c.isOwner,
    cor: c.cor,
    emoji: c.emoji,
  }))
}

/* ───────────── Transferência de registros entre contas ───────────── */

export interface TransferirInput {
  userId: string
  deContaId: string
  paraContaId: string
  incluirLancamentos: boolean
  incluirFixas: boolean
  incluirOrcamentos: boolean
}

export interface TransferirResultado {
  fixas: number
  lancamentos: number
  orcamentos: number
  orcamentosIgnorados: number
  espelhosPreservados: number
}

/** Conta acessível ao usuário (dono ou membro ativo), com o tipo. */
async function contaComAcesso(userId: string, contaId: string) {
  const [propria] = await db
    .select()
    .from(contas)
    .where(and(eq(contas.id, contaId), eq(contas.userId, userId)))
  if (propria) return { conta: propria, isOwner: true }

  const [membro] = await db
    .select()
    .from(contaMembers)
    .where(and(
      eq(contaMembers.contaId, contaId),
      eq(contaMembers.userId, userId),
      eq(contaMembers.status, 'active'),
    ))
  if (!membro) return null

  const [conta] = await db.select().from(contas).where(eq(contas.id, contaId))
  return conta ? { conta, isOwner: false } : null
}

/**
 * Transferência real: troca `conta_id` de séries, lançamentos e (opcional)
 * orçamentos, tudo numa transação. Preserva ids, datas e valores; espelhos da
 * casa ficam onde estão.
 */
export async function transferirRegistros(input: TransferirInput): Promise<TransferirResultado | null> {
  await ensureContasSchema()

  const origem = await contaComAcesso(input.userId, input.deContaId)
  if (!origem || !origem.isOwner) return null

  const destino = await contaComAcesso(input.userId, input.paraContaId)
  if (!destino) return null

  // Lê o que existe hoje para montar o plano (regra pura).
  const [itens, series, orcamentosOrigem, orcamentosDestino] = await Promise.all([
    db
      .select({
        id: items.id,
        contaId: items.contaId,
        recorrente: items.recorrente,
        recorrenciaId: items.recorrenciaId,
        espelhoDe: items.espelhoDe,
        userId: items.userId,
      })
      .from(items)
      .where(eq(items.contaId, input.deContaId)),
    db
      .select({
        id: recorrencias.id,
        contaId: recorrencias.contaId,
        userId: recorrencias.userId,
        ativa: recorrencias.ativa,
      })
      .from(recorrencias)
      .where(eq(recorrencias.contaId, input.deContaId)),
    db
      .select({
        id: orcamentos.id,
        contaId: orcamentos.contaId,
        mes: orcamentos.mes,
        categoria: orcamentos.categoria,
      })
      .from(orcamentos)
      .where(eq(orcamentos.contaId, input.deContaId)),
    db
      .select({
        id: orcamentos.id,
        contaId: orcamentos.contaId,
        mes: orcamentos.mes,
        categoria: orcamentos.categoria,
      })
      .from(orcamentos)
      .where(eq(orcamentos.contaId, input.paraContaId)),
  ])

  const tipoOrigem = tipoValido(origem.conta.tipo) ? origem.conta.tipo : 'pessoal'
  const plano = planejarTransferencia({
    origem: { id: input.deContaId, tipo: tipoOrigem },
    usuarioId: input.userId,
    opcoes: {
      incluirLancamentos: input.incluirLancamentos,
      incluirFixas: input.incluirFixas,
      incluirOrcamentos: input.incluirOrcamentos,
    },
    itens,
    series,
    orcamentosOrigem,
    orcamentosDestino,
  })

  // Espelhos que continuam na origem (apontando para itens que vão mudar de
  // conta): são preservados de propósito — a despesa segue visível na casa.
  const idsMovidos = new Set(plano.itemIds)
  const espelhosPreservados = itens.filter(i => i.espelhoDe && idsMovidos.has(i.espelhoDe)).length

  if (plano.serieIds.length === 0 && plano.itemIds.length === 0 && plano.orcamentoIds.length === 0) {
    return { fixas: 0, lancamentos: 0, orcamentos: 0, orcamentosIgnorados: plano.counts.orcamentosIgnorados, espelhosPreservados }
  }

  await db.transaction(async tx => {
    if (plano.serieIds.length > 0) {
      await tx
        .update(recorrencias)
        .set({ contaId: input.paraContaId })
        .where(inArray(recorrencias.id, plano.serieIds))
    }
    if (plano.itemIds.length > 0) {
      await tx
        .update(items)
        .set({ contaId: input.paraContaId })
        .where(and(inArray(items.id, plano.itemIds), sql`${items.espelhoDe} IS NULL`))
    }
    if (plano.orcamentoIds.length > 0) {
      await tx
        .update(orcamentos)
        .set({ contaId: input.paraContaId })
        .where(inArray(orcamentos.id, plano.orcamentoIds))
    }
  })

  return {
    fixas: plano.counts.fixas,
    lancamentos: plano.counts.lancamentos,
    orcamentos: plano.counts.orcamentos,
    orcamentosIgnorados: plano.counts.orcamentosIgnorados,
    espelhosPreservados,
  }
}

/** Prévia (só contagens) para mostrar antes de confirmar. */
export async function previaTransferencia(input: Omit<TransferirInput, 'incluirLancamentos' | 'incluirFixas' | 'incluirOrcamentos'> & {
  incluirLancamentos: boolean
  incluirFixas: boolean
  incluirOrcamentos: boolean
}): Promise<TransferirResultado | null> {
  const origem = await contaComAcesso(input.userId, input.deContaId)
  if (!origem || !origem.isOwner) return null
  const destino = await contaComAcesso(input.userId, input.paraContaId)
  if (!destino) return null

  const [itens, series, orcamentosOrigem, orcamentosDestino] = await Promise.all([
    db
      .select({
        id: items.id,
        contaId: items.contaId,
        recorrente: items.recorrente,
        recorrenciaId: items.recorrenciaId,
        espelhoDe: items.espelhoDe,
        userId: items.userId,
      })
      .from(items)
      .where(eq(items.contaId, input.deContaId)),
    db
      .select({
        id: recorrencias.id,
        contaId: recorrencias.contaId,
        userId: recorrencias.userId,
        ativa: recorrencias.ativa,
      })
      .from(recorrencias)
      .where(eq(recorrencias.contaId, input.deContaId)),
    db
      .select({
        id: orcamentos.id,
        contaId: orcamentos.contaId,
        mes: orcamentos.mes,
        categoria: orcamentos.categoria,
      })
      .from(orcamentos)
      .where(eq(orcamentos.contaId, input.deContaId)),
    db
      .select({
        id: orcamentos.id,
        contaId: orcamentos.contaId,
        mes: orcamentos.mes,
        categoria: orcamentos.categoria,
      })
      .from(orcamentos)
      .where(eq(orcamentos.contaId, input.paraContaId)),
  ])

  const tipoOrigem = tipoValido(origem.conta.tipo) ? origem.conta.tipo : 'pessoal'
  const plano = planejarTransferencia({
    origem: { id: input.deContaId, tipo: tipoOrigem },
    usuarioId: input.userId,
    opcoes: {
      incluirLancamentos: input.incluirLancamentos,
      incluirFixas: input.incluirFixas,
      incluirOrcamentos: input.incluirOrcamentos,
    },
    itens,
    series,
    orcamentosOrigem,
    orcamentosDestino,
  })

  const idsMovidos = new Set(plano.itemIds)
  return {
    ...plano.counts,
    espelhosPreservados: itens.filter(i => i.espelhoDe && idsMovidos.has(i.espelhoDe)).length,
  }
}
