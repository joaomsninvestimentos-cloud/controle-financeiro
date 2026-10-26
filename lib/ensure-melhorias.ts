import { db } from '@/db'
import { sql } from 'drizzle-orm'

let ensured = false

export async function ensureMelhoriasTable() {
  if (ensured) return
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS melhorias (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name text NOT NULL,
      titulo text NOT NULL,
      descricao text NOT NULL,
      justificativa text NOT NULL,
      impacto text NOT NULL DEFAULT 'medio',
      status text NOT NULL DEFAULT 'nova',
      created_at timestamp NOT NULL DEFAULT now()
    )
  `)
  ensured = true
}
