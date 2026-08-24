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
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Membros de contas compartilhadas
// role: 'owner' | 'member'
export const contaMembers = pgTable('conta_members', {
  id: text('id').primaryKey(),
  contaId: text('conta_id')
    .notNull()
    .references(() => contas.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'member'
  inviteEmail: text('invite_email'),               // email convidado (antes de aceitar)
  inviteToken: text('invite_token'),               // token do convite
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
