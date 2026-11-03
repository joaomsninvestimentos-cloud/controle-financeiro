import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Contas bancárias/carteiras
export const contas = pgTable('contas', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  cor: text('cor').notNull().default('#8FB39A'),
  emoji: text('emoji').notNull().default('🏦'),
  saldoInicial: text('saldo_inicial').notNull().default('0'),
  saldoInicialMes: text('saldo_inicial_mes').notNull().default(''),
  ativa: boolean('ativa').notNull().default(true),
  // 'pessoal' (só o dono vê) | 'casa' (compartilhada)
  tipo: text('tipo').notNull().default('pessoal'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Membros de contas compartilhadas
// role: 'owner' | 'member'
export const contaMembers = pgTable('conta_members', {
  id: text('id').primaryKey(),
  contaId: text('conta_id')
    .notNull()
    .references(() => contas.id, { onDelete: 'cascade' }),
  // nullable: convite para quem ainda não tem conta no app
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'member'
  inviteEmail: text('invite_email'),               // email convidado (antes de aceitar)
  inviteToken: text('invite_token'),               // token do convite
  inviteRole: text('invite_role'),                 // 'member' (padrão)
  inviteExpiresAt: timestamp('invite_expires_at'), // validade do convite
  inviteUsedAt: timestamp('invite_used_at'),       // quando foi aceito
  status: text('status').notNull().default('pending'), // 'pending' | 'active'
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Orçamentos por categoria
export const orcamentos = pgTable('orcamentos', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contaId: text('conta_id')
    .references(() => contas.id, { onDelete: 'cascade' }),
  mes: text('mes').notNull(),           // YYYY-MM
  categoria: text('categoria').notNull(),
  limite: text('limite').notNull(),     // valor em string
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const items = pgTable('items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contaId: text('conta_id')
    .references(() => contas.id, { onDelete: 'set null' }),
  descricao: text('descricao').notNull(),
  valor: text('valor').notNull(),
  tipo: text('tipo').notNull(),            // 'receita' | 'despesa'
  categoria: text('categoria').notNull(),
  data: text('data').notNull(),            // YYYY-MM-DD
  mes: text('mes').notNull(),              // YYYY-MM
  recorrente: boolean('recorrente').notNull().default(false),
  recorrenciaId: text('recorrencia_id'),   // série de despesa fixa (nullable)
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Séries de despesa fixa (recorrência real: repete todo mês até encerrar)
export const recorrencias = pgTable('recorrencias', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contaId: text('conta_id')
    .references(() => contas.id, { onDelete: 'set null' }),
  descricao: text('descricao').notNull(),
  valor: text('valor').notNull(),
  tipo: text('tipo').notNull(),            // 'despesa' | 'receita'
  categoria: text('categoria').notNull(),
  dia: text('dia').notNull().default('1'), // dia do mês (string para manter padrão)
  mesInicio: text('mes_inicio').notNull(), // YYYY-MM
  mesFim: text('mes_fim'),                 // YYYY-MM (null = até encerrar)
  ativa: boolean('ativa').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Meses pulados manualmente em uma série — não devem ser recriados
export const recorrenciaPulos = pgTable('recorrencia_pulos', {
  recorrenciaId: text('recorrencia_id').notNull(),
  mes: text('mes').notNull(),
})

export const melhorias = pgTable('melhorias', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  userName: text('user_name').notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').notNull(),
  justificativa: text('justificativa').notNull(),
  impacto: text('impacto').notNull().default('medio'),
  status: text('status').notNull().default('nova'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
